import { supabase } from "@/lib/supabase";
import { buildLineMessage, pushLineMessages, summarizeBuiltMessage } from "@/lib/line";
import {
  DeliveryCondition,
  FollowerLite,
  evalCondition,
} from "@/lib/delivery-conditions";
import { fireTrigger } from "@/lib/action-rules";
import { buildReplacerContext, buildBranchEvalContext, defaultContext } from "@/lib/line-replacer";
import { rewriteUrlsInMessage, persistTokens, type ClickContext } from "@/lib/click-tracking";
import { resolveScenarioAccountsWithTokens } from "@/lib/scenario-resolve";

// 並列送信のチャンクサイズ（LINE API レート対策）
const PUSH_CONCURRENCY = 20;

export interface BroadcastSequenceRow {
  id: string;
  // 段階5 Step 11:line_step_sequences.account_id は列削除予定のため optional + nullable に緩和。
  // primary path(scenario_id 経由)では未取得、fallback path のみ参照。
  account_id?: string | null;
  name: string;
  scheduled_at: string | null;
  target_condition: DeliveryCondition | null;
  // 段階5 案B:scenario_id がセットされていれば scenario 経由で main を解決
  scenario_id?: string | null;
}

interface StepMessageRow {
  id: string;
  step_order: number;
  body: string | null;
  payload: Record<string, unknown> | null;
}

interface AccountRow {
  id: string;
  channel_access_token: string | null;
  // 段階5 §16-9: ClickContext.project_id 用に取得
  project_id?: string | null;
}

interface FollowerRow {
  id: string;
  line_user_id: string;
  display_name: string | null;
  followed_at: string;
  // 段階8-2-E-4: scenario 配下統合配信で「どの account に属する follower か」を判定する用
  line_account_id: string;
  inflow_route_id?: string | null;
}

export async function markBroadcastSent(sequenceId: string) {
  await supabase
    .from("line_step_sequences")
    .update({ sent_at: new Date().toISOString() })
    .eq("id", sequenceId);
}

/**
 * 1件の予約配信シーケンスを配信。
 * - 対象フォロワー抽出 → 並列 push → line_messages / line_broadcast_logs に記録 → sent_at を更新
 * 既に sent_at が埋まっている場合でも再送はしない想定なので、呼び出し側で未送信チェックをする。
 *
 * 段階8-2-E-4 改修(方針 A + B):
 *   - 方針 B:scenario 配下統合配信(main + standby、is_active=true)
 *     → resolveScenarioAccountsWithTokens で accountIds + tokenMap を取得
 *     → line_followers IN(accountIds) で全 follower を取得
 *     → follower.line_account_id ごとに tokenMap から token を引いて pushLineMessages
 *     → line_messages 記録時の line_account_id は follower.line_account_id(送信実態と整合、D-3)
 *   - 方針 A:skip 経路の markBroadcastSent 呼び分け
 *     - account_or_token_missing → markBroadcastSent しない、status='inactive' に変更
 *     - no_messages → markBroadcastSent OK(意図的 skip、再 SELECT 防止)
 *     - no_followers → markBroadcastSent しない(後から friend 追加で届くべき)
 *
 * 後方互換 fallback:
 *   - seq.scenario_id なし or 解決不能 → seq.account_id で従来単一 account 配信
 */
async function markSequenceInactive(sequenceId: string, reason: string): Promise<void> {
  // 段階8-2-E-4: 配信不能 sequence を 'inactive' に変更し、cron の SELECT 対象から外す。
  // 運用者が dashboard で対象を発見・修正できるよう sent_at は更新しない(再送可能に保つ)。
  await supabase
    .from("line_step_sequences")
    .update({ status: "inactive", updated_at: new Date().toISOString() })
    .eq("id", sequenceId);
  console.warn(`[broadcast] sequence=${sequenceId} marked inactive: ${reason}`);
}

export async function processBroadcastSequence(seq: BroadcastSequenceRow): Promise<{
  sent: number;
  failed: number;
  skipped_reason?: string;
}> {
  // 1) 段階8-2-E-4 方針 B:scenario 配下統合(main + standby、is_active=true、token あり)
  let scenarioAccountIds: string[] = [];
  let tokenMap = new Map<string, string>();
  let scenarioProjectId: string | null = null;
  if (seq.scenario_id) {
    const resolved = await resolveScenarioAccountsWithTokens(seq.scenario_id);
    scenarioAccountIds = resolved.accountIds;
    tokenMap = resolved.tokenMap;
    // scenario 配下の代表 project_id を取得(click-tracking ctx 用、main の project_id を採用)
    if (scenarioAccountIds.length > 0) {
      const r = await supabase
        .from("line_accounts")
        .select("project_id")
        .eq("scenario_id", seq.scenario_id)
        .eq("role", "main")
        .eq("is_active", true)
        .limit(1)
        .maybeSingle<{ project_id: string | null }>();
      scenarioProjectId = r.data?.project_id ?? null;
    }
  }

  // 2) 後方互換 fallback:scenario 解決不能 → seq.account_id で従来単一 account 配信
  let fallbackAccount: AccountRow | null = null;
  if (scenarioAccountIds.length === 0 && seq.account_id) {
    const { data: fb } = await supabase
      .from("line_accounts")
      .select("id, channel_access_token, project_id")
      .eq("id", seq.account_id)
      .maybeSingle<AccountRow>();
    if (fb && fb.channel_access_token) {
      fallbackAccount = fb;
      scenarioAccountIds = [fb.id];
      tokenMap.set(fb.id, fb.channel_access_token);
      scenarioProjectId = fb.project_id ?? null;
    }
  }

  // 段階8-2-E-4 方針 A ①:account_or_token_missing → markBroadcastSent しない、status='inactive' に変更
  if (scenarioAccountIds.length === 0) {
    await markSequenceInactive(seq.id, "account_or_token_missing");
    return { sent: 0, failed: 0, skipped_reason: "account_or_token_missing" };
  }

  const { data: msgs } = await supabase
    .from("line_step_messages")
    .select("id, step_order, body, payload")
    .eq("sequence_id", seq.id)
    .order("step_order", { ascending: true });

  const stepMessages = (msgs ?? []) as StepMessageRow[];
  // 段階8-2-E-4 方針 A ②:no_messages → markBroadcastSent OK(意図的 skip、再 SELECT 防止)
  if (stepMessages.length === 0) {
    await markBroadcastSent(seq.id);
    return { sent: 0, failed: 0, skipped_reason: "no_messages" };
  }

  // フォロワー取得(status='following' + 段階8-2-E-4 方針 B:scenario 配下統合 IN 句)+ target_condition フィルタ
  let followersRaw: Array<Record<string, unknown>> = [];
  {
    const r = await supabase
      .from("line_followers")
      .select("id, line_user_id, display_name, followed_at, inflow_route_id, line_account_id")
      .in("line_account_id", scenarioAccountIds)
      .eq("status", "following");
    if (r.error && /inflow_route_id/.test(r.error.message)) {
      const fb = await supabase
        .from("line_followers")
        .select("id, line_user_id, display_name, followed_at, line_account_id")
        .in("line_account_id", scenarioAccountIds)
        .eq("status", "following");
      followersRaw = (fb.data ?? []) as Array<Record<string, unknown>>;
    } else {
      followersRaw = (r.data ?? []) as Array<Record<string, unknown>>;
    }
  }

  // fallbackAccount は単一 account fallback path 用、後段の click-tracking 等で使用する変数として温存
  void fallbackAccount;

  let recipients: FollowerRow[] = followersRaw.map((row) => ({
    id: (row.id as string) ?? "",
    line_user_id: row.line_user_id as string,
    display_name: (row.display_name as string | null) ?? null,
    followed_at: (row.followed_at as string) ?? "",
    line_account_id: row.line_account_id as string,
    inflow_route_id: (row.inflow_route_id as string | null) ?? null,
  }));

  if (seq.target_condition && seq.target_condition.mode === "filtered") {
    const lites: FollowerLite[] = recipients.map((r) => ({
      id: r.id,
      line_user_id: r.line_user_id,
      display_name: r.display_name,
      followed_at: r.followed_at,
      inflow_route_id: r.inflow_route_id ?? null,
      label_ids: [],
    }));
    const matched = new Set(
      lites.filter((f) => evalCondition(seq.target_condition as DeliveryCondition, f)).map((f) => f.id),
    );
    recipients = recipients.filter((r) => matched.has(r.id));
  }
  // 段階8-2-E-4 方針 A ③:no_followers → markBroadcastSent しない
  // 後から friend が追加されたら次の cron 発火で送信されるべき。
  // status は 'active' のまま、sent_at も NULL のまま維持。
  if (recipients.length === 0) {
    return { sent: 0, failed: 0, skipped_reason: "no_followers" };
  }

  let sent = 0;
  let failed = 0;
  const logRows: Array<{
    sequence_id: string;
    account_id: string;
    line_user_id: string;
    status: "success" | "failed";
    error_message: string | null;
  }> = [];

  for (let i = 0; i < recipients.length; i += PUSH_CONCURRENCY) {
    const chunk = recipients.slice(i, i + PUSH_CONCURRENCY);
    const results = await Promise.all(
      chunk.map(async (f) => {
        const [replacerCtx, branchCtx] = await Promise.all([
          buildReplacerContext(supabase, { id: f.id }).catch(() =>
            defaultContext(f.display_name ?? "ゲスト"),
          ),
          buildBranchEvalContext(supabase, { id: f.id }).catch(() => ({
            label_ids: [],
            inflow_route_id: (f.inflow_route_id as string | null) ?? null,
            custom_fields: {},
          })),
        ]);
        const builtPairs = stepMessages
          .map((m) => {
            const source = (m.payload as Record<string, unknown>) ?? { msgType: "text", body: m.body };
            const built = buildLineMessage(source, replacerCtx, branchCtx);
            return built ? { built, source, step_message_id: m.id } : null;
          })
          .filter(
            (
              x,
            ): x is {
              built: Record<string, unknown>;
              source: Record<string, unknown>;
              step_message_id: string;
            } => x !== null,
          );
        const lineMessages = builtPairs.map((p) => p.built);

        if (lineMessages.length === 0) {
          return { ok: false as const, status: 0, error: "no_valid_messages", follower: f, builtPairs };
        }

        // 段階5 §16-9 Phase 2:URL を中継 URL に書き換え + token 永続化
        // フォールバック原則:rewrite/persist 失敗時は元メッセージで送信続行(計測ロスのみ)
        let sendMessages: Array<Record<string, unknown>>;
        try {
          const ctxBase: ClickContext = {
            broadcast_sequence_id: seq.id,
            step_message_id: "", // メッセージごとに上書き(下のループで個別設定)
            step_enrollment_id: null, // 予約配信は enrollment なし
            scenario_id: seq.scenario_id ?? null,
            project_id: scenarioProjectId,
            follower_id: f.id,
            line_user_id: f.line_user_id,
          };
          const rewriteResults = builtPairs.map((p) =>
            rewriteUrlsInMessage(p.built, { ...ctxBase, step_message_id: p.step_message_id }),
          );
          const allTokens = rewriteResults.flatMap((r) => r.tokens);
          if (allTokens.length === 0) {
            // URL を含まないメッセージのみ → 元のまま送信
            sendMessages = lineMessages;
          } else {
            const persistResult = await persistTokens(supabase, allTokens);
            if (!persistResult.ok) {
              console.error(
                "[broadcast] persistTokens failed, fallback to original URLs:",
                persistResult.error,
              );
              sendMessages = lineMessages;
            } else {
              sendMessages = rewriteResults.map((r) => r.message);
            }
          }
        } catch (e) {
          console.error("[broadcast] click-tracking rewrite error, fallback to original:", e);
          sendMessages = lineMessages;
        }

        // 段階8-2-E-4 方針 B:follower の line_account_id ごとに対応 token を引いて push
        // tokenMap に該当 account の token がない場合は no_token エラーを返す(scenario 配下の
        // 他 account で送信は継続)
        const followerToken = tokenMap.get(f.line_account_id);
        if (!followerToken) {
          return { ok: false as const, status: 0, error: "no_token", follower: f, builtPairs };
        }
        const res = await pushLineMessages(
          followerToken,
          f.line_user_id,
          sendMessages,
        );
        return { ...res, follower: f, builtPairs } as
          | {
              ok: true;
              follower: FollowerRow;
              builtPairs: Array<{
                built: Record<string, unknown>;
                source: Record<string, unknown>;
                step_message_id: string;
              }>;
            }
          | {
              ok: false;
              status: number;
              error: string;
              follower: FollowerRow;
              builtPairs: Array<{
                built: Record<string, unknown>;
                source: Record<string, unknown>;
                step_message_id: string;
              }>;
            };
      }),
    );

    for (const r of results) {
      if (r.ok) {
        sent++;
        // 段階8-2-E-4 D-3:account_id は follower.line_account_id(送信実態と整合)で記録
        logRows.push({
          sequence_id: seq.id,
          account_id: r.follower.line_account_id,
          line_user_id: r.follower.line_user_id,
          status: "success",
          error_message: null,
        });
        const nowIso = new Date().toISOString();
        const msgRows = r.builtPairs.map(({ built, source }) => ({
          line_account_id: r.follower.line_account_id,
          line_user_id: r.follower.line_user_id,
          direction: "outgoing" as const,
          message_type: (built.type as string) || "text",
          message_text: summarizeBuiltMessage(built, source),
          sent_at: nowIso,
        }));
        if (msgRows.length > 0) {
          await supabase.from("line_messages").insert(msgRows);
        }
        await fireTrigger("sequence_completed", {
          account_id: r.follower.line_account_id,
          line_user_id: r.follower.line_user_id,
          follower_id: r.follower.id,
          sequence_id: seq.id,
        });
      } else {
        failed++;
        logRows.push({
          sequence_id: seq.id,
          account_id: r.follower.line_account_id,
          line_user_id: r.follower.line_user_id,
          status: "failed",
          error_message: `${r.status}: ${r.error}`.slice(0, 500),
        });
      }
    }
  }

  if (logRows.length > 0) {
    const { error: logErr } = await supabase
      .from("line_broadcast_logs")
      .insert(logRows);
    if (logErr) {
      console.error("[broadcast] log insert failed:", logErr.message);
    }
  }

  await markBroadcastSent(seq.id);

  return { sent, failed };
}

/**
 * 予定時刻を過ぎた予約配信を一括配信。cron から呼び出し。
 */
export async function runScheduledBroadcasts(): Promise<{
  processed: number;
  total_sent: number;
  total_failed: number;
  sequences: Array<{
    sequence_id: string;
    name: string;
    sent: number;
    failed: number;
    skipped_reason?: string;
  }>;
}> {
  const nowIso = new Date().toISOString();

  // 段階5 Step 11:primary SELECT から account_id 除外(列削除耐性)。
  // scenario_id 列が無い環境(Step 02 未適用)では fallback で account_id を含めて再取得。
  let sequences: BroadcastSequenceRow[] = [];
  {
    const r = await supabase
      .from("line_step_sequences")
      .select("id, name, scheduled_at, target_condition, scenario_id")
      .eq("kind", "schedule")
      .eq("status", "active")
      .is("sent_at", null)
      .not("scheduled_at", "is", null)
      .lte("scheduled_at", nowIso)
      .order("scheduled_at", { ascending: true })
      .limit(20);

    if (r.error && /scenario_id/i.test(r.error.message)) {
      // scenario_id 列が無い(Step 02 未適用)→ 従来 select(account_id 付き)で再取得
      const fb = await supabase
        .from("line_step_sequences")
        .select("id, account_id, name, scheduled_at, target_condition")
        .eq("kind", "schedule")
        .eq("status", "active")
        .is("sent_at", null)
        .not("scheduled_at", "is", null)
        .lte("scheduled_at", nowIso)
        .order("scheduled_at", { ascending: true })
        .limit(20);
      if (fb.error) {
        throw new Error(`sequences fetch failed: ${fb.error.message}`);
      }
      sequences = (fb.data ?? []).map((s) => ({
        ...(s as Omit<BroadcastSequenceRow, "scenario_id">),
        scenario_id: null,
      })) as BroadcastSequenceRow[];
    } else if (r.error) {
      throw new Error(`sequences fetch failed: ${r.error.message}`);
    } else {
      sequences = (r.data ?? []) as BroadcastSequenceRow[];
    }
  }

  const summary = {
    processed: sequences.length,
    total_sent: 0,
    total_failed: 0,
    sequences: [] as Array<{
      sequence_id: string;
      name: string;
      sent: number;
      failed: number;
      skipped_reason?: string;
    }>,
  };

  for (const seq of sequences) {
    const result = await processBroadcastSequence(seq);
    summary.total_sent += result.sent;
    summary.total_failed += result.failed;
    summary.sequences.push({
      sequence_id: seq.id,
      name: seq.name,
      sent: result.sent,
      failed: result.failed,
      skipped_reason: result.skipped_reason,
    });
  }

  return summary;
}

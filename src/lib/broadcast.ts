import { supabase } from "@/lib/supabase";
import { buildLineMessage, pushLineMessages, summarizeBuiltMessage } from "@/lib/line";
import {
  DeliveryCondition,
  FollowerLite,
  evalCondition,
} from "@/lib/delivery-conditions";
import { fireTrigger } from "@/lib/action-rules";
import { buildReplacerContext, buildBranchEvalContext, defaultContext } from "@/lib/line-replacer";

// 並列送信のチャンクサイズ（LINE API レート対策）
const PUSH_CONCURRENCY = 20;

export interface BroadcastSequenceRow {
  id: string;
  account_id: string;
  name: string;
  scheduled_at: string | null;
  target_condition: DeliveryCondition | null;
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
}

interface FollowerRow {
  id: string;
  line_user_id: string;
  display_name: string | null;
  followed_at: string;
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
 */
export async function processBroadcastSequence(seq: BroadcastSequenceRow): Promise<{
  sent: number;
  failed: number;
  skipped_reason?: string;
}> {
  const { data: account } = await supabase
    .from("line_accounts")
    .select("id, channel_access_token")
    .eq("id", seq.account_id)
    .maybeSingle<AccountRow>();

  if (!account || !account.channel_access_token) {
    await markBroadcastSent(seq.id);
    return { sent: 0, failed: 0, skipped_reason: "account_or_token_missing" };
  }

  const { data: msgs } = await supabase
    .from("line_step_messages")
    .select("id, step_order, body, payload")
    .eq("sequence_id", seq.id)
    .order("step_order", { ascending: true });

  const stepMessages = (msgs ?? []) as StepMessageRow[];
  if (stepMessages.length === 0) {
    await markBroadcastSent(seq.id);
    return { sent: 0, failed: 0, skipped_reason: "no_messages" };
  }

  // フォロワー取得（status='following' のみ）+ target_condition でフィルタ
  let followersRaw: Array<Record<string, unknown>> = [];
  {
    const r = await supabase
      .from("line_followers")
      .select("id, line_user_id, display_name, followed_at, inflow_route_id")
      .eq("line_account_id", account.id)
      .eq("status", "following");
    if (r.error && /inflow_route_id/.test(r.error.message)) {
      const fb = await supabase
        .from("line_followers")
        .select("id, line_user_id, display_name, followed_at")
        .eq("line_account_id", account.id)
        .eq("status", "following");
      followersRaw = (fb.data ?? []) as Array<Record<string, unknown>>;
    } else {
      followersRaw = (r.data ?? []) as Array<Record<string, unknown>>;
    }
  }

  let recipients: FollowerRow[] = followersRaw.map((row) => ({
    id: (row.id as string) ?? "",
    line_user_id: row.line_user_id as string,
    display_name: (row.display_name as string | null) ?? null,
    followed_at: (row.followed_at as string) ?? "",
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
  if (recipients.length === 0) {
    await markBroadcastSent(seq.id);
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
            return built ? { built, source } : null;
          })
          .filter((x): x is { built: Record<string, unknown>; source: Record<string, unknown> } => x !== null);
        const lineMessages = builtPairs.map((p) => p.built);

        if (lineMessages.length === 0) {
          return { ok: false as const, status: 0, error: "no_valid_messages", follower: f, builtPairs };
        }

        const res = await pushLineMessages(
          account.channel_access_token!,
          f.line_user_id,
          lineMessages,
        );
        return { ...res, follower: f, builtPairs } as
          | { ok: true; follower: FollowerRow; builtPairs: Array<{ built: Record<string, unknown>; source: Record<string, unknown> }> }
          | { ok: false; status: number; error: string; follower: FollowerRow; builtPairs: Array<{ built: Record<string, unknown>; source: Record<string, unknown> }> };
      }),
    );

    for (const r of results) {
      if (r.ok) {
        sent++;
        logRows.push({
          sequence_id: seq.id,
          account_id: account.id,
          line_user_id: r.follower.line_user_id,
          status: "success",
          error_message: null,
        });
        const nowIso = new Date().toISOString();
        const msgRows = r.builtPairs.map(({ built, source }) => ({
          line_account_id: account.id,
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
          account_id: account.id,
          line_user_id: r.follower.line_user_id,
          follower_id: r.follower.id,
          sequence_id: seq.id,
        });
      } else {
        failed++;
        logRows.push({
          sequence_id: seq.id,
          account_id: account.id,
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

  const { data: seqs, error: seqErr } = await supabase
    .from("line_step_sequences")
    .select("id, account_id, name, scheduled_at, target_condition")
    .eq("kind", "schedule")
    .eq("status", "active")
    .is("sent_at", null)
    .not("scheduled_at", "is", null)
    .lte("scheduled_at", nowIso)
    .order("scheduled_at", { ascending: true })
    .limit(20);

  if (seqErr) {
    throw new Error(`sequences fetch failed: ${seqErr.message}`);
  }

  const sequences = (seqs ?? []) as BroadcastSequenceRow[];
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

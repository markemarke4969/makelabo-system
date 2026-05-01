import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";
import { buildLineMessage, pushLineMessages, summarizeBuiltMessage } from "@/lib/line";
import { buildReplacerContext, buildBranchEvalContext, defaultContext } from "@/lib/line-replacer";
import { rewriteUrlsInMessage, persistTokens, type ClickContext } from "@/lib/click-tracking";

export const maxDuration = 300;

/**
 * ステップ配信 cron: delay_minutes > 0 のステップメッセージを配信
 *
 * 流れ:
 *   1. active なエンロールメントを取得
 *   2. 各エンロールメントについて、enrolled_at + delay_minutes が now() 以前のメッセージを探す
 *   3. last_sent_step より大きい step_order のメッセージを送信
 *   4. 全ステップ送信完了したら status='completed' に更新
 */

interface EnrollmentRow {
  id: string;
  sequence_id: string;
  follower_id: string;
  account_id: string;
  line_user_id: string;
  enrolled_at: string;
  last_sent_step: number;
  // 段階5 案B:line_step_enrollments に scenario_id 列があればそれを優先(列不在なら null)
  scenario_id?: string | null;
}

interface StepMsgRow {
  id: string;
  step_order: number;
  delay_minutes: number;
  body: string | null;
  payload: Record<string, unknown> | null;
  timing_mode: "immediate" | "absolute" | "relative" | null;
  delivery_days: number | null;
  delivery_time: string | null;
}

// timing_mode=absolute の場合は、基準日(enrolled_at の日付) + delivery_days の delivery_time が due
// それ以外は delay_minutes 経過ベース
function isDue(enrolledAt: string, m: StepMsgRow, nowMs: number): boolean {
  const mode = m.timing_mode ?? "immediate";
  if (mode === "absolute" && m.delivery_time) {
    const base = new Date(enrolledAt);
    const days = m.delivery_days ?? 0;
    const [hh, mm] = (m.delivery_time || "09:00").split(":").map((v) => Number(v) || 0);
    const target = new Date(base);
    target.setDate(target.getDate() + days);
    target.setHours(hh, mm, 0, 0);
    return nowMs >= target.getTime();
  }
  // immediate / relative / 旧データは delay_minutes で判定
  const elapsedMinutes = (nowMs - new Date(enrolledAt).getTime()) / (1000 * 60);
  return m.delay_minutes <= elapsedMinutes;
}

async function runStepDelivery(): Promise<{
  processed: number;
  sent: number;
  failed: number;
  completed: number;
}> {
  // 1. active なエンロールメントを取得（最大200件）
  // 9 項目判断 1:本番 DB に line_step_enrollments テーブル不在のため、PGRST205 エラー時は早期 return
  // 段階5 案B:scenario_id 列があれば取得、無ければ列不在 fallback
  let rows: EnrollmentRow[] = [];
  {
    const r = await supabase
      .from("line_step_enrollments")
      .select("id, sequence_id, follower_id, account_id, line_user_id, enrolled_at, last_sent_step, scenario_id")
      .eq("status", "active")
      .order("enrolled_at", { ascending: true })
      .limit(200);

    // テーブル不在(本番 DB:9 項目判断 1)→ 処理スキップで早期 return
    if (
      r.error &&
      (/line_step_enrollments/i.test(r.error.message) || r.error.code === "PGRST205")
    ) {
      console.warn(
        "[cron/line-step-delivery] line_step_enrollments テーブル未作成 → 段階5 案B 9項目判断 1 (Skip) により処理スキップ",
      );
      return { processed: 0, sent: 0, failed: 0, completed: 0 };
    }

    // scenario_id 列が無い(Step 02 未適用)→ 従来 select で再取得
    if (r.error && /scenario_id/i.test(r.error.message)) {
      const fb = await supabase
        .from("line_step_enrollments")
        .select("id, sequence_id, follower_id, account_id, line_user_id, enrolled_at, last_sent_step")
        .eq("status", "active")
        .order("enrolled_at", { ascending: true })
        .limit(200);
      if (fb.error) {
        if (/line_step_enrollments/i.test(fb.error.message) || fb.error.code === "PGRST205") {
          console.warn(
            "[cron/line-step-delivery] line_step_enrollments テーブル未作成 → 処理スキップ",
          );
          return { processed: 0, sent: 0, failed: 0, completed: 0 };
        }
        throw new Error(`enrollments fetch failed: ${fb.error.message}`);
      }
      rows = (fb.data ?? []).map((e) => ({
        ...(e as Omit<EnrollmentRow, "scenario_id">),
        scenario_id: null,
      })) as EnrollmentRow[];
    } else if (r.error) {
      throw new Error(`enrollments fetch failed: ${r.error.message}`);
    } else {
      rows = (r.data ?? []) as EnrollmentRow[];
    }
  }

  let sent = 0;
  let failed = 0;
  let completed = 0;

  // アカウント→トークンのキャッシュ
  const tokenCache = new Map<string, string | null>();
  // 段階5 §16-9 Phase 3: ClickContext.project_id 用キャッシュ(tokenCache と同じキーを使う)
  const projectIdCache = new Map<string, string | null>();

  for (const enr of rows) {
    // 2. シーケンスのステップメッセージ（last_sent_step より大きいもの）を取得
    // timing_mode 系カラム未作成の環境への fallback 付き
    let steps: StepMsgRow[] = [];
    {
      const r = await supabase
        .from("line_step_messages")
        .select("id, step_order, delay_minutes, body, payload, timing_mode, delivery_days, delivery_time")
        .eq("sequence_id", enr.sequence_id)
        .gt("step_order", enr.last_sent_step)
        .order("step_order", { ascending: true });
      if (r.error && /(timing_mode|delivery_days|delivery_time)/.test(r.error.message)) {
        const fb = await supabase
          .from("line_step_messages")
          .select("id, step_order, delay_minutes, body, payload")
          .eq("sequence_id", enr.sequence_id)
          .gt("step_order", enr.last_sent_step)
          .order("step_order", { ascending: true });
        steps = ((fb.data ?? []) as Array<Record<string, unknown>>).map((m) => ({
          id: m.id as string,
          step_order: m.step_order as number,
          delay_minutes: (m.delay_minutes as number) ?? 0,
          body: (m.body as string) ?? null,
          payload: (m.payload as Record<string, unknown>) ?? null,
          timing_mode: null,
          delivery_days: null,
          delivery_time: null,
        }));
      } else {
        steps = (r.data ?? []) as StepMsgRow[];
      }
    }
    if (steps.length === 0) {
      // 全ステップ送信済み → completed
      await supabase
        .from("line_step_enrollments")
        .update({ status: "completed", updated_at: new Date().toISOString() })
        .eq("id", enr.id);
      completed++;
      continue;
    }

    // 3. 現在時刻
    const nowMs = Date.now();

    // 4. due なメッセージを timing_mode 別に判定
    const dueMessages = steps.filter((m) => isDue(enr.enrolled_at, m, nowMs));
    if (dueMessages.length === 0) continue;

    // 5. アクセストークン取得
    // 段階5 案B:enr.scenario_id があれば scenario 配下の main(role='main' AND is_active=true)から取得
    //          取れなければ enr.account_id 経由の従来取得に fallback(後方互換)
    // キャッシュキーは「scenario_id があればそれ、なければ account_id」で区別
    const cacheKey = enr.scenario_id ? `scn:${enr.scenario_id}` : `acc:${enr.account_id}`;
    if (!tokenCache.has(cacheKey)) {
      let resolvedToken: string | null = null;
      let resolvedProjectId: string | null = null;

      if (enr.scenario_id) {
        const r = await supabase
          .from("line_accounts")
          .select("channel_access_token, project_id")
          .eq("scenario_id", enr.scenario_id)
          .eq("role", "main")
          .eq("is_active", true)
          .limit(1)
          .maybeSingle();
        if (!r.error && r.data) {
          resolvedToken = (r.data.channel_access_token as string) ?? null;
          resolvedProjectId = (r.data.project_id as string | null) ?? null;
        }
        // scenario 経由でアクセスエラー(列不在等)の場合は account_id fallback へ
      }

      if (!resolvedToken) {
        const { data: acc } = await supabase
          .from("line_accounts")
          .select("channel_access_token, project_id")
          .eq("id", enr.account_id)
          .maybeSingle();
        resolvedToken = (acc?.channel_access_token as string) ?? null;
        resolvedProjectId = (acc?.project_id as string | null) ?? null;
      }

      tokenCache.set(cacheKey, resolvedToken);
      projectIdCache.set(cacheKey, resolvedProjectId);
    }
    const token = tokenCache.get(cacheKey);
    const projectId = projectIdCache.get(cacheKey) ?? null;
    if (!token) {
      failed += dueMessages.length;
      continue;
    }

    // 6. 置換コンテキスト + 条件分岐コンテキストを構築
    const [replacerCtx, branchCtx] = await Promise.all([
      buildReplacerContext(supabase, { id: enr.follower_id }).catch(() => defaultContext()),
      buildBranchEvalContext(supabase, { id: enr.follower_id }).catch(() => ({
        label_ids: [],
        inflow_route_id: null,
        custom_fields: {},
      })),
    ]);

    // 7. メッセージ送信
    //
    // 段階5 §16-9 Phase 3: enrollment 単位で URL 書き換え + token 一括永続化を事前に実施。
    // フォールバック原則:rewrite/persist 失敗時は元メッセージで送信続行(計測ロスのみ)。
    let maxSentStep = enr.last_sent_step;

    // 7-a. 全 due メッセージを組立。組立失敗(null)は skip 扱いで maxSentStep を進める。
    type BuiltDueMessage = {
      msg: StepMsgRow;
      built: Record<string, unknown>;
      payload: Record<string, unknown>;
      sendMsg: Record<string, unknown>; // 送信用、デフォルトは元 built
    };
    const builts: BuiltDueMessage[] = [];
    for (const msg of dueMessages) {
      const payload = (msg.payload as Record<string, unknown> | null) ?? {
        msgType: "text",
        body: msg.body,
      };
      const built = buildLineMessage(payload, replacerCtx, branchCtx);
      if (!built) {
        maxSentStep = Math.max(maxSentStep, msg.step_order);
        continue;
      }
      builts.push({ msg, built, payload, sendMsg: built });
    }

    // 7-b. URL 書き換え + token 一括永続化
    if (builts.length > 0) {
      try {
        const ctxBase: ClickContext = {
          broadcast_sequence_id: enr.sequence_id,
          step_message_id: "", // 各メッセージで上書き
          step_enrollment_id: enr.id,
          scenario_id: enr.scenario_id ?? null,
          project_id: projectId,
          follower_id: enr.follower_id,
          line_user_id: enr.line_user_id,
        };
        const rewriteResults = builts.map((b) =>
          rewriteUrlsInMessage(b.built, { ...ctxBase, step_message_id: b.msg.id }),
        );
        const allTokens = rewriteResults.flatMap((r) => r.tokens);
        if (allTokens.length > 0) {
          const persistResult = await persistTokens(supabase, allTokens);
          if (persistResult.ok) {
            for (let i = 0; i < builts.length; i++) {
              builts[i].sendMsg = rewriteResults[i].message;
            }
          } else {
            console.error(
              "[cron/line-step-delivery] persistTokens failed, fallback to original URLs:",
              persistResult.error,
            );
          }
        }
      } catch (e) {
        console.error("[cron/line-step-delivery] click-tracking rewrite error, fallback:", e);
      }
    }

    // 7-c. 送信ループ(sendMsg は rewrite 後 or 元 built)
    for (const b of builts) {
      const res = await pushLineMessages(token, enr.line_user_id, [b.sendMsg]);
      if (res.ok) {
        sent++;
        maxSentStep = Math.max(maxSentStep, b.msg.step_order);
        // チャット画面表示用ログ: 実際の送信内容を1行要約で残す(URL は元のまま表示)
        const builtType = (b.built.type as string) || "text";
        const summary = summarizeBuiltMessage(b.built, b.payload);
        await supabase.from("line_messages").insert({
          line_account_id: enr.account_id,
          line_user_id: enr.line_user_id,
          direction: "outgoing",
          message_type: builtType,
          message_text: summary,
          sent_at: new Date().toISOString(),
        });
      } else {
        failed++;
        console.error(
          `[cron/line-step-delivery] send failed: enrollment=${enr.id} step=${b.msg.step_order}`,
          res.status,
          res.error,
        );
      }
    }

    // 8. last_sent_step を更新
    if (maxSentStep > enr.last_sent_step) {
      // 残りのステップがあるか確認
      const remaining = steps.filter((m) => m.step_order > maxSentStep);
      const newStatus = remaining.length === 0 ? "completed" : "active";
      if (newStatus === "completed") completed++;

      await supabase
        .from("line_step_enrollments")
        .update({
          last_sent_step: maxSentStep,
          status: newStatus,
          updated_at: new Date().toISOString(),
        })
        .eq("id", enr.id);
    }
  }

  return { processed: rows.length, sent, failed, completed };
}

function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  const auth = request.headers.get("authorization") ?? "";
  if (auth === `Bearer ${secret}`) return true;
  const query = request.nextUrl.searchParams.get("secret");
  if (query === secret) return true;
  return false;
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const result = await runStepDelivery();
    return Response.json({ ok: true, ...result });
  } catch (e) {
    console.error("[cron/line-step-delivery] error:", e);
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  return GET(request);
}

// ============================================================
// LINE アクション管理 実行エンジン
// ============================================================
// 役割:
//   - 各種トリガー発火ポイントから呼ばれ、マッチするルールを評価 → 即実行 or 遅延キュー投入
//   - cron からも呼ばれ、遅延キュー（line_action_executions.status='pending'）を消化
//
// 実行フロー:
//   1. fireTrigger(type, ctx) -- webhook / step sender / cron-wrapper から呼ぶ
//   2. 該当 rule を DB から引く
//   3. conditions を評価
//   4. days_after_follow 条件があれば scheduled_at = follow + N日 で pending を挿入
//      なければ即 executeAction を呼ぶ
//   5. executeAction 結果を line_action_executions に記録
// ============================================================

import { supabase } from "@/lib/supabase";
import { buildLineMessage, pushLineMessages } from "@/lib/line";
import { rewriteUrlsInMessage, persistTokens, type ClickContext } from "@/lib/click-tracking";

// ------------------------------------------------------------
// 型定義
// ------------------------------------------------------------
export type TriggerType =
  | "follow"
  | "label_added"
  | "message_received"
  | "sequence_completed";

export type ActionType =
  | "start_sequence"
  | "label_add"
  | "label_remove"
  | "move_sequence"
  | "webhook";

export interface RuleCondition {
  type: "label_in" | "inflow_route_in" | "days_after_follow";
  label_ids?: string[];
  route_ids?: string[];
  days?: number;
}

export interface ActionRule {
  id: string;
  account_id: string;
  name: string;
  status: string;
  trigger_type: TriggerType;
  trigger_config: Record<string, unknown>;
  conditions: RuleCondition[];
  action_type: ActionType;
  action_config: Record<string, unknown>;
}

export interface TriggerContext {
  account_id: string;
  line_user_id: string;
  follower_id?: string | null;
  // トリガー種別ごとの付加情報
  message_text?: string | null;
  label_id?: string | null;
  sequence_id?: string | null;
}

// ------------------------------------------------------------
// エントリポイント
// ------------------------------------------------------------
export async function fireTrigger(type: TriggerType, ctx: TriggerContext): Promise<void> {
  try {
    // 1. follower_id が未解決なら引く
    let followerId = ctx.follower_id ?? null;
    if (!followerId) {
      const { data: f } = await supabase
        .from("line_followers")
        .select("id")
        .eq("line_account_id", ctx.account_id)
        .eq("line_user_id", ctx.line_user_id)
        .maybeSingle();
      followerId = (f?.id as string) ?? null;
    }

    // 2. マッチするルールを取得
    const { data: rules, error } = await supabase
      .from("line_action_rules")
      .select("*")
      .eq("account_id", ctx.account_id)
      .eq("trigger_type", type)
      .eq("status", "active");

    if (error) {
      console.error("[action-rules] rules fetch failed:", error.message);
      return;
    }

    const matched = (rules ?? []).filter((r) =>
      triggerConfigMatches(type, (r.trigger_config ?? {}) as Record<string, unknown>, ctx),
    );

    for (const rule of matched as ActionRule[]) {
      await dispatchRule(rule, { ...ctx, follower_id: followerId });
    }
  } catch (e) {
    console.error("[action-rules] fireTrigger error:", e);
  }
}

// ------------------------------------------------------------
// トリガー補足情報のマッチング
// ------------------------------------------------------------
function triggerConfigMatches(
  type: TriggerType,
  config: Record<string, unknown>,
  ctx: TriggerContext,
): boolean {
  if (type === "label_added") {
    const wantLabelId = config.label_id as string | undefined;
    if (wantLabelId && wantLabelId !== ctx.label_id) return false;
    return true;
  }
  if (type === "sequence_completed") {
    const wantSeqId = config.sequence_id as string | undefined;
    if (wantSeqId && wantSeqId !== ctx.sequence_id) return false;
    return true;
  }
  if (type === "message_received") {
    const keyword = (config.keyword as string | undefined)?.trim();
    if (!keyword) return true;
    const text = (ctx.message_text ?? "").trim();
    return text.includes(keyword);
  }
  // follow は補足情報なし
  return true;
}

// ------------------------------------------------------------
// ルールをディスパッチ: 条件評価 → 即実行 or 遅延キュー投入
// ------------------------------------------------------------
async function dispatchRule(rule: ActionRule, ctx: TriggerContext): Promise<void> {
  const conditions = Array.isArray(rule.conditions) ? rule.conditions : [];

  // days_after_follow があれば、それを delay として扱い、他の条件は実行時に再評価
  const delayCond = conditions.find((c) => c.type === "days_after_follow");
  const nonDelayConds = conditions.filter((c) => c.type !== "days_after_follow");

  // 非 delay 条件を即評価
  const passNow = await evaluateConditions(nonDelayConds, rule.account_id, ctx);
  if (!passNow) {
    await logExecution(rule, ctx, "skipped", null, "condition_failed_on_fire");
    return;
  }

  if (delayCond && typeof delayCond.days === "number" && delayCond.days > 0) {
    // フォロワーの followed_at + N日 を scheduled_at にして pending 挿入
    const scheduledAt = await computeDelayedAt(ctx, delayCond.days);
    if (!scheduledAt) {
      await logExecution(rule, ctx, "skipped", null, "follower_followed_at_missing");
      return;
    }
    await insertPendingExecution(rule, ctx, scheduledAt);
    return;
  }

  // 即実行
  const result = await executeAction(rule, ctx);
  await logExecution(
    rule,
    ctx,
    result.ok ? "success" : "failed",
    new Date().toISOString(),
    result.ok ? null : result.error,
  );
}

async function computeDelayedAt(ctx: TriggerContext, days: number): Promise<string | null> {
  const { data: f } = await supabase
    .from("line_followers")
    .select("followed_at")
    .eq("line_account_id", ctx.account_id)
    .eq("line_user_id", ctx.line_user_id)
    .maybeSingle();
  const base = f?.followed_at as string | undefined;
  if (!base) return null;
  const dt = new Date(base);
  dt.setDate(dt.getDate() + days);
  return dt.toISOString();
}

async function insertPendingExecution(
  rule: ActionRule,
  ctx: TriggerContext,
  scheduledAt: string,
): Promise<void> {
  const { error } = await supabase.from("line_action_executions").insert({
    rule_id: rule.id,
    account_id: rule.account_id,
    follower_id: ctx.follower_id ?? null,
    line_user_id: ctx.line_user_id,
    trigger_event: buildTriggerEvent(ctx),
    status: "pending",
    scheduled_at: scheduledAt,
  });
  if (error) console.error("[action-rules] pending insert failed:", error.message);
}

async function logExecution(
  rule: ActionRule,
  ctx: TriggerContext,
  status: "success" | "failed" | "skipped",
  executedAt: string | null,
  errorMessage: string | null,
): Promise<void> {
  const { error } = await supabase.from("line_action_executions").insert({
    rule_id: rule.id,
    account_id: rule.account_id,
    follower_id: ctx.follower_id ?? null,
    line_user_id: ctx.line_user_id,
    trigger_event: buildTriggerEvent(ctx),
    status,
    scheduled_at: new Date().toISOString(),
    executed_at: executedAt,
    error_message: errorMessage,
  });
  if (error) console.error("[action-rules] log insert failed:", error.message);
}

function buildTriggerEvent(ctx: TriggerContext): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (ctx.message_text != null) out.message_text = ctx.message_text;
  if (ctx.label_id != null) out.label_id = ctx.label_id;
  if (ctx.sequence_id != null) out.sequence_id = ctx.sequence_id;
  return out;
}

// ------------------------------------------------------------
// 条件評価 (AND)
// ------------------------------------------------------------
export async function evaluateConditions(
  conditions: RuleCondition[],
  accountId: string,
  ctx: TriggerContext,
): Promise<boolean> {
  for (const cond of conditions) {
    if (cond.type === "label_in") {
      const want = cond.label_ids ?? [];
      if (want.length === 0) continue;
      const followerId = ctx.follower_id ?? (await resolveFollowerId(accountId, ctx.line_user_id));
      if (!followerId) return false;
      const { data } = await supabase
        .from("line_follower_labels")
        .select("label_id")
        .eq("follower_id", followerId)
        .in("label_id", want);
      if (!data || data.length === 0) return false;
      continue;
    }
    if (cond.type === "inflow_route_in") {
      const want = cond.route_ids ?? [];
      if (want.length === 0) continue;
      const { data: f } = await supabase
        .from("line_followers")
        .select("inflow_route_id")
        .eq("line_account_id", accountId)
        .eq("line_user_id", ctx.line_user_id)
        .maybeSingle();
      const rid = (f?.inflow_route_id as string | null) ?? null;
      if (!rid || !want.includes(rid)) return false;
      continue;
    }
    // days_after_follow は dispatch で delay として扱うのでここでは通す
  }
  return true;
}

async function resolveFollowerId(accountId: string, lineUserId: string): Promise<string | null> {
  const { data } = await supabase
    .from("line_followers")
    .select("id")
    .eq("line_account_id", accountId)
    .eq("line_user_id", lineUserId)
    .maybeSingle();
  return (data?.id as string) ?? null;
}

// ------------------------------------------------------------
// アクション実行
// ------------------------------------------------------------
export async function executeAction(
  rule: ActionRule,
  ctx: TriggerContext,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const cfg = rule.action_config ?? {};

  try {
    if (rule.action_type === "start_sequence") {
      const seqId = cfg.sequence_id as string | undefined;
      if (!seqId) return { ok: false, error: "sequence_id missing" };
      return await runStepSequenceForUser(rule.account_id, ctx.line_user_id, seqId);
    }

    if (rule.action_type === "label_add") {
      const labelId = cfg.label_id as string | undefined;
      if (!labelId) return { ok: false, error: "label_id missing" };
      const followerId = ctx.follower_id ?? (await resolveFollowerId(rule.account_id, ctx.line_user_id));
      if (!followerId) return { ok: false, error: "follower not found" };
      const { error } = await supabase
        .from("line_follower_labels")
        .upsert(
          { label_id: labelId, follower_id: followerId },
          { onConflict: "label_id,follower_id" },
        );
      if (error) return { ok: false, error: error.message };
      return { ok: true };
    }

    if (rule.action_type === "label_remove") {
      const labelId = cfg.label_id as string | undefined;
      if (!labelId) return { ok: false, error: "label_id missing" };
      const followerId = ctx.follower_id ?? (await resolveFollowerId(rule.account_id, ctx.line_user_id));
      if (!followerId) return { ok: false, error: "follower not found" };
      const { error } = await supabase
        .from("line_follower_labels")
        .delete()
        .eq("label_id", labelId)
        .eq("follower_id", followerId);
      if (error) return { ok: false, error: error.message };
      return { ok: true };
    }

    if (rule.action_type === "move_sequence") {
      // 新シナリオを即送る。旧シナリオの「停止」は本実装ではステップ進行状態を持たないため no-op。
      const toId = cfg.to_sequence_id as string | undefined;
      if (!toId) return { ok: false, error: "to_sequence_id missing" };
      return await runStepSequenceForUser(rule.account_id, ctx.line_user_id, toId);
    }

    if (rule.action_type === "webhook") {
      const url = cfg.url as string | undefined;
      if (!url) return { ok: false, error: "url missing" };
      const method = ((cfg.method as string) ?? "POST").toUpperCase();
      const payload = {
        rule_id: rule.id,
        rule_name: rule.name,
        trigger_type: rule.trigger_type,
        account_id: rule.account_id,
        line_user_id: ctx.line_user_id,
        follower_id: ctx.follower_id ?? null,
        event: buildTriggerEvent(ctx),
        fired_at: new Date().toISOString(),
      };
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: method === "GET" ? undefined : JSON.stringify(payload),
      });
      if (!res.ok) {
        const txt = (await res.text().catch(() => "")).slice(0, 300);
        return { ok: false, error: `${res.status}: ${txt}` };
      }
      return { ok: true };
    }

    if (rule.action_type === "cross_account_label") {
      const targetAccountId = cfg.target_account_id as string | undefined;
      const labelName = cfg.label_name as string | undefined;
      if (!targetAccountId || !labelName) return { ok: false, error: "target_account_id and label_name required" };

      // 対象アカウントで同一UserIDのフォロワーを検索
      const { data: targetFollower } = await supabase
        .from("line_followers")
        .select("id")
        .eq("line_account_id", targetAccountId)
        .eq("line_user_id", ctx.line_user_id)
        .maybeSingle();

      if (!targetFollower) {
        return { ok: false, error: `UserID ${ctx.line_user_id} not found in target account` };
      }

      // 対象アカウントのラベルを検索（なければ作成）
      let { data: label } = await supabase
        .from("line_labels")
        .select("id")
        .eq("account_id", targetAccountId)
        .eq("name", labelName)
        .maybeSingle();

      if (!label) {
        const { data: newLabel, error: createErr } = await supabase
          .from("line_labels")
          .insert({ account_id: targetAccountId, name: labelName, color: "#3B82F6" })
          .select("id")
          .single();
        if (createErr) return { ok: false, error: createErr.message };
        label = newLabel;
      }

      if (!label) return { ok: false, error: "failed to create label" };

      // ラベル付与
      const { error: assignErr } = await supabase
        .from("line_follower_labels")
        .upsert(
          { label_id: label.id, follower_id: targetFollower.id },
          { onConflict: "label_id,follower_id" },
        );
      if (assignErr) return { ok: false, error: assignErr.message };
      return { ok: true };
    }

    return { ok: false, error: `unknown action_type: ${rule.action_type}` };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

// ------------------------------------------------------------
// 指定ユーザー1人にシナリオのメッセージを一括 push
// （ステップ進行状態テーブルが無いため、delay=0 のメッセージだけ即送信）
// ------------------------------------------------------------
async function runStepSequenceForUser(
  accountId: string,
  lineUserId: string,
  sequenceId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  // 段階5 §16-9 Phase 3: ClickContext.project_id 用に project_id も取得
  const { data: acc } = await supabase
    .from("line_accounts")
    .select("channel_access_token, project_id")
    .eq("id", accountId)
    .maybeSingle();
  const token = acc?.channel_access_token as string | undefined;
  if (!token) return { ok: false, error: "access token missing" };
  const accountProjectId = (acc?.project_id as string | null) ?? null;

  // 全メッセージ取得（delay=0 の即時送信 + delay>0 のエンロールメント用）
  const { data: allMsgs } = await supabase
    .from("line_step_messages")
    .select("id, body, payload, step_order, delay_minutes")
    .eq("sequence_id", sequenceId)
    .order("step_order", { ascending: true });

  if (!allMsgs || allMsgs.length === 0) {
    return { ok: false, error: "no messages in sequence" };
  }

  const immediateMsgs = allMsgs.filter((m) => m.delay_minutes === 0);
  const delayedMsgs = allMsgs.filter((m) => m.delay_minutes > 0);

  // 段階5 §16-9 Phase 3: sequence の scenario_id を別 SELECT で取得(列不在環境では null フォールバック)
  let sequenceScenarioId: string | null = null;
  {
    const r = await supabase
      .from("line_step_sequences")
      .select("scenario_id")
      .eq("id", sequenceId)
      .maybeSingle();
    if (!r.error && r.data) {
      sequenceScenarioId = (r.data.scenario_id as string | null) ?? null;
    }
    // scenario_id 列が無い(Step 02 未適用)等 → null のまま継続
  }

  const { data: follower } = await supabase
    .from("line_followers")
    .select("id, display_name")
    .eq("line_account_id", accountId)
    .eq("line_user_id", lineUserId)
    .maybeSingle();
  const displayName = (follower?.display_name as string | null) ?? "ゲスト";
  const followerId = follower?.id as string | undefined;

  // 即時メッセージを送信
  // 段階5 §16-9 Phase 3: 即時送信(delay=0)のみ click-tracking 対象。
  //   delay > 0 のメッセージは line-step-delivery 側で送信・計測されるので、
  //   ここで重ねて token 発行すると二重計測になる(本ループは delay=0 のみ通る)。
  if (immediateMsgs.length > 0) {
    const builtPairs = immediateMsgs
      .map((m) => {
        const built = buildLineMessage(
          (m.payload as Record<string, unknown> | null) ?? { msgType: "text", body: m.body },
          displayName,
        );
        return built ? { built, step_message_id: m.id as string } : null;
      })
      .filter(
        (x): x is { built: Record<string, unknown>; step_message_id: string } => x !== null,
      );

    if (builtPairs.length > 0) {
      const lineMessages = builtPairs.map((p) => p.built);

      // URL 書き換え + token 永続化(失敗時は元メッセージで送信続行)
      let sendMessages: Array<Record<string, unknown>> = lineMessages;
      try {
        const ctxBase: ClickContext = {
          broadcast_sequence_id: sequenceId,
          step_message_id: "", // メッセージごとに上書き
          // 即時送信は enrollment 経由でない(enrollment 作成は delay > 0 メッセージ向け、
          // かつ作成タイミングは下のブロックで本送信より後)。よって null。
          step_enrollment_id: null,
          scenario_id: sequenceScenarioId,
          project_id: accountProjectId,
          follower_id: followerId ?? null,
          line_user_id: lineUserId,
        };
        const rewriteResults = builtPairs.map((p) =>
          rewriteUrlsInMessage(p.built, { ...ctxBase, step_message_id: p.step_message_id }),
        );
        const allTokens = rewriteResults.flatMap((r) => r.tokens);
        if (allTokens.length > 0) {
          const persistResult = await persistTokens(supabase, allTokens);
          if (persistResult.ok) {
            sendMessages = rewriteResults.map((r) => r.message);
          } else {
            console.error(
              "[action-rules] persistTokens failed, fallback to original URLs:",
              persistResult.error,
            );
          }
        }
      } catch (e) {
        console.error("[action-rules] click-tracking rewrite error, fallback:", e);
      }

      const res = await pushLineMessages(token, lineUserId, sendMessages);
      if (!res.ok) return { ok: false, error: `${res.status}: ${res.error}` };
    }
  }

  // N分後メッセージがある場合はエンロールメント作成
  if (delayedMsgs.length > 0 && followerId) {
    const maxImmediate = immediateMsgs.reduce((max, m) => Math.max(max, m.step_order), 0);
    try {
      await supabase.from("line_step_enrollments").upsert(
        {
          sequence_id: sequenceId,
          follower_id: followerId,
          account_id: accountId,
          line_user_id: lineUserId,
          enrolled_at: new Date().toISOString(),
          last_sent_step: maxImmediate,
          status: "active",
        },
        { onConflict: "sequence_id,follower_id" },
      );
    } catch (e) {
      console.error("[action-rules] enrollment insert failed:", e);
    }
  }

  return { ok: true };
}

// ------------------------------------------------------------
// 遅延キューの消化（cron から呼ぶ）
// ------------------------------------------------------------
export async function processPendingExecutions(limit = 100): Promise<{
  processed: number;
  success: number;
  failed: number;
  skipped: number;
}> {
  const nowIso = new Date().toISOString();

  const { data: pending, error } = await supabase
    .from("line_action_executions")
    .select("id, rule_id, account_id, follower_id, line_user_id, trigger_event, scheduled_at")
    .eq("status", "pending")
    .lte("scheduled_at", nowIso)
    .order("scheduled_at", { ascending: true })
    .limit(limit);

  if (error) {
    console.error("[action-rules] pending fetch failed:", error.message);
    return { processed: 0, success: 0, failed: 0, skipped: 0 };
  }

  let success = 0;
  let failed = 0;
  let skipped = 0;

  for (const exec of pending ?? []) {
    // ルール引き直し（pause されていれば skip）
    const { data: rule } = await supabase
      .from("line_action_rules")
      .select("*")
      .eq("id", exec.rule_id)
      .maybeSingle();

    if (!rule || rule.status !== "active") {
      await markExecution(exec.id as string, "skipped", null, "rule_inactive_or_deleted");
      skipped++;
      continue;
    }

    const ctx: TriggerContext = {
      account_id: exec.account_id as string,
      line_user_id: exec.line_user_id as string,
      follower_id: (exec.follower_id as string | null) ?? null,
      ...(exec.trigger_event as Record<string, unknown>),
    };

    // 実行直前にも条件を再評価（ラベルが付け外しされている可能性あり）
    const conds = (Array.isArray(rule.conditions) ? rule.conditions : []) as RuleCondition[];
    const nonDelay = conds.filter((c) => c.type !== "days_after_follow");
    const pass = await evaluateConditions(nonDelay, rule.account_id as string, ctx);
    if (!pass) {
      await markExecution(exec.id as string, "skipped", new Date().toISOString(), "condition_failed_on_execute");
      skipped++;
      continue;
    }

    const result = await executeAction(rule as ActionRule, ctx);
    if (result.ok) {
      await markExecution(exec.id as string, "success", new Date().toISOString(), null);
      success++;
    } else {
      await markExecution(exec.id as string, "failed", new Date().toISOString(), result.error);
      failed++;
    }
  }

  return { processed: pending?.length ?? 0, success, failed, skipped };
}

async function markExecution(
  id: string,
  status: "success" | "failed" | "skipped",
  executedAt: string | null,
  errorMessage: string | null,
): Promise<void> {
  await supabase
    .from("line_action_executions")
    .update({ status, executed_at: executedAt, error_message: errorMessage })
    .eq("id", id);
}

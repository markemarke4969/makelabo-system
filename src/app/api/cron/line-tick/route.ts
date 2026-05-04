import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";
import { processPendingExecutions } from "@/lib/action-rules";
import { dispatchNewsletter } from "@/lib/newsletter";
import { buildLineMessage, pushLineMessages } from "@/lib/line";
import {
  buildReplacerContext,
  buildBranchEvalContext,
  defaultContext,
} from "@/lib/line-replacer";

export const maxDuration = 300;

/**
 * LINE 関連 cron の統合実行エンドポイント。
 * Vercel Hobby プランの cron 数制約（2件）を回避するため、
 * 本エンドポイントを 5 分ごとに叩き、内部で各ジョブを順次実行する。
 *
 * 実行するジョブ:
 *   1. ステップ配信 (line_step_enrollments の消化)
 *   2. 予約配信 (line_step_sequences kind=schedule)
 *   3. 予約メルマガ (line_newsletters status=scheduled)
 *   4. アクションルール遅延実行 (line_action_executions status=pending)
 *   5. リマインダ配信 (line_reminders)
 */
function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  const auth = request.headers.get("authorization") ?? "";
  if (auth === `Bearer ${secret}`) return true;
  const query = request.nextUrl.searchParams.get("secret");
  return query === secret;
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const results: Record<string, unknown> = {};

  // 1. ステップ配信
  try {
    const r = await fetch(new URL("/api/cron/line-step-delivery", request.url), {
      headers: forwardAuth(request),
    });
    results.step_delivery = await safeJson(r);
  } catch (e) {
    results.step_delivery = { error: (e as Error).message };
  }

  // 2. 予約配信
  try {
    const r = await fetch(new URL("/api/cron/line-broadcast", request.url), {
      headers: forwardAuth(request),
    });
    results.broadcast = await safeJson(r);
  } catch (e) {
    results.broadcast = { error: (e as Error).message };
  }

  // 3. 予約メルマガ
  try {
    const nowIso = new Date().toISOString();
    const { data } = await supabase
      .from("line_newsletters")
      .select("id, name")
      .eq("status", "scheduled")
      .not("scheduled_at", "is", null)
      .lte("scheduled_at", nowIso)
      .limit(20);
    const list = (data ?? []) as Array<{ id: string; name: string }>;
    const out: Array<{ id: string; sent: number; failed: number; ok: boolean }> = [];
    for (const nl of list) {
      const r = await dispatchNewsletter(nl.id);
      out.push({ id: nl.id, sent: r.sent, failed: r.failed, ok: r.ok });
    }
    results.newsletter = { processed: list.length, results: out };
  } catch (e) {
    results.newsletter = { error: (e as Error).message };
  }

  // 4. アクションルール遅延実行
  try {
    const r = await processPendingExecutions(200);
    results.action_rules = r;
  } catch (e) {
    results.action_rules = { error: (e as Error).message };
  }

  // 5. リマインダ配信
  try {
    results.reminders = await processReminders();
  } catch (e) {
    results.reminders = { error: (e as Error).message };
  }

  // 6. 予約掘り起こし配信(段階8-2-E-3-2)
  try {
    const r = await fetch(new URL("/api/cron/line-reengagement-send", request.url), {
      headers: forwardAuth(request),
    });
    results.reengagement = await safeJson(r);
  } catch (e) {
    results.reengagement = { error: (e as Error).message };
  }

  return Response.json({ ok: true, results });
}

export async function POST(request: NextRequest) {
  return GET(request);
}

function forwardAuth(request: NextRequest): Record<string, string> {
  const auth = request.headers.get("authorization");
  const headers: Record<string, string> = {};
  if (auth) headers.Authorization = auth;
  return headers;
}

async function safeJson(r: Response): Promise<unknown> {
  try {
    return await r.json();
  } catch {
    return { status: r.status };
  }
}

// ------------------------------------------------------------
// リマインダ処理
// ------------------------------------------------------------
interface ReminderRow {
  id: string;
  account_id: string;
  name: string;
  base_date_field: string;
  status: string;
}

interface ReminderMsgRow {
  id: string;
  msg_order: number;
  offset_days: number;
  offset_time: string | null;
  body: string | null;
  payload: Record<string, unknown> | null;
}

async function processReminders(): Promise<{
  processed: number;
  sent: number;
  failed: number;
  completed: number;
}> {
  const { data: reminders, error } = await supabase
    .from("line_reminders")
    .select("id, account_id, name, base_date_field, status")
    .eq("status", "active")
    .limit(100);
  if (error) {
    // テーブル未作成
    if ((error as { code?: string }).code === "42P01") {
      return { processed: 0, sent: 0, failed: 0, completed: 0 };
    }
    throw error;
  }

  const list = (reminders ?? []) as ReminderRow[];
  let totalSent = 0;
  let totalFailed = 0;
  let totalCompleted = 0;

  // アカウントごとのトークンキャッシュ
  const tokenCache = new Map<string, string | null>();

  for (const rem of list) {
    // メッセージ取得
    const { data: msgs } = await supabase
      .from("line_reminder_messages")
      .select("id, msg_order, offset_days, offset_time, body, payload")
      .eq("reminder_id", rem.id)
      .order("msg_order", { ascending: true });
    const messages = (msgs ?? []) as ReminderMsgRow[];
    if (messages.length === 0) continue;

    // base_date_field の field_id 解決（カスタムフィールド）
    const { data: field } = await supabase
      .from("line_custom_fields")
      .select("id")
      .eq("account_id", rem.account_id)
      .eq("field_key", rem.base_date_field)
      .maybeSingle();
    if (!field) continue; // 基準日フィールドが未設定

    // 対象フォロワー: カスタム値に日付が入っているもの
    const { data: values } = await supabase
      .from("line_follower_custom_values")
      .select("follower_id, value")
      .eq("field_id", field.id);
    const followers = ((values ?? []) as Array<{ follower_id: string; value: string | null }>).filter(
      (v) => v.value && /^\d{4}-\d{2}-\d{2}/.test(v.value),
    );
    if (followers.length === 0) continue;

    // アクセストークン取得
    if (!tokenCache.has(rem.account_id)) {
      const { data: acc } = await supabase
        .from("line_accounts")
        .select("channel_access_token")
        .eq("id", rem.account_id)
        .maybeSingle();
      tokenCache.set(rem.account_id, (acc?.channel_access_token as string) ?? null);
    }
    const token = tokenCache.get(rem.account_id);
    if (!token) continue;

    // フォロワーごとに due 判定
    const nowMs = Date.now();
    interface EnrollmentRow {
      id: string;
      last_sent_order: number;
      status: string;
    }
    for (const f of followers) {
      // enrollment を取得または作成
      let enrollment: EnrollmentRow | null = null;

      const { data: existing } = await supabase
        .from("line_reminder_enrollments")
        .select("id, last_sent_order, status")
        .eq("reminder_id", rem.id)
        .eq("follower_id", f.follower_id)
        .maybeSingle();

      if (existing) {
        enrollment = existing as unknown as EnrollmentRow;
      } else {
        const { data: created } = await supabase
          .from("line_reminder_enrollments")
          .insert({
            reminder_id: rem.id,
            follower_id: f.follower_id,
            base_date: (f.value ?? "").slice(0, 10),
            status: "active",
            last_sent_order: 0,
          })
          .select("id, last_sent_order, status")
          .single();
        enrollment = (created ?? null) as unknown as EnrollmentRow | null;
      }

      if (!enrollment || enrollment.status !== "active") continue;

      const baseDate = (f.value ?? "").slice(0, 10);
      if (!baseDate) continue;

      // follower の line_user_id を解決
      const { data: follower } = await supabase
        .from("line_followers")
        .select("line_user_id, display_name, status")
        .eq("id", f.follower_id)
        .maybeSingle();
      if (!follower || follower.status !== "following") continue;
      const lineUserId = follower.line_user_id as string;

      // due メッセージ
      const dueMsgs = messages.filter((m) => {
        if (m.msg_order <= enrollment!.last_sent_order) return false;
        const [hh, mm] = (m.offset_time || "09:00").split(":").map((v) => Number(v) || 0);
        const target = new Date(`${baseDate}T00:00:00`);
        target.setDate(target.getDate() + (m.offset_days ?? 0));
        target.setHours(hh, mm, 0, 0);
        return nowMs >= target.getTime();
      });
      if (dueMsgs.length === 0) continue;

      // 置換コンテキスト
      const [replacerCtx, branchCtx] = await Promise.all([
        buildReplacerContext(supabase, { id: f.follower_id }).catch(() =>
          defaultContext((follower.display_name as string | null) ?? "ゲスト"),
        ),
        buildBranchEvalContext(supabase, { id: f.follower_id }).catch(() => ({
          label_ids: [],
          inflow_route_id: null,
          custom_fields: {},
        })),
      ]);

      let maxSentOrder = enrollment.last_sent_order;
      for (const msg of dueMsgs) {
        const payload = (msg.payload as Record<string, unknown> | null) ?? {
          msgType: "text",
          body: msg.body,
        };
        const lineMsg = buildLineMessage(payload, replacerCtx, branchCtx);
        if (!lineMsg) {
          maxSentOrder = Math.max(maxSentOrder, msg.msg_order);
          continue;
        }
        const res = await pushLineMessages(token, lineUserId, [lineMsg]);
        if (res.ok) {
          totalSent++;
          maxSentOrder = Math.max(maxSentOrder, msg.msg_order);
          await supabase.from("line_messages").insert({
            line_account_id: rem.account_id,
            line_user_id: lineUserId,
            direction: "outgoing",
            message_type: "reminder",
            message_text: `[リマインダ] ${rem.name}`,
            sent_at: new Date().toISOString(),
          });
        } else {
          totalFailed++;
          console.error(
            `[cron/line-tick] reminder send failed: reminder=${rem.id} msg_order=${msg.msg_order}`,
            res.status,
            res.error,
          );
        }
      }

      // 完了チェック
      const remaining = messages.filter((m) => m.msg_order > maxSentOrder);
      const newStatus = remaining.length === 0 ? "completed" : "active";
      if (newStatus === "completed") totalCompleted++;
      if (maxSentOrder !== enrollment.last_sent_order || newStatus !== enrollment.status) {
        await supabase
          .from("line_reminder_enrollments")
          .update({ last_sent_order: maxSentOrder, status: newStatus })
          .eq("id", enrollment.id);
      }
    }
  }

  return {
    processed: list.length,
    sent: totalSent,
    failed: totalFailed,
    completed: totalCompleted,
  };
}

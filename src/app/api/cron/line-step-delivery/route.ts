import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";
import { buildLineMessage, pushLineMessages } from "@/lib/line";

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
}

interface StepMsgRow {
  id: string;
  step_order: number;
  delay_minutes: number;
  body: string | null;
  payload: Record<string, unknown> | null;
}

async function runStepDelivery(): Promise<{
  processed: number;
  sent: number;
  failed: number;
  completed: number;
}> {
  // 1. active なエンロールメントを取得（最大200件）
  const { data: enrollments, error } = await supabase
    .from("line_step_enrollments")
    .select("id, sequence_id, follower_id, account_id, line_user_id, enrolled_at, last_sent_step")
    .eq("status", "active")
    .order("enrolled_at", { ascending: true })
    .limit(200);

  if (error) {
    throw new Error(`enrollments fetch failed: ${error.message}`);
  }

  const rows = (enrollments ?? []) as EnrollmentRow[];
  let sent = 0;
  let failed = 0;
  let completed = 0;

  // アカウント→トークンのキャッシュ
  const tokenCache = new Map<string, string | null>();

  for (const enr of rows) {
    // 2. シーケンスのステップメッセージ（last_sent_step より大きいもの）を取得
    const { data: msgs } = await supabase
      .from("line_step_messages")
      .select("id, step_order, delay_minutes, body, payload")
      .eq("sequence_id", enr.sequence_id)
      .gt("step_order", enr.last_sent_step)
      .order("step_order", { ascending: true });

    const steps = (msgs ?? []) as StepMsgRow[];
    if (steps.length === 0) {
      // 全ステップ送信済み → completed
      await supabase
        .from("line_step_enrollments")
        .update({ status: "completed", updated_at: new Date().toISOString() })
        .eq("id", enr.id);
      completed++;
      continue;
    }

    // 3. enrolled_at からの経過分を計算
    const enrolledAt = new Date(enr.enrolled_at).getTime();
    const nowMs = Date.now();
    const elapsedMinutes = (nowMs - enrolledAt) / (1000 * 60);

    // 4. due なメッセージ（delay_minutes <= elapsedMinutes）を抽出
    const dueMessages = steps.filter((m) => m.delay_minutes <= elapsedMinutes);
    if (dueMessages.length === 0) continue;

    // 5. アクセストークン取得
    if (!tokenCache.has(enr.account_id)) {
      const { data: acc } = await supabase
        .from("line_accounts")
        .select("channel_access_token")
        .eq("id", enr.account_id)
        .maybeSingle();
      tokenCache.set(enr.account_id, (acc?.channel_access_token as string) ?? null);
    }
    const token = tokenCache.get(enr.account_id);
    if (!token) {
      failed += dueMessages.length;
      continue;
    }

    // 6. フォロワーの display_name 取得
    const { data: follower } = await supabase
      .from("line_followers")
      .select("display_name")
      .eq("id", enr.follower_id)
      .maybeSingle();
    const displayName = (follower?.display_name as string) ?? "ゲスト";

    // 7. メッセージ送信
    let maxSentStep = enr.last_sent_step;
    for (const msg of dueMessages) {
      const payload = (msg.payload as Record<string, unknown> | null) ?? {
        msgType: "text",
        body: msg.body,
      };
      const lineMsg = buildLineMessage(payload, displayName);
      if (!lineMsg) {
        maxSentStep = Math.max(maxSentStep, msg.step_order);
        continue;
      }

      const res = await pushLineMessages(token, enr.line_user_id, [lineMsg]);
      if (res.ok) {
        sent++;
        maxSentStep = Math.max(maxSentStep, msg.step_order);
        // チャット画面表示用ログ
        await supabase.from("line_messages").insert({
          line_account_id: enr.account_id,
          line_user_id: enr.line_user_id,
          direction: "outgoing",
          message_type: "step",
          message_text: `[ステップ配信] step ${msg.step_order}`,
          sent_at: new Date().toISOString(),
        });
      } else {
        failed++;
        console.error(
          `[cron/line-step-delivery] send failed: enrollment=${enr.id} step=${msg.step_order}`,
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

import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";
import { buildLineMessage, pushLineMessages } from "@/lib/line";
import {
  DeliveryCondition,
  FollowerLite,
  evalCondition,
} from "@/lib/delivery-conditions";
import { fireTrigger } from "@/lib/action-rules";

export const maxDuration = 300;

// 並列送信のチャンクサイズ（LINE API レート対策）
const PUSH_CONCURRENCY = 20;

interface SequenceRow {
  id: string;
  account_id: string;
  name: string;
  scheduled_at: string;
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

async function runBroadcast(): Promise<{
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

  // 1. 到来した予約配信を取得
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

  const sequences = (seqs ?? []) as SequenceRow[];
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
    const result = await processSequence(seq);
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

async function processSequence(seq: SequenceRow): Promise<{
  sent: number;
  failed: number;
  skipped_reason?: string;
}> {
  // 2. アカウント取得
  const { data: account } = await supabase
    .from("line_accounts")
    .select("id, channel_access_token")
    .eq("id", seq.account_id)
    .maybeSingle<AccountRow>();

  if (!account || !account.channel_access_token) {
    await markSent(seq.id);
    return { sent: 0, failed: 0, skipped_reason: "account_or_token_missing" };
  }

  // 3. メッセージ取得（step_order 順）
  const { data: msgs } = await supabase
    .from("line_step_messages")
    .select("id, step_order, body, payload")
    .eq("sequence_id", seq.id)
    .order("step_order", { ascending: true });

  const stepMessages = (msgs ?? []) as StepMessageRow[];
  if (stepMessages.length === 0) {
    await markSent(seq.id);
    return { sent: 0, failed: 0, skipped_reason: "no_messages" };
  }

  // 4. フォロワー取得（status='following' のみ）+ target_condition でフィルタ
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
    await markSent(seq.id);
    return { sent: 0, failed: 0, skipped_reason: "no_followers" };
  }

  // 5. 並列送信 + ログ記録
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
        const lineMessages = stepMessages
          .map((m) =>
            buildLineMessage(
              (m.payload as Record<string, unknown>) ?? { msgType: "text", body: m.body },
              f.display_name ?? "ゲスト",
            ),
          )
          .filter((x): x is Record<string, unknown> => x !== null);

        if (lineMessages.length === 0) {
          return { ok: false as const, status: 0, error: "no_valid_messages", follower: f };
        }

        const res = await pushLineMessages(
          account.channel_access_token!,
          f.line_user_id,
          lineMessages,
        );
        return { ...res, follower: f } as
          | { ok: true; follower: FollowerRow }
          | { ok: false; status: number; error: string; follower: FollowerRow };
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
        // 既存の line_messages にも送信履歴を残す（チャット画面表示用）
        await supabase.from("line_messages").insert({
          line_account_id: account.id,
          line_user_id: r.follower.line_user_id,
          direction: "outgoing",
          message_type: "broadcast",
          message_text: `[予約配信] ${seq.name}`,
          sent_at: new Date().toISOString(),
        });
        // アクションルール発火（sequence_completed）
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

  // 6. ログを一括挿入
  if (logRows.length > 0) {
    const { error: logErr } = await supabase
      .from("line_broadcast_logs")
      .insert(logRows);
    if (logErr) {
      console.error("[cron/line-broadcast] log insert failed:", logErr.message);
    }
  }

  // 7. 送信完了マーク
  await markSent(seq.id);

  return { sent, failed };
}

async function markSent(sequenceId: string) {
  await supabase
    .from("line_step_sequences")
    .update({ sent_at: new Date().toISOString() })
    .eq("id", sequenceId);
}

function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  // CRON_SECRET 未設定なら認証不要（開発用）
  if (!secret) return true;
  const auth = request.headers.get("authorization") ?? "";
  if (auth === `Bearer ${secret}`) return true;
  // クエリパラメータでも受け付ける（cron-job.org のシンプル設定用）
  const query = request.nextUrl.searchParams.get("secret");
  if (query === secret) return true;
  return false;
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const result = await runBroadcast();
    return Response.json({ ok: true, ...result });
  } catch (e) {
    console.error("[cron/line-broadcast] error:", e);
    return Response.json(
      { error: (e as Error).message },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  return GET(request);
}

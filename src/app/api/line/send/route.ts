import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";

export async function POST(request: NextRequest) {
  const { line_user_id, message } = await request.json();

  if (!line_user_id || !message) {
    return Response.json({ error: "line_user_id and message are required" }, { status: 400 });
  }

  // アカウント情報を取得（アクティブな最初のアカウント）
  const { data: account, error: accErr } = await supabase
    .from("line_accounts")
    .select("id, channel_access_token")
    .eq("is_active", true)
    .limit(1)
    .single();

  if (accErr || !account) {
    return Response.json({ error: "有効なLINEアカウントが見つかりません" }, { status: 500 });
  }

  // LINE Push Message API
  const res = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${account.channel_access_token}`,
    },
    body: JSON.stringify({
      to: line_user_id,
      messages: [{ type: "text", text: message }],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error("[LINE Send] 送信失敗:", err);
    return Response.json({ error: `LINE API error: ${res.status}` }, { status: 500 });
  }

  // 送信履歴をDBに保存
  await supabase.from("line_messages").insert({
    line_account_id: account.id,
    line_user_id,
    direction: "outgoing",
    message_type: "text",
    message_text: message,
    sent_at: new Date().toISOString(),
  });

  return Response.json({ ok: true });
}

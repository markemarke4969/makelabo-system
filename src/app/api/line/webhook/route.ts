import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";
import { getLineConfig, verifySignature, getProfile } from "@/lib/line";

export async function POST(request: NextRequest) {
  let channelSecret: string;
  let channelAccessToken: string;
  try {
    ({ channelSecret, channelAccessToken } = getLineConfig());
  } catch (e) {
    console.error("[LINE Webhook] 環境変数エラー:", e);
    return Response.json({ error: "Server config error" }, { status: 500 });
  }

  // リクエストボディを取得
  const body = await request.text();
  const signature = request.headers.get("x-line-signature") ?? "";

  console.log("[LINE Webhook] body length:", body.length);
  console.log("[LINE Webhook] signature:", signature ? "あり" : "なし");
  console.log("[LINE Webhook] secret prefix:", channelSecret.slice(0, 6) + "...");
  console.log("[LINE Webhook] secret length:", channelSecret.length);

  // 署名検証
  if (!verifySignature(body, signature, channelSecret)) {
    console.error("[LINE Webhook] 署名検証失敗");
    console.error("[LINE Webhook] body:", body.slice(0, 200));
    return Response.json({ error: "Invalid signature" }, { status: 403 });
  }

  const payload = JSON.parse(body);
  console.log("[LINE Webhook 受信]", JSON.stringify(payload, null, 2));

  // LINE Developers検証リクエスト（events空）は即200返却
  if (!payload.events || payload.events.length === 0) {
    console.log("[LINE Webhook] 検証リクエスト - OK");
    return Response.json({ ok: true });
  }

  // line_accountsからアカウント取得（初回は自動作成）
  let { data: account } = await supabase
    .from("line_accounts")
    .select("id")
    .eq("channel_secret", channelSecret)
    .single();

  if (!account) {
    const { data: created } = await supabase
      .from("line_accounts")
      .insert({
        channel_id: payload.destination ?? "unknown",
        channel_secret: channelSecret,
        channel_access_token: channelAccessToken,
        account_name: "LINE公式アカウント",
      })
      .select("id")
      .single();
    account = created;
  }

  if (!account) {
    console.error("[LINE Webhook] アカウント取得/作成失敗");
    return Response.json({ error: "Account error" }, { status: 500 });
  }

  // イベント処理
  for (const event of payload.events ?? []) {
    console.log(`[LINE Webhook] event.type=${event.type}, userId=${event.source?.userId}`);

    // 全イベントをline_messagesに保存
    await saveEvent(event, account.id);

    if (event.type === "follow") {
      await handleFollow(event, account.id, channelAccessToken);
    } else if (event.type === "unfollow") {
      await handleUnfollow(event, account.id);
    } else if (event.type === "block") {
      await handleBlock(event, account.id);
    }
  }

  return Response.json({ ok: true });
}

async function handleFollow(
  event: { source: { userId: string } },
  accountId: string,
  accessToken: string,
) {
  const userId = event.source.userId;

  // プロフィール取得
  const profile = await getProfile(userId, accessToken);
  console.log("[LINE Webhook] follow profile:", profile);

  // upsert（再フォロー対応）
  const { error } = await supabase
    .from("line_followers")
    .upsert(
      {
        line_account_id: accountId,
        line_user_id: userId,
        display_name: profile?.displayName ?? null,
        picture_url: profile?.pictureUrl ?? null,
        status: "following",
        followed_at: new Date().toISOString(),
        unfollowed_at: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "line_account_id,line_user_id" },
    );

  if (error) {
    console.error("[LINE Webhook] follower upsert失敗:", error.message);
  }
}

async function handleUnfollow(
  event: { source: { userId: string } },
  accountId: string,
) {
  const { error } = await supabase
    .from("line_followers")
    .update({
      status: "unfollowed",
      unfollowed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("line_account_id", accountId)
    .eq("line_user_id", event.source.userId);

  if (error) {
    console.error("[LINE Webhook] unfollow更新失敗:", error.message);
  }
}

async function saveEvent(
  event: { type: string; message?: { id: string; type: string; text?: string }; source: { userId: string }; replyToken?: string; timestamp: number },
  accountId: string,
) {
  const { error } = await supabase
    .from("line_messages")
    .insert({
      line_account_id: accountId,
      line_user_id: event.source.userId,
      direction: "incoming",
      message_type: event.type === "message" ? event.message?.type ?? "text" : event.type,
      message_text: event.message?.text ?? null,
      raw_event: event,
      line_message_id: event.message?.id ?? null,
      reply_token: event.replyToken ?? null,
      sent_at: new Date(event.timestamp).toISOString(),
    });

  if (error) {
    console.error("[LINE Webhook] event保存失敗:", error.message);
  }
}

async function handleBlock(
  event: { source: { userId: string } },
  accountId: string,
) {
  const { error } = await supabase
    .from("line_followers")
    .update({
      status: "blocked",
      updated_at: new Date().toISOString(),
    })
    .eq("line_account_id", accountId)
    .eq("line_user_id", event.source.userId);

  if (error) {
    console.error("[LINE Webhook] block更新失敗:", error.message);
  }
}

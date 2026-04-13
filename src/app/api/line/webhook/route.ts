import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";
import { verifySignature, getProfile } from "@/lib/line";
import { fireTrigger } from "@/lib/action-rules";

interface LineAccountRow {
  id: string;
  channel_id: string | null;
  channel_secret: string | null;
  channel_access_token: string | null;
  greeting_message: string | null;
  project_id: string | null;
}

interface LineEvent {
  type: string;
  source: { userId: string };
  replyToken?: string;
  timestamp: number;
  message?: { id: string; type: string; text?: string };
}

async function logWebhookAttempt(
  body: string,
  signature: string,
  matched: { id: string; channel_id: string | null } | null,
  verifyResult: string,
  eventTypes: string[],
) {
  try {
    await supabase.from("line_webhook_logs").insert({
      received_at: new Date().toISOString(),
      signature_header: signature ? signature.slice(0, 16) + "..." : null,
      body_preview: body.slice(0, 1000),
      matched_account_id: matched?.id ?? null,
      matched_channel_id: matched?.channel_id ?? null,
      verify_result: verifyResult,
      event_types: eventTypes,
    });
  } catch (e) {
    console.error("[LINE Webhook] webhook log insert failed:", e);
  }
}

export async function POST(request: NextRequest) {
  const body = await request.text();
  const signature = request.headers.get("x-line-signature") ?? "";

  console.log("[LINE Webhook] body length:", body.length);

  // 登録されている全アカウントを取得 → 署名が一致する secret を持つアカウントを特定
  let accounts: LineAccountRow[] = [];
  {
    // greeting_message カラム未作成環境への fallback
    const res = await supabase
      .from("line_accounts")
      .select("id, channel_id, channel_secret, channel_access_token, greeting_message, project_id");
    if (res.error && /greeting_message/.test(res.error.message)) {
      const fb = await supabase
        .from("line_accounts")
        .select("id, channel_id, channel_secret, channel_access_token, project_id");
      if (fb.error) {
        console.error("[LINE Webhook] accounts fetch error:", fb.error.message);
        return Response.json({ error: "DB error" }, { status: 500 });
      }
      accounts = (fb.data ?? []).map((a) => ({ ...a, greeting_message: null }));
    } else if (res.error) {
      console.error("[LINE Webhook] accounts fetch error:", res.error.message);
      return Response.json({ error: "DB error" }, { status: 500 });
    } else {
      accounts = (res.data ?? []) as LineAccountRow[];
    }
  }

  // 署名一致するアカウントを探す
  let matchedAccount: LineAccountRow | null = null;
  for (const acc of accounts) {
    if (!acc.channel_secret) continue;
    if (verifySignature(body, signature, acc.channel_secret)) {
      matchedAccount = acc;
      break;
    }
  }

  if (!matchedAccount) {
    console.error(
      "[LINE Webhook] 署名検証失敗 - 登録済み",
      accounts.length,
      "アカウントどれも一致せず",
    );
    await logWebhookAttempt(body, signature, null, "no_account_matched", []);
    return Response.json({ error: "Invalid signature" }, { status: 403 });
  }

  console.log("[LINE Webhook] 署名一致:", matchedAccount.id, matchedAccount.channel_id);

  let payload: { events?: LineEvent[]; destination?: string };
  try {
    payload = JSON.parse(body);
  } catch {
    await logWebhookAttempt(body, signature, matchedAccount, "invalid_json", []);
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const eventTypes = (payload.events ?? []).map((e) => e.type);
  await logWebhookAttempt(body, signature, matchedAccount, "verified", eventTypes);

  // LINE Developers 検証リクエスト（events 空）
  if (!payload.events || payload.events.length === 0) {
    console.log("[LINE Webhook] 検証リクエスト - OK");
    return Response.json({ ok: true });
  }

  for (const event of payload.events) {
    console.log(`[LINE Webhook] event.type=${event.type}, userId=${event.source?.userId}`);

    await saveEvent(event, matchedAccount.id);

    if (event.type === "follow") {
      await handleFollow(event, matchedAccount);
      await fireTrigger("follow", {
        account_id: matchedAccount.id,
        line_user_id: event.source.userId,
      });
    } else if (event.type === "unfollow") {
      await handleUnfollow(event, matchedAccount.id);
    } else if (event.type === "block") {
      await handleBlock(event, matchedAccount.id);
    } else if (event.type === "message") {
      await fireTrigger("message_received", {
        account_id: matchedAccount.id,
        line_user_id: event.source.userId,
        message_text: event.message?.text ?? null,
      });
    }
  }

  return Response.json({ ok: true });
}

async function handleFollow(event: LineEvent, account: LineAccountRow) {
  const userId = event.source.userId;

  // プロフィール取得
  const profile = account.channel_access_token
    ? await getProfile(userId, account.channel_access_token)
    : null;
  console.log("[LINE Webhook] follow profile:", profile);

  // upsert（再フォロー対応）
  const { data: upserted, error } = await supabase
    .from("line_followers")
    .upsert(
      {
        line_account_id: account.id,
        line_user_id: userId,
        display_name: profile?.displayName ?? null,
        picture_url: profile?.pictureUrl ?? null,
        status: "following",
        followed_at: new Date().toISOString(),
        unfollowed_at: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "line_account_id,line_user_id" },
    )
    .select("id, inflow_route_id")
    .maybeSingle();

  if (error) {
    console.error("[LINE Webhook] follower upsert失敗:", error.message);
  }

  // 流入経路の紐付け: 直近30分以内の未消費クリックで最新のものを同一案件内から探す
  // LINE webhook には流入情報が来ないため時間窓ヒューリスティックで対応。
  // 既に inflow_route_id が入っている follower（再フォロー等）は上書きしない。
  if (upserted && !upserted.inflow_route_id && account.project_id) {
    try {
      const since = new Date(Date.now() - 30 * 60 * 1000).toISOString();
      const { data: routesOfProject } = await supabase
        .from("line_inflow_routes")
        .select("id")
        .eq("project_id", account.project_id);
      const routeIds = (routesOfProject ?? []).map((r) => r.id as string);

      if (routeIds.length > 0) {
        const { data: recentClick } = await supabase
          .from("line_inflow_clicks")
          .select("id, inflow_route_id")
          .in("inflow_route_id", routeIds)
          .is("follower_id", null)
          .gte("clicked_at", since)
          .order("clicked_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (recentClick) {
          await supabase
            .from("line_followers")
            .update({ inflow_route_id: recentClick.inflow_route_id })
            .eq("id", upserted.id);
          await supabase
            .from("line_inflow_clicks")
            .update({ follower_id: upserted.id })
            .eq("id", recentClick.id);
          console.log(
            `[LINE Webhook] 流入紐付け: follower=${upserted.id} ← click=${recentClick.id} (route=${recentClick.inflow_route_id})`,
          );
        }
      }
    } catch (e) {
      console.error("[LINE Webhook] 流入紐付け失敗:", e);
    }
  }

  // カスタム挨拶メッセージを送信（設定されていれば）
  if (account.greeting_message && account.channel_access_token && event.replyToken) {
    const text = account.greeting_message.replace(
      /\{display_name\}/g,
      profile?.displayName ?? "ゲスト",
    );
    try {
      const res = await fetch("https://api.line.me/v2/bot/message/reply", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${account.channel_access_token}`,
        },
        body: JSON.stringify({
          replyToken: event.replyToken,
          messages: [{ type: "text", text }],
        }),
      });
      if (!res.ok) {
        const errText = await res.text();
        console.error("[LINE Webhook] 挨拶送信失敗:", res.status, errText);
      }
    } catch (e) {
      console.error("[LINE Webhook] 挨拶送信例外:", e);
    }
  }

  // ステップ配信: 「登録直後 (delay_minutes = 0)」の step_messages を push
  if (account.channel_access_token) {
    try {
      const { data: sequences } = await supabase
        .from("line_step_sequences")
        .select("id")
        .eq("account_id", account.id)
        .eq("status", "active");

      const sequenceIds = (sequences ?? []).map((s) => s.id as string);
      if (sequenceIds.length > 0) {
        const { data: msgs } = await supabase
          .from("line_step_messages")
          .select("id, body, step_order, sequence_id, delay_minutes")
          .in("sequence_id", sequenceIds)
          .eq("delay_minutes", 0)
          .order("step_order", { ascending: true });

        for (const msg of msgs ?? []) {
          if (!msg.body) continue;
          const text = String(msg.body).replace(
            /\{display_name\}/g,
            profile?.displayName ?? "ゲスト",
          );
          try {
            const res = await fetch("https://api.line.me/v2/bot/message/push", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${account.channel_access_token}`,
              },
              body: JSON.stringify({
                to: userId,
                messages: [{ type: "text", text }],
              }),
            });
            if (!res.ok) {
              const errText = await res.text();
              console.error(
                "[LINE Webhook] 登録直後ステップ送信失敗:",
                res.status,
                errText,
              );
            }
          } catch (e) {
            console.error("[LINE Webhook] 登録直後ステップ送信例外:", e);
          }
        }
      }
    } catch (e) {
      console.error("[LINE Webhook] ステップ配信起動失敗:", e);
    }
  }
}

async function handleUnfollow(event: LineEvent, accountId: string) {
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

async function saveEvent(event: LineEvent, accountId: string) {
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

async function handleBlock(event: LineEvent, accountId: string) {
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

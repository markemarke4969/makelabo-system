import { NextRequest } from "next/server";
import { supabase, supabaseAdmin } from "@/lib/supabase";
import { verifySignature, getProfile, buildLineMessage, pushLineMessages, summarizeBuiltMessage } from "@/lib/line";
import { fireTrigger } from "@/lib/action-rules";

interface LineAccountRow {
  id: string;
  channel_id: string | null;
  channel_secret: string | null;
  channel_access_token: string | null;
  greeting_message: string | null;
  project_id: string | null;
  role: string | null;
}

interface LineEvent {
  type: string;
  source: { userId: string };
  replyToken?: string;
  timestamp: number;
  message?: {
    id: string;
    type: string;
    text?: string;
    stickerId?: string;
    packageId?: string;
    stickerResourceType?: string;
    emojis?: Array<{ index: number; length: number; productId: string; emojiId: string }>;
    contentProvider?: { type: string; originalContentUrl?: string; previewImageUrl?: string };
    fileName?: string;
    fileSize?: number;
    title?: string;
    address?: string;
    latitude?: number;
    longitude?: number;
  };
  postback?: { data: string };
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
      .select("id, channel_id, channel_secret, channel_access_token, greeting_message, project_id, role");
    if (res.error && /greeting_message/.test(res.error.message)) {
      const fb = await supabase
        .from("line_accounts")
        .select("id, channel_id, channel_secret, channel_access_token, project_id, role");
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
    } else if (event.type === "postback") {
      console.log(`[LINE Webhook] postback data=${event.postback?.data}`);
      await handlePostback(event, matchedAccount);
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

  // BAN対策: 同一 project_id 内の他アカウントに同 userId の follower 行が
  // 既に存在するかを探す。見つかったら「復元対象」として、挨拶メッセージを
  // スキップし、restored_from_* を記録する。
  let restoredFrom: { account_id: string; follower_id: string } | null = null;
  if (account.project_id) {
    try {
      // 同一案件のアカウントID一覧
      const { data: siblingAccs } = await supabase
        .from("line_accounts")
        .select("id")
        .eq("project_id", account.project_id);
      const siblingIds = (siblingAccs ?? [])
        .map((a) => a.id as string)
        .filter((id) => id !== account.id);

      if (siblingIds.length > 0) {
        const { data: priorFollowers } = await supabase
          .from("line_followers")
          .select("id, line_account_id, followed_at")
          .eq("line_user_id", userId)
          .in("line_account_id", siblingIds)
          .order("followed_at", { ascending: false })
          .limit(1);
        if (priorFollowers && priorFollowers.length > 0) {
          const prior = priorFollowers[0] as {
            id: string;
            line_account_id: string;
            followed_at: string;
          };
          restoredFrom = {
            account_id: prior.line_account_id,
            follower_id: prior.id,
          };
          console.log(
            `[LINE Webhook] 復元対象検出: user=${userId} prior_account=${prior.line_account_id} prior_follower=${prior.id}`,
          );
        }
      }
    } catch (e) {
      console.error("[LINE Webhook] 復元判定失敗:", e);
    }
  }

  // upsert（再フォロー対応）
  // upsert + select の同時実行は maybeSingle で null が返る既知の挙動があるため、
  // upsert と select を分離する
  const upsertBase: Record<string, unknown> = {
    line_account_id: account.id,
    line_user_id: userId,
    display_name: profile?.displayName ?? null,
    picture_url: profile?.pictureUrl ?? null,
    status: "following",
    followed_at: new Date().toISOString(),
    unfollowed_at: null,
    updated_at: new Date().toISOString(),
  };
  if (restoredFrom) {
    upsertBase.restored_from_account_id = restoredFrom.account_id;
    upsertBase.restored_from_follower_id = restoredFrom.follower_id;
    upsertBase.restored_at = new Date().toISOString();
  }

  // ステップ1: upsert のみ実行 (restored_* カラム未作成環境への fallback 付き)
  let upsertRes = await supabase
    .from("line_followers")
    .upsert(upsertBase, { onConflict: "line_account_id,line_user_id" });
  if (
    upsertRes.error &&
    /restored_from_account_id|restored_from_follower_id|restored_at/.test(upsertRes.error.message)
  ) {
    console.warn("[LINE Webhook] restored_* カラム未作成 → migration 推奨。復元記録なしで再試行");
    const fallback = { ...upsertBase };
    delete fallback.restored_from_account_id;
    delete fallback.restored_from_follower_id;
    delete fallback.restored_at;
    upsertRes = await supabase
      .from("line_followers")
      .upsert(fallback, { onConflict: "line_account_id,line_user_id" });
  }
  if (upsertRes.error) {
    console.error("[LINE Webhook] follower upsert失敗:", upsertRes.error.message);
  }

  // ステップ2: 対象行を一意キーで別 select → inflow_route_id カラム有無を判定しつつ取得
  let upserted: { id: string; inflow_route_id: string | null } | null = null;
  let hasInflowCol = true;

  const sel1 = await supabase
    .from("line_followers")
    .select("id, inflow_route_id")
    .eq("line_account_id", account.id)
    .eq("line_user_id", userId)
    .maybeSingle();

  if (sel1.error && /inflow_route_id/.test(sel1.error.message)) {
    hasInflowCol = false;
    console.warn("[LINE Webhook] inflow_route_id カラム未作成 → migration 推奨");
    const sel2 = await supabase
      .from("line_followers")
      .select("id")
      .eq("line_account_id", account.id)
      .eq("line_user_id", userId)
      .maybeSingle();
    if (!sel2.error && sel2.data) {
      upserted = { id: sel2.data.id as string, inflow_route_id: null };
    }
  } else if (sel1.error) {
    console.error("[LINE Webhook] follower select失敗:", sel1.error.message);
  } else if (sel1.data) {
    upserted = {
      id: sel1.data.id as string,
      inflow_route_id: (sel1.data as { inflow_route_id: string | null }).inflow_route_id ?? null,
    };
  }

  console.log(
    `[LINE Webhook] follower upsert完了: id=${upserted?.id ?? "(null)"}, existing_inflow=${upserted?.inflow_route_id ?? "(null)"}, project_id=${account.project_id ?? "(null)"}, hasInflowCol=${hasInflowCol}`,
  );

  // 流入経路の紐付け: 直近60分以内の未消費クリックで最新のものを同一案件内から探す
  // LINE webhook には流入情報が来ないため時間窓ヒューリスティックで対応。
  // カラム未作成の場合はスキップ。
  if (hasInflowCol && upserted && !upserted.inflow_route_id && account.project_id) {
    try {
      const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const { data: routesOfProject } = await supabase
        .from("line_inflow_routes")
        .select("id")
        .eq("project_id", account.project_id);
      const routeIds = (routesOfProject ?? []).map((r) => r.id as string);

      if (routeIds.length === 0) {
        console.log(`[LINE Webhook] 流入紐付けスキップ: project=${account.project_id} に流入経路なし`);
      } else {
        // line_inflow_clicks の RLS で anon の SELECT が塞がっていることがあるため
        // service role クライアントで検索・更新する
        const { data: recentClick, error: clickErr } = await supabaseAdmin
          .from("line_inflow_clicks")
          .select("id, inflow_route_id, clicked_at")
          .in("inflow_route_id", routeIds)
          .is("follower_id", null)
          .gte("clicked_at", since)
          .order("clicked_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (clickErr && /follower_id/.test(clickErr.message)) {
          console.warn("[LINE Webhook] line_inflow_clicks.follower_id カラム未作成 → migration 推奨");
        } else if (clickErr) {
          console.warn("[LINE Webhook] click検索失敗:", clickErr.message);
        } else if (recentClick) {
          const up1 = await supabaseAdmin
            .from("line_followers")
            .update({ inflow_route_id: recentClick.inflow_route_id })
            .eq("id", upserted.id);
          if (up1.error) console.warn("[LINE Webhook] follower.inflow_route_id更新失敗:", up1.error.message);

          const up2 = await supabaseAdmin
            .from("line_inflow_clicks")
            .update({ follower_id: upserted.id })
            .eq("id", recentClick.id);
          if (up2.error) console.warn("[LINE Webhook] click.follower_id更新失敗:", up2.error.message);

          console.log(
            `[LINE Webhook] 流入紐付け成功: follower=${upserted.id} ← click=${recentClick.id} (route=${recentClick.inflow_route_id}, clicked_at=${recentClick.clicked_at})`,
          );
        } else {
          console.log(
            `[LINE Webhook] 流入紐付けなし: follower=${upserted.id} project=${account.project_id} routes=${routeIds.length} since=${since}（60分以内の未消費クリックなし）`,
          );
        }
      }
    } catch (e) {
      console.error("[LINE Webhook] 流入紐付け失敗:", e);
    }
  }

  // カスタム挨拶メッセージを送信（設定されていれば）
  // BAN対策: 復元対象 (restoredFrom != null) の場合は挨拶送信しない
  if (restoredFrom) {
    console.log(
      `[LINE Webhook] 復元対象のため挨拶送信スキップ: user=${userId} prior=${restoredFrom.account_id}`,
    );
  }

  // 分散案件 (distribute_enabled=true) では、マスター (role='main') 以外の
  // アカウントへの follow では挨拶メッセージを送信しない。
  // ・5本連続で挨拶が送られる UX 崩れを回避
  // ・マスターだけが「代表」として挨拶する設計
  let skipGreetingForDistribute = false;
  if (account.project_id && account.role && account.role !== "main") {
    try {
      const { data: projRow } = await supabase
        .from("line_projects")
        .select("distribute_enabled")
        .eq("id", account.project_id)
        .maybeSingle();
      if (projRow && (projRow as { distribute_enabled?: boolean | null }).distribute_enabled === true) {
        skipGreetingForDistribute = true;
        console.log(
          `[LINE Webhook] 分散案件のためマスター以外は挨拶スキップ: account=${account.id} role=${account.role}`,
        );
      }
    } catch (e) {
      // distribute_enabled カラム未作成 / その他エラーは無視 (従来挙動フォールバック)
      console.warn("[LINE Webhook] distribute_enabled check failed:", (e as Error).message);
    }
  }

  if (!restoredFrom && !skipGreetingForDistribute && account.greeting_message && account.channel_access_token && event.replyToken) {
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
  // ※ kind='step' のシーケンスのみ対象（予約配信 kind='schedule' は cron で処理）
  if (account.channel_access_token) {
    try {
      // kind カラム未作成環境への fallback 付き
      let sequenceIds: string[] = [];
      {
        const r = await supabase
          .from("line_step_sequences")
          .select("id")
          .eq("account_id", account.id)
          .eq("status", "active")
          .eq("kind", "step");
        if (r.error && /kind/.test(r.error.message)) {
          const fb = await supabase
            .from("line_step_sequences")
            .select("id")
            .eq("account_id", account.id)
            .eq("status", "active");
          sequenceIds = (fb.data ?? []).map((s) => s.id as string);
        } else {
          sequenceIds = (r.data ?? []).map((s) => s.id as string);
        }
      }

      if (sequenceIds.length > 0) {
        const { data: msgs } = await supabase
          .from("line_step_messages")
          .select("id, body, payload, msg_type, step_order, sequence_id, delay_minutes")
          .in("sequence_id", sequenceIds)
          .order("step_order", { ascending: true });

        const displayName = profile?.displayName ?? "ゲスト";

        // 即時配信 (delay_minutes = 0) のメッセージを送信
        for (const msg of (msgs ?? []).filter((m) => m.delay_minutes === 0)) {
          const payload = (msg.payload as Record<string, unknown> | null) ?? {
            msgType: "text",
            body: msg.body,
          };
          const lineMsg = buildLineMessage(payload, displayName);
          if (!lineMsg) continue;

          try {
            const res = await pushLineMessages(
              account.channel_access_token!,
              userId,
              [lineMsg],
            );
            if (!res.ok) {
              console.error(
                "[LINE Webhook] 登録直後ステップ送信失敗:",
                res.status,
                res.error,
              );
            } else {
              // チャット画面表示用ログを残す
              const builtType = (lineMsg.type as string) || "text";
              await supabase.from("line_messages").insert({
                line_account_id: account.id,
                line_user_id: userId,
                direction: "outgoing",
                message_type: builtType,
                message_text: summarizeBuiltMessage(lineMsg, payload),
                sent_at: new Date().toISOString(),
              });
            }
          } catch (e) {
            console.error("[LINE Webhook] 登録直後ステップ送信例外:", e);
          }
        }

        // N分後配信 (delay_minutes > 0) があるシーケンスにエンロールメント作成
        const seqsWithDelay = new Set(
          (msgs ?? []).filter((m) => m.delay_minutes > 0).map((m) => m.sequence_id as string),
        );
        if (seqsWithDelay.size > 0 && upserted) {
          // 即時送信済みの最大 step_order を計算（エンロールメントの last_sent_step に設定）
          const immediateSteps = (msgs ?? []).filter((m) => m.delay_minutes === 0);
          for (const seqId of seqsWithDelay) {
            const maxImmediate = immediateSteps
              .filter((m) => m.sequence_id === seqId)
              .reduce((max, m) => Math.max(max, m.step_order), 0);
            try {
              await supabase.from("line_step_enrollments").upsert(
                {
                  sequence_id: seqId,
                  follower_id: upserted.id,
                  account_id: account.id,
                  line_user_id: userId,
                  enrolled_at: new Date().toISOString(),
                  last_sent_step: maxImmediate,
                  status: "active",
                },
                { onConflict: "sequence_id,follower_id" },
              );
            } catch (e) {
              console.error("[LINE Webhook] エンロールメント作成失敗:", e);
            }
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

async function handlePostback(event: LineEvent, account: LineAccountRow) {
  const postbackData = event.postback?.data ?? "";
  console.log(`[LINE Webhook] handlePostback: userId=${event.source.userId}, data=${postbackData}`);

  // postbackデータをメッセージとして保存
  await supabase.from("line_messages").insert({
    line_account_id: account.id,
    line_user_id: event.source.userId,
    direction: "incoming",
    message_type: "postback",
    message_text: postbackData,
    raw_event: event,
    reply_token: event.replyToken ?? null,
    sent_at: new Date(event.timestamp).toISOString(),
  });

  // postbackデータのパース: "action=xxx&label_id=yyy" 形式をサポート
  const params = new URLSearchParams(postbackData);
  const action = params.get("action");

  if (action === "add_label" && params.get("label_id")) {
    // ラベル追加アクション
    const { data: follower } = await supabase
      .from("line_followers")
      .select("id")
      .eq("line_account_id", account.id)
      .eq("line_user_id", event.source.userId)
      .maybeSingle();
    if (follower) {
      await supabase.from("line_follower_labels").upsert({
        label_id: params.get("label_id"),
        follower_id: follower.id,
      });
      await fireTrigger("label_added", {
        account_id: account.id,
        line_user_id: event.source.userId,
        follower_id: follower.id,
        label_id: params.get("label_id"),
      });
    }
  } else if (action === "start_sequence" && params.get("sequence_id")) {
    // シーケンス開始アクション
    const { data: follower } = await supabase
      .from("line_followers")
      .select("id")
      .eq("line_account_id", account.id)
      .eq("line_user_id", event.source.userId)
      .maybeSingle();
    if (follower) {
      await supabase.from("line_step_enrollments").upsert({
        sequence_id: params.get("sequence_id"),
        follower_id: follower.id,
        account_id: account.id,
        line_user_id: event.source.userId,
        enrolled_at: new Date().toISOString(),
        last_sent_step: 0,
        status: "active",
      });
    }
  }

  // message_received トリガーとしても発火（Postbackはメッセージ受信の一種として扱う）
  await fireTrigger("message_received", {
    account_id: account.id,
    line_user_id: event.source.userId,
    message_text: postbackData,
  });
}

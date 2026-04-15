import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";
import { buildLineMessage, pushLineMessages } from "@/lib/line";
import { buildReplacerContext, buildBranchEvalContext, defaultContext } from "@/lib/line-replacer";

// チャット履歴に残す1行表示を組み立てる。
// text は本文をそのまま、それ以外は種別ラベル + 補足情報。
function summarizeMessage(
  built: Record<string, unknown>,
  source: Record<string, unknown>,
): string {
  const t = (built.type as string) ?? "";
  if (t === "text") return (built.text as string) ?? "";
  if (t === "image") return "[画像]";
  if (t === "video") return "[動画]";
  if (t === "audio") return "[音声]";
  if (t === "sticker") return "[スタンプ]";
  if (t === "template") {
    const tpl = (built.template as Record<string, unknown>) ?? {};
    const tplType = tpl.type as string;
    if (tplType === "buttons") {
      const text = (tpl.text as string) ?? (built.altText as string) ?? "ボタン";
      return `[ボタン] ${text}`;
    }
    if (tplType === "carousel") {
      const cols = (tpl.columns as unknown[]) ?? [];
      return `[カルーセル ${cols.length}件]`;
    }
    return `[テンプレート] ${(built.altText as string) ?? ""}`;
  }
  // source から推測
  const srcType = (source.msgType as string) ?? "";
  if (srcType === "text") return (source.body as string) ?? "";
  if (srcType === "branch") return "[条件分岐メッセージ]";
  return `[${srcType || t || "メッセージ"}]`;
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { line_user_id, message, type, packageId, stickerId, account_id, messages: richMessages } = body;

  if (!line_user_id) {
    return Response.json({ error: "line_user_id is required" }, { status: 400 });
  }

  // リッチメッセージ配列が渡された場合（ボタン/カルーセル等）
  const hasRichMessages = Array.isArray(richMessages) && richMessages.length > 0;

  // テキスト or スタンプ or リッチメッセージの判定
  const isSticker = type === "sticker" && packageId && stickerId;
  if (!isSticker && !message && !hasRichMessages) {
    return Response.json({ error: "message or sticker info is required" }, { status: 400 });
  }

  // アカウント解決: follower の line_account_id を最優先（401 の原因になるトークン取り違えを防ぐ）
  // それでも見つからない場合のみ、client 指定 → アクティブ先頭 の順で fallback
  let resolvedAccountId: string | null = null;

  {
    const { data: follower } = await supabase
      .from("line_followers")
      .select("line_account_id")
      .eq("line_user_id", line_user_id)
      .order("followed_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (follower?.line_account_id) resolvedAccountId = follower.line_account_id;
  }

  if (!resolvedAccountId && account_id) {
    resolvedAccountId = account_id;
  }

  let account: { id: string; channel_access_token: string } | null = null;
  if (resolvedAccountId) {
    const { data } = await supabase
      .from("line_accounts")
      .select("id, channel_access_token")
      .eq("id", resolvedAccountId)
      .maybeSingle();
    account = data;
  }

  if (!account) {
    const { data } = await supabase
      .from("line_accounts")
      .select("id, channel_access_token")
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();
    account = data;
  }

  if (!account) {
    return Response.json(
      { error: "有効なLINEアカウントが見つかりません（アカウントをアクティブにするか、account_idを指定してください）" },
      { status: 500 },
    );
  }

  if (!account.channel_access_token) {
    return Response.json(
      { error: "LINEアカウントのチャネルアクセストークンが未設定です（アカウント管理で再登録してください）" },
      { status: 500 },
    );
  }

  // 置換コンテキスト + 条件分岐評価コンテキストを構築
  const [replacerCtx, branchCtx] = await Promise.all([
    buildReplacerContext(supabase, { line_user_id }).catch(() => defaultContext()),
    buildBranchEvalContext(supabase, { line_user_id }).catch(() => ({
      label_ids: [],
      inflow_route_id: null,
      custom_fields: {},
    })),
  ]);

  // リッチメッセージモード
  if (hasRichMessages) {
    interface BuiltWithSource {
      built: Record<string, unknown>;
      source: Record<string, unknown>;
    }
    const builtPairs: BuiltWithSource[] = [];
    for (const rm of richMessages) {
      const built = buildLineMessage(rm, replacerCtx, branchCtx);
      if (built) builtPairs.push({ built, source: rm });
    }
    if (builtPairs.length === 0) {
      return Response.json({ error: "送信可能なメッセージがありません（URLやテキストが未入力の可能性）" }, { status: 400 });
    }
    const builtMessages = builtPairs.map((p) => p.built);
    const result = await pushLineMessages(account.channel_access_token, line_user_id, builtMessages);
    if (!result.ok) {
      const hint =
        result.status === 401
          ? "（401: チャネルアクセストークンが無効です）"
          : result.status === 403
            ? "（403: このユーザーが友だち追加していない可能性があります）"
            : "";
      return Response.json({ error: `LINE API error ${result.status}: ${result.error} ${hint}` }, { status: 500 });
    }
    // 履歴はメッセージ単位で1行ずつ保存（チャット画面に本文が表示されるように）
    const nowIso = new Date().toISOString();
    const rows = builtPairs.map(({ built, source }) => {
      const srcType = (source.msgType as string) || (built.type as string) || "text";
      return {
        line_account_id: account.id,
        line_user_id,
        direction: "outgoing",
        message_type: srcType,
        message_text: summarizeMessage(built, source),
        sent_at: nowIso,
      };
    });
    await supabase.from("line_messages").insert(rows);
    return Response.json({ ok: true });
  }

  // LINE Push Message API（テキスト/スタンプ）
  const builtText =
    !isSticker ? buildLineMessage({ msgType: "text", body: message }, replacerCtx, branchCtx) : null;
  const lineMessage = isSticker
    ? { type: "sticker", packageId: String(packageId), stickerId: String(stickerId) }
    : builtText ?? { type: "text", text: message };

  const res = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${account.channel_access_token}`,
    },
    body: JSON.stringify({
      to: line_user_id,
      messages: [lineMessage],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error("[LINE Send] 送信失敗:", res.status, err);
    const hint =
      res.status === 401
        ? "（401: チャネルアクセストークンが無効です。LINE Developers から再発行してアカウント管理画面で更新してください）"
        : res.status === 403
          ? "（403: このユーザーがこのLINE公式アカウントを友だち追加していない可能性があります）"
          : "";
    return Response.json(
      { error: `LINE API error ${res.status}: ${err.slice(0, 200)} ${hint}` },
      { status: 500 },
    );
  }

  // 送信履歴をDBに保存
  await supabase.from("line_messages").insert({
    line_account_id: account.id,
    line_user_id,
    direction: "outgoing",
    message_type: isSticker ? "sticker" : "text",
    message_text: isSticker ? `[スタンプ ${packageId}:${stickerId}]` : message,
    sent_at: new Date().toISOString(),
  });

  return Response.json({ ok: true });
}

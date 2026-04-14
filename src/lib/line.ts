import crypto from "crypto";
import {
  replaceVariables,
  defaultContext,
  evaluateBranchCondition,
  type ReplacerContext,
  type BranchCondition,
  type BranchEvalContext,
} from "./line-replacer";

export function getLineConfig() {
  const channelSecret = process.env.LINE_CHANNEL_SECRET;
  const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!channelSecret || !channelAccessToken) {
    throw new Error("LINE環境変数が未設定です (LINE_CHANNEL_SECRET / LINE_CHANNEL_ACCESS_TOKEN)");
  }
  return { channelSecret, channelAccessToken };
}

/** LINE署名検証 */
export function verifySignature(body: string, signature: string, channelSecret: string): boolean {
  const hash = crypto
    .createHmac("SHA256", channelSecret)
    .update(body)
    .digest("base64");
  return hash === signature;
}

/** LINEプロフィール取得 */
export async function getProfile(userId: string, accessToken: string) {
  const res = await fetch(`https://api.line.me/v2/bot/profile/${userId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  return res.json() as Promise<{
    displayName: string;
    userId: string;
    pictureUrl?: string;
  }>;
}

/**
 * line_step_messages.payload（ダッシュボード保存形式）を LINE Messaging API のメッセージオブジェクトに変換
 * 非対応・情報不足のものは null を返す
 *
 * 第2引数は後方互換のため文字列（display_name）も許容。
 * 置換文字の完全サポートを使うには ReplacerContext を渡す。
 * 条件分岐メッセージ（msgType: "branch"）を評価するには第3引数に BranchEvalContext を渡す。
 */
export function buildLineMessage(
  payload: Record<string, unknown> | null | undefined,
  displayNameOrContext: string | ReplacerContext = "ゲスト",
  branchCtx?: BranchEvalContext,
): Record<string, unknown> | null {
  if (!payload || typeof payload !== "object") return null;
  const p = payload as Record<string, unknown>;
  const ctx: ReplacerContext =
    typeof displayNameOrContext === "string"
      ? defaultContext(displayNameOrContext)
      : displayNameOrContext;
  const replaceVars = (s: string) => replaceVariables(s ?? "", ctx);
  const type = (p.msgType as string) ?? "text";

  // 条件分岐メッセージ: branches[].condition にマッチした最初のサブメッセージを返す
  // 2 種類の payload 形式に対応:
  //   (A) 正規形式: { branches: [{ condition, message }], defaultMessage }
  //   (B) 簡易形式: { branches: [{ label_ids, body }], defaultBody }
  if (type === "branch") {
    const rawBranches = (p.branches as Array<Record<string, unknown>>) ?? [];
    const evalCtx: BranchEvalContext =
      branchCtx ?? { label_ids: [], inflow_route_id: null, custom_fields: ctx.custom_fields };
    for (const b of rawBranches) {
      if (!b) continue;
      const hasCondition = "condition" in b;
      const hasMessage = "message" in b;
      const labelIdsRaw = (b.label_ids as unknown) ?? null;
      const bodyRaw = (b.body as unknown) ?? null;

      const condition: BranchCondition | null = hasCondition
        ? ((b.condition as BranchCondition | null) ?? null)
        : labelIdsRaw
          ? { label_ids: Array.isArray(labelIdsRaw) ? (labelIdsRaw as string[]) : [] }
          : null;
      const subMessage: Record<string, unknown> | null = hasMessage
        ? ((b.message as Record<string, unknown>) ?? null)
        : bodyRaw != null
          ? { msgType: "text", body: String(bodyRaw) }
          : null;
      if (!subMessage) continue;
      if (evaluateBranchCondition(condition, evalCtx)) {
        return buildLineMessage(subMessage, ctx, evalCtx);
      }
    }
    const fallback =
      (p.defaultMessage as Record<string, unknown> | undefined) ??
      (typeof p.defaultBody === "string" && p.defaultBody
        ? { msgType: "text", body: p.defaultBody }
        : null);
    if (fallback) return buildLineMessage(fallback, ctx, evalCtx);
    return null;
  }

  if (type === "text") {
    const body = p.body as string | undefined;
    if (!body) return null;
    return { type: "text", text: replaceVars(body) };
  }
  if (type === "image") {
    const url = p.imageUrl as string | undefined;
    if (!url) return null;
    return { type: "image", originalContentUrl: url, previewImageUrl: url };
  }
  if (type === "video") {
    const url = p.videoUrl as string | undefined;
    const previewUrl = p.videoPreviewUrl as string | undefined;
    if (!url) return null;
    // LINE API: previewImageUrl は JPEG/PNG 画像が必須。未指定なら送信不可
    if (!previewUrl) return null;
    return {
      type: "video",
      originalContentUrl: url,
      previewImageUrl: previewUrl,
    };
  }
  if (type === "audio") {
    const url = p.audioUrl as string | undefined;
    if (!url) return null;
    const duration = Number(p.audioDuration ?? 60);
    return { type: "audio", originalContentUrl: url, duration: duration * 1000 };
  }
  if (type === "sticker") {
    return {
      type: "sticker",
      packageId: String(p.stickerPackageId ?? "11537"),
      stickerId: String(p.stickerId ?? "52002734"),
    };
  }
  if (type === "button") {
    const text = replaceVars((p.buttonText as string) || "");
    const title = ((p.buttonTitle as string) ?? "").slice(0, 40) || undefined;
    const thumbUrl = (p.buttonImageUrl as string) || undefined;
    const rawActions = (p.buttonActions as Array<{ label?: string; uri?: string; actionType?: string; data?: string; text?: string }>) ?? [];
    const actions = rawActions
      .filter((a) => a.uri || a.data || a.text || a.actionType === "postback" || a.actionType === "message")
      .slice(0, 4)
      .map((a) => {
        const actionType = a.actionType || "uri";
        if (actionType === "postback") {
          return { type: "postback", label: (a.label || "選択").slice(0, 20), data: a.data || a.label || "action", displayText: a.text || undefined };
        }
        if (actionType === "message") {
          return { type: "message", label: (a.label || "送信").slice(0, 20), text: a.text || a.label || "" };
        }
        return { type: "uri", label: (a.label || "詳細").slice(0, 20), uri: a.uri };
      });
    if (actions.length === 0) return null;
    // LINE API: text は title/thumbnail ありなら160文字、なしなら240文字
    const maxText = title || thumbUrl ? 160 : 240;
    return {
      type: "template",
      altText: text || "ボタン",
      template: {
        type: "buttons",
        thumbnailImageUrl: thumbUrl,
        title,
        text: (text || "選択してください").slice(0, maxText),
        actions,
      },
    };
  }
  if (type === "carousel") {
    const raw = (p.carouselColumns as Array<{
      title?: string;
      text?: string;
      imageUrl?: string;
      uri?: string;
      label?: string;
      actionType?: string;
      data?: string;
      actionText?: string;
    }>) ?? [];
    const validCols = raw.filter((c) => c.uri || c.data || c.actionText || c.actionType === "postback" || c.actionType === "message").slice(0, 10);
    if (validCols.length === 0) return null;
    // LINE API 制約: title は「全カラムにあり」か「全カラムになし」のどちらか
    const hasAnyTitle = validCols.some((c) => (c.title ?? "").trim() !== "");
    // LINE API 制約: thumbnailImageUrl も同様に全カラム統一が必要
    const hasAnyImage = validCols.some((c) => (c.imageUrl ?? "").trim() !== "");
    const columns = validCols.map((c) => {
      const colActionType = c.actionType || "uri";
      let action: Record<string, unknown>;
      if (colActionType === "postback") {
        action = { type: "postback", label: (c.label || "選択").slice(0, 20), data: c.data || c.label || "action", displayText: c.actionText || undefined };
      } else if (colActionType === "message") {
        action = { type: "message", label: (c.label || "送信").slice(0, 20), text: c.actionText || c.label || "" };
      } else {
        action = { type: "uri", label: (c.label || "詳細").slice(0, 20), uri: c.uri };
      }
      return {
        thumbnailImageUrl: hasAnyImage ? (c.imageUrl || undefined) : undefined,
        title: hasAnyTitle ? replaceVars(c.title ?? "").slice(0, 40) || "　" : undefined,
        text: replaceVars(c.text ?? " ").slice(0, 60) || " ",
        actions: [action],
      };
    });
    return {
      type: "template",
      altText: "カルーセル",
      template: { type: "carousel", columns },
    };
  }
  return null;
}

/**
 * LINE Push Message API を叩く（1ユーザーに最大5メッセージまで）
 * 成功なら { ok: true }、失敗なら { ok: false, status, error }
 */
export async function pushLineMessages(
  accessToken: string,
  to: string,
  messages: Array<Record<string, unknown>>,
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  if (messages.length === 0) return { ok: true };
  const res = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ to, messages: messages.slice(0, 5) }),
  });
  if (!res.ok) {
    const error = await res.text();
    return { ok: false, status: res.status, error: error.slice(0, 300) };
  }
  return { ok: true };
}

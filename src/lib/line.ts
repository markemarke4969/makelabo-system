import crypto from "crypto";

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
 */
export function buildLineMessage(
  payload: Record<string, unknown> | null | undefined,
  displayName = "ゲスト",
): Record<string, unknown> | null {
  if (!payload || typeof payload !== "object") return null;
  const p = payload as Record<string, unknown>;
  const replaceVars = (s: string) => s.replace(/\{display_name\}/g, displayName);
  const type = (p.msgType as string) ?? "text";

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
    if (!url) return null;
    return {
      type: "video",
      originalContentUrl: url,
      previewImageUrl: (p.videoPreviewUrl as string) || url,
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
    const rawActions = (p.buttonActions as Array<{ label?: string; uri?: string }>) ?? [];
    const actions = rawActions
      .filter((a) => a.uri)
      .slice(0, 4)
      .map((a) => ({ type: "uri", label: a.label || "詳細", uri: a.uri }));
    if (actions.length === 0) return null;
    return {
      type: "template",
      altText: text || "ボタン",
      template: { type: "buttons", text: text || "選択してください", actions },
    };
  }
  if (type === "carousel") {
    const raw = (p.carouselColumns as Array<{
      title?: string;
      text?: string;
      imageUrl?: string;
      uri?: string;
      label?: string;
    }>) ?? [];
    const columns = raw
      .filter((c) => c.uri)
      .slice(0, 10)
      .map((c) => ({
        thumbnailImageUrl: c.imageUrl || undefined,
        title: (c.title ?? "").slice(0, 40) || undefined,
        text: (c.text ?? " ").slice(0, 60) || " ",
        actions: [{ type: "uri", label: c.label || "詳細", uri: c.uri }],
      }));
    if (columns.length === 0) return null;
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

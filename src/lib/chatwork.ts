// Chatwork 通知ヘルパー
// 既存の /api/line/ban-switch で使っていたロジックをここに集約。

export interface ChatworkResult {
  ok: boolean;
  status?: number;
  reason?: string;
}

export async function notifyChatwork(message: string, options?: { toAll?: boolean }): Promise<ChatworkResult> {
  const token = process.env.CHATWORK_API_TOKEN;
  const roomId = process.env.CHATWORK_ROOM_ID_PERSONAL;
  if (!token || !roomId) return { ok: false, reason: "CHATWORK credentials not set" };

  const bodyText = options?.toAll === false ? message : `[toall]\n${message}`;

  try {
    const form = new URLSearchParams();
    form.set("body", bodyText);
    form.set("self_unread", "1");
    const res = await fetch(
      `https://api.chatwork.com/v2/rooms/${roomId}/messages`,
      {
        method: "POST",
        headers: {
          "X-ChatWorkToken": token,
        },
        body: form,
      },
    );
    return { ok: res.ok, status: res.status };
  } catch (e) {
    return { ok: false, reason: String(e) };
  }
}

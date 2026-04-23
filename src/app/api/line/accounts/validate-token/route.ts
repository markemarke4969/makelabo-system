import { NextRequest } from "next/server";

/**
 * アカウント登録ウィザード用のトークン検証エンドポイント。
 * LINE /v2/bot/info を叩いて、トークンが有効か（＋bot基本情報）を返す。
 * 保存は行わないので、登録前の接続確認に使える。
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const token: string | undefined = body.channel_access_token;
  if (!token) {
    return Response.json({ error: "channel_access_token is required" }, { status: 400 });
  }

  const res = await fetch("https://api.line.me/v2/bot/info", {
    headers: { Authorization: `Bearer ${token}` },
  });
  const text = await res.text();
  if (res.ok) {
    let info: { displayName?: string; userId?: string; basicId?: string; pictureUrl?: string } = {};
    try { info = JSON.parse(text); } catch { /* ignore */ }
    return Response.json({
      ok: true,
      status: res.status,
      displayName: info.displayName,
      basicId: info.basicId,
      userId: info.userId,
      pictureUrl: info.pictureUrl,
    });
  }

  return Response.json({
    ok: false,
    status: res.status,
    detail: text.slice(0, 300),
    hint:
      res.status === 401
        ? "トークンが無効です。LINE Developers で長期トークンを再発行してください。"
        : res.status === 403
          ? "アクセスが拒否されました。チャネル種別（Messaging API）とスコープを確認してください。"
          : undefined,
  });
}

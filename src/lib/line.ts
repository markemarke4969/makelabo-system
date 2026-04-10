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

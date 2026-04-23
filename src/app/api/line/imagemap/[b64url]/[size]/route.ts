import { NextRequest } from "next/server";
import sharp from "sharp";

export const runtime = "nodejs";
export const maxDuration = 30;

// LINE Imagemap が要求するサイズ
const ALLOWED_SIZES = new Set([240, 300, 460, 700, 1040]);

/**
 * LINE Imagemap 用の画像中継エンドポイント。
 *
 * LINE は baseUrl/{240|300|460|700|1040} の形で画像にアクセスしてくるので、
 * 元画像URLをbase64url化したパラメータから取得 → sharp で指定幅にリサイズして返す。
 *
 * 例: /api/line/imagemap/aHR0cHM6Ly9leGFtcGxlLmNvbS9pbWcuanBn/1040
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ b64url: string; size: string }> },
) {
  const { b64url, size: sizeStr } = await params;
  const size = Number(sizeStr);

  if (!ALLOWED_SIZES.has(size)) {
    return new Response("unsupported size", { status: 400 });
  }

  // base64url デコード
  let originalUrl: string;
  try {
    const padded = b64url.replace(/-/g, "+").replace(/_/g, "/");
    const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
    originalUrl = Buffer.from(padded + pad, "base64").toString("utf-8");
  } catch {
    return new Response("invalid url encoding", { status: 400 });
  }

  // セーフガード: https のみ許可（LINE要件）
  if (!/^https:\/\//.test(originalUrl)) {
    return new Response("https url required", { status: 400 });
  }

  // 元画像を取得
  let upstream: Response;
  try {
    upstream = await fetch(originalUrl, {
      headers: { "User-Agent": "makelabo-imagemap/1.0" },
    });
  } catch {
    return new Response("fetch failed", { status: 502 });
  }
  if (!upstream.ok) {
    return new Response(`upstream ${upstream.status}`, { status: 502 });
  }

  const inputBuf = Buffer.from(await upstream.arrayBuffer());

  // sharp でリサイズ（幅を固定、高さは自動）。JPEG で返す
  let output: Buffer;
  try {
    output = await sharp(inputBuf)
      .rotate()
      .resize({ width: size, withoutEnlargement: false })
      .jpeg({ quality: 85, mozjpeg: true })
      .toBuffer();
  } catch (e) {
    return new Response(`resize failed: ${(e as Error).message}`, { status: 500 });
  }

  return new Response(output as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": "image/jpeg",
      "Cache-Control": "public, max-age=86400, immutable",
      "Content-Length": String(output.length),
    },
  });
}

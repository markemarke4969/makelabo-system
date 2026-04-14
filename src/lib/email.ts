/**
 * Resend HTTP API でメールを送信する薄いラッパー。
 * SDK は入れず fetch のみで完結させる。
 *
 * 必要な環境変数:
 *   RESEND_API_KEY - Resend API キー
 *
 * 送信元 (from) は呼び出し側から必ず渡す（アカウント単位で設定）。
 */

export interface SendEmailInput {
  to: string;
  subject: string;
  from: string;
  text?: string;
  html?: string;
}

export interface SendEmailResult {
  ok: boolean;
  id?: string;
  status?: number;
  error?: string;
}

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return { ok: false, error: "RESEND_API_KEY が未設定です" };
  }
  if (!input.from) {
    return { ok: false, error: "送信元アドレス(from)が未指定です" };
  }
  const from = input.from;

  // text 本文から最小限の HTML を生成（指定があればそちらを優先）
  const html =
    input.html ??
    `<div style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;font-size:14px;line-height:1.7;color:#333;white-space:pre-wrap;">${escapeHtml(
      input.text ?? "",
    )}</div>`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      from,
      to: input.to,
      subject: input.subject,
      text: input.text,
      html,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    return { ok: false, status: res.status, error: body.slice(0, 300) };
  }
  const data = (await res.json().catch(() => ({}))) as { id?: string };
  return { ok: true, id: data.id };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

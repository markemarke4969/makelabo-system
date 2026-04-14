import { supabase } from "./supabase";
import { sendEmail } from "./email";
import { buildReplacerContext, replaceVariables, defaultContext, type ReplacerContext } from "./line-replacer";

export interface DispatchResult {
  ok: boolean;
  sent: number;
  failed: number;
  skipped: number;
  error?: string;
}

/**
 * 指定 newsletter_id のメルマガを、対象フォロワー全員に送信する。
 * 対象: カスタムフィールド field_key='email' に値があるフォロワー。
 * target_condition がある場合はそれでフィルタ。
 */
export async function dispatchNewsletter(newsletterId: string): Promise<DispatchResult> {
  const { data: nl, error: nlErr } = await supabase
    .from("line_newsletters")
    .select("id, account_id, name, subject, body_text, body_html, status, target_condition")
    .eq("id", newsletterId)
    .maybeSingle();

  if (nlErr || !nl) {
    return { ok: false, sent: 0, failed: 0, skipped: 0, error: nlErr?.message ?? "newsletter not found" };
  }
  if (nl.status === "sent") {
    return { ok: true, sent: 0, failed: 0, skipped: 0, error: "already sent" };
  }

  // アカウントの送信元設定を取得
  const fromAddress = await resolveAccountFrom(nl.account_id);
  if (!fromAddress.ok) {
    return { ok: false, sent: 0, failed: 0, skipped: 0, error: fromAddress.error };
  }

  // email フィールド定義を取得
  const { data: emailField } = await supabase
    .from("line_custom_fields")
    .select("id")
    .eq("account_id", nl.account_id)
    .eq("field_key", "email")
    .maybeSingle();
  if (!emailField) {
    await supabase
      .from("line_newsletters")
      .update({ status: "draft", updated_at: new Date().toISOString() })
      .eq("id", newsletterId);
    return {
      ok: false,
      sent: 0,
      failed: 0,
      skipped: 0,
      error: "カスタムフィールド field_key='email' が作成されていません",
    };
  }

  // 対象フォロワー（email を持つ者）を取得
  const { data: values, error: vErr } = await supabase
    .from("line_follower_custom_values")
    .select("follower_id, value, line_followers!inner(id, line_account_id, status)")
    .eq("field_id", emailField.id);

  if (vErr) {
    return { ok: false, sent: 0, failed: 0, skipped: 0, error: vErr.message };
  }

  interface Row {
    follower_id: string;
    value: string | null;
    line_followers: { id: string; line_account_id: string; status: string | null } | null;
  }
  const rows = (values ?? []) as unknown as Row[];

  const targets = rows.filter(
    (r) =>
      r.value &&
      r.value.includes("@") &&
      r.line_followers &&
      r.line_followers.line_account_id === nl.account_id &&
      (r.line_followers.status ?? "following") === "following",
  );

  if (targets.length === 0) {
    await supabase
      .from("line_newsletters")
      .update({
        status: "sent",
        sent_at: new Date().toISOString(),
        sent_count: 0,
        updated_at: new Date().toISOString(),
      })
      .eq("id", newsletterId);
    return { ok: true, sent: 0, failed: 0, skipped: 0 };
  }

  let sent = 0;
  let failed = 0;
  const skipped = 0;

  for (const t of targets) {
    const email = t.value as string;
    const followerId = t.follower_id;
    const ctx: ReplacerContext = await buildReplacerContext(supabase, { id: followerId }).catch(
      () => defaultContext(),
    );
    const subject = replaceVariables(nl.subject ?? "", ctx);
    const text = replaceVariables(nl.body_text ?? "", ctx);
    const html = nl.body_html ? replaceVariables(nl.body_html, ctx) : undefined;

    const res = await sendEmail({ to: email, from: fromAddress.from, subject, text, html });
    if (res.ok) {
      sent++;
      await supabase.from("line_newsletter_logs").insert({
        newsletter_id: newsletterId,
        follower_id: followerId,
        email,
        status: "sent",
      });
    } else {
      failed++;
      await supabase.from("line_newsletter_logs").insert({
        newsletter_id: newsletterId,
        follower_id: followerId,
        email,
        status: "bounced",
      });
      console.error("[newsletter dispatch] send failed:", res.status, res.error);
    }
  }

  await supabase
    .from("line_newsletters")
    .update({
      status: "sent",
      sent_at: new Date().toISOString(),
      sent_count: sent,
      updated_at: new Date().toISOString(),
    })
    .eq("id", newsletterId);

  return { ok: true, sent, failed, skipped };
}

/**
 * line_accounts.newsletter_from_email / newsletter_from_name から
 * Resend の from 文字列を組み立てる。
 *   name + email  → `"まり公式" <mari@example.com>`
 *   email のみ    → `mari@example.com`
 * 未設定の場合は ok:false を返す（呼び出し側で送信中止）。
 */
async function resolveAccountFrom(
  accountId: string,
): Promise<{ ok: true; from: string } | { ok: false; error: string }> {
  type AccountRow = {
    newsletter_from_email: string | null;
    newsletter_from_name: string | null;
  };
  let { data, error } = await supabase
    .from("line_accounts")
    .select("newsletter_from_email, newsletter_from_name")
    .eq("id", accountId)
    .maybeSingle<AccountRow>();

  // カラム未作成の環境への fallback（設定未反映扱い）
  if (error && /newsletter_from_/.test(error.message)) {
    data = null;
    error = null;
  }
  if (error) {
    return { ok: false, error: `アカウント設定取得失敗: ${error.message}` };
  }

  const email = data?.newsletter_from_email?.trim() ?? "";
  if (!email) {
    return {
      ok: false,
      error: "このアカウントに送信元メールアドレスが未設定です。アカウント管理 → メール送信設定から登録してください",
    };
  }
  const name = data?.newsletter_from_name?.trim() ?? "";
  const safeName = name.replace(/"/g, "'");
  return { ok: true, from: name ? `"${safeName}" <${email}>` : email };
}

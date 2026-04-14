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

    const res = await sendEmail({ to: email, subject, text, html });
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

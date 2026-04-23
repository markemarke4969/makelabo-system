/**
 * ログインID（メアド以外の ID 文字列）と Supabase Auth のメアドを相互変換する。
 *
 * Supabase Auth はメアド必須なので、ID のみの入力を受け付けるために
 * `{id}@harness.local` という内部ドメイン付きの疑似メアドで保存する。
 * 画面には local part だけを表示する。
 *
 * 既存のメアドユーザー（例: foo@gmail.com）はそのままメアドとして扱う。
 */
export const INTERNAL_LOGIN_DOMAIN = "harness.local";

/** 旧バージョンで使用していた内部ドメイン（後方互換のため表示時に抽出対象に含める） */
const LEGACY_INTERNAL_DOMAINS = ["makelabo.local"] as const;

/** ログインID入力 → Supabase Auth 用メアド。@ が含まれていればそのまま返す */
export function loginIdToEmail(input: string): string {
  const s = (input ?? "").trim();
  if (!s) return s;
  if (s.includes("@")) return s;
  return `${s}@${INTERNAL_LOGIN_DOMAIN}`;
}

/** メアド → 画面表示用 ID。現行 or 旧内部ドメインなら local part だけ返す */
export function emailToDisplayId(email: string | null | undefined): string {
  if (!email) return "";
  const domains = [INTERNAL_LOGIN_DOMAIN, ...LEGACY_INTERNAL_DOMAINS];
  for (const d of domains) {
    if (email.endsWith(`@${d}`)) {
      return email.slice(0, email.length - 1 - d.length);
    }
  }
  return email;
}

/** ログインIDのバリデーション: 英数字 / . / _ / - のみ、3〜50文字 */
export function isValidLoginId(input: string): boolean {
  return /^[a-zA-Z0-9._-]{3,50}$/.test(input);
}

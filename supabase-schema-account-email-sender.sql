-- ============================================================
-- メルマガ送信元設定をアカウント単位で持たせる
-- ============================================================
-- 従来は NEWSLETTER_FROM_EMAIL 環境変数でシステム固定だったものを
-- line_accounts 単位で設定できるように変更する。

ALTER TABLE line_accounts
  ADD COLUMN IF NOT EXISTS newsletter_from_email TEXT,
  ADD COLUMN IF NOT EXISTS newsletter_from_name  TEXT;

COMMENT ON COLUMN line_accounts.newsletter_from_email IS 'メルマガ送信元メールアドレス（例: mari@example.com）';
COMMENT ON COLUMN line_accounts.newsletter_from_name  IS 'メルマガ送信元表示名（例: まり公式）';

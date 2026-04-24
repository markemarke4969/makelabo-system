-- ============================================================
-- BAN対策: 友だち復元の履歴記録カラム追加
-- ============================================================
-- 目的:
--   BAN 発生時に LIFF 中継URL経由で新メインアカウントへ誘導し、
--   新アカウントへ follow した際、旧アカウントの follower 行と
--   紐付けを記録するためのカラムを追加する。
--
-- 影響:
--   追加のみ（既存データ・挙動に影響なし）。複数回実行しても安全。
-- ============================================================

ALTER TABLE line_followers
  ADD COLUMN IF NOT EXISTS restored_from_account_id UUID
    REFERENCES line_accounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS restored_from_follower_id UUID
    REFERENCES line_followers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS restored_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_line_followers_restored_from_account
  ON line_followers(restored_from_account_id)
  WHERE restored_from_account_id IS NOT NULL;

-- 確認用
SELECT column_name, data_type, is_nullable
  FROM information_schema.columns
 WHERE table_name = 'line_followers'
   AND column_name IN ('restored_from_account_id', 'restored_from_follower_id', 'restored_at')
 ORDER BY column_name;

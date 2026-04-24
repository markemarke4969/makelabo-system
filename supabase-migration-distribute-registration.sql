-- ============================================================
-- 分散登録機能 (STEP 2) のスキーマ変更
-- ============================================================
-- 目的:
--   BAN対策の予防として、1ユーザーを複数の本番LINEアカウントに
--   順次友達追加させる「分散登録」機能を追加する。
--
-- 変更:
--   1. line_projects に分散設定 3 列追加
--       distribute_enabled  : この案件で分散登録を使うか
--       distribute_count    : 分散本数 (main + distribute 合計)
--       reserve_count       : 予備本数 (standby の目安、現状は運用メモ用途)
--   2. line_accounts に order_index 列追加
--       分散本番内での表示順。main=1、distribute は 2〜N。
--   3. role カラムは既存で CHECK 制約無し。'distribute' をそのまま格納可能。
--
-- 安全性:
--   - 既存データへの影響なし (追加のみ、デフォルト値で既存行も有効)
--   - 複数回実行しても安全 (IF NOT EXISTS)
-- ============================================================

ALTER TABLE line_projects
  ADD COLUMN IF NOT EXISTS distribute_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS distribute_count   INT     NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS reserve_count      INT     NOT NULL DEFAULT 0;

ALTER TABLE line_accounts
  ADD COLUMN IF NOT EXISTS order_index INT NOT NULL DEFAULT 0;

-- 分散本番の取得を高速化するインデックス
CREATE INDEX IF NOT EXISTS idx_line_accounts_role_order
  ON line_accounts(project_id, role, order_index);

-- 確認用
SELECT 'line_projects' AS tbl, column_name, data_type, is_nullable, column_default
  FROM information_schema.columns
 WHERE table_name = 'line_projects'
   AND column_name IN ('distribute_enabled', 'distribute_count', 'reserve_count')
UNION ALL
SELECT 'line_accounts' AS tbl, column_name, data_type, is_nullable, column_default
  FROM information_schema.columns
 WHERE table_name = 'line_accounts'
   AND column_name = 'order_index'
 ORDER BY tbl, column_name;

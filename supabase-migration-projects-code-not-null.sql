-- ============================================================
-- 段階8-2-F: line_projects.code を NOT NULL 化
-- ============================================================
-- 背景:
--   line_projects.code は中継URL /line/r/{案件コード}/{流入コード} の必須要素。
--   過去 NULL 許容のまま運用されており、AI副業診断は code が NULL のまま
--   作成されていた(2026-05-06 に aifukugyo へバックフィル済み)。
--
--   本マイグレーションで NOT NULL 制約を追加し、UI バリデーション
--   (案件作成モーダルの code 必須化)とセットで適用する。
--
-- 前提:
--   全案件の code が埋まっていること。本日確認済の値:
--     MARI            : mari
--     スレッズ集客     : threads
--     AI副業診断       : aifukugyo
--
-- 安全性:
--   - autocommit / idempotent
--   - Step 1 の事前検証で code IS NULL の行が 1 件でもあれば中止(EXCEPTION)
--   - PostgreSQL の SET NOT NULL は既に NOT NULL なら no-op(再実行可)
-- ============================================================

-- ===== Step 1: 事前確認(code IS NULL がある場合は中止)=====
DO $$
DECLARE
  null_count INTEGER;
  row_total INTEGER;
BEGIN
  SELECT count(*) INTO null_count FROM line_projects WHERE code IS NULL;
  SELECT count(*) INTO row_total FROM line_projects;
  RAISE NOTICE '[projects-code-not-null] pre-check';
  RAISE NOTICE '  line_projects total rows : %', row_total;
  RAISE NOTICE '  rows with code IS NULL  : %', null_count;
  IF null_count > 0 THEN
    RAISE EXCEPTION 'ABORT: line_projects has % rows with code IS NULL. Backfill required before NOT NULL constraint.', null_count;
  END IF;
END $$;

-- ===== Step 2: NOT NULL 制約付与 =====
-- PostgreSQL: SET NOT NULL は idempotent(既に NOT NULL なら no-op)。
ALTER TABLE line_projects ALTER COLUMN code SET NOT NULL;

-- ===== Step 3: 検証 =====
SELECT
  column_name,
  is_nullable,
  data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'line_projects'
  AND column_name = 'code';
-- 期待: column_name='code' / is_nullable='NO' / data_type='text'

SELECT id, name, code FROM line_projects ORDER BY sort_order;
-- 期待: 全行 code が埋まっている

-- ============================================================
-- ロールバック(必要時)
-- ============================================================
-- ALTER TABLE line_projects ALTER COLUMN code DROP NOT NULL;
-- ============================================================

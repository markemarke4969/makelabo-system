-- ============================================================
-- 段階7-Z: line_monthly_reports に scenario_id 列追加
-- ============================================================
-- 目的:
--   段階7-C2(scenario レポート新設)の前提として、line_monthly_reports
--   テーブルに scenario_id 列を追加し、scenario 単位レポートを
--   保存できるようにする。
--
-- 設計判断(石井さん 2026-05-03 確定):
--   - Z-1 UNIQUE 制約変更案:案 B(部分 UNIQUE 2 本立て、Postgres バージョン非依存)
--   - Z-2 ON DELETE 戦略:SET NULL(履歴性を考慮、line_inflow_routes と同パターン)
--   - Z-3 既存 UNIQUE 制約名:line_monthly_reports_project_id_report_month_key
--   - Z-4 本番適用方式:Supabase Dashboard SQL Editor で手動実行(過去 7-A1 と同手順)
--   - Z-5 既存 2 件のバックフィル:scenario_id NULL のまま維持(再構成不要)
--
-- 参考実装:
--   - 段階5-step02:line_inflow_routes に scenario_id 列追加(SET NULL)
--     supabase-migration-stage5-step02-add-scenario-columns.sql L51-56
--   - 段階7-A1:9 テーブル + closer_visible に scenario_id 列追加(CASCADE 主)
--     supabase-migration-stage7-a1-add-scenario-columns-9tables.sql
--
-- 本番環境(2026-05-03 時点):
--   - PostgreSQL 17.6 on aarch64
--   - 既存 UNIQUE 制約名:line_monthly_reports_project_id_report_month_key
--   - 既存データ 2 件(MARI 987d51d5 の 2026-04 / threads 4f065915 の 2026-04)
--   - 列追加後は両者 scenario_id NULL のまま(7-Z で UPDATE しない)
--
-- 申し送り(段階8 以降):
--   - scenario 削除時の部分 UNIQUE 1 衝突問題:scenario が削除されると
--     当該 scenario レポート行の scenario_id が NULL 化(ON DELETE SET NULL)し、
--     同 (project_id, report_month) の既存 NULL 行と部分 UNIQUE 1
--     (uniq_line_monthly_reports_project_null_scenario)で衝突する可能性。
--     段階8 本運用前は scenario 削除自体がほぼ発生しない想定のため、
--     本 PR では対処せず、段階8 以降にトリガーや CASCADE 切替を検討。
--   - 既存 2 件(MARI 2026-04 / threads 2026-04)は scenario_id NULL の
--     project 単位レポートとして維持。必要なら 7-C2 完了後に dashboard
--     から手動再生成可能(scenario_id 込みで POST → 新規行作成、
--     既存 NULL 行は維持)。
-- ============================================================

BEGIN;

-- 1. 列追加(NULLABLE、ON DELETE SET NULL)
DO $$
BEGIN
  RAISE NOTICE '[1/5] line_monthly_reports に scenario_id 列を追加中...';
END $$;

ALTER TABLE line_monthly_reports
  ADD COLUMN IF NOT EXISTS scenario_id UUID
    REFERENCES line_scenarios(id) ON DELETE SET NULL;

-- 2. 既存 UNIQUE 制約を DROP(部分 UNIQUE への置換のため)
DO $$
BEGIN
  RAISE NOTICE '[2/5] 既存 UNIQUE 制約 line_monthly_reports_project_id_report_month_key を DROP 中...';
END $$;

ALTER TABLE line_monthly_reports
  DROP CONSTRAINT IF EXISTS line_monthly_reports_project_id_report_month_key;

-- 3. 部分 UNIQUE 1:scenario_id IS NULL 用(project 単位レポート、既存挙動踏襲)
DO $$
BEGIN
  RAISE NOTICE '[3/5] 部分 UNIQUE インデックス(scenario_id IS NULL 用)を作成中...';
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_line_monthly_reports_project_null_scenario
  ON line_monthly_reports(project_id, report_month)
  WHERE scenario_id IS NULL;

-- 4. 部分 UNIQUE 2:scenario_id IS NOT NULL 用(scenario 単位レポート、7-C2 で利用)
DO $$
BEGIN
  RAISE NOTICE '[4/5] 部分 UNIQUE インデックス(scenario_id IS NOT NULL 用)を作成中...';
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_line_monthly_reports_project_scenario
  ON line_monthly_reports(project_id, scenario_id, report_month)
  WHERE scenario_id IS NOT NULL;

-- 5. 部分インデックス(scenario_id でのクエリ最適化、段階7-A1 同パターン)
DO $$
BEGIN
  RAISE NOTICE '[5/5] 部分インデックス idx_line_monthly_reports_scenario を作成中...';
END $$;

CREATE INDEX IF NOT EXISTS idx_line_monthly_reports_scenario
  ON line_monthly_reports(scenario_id)
  WHERE scenario_id IS NOT NULL;

-- 6. 事後検証(SELECT で確認)
DO $$
BEGIN
  RAISE NOTICE '=== 事後検証 ===';
END $$;

-- 6-1. 列追加確認
-- 期待:1 行(column_name=scenario_id, data_type=uuid, is_nullable=YES, column_default=NULL)
SELECT
  column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'line_monthly_reports'
  AND column_name = 'scenario_id';

-- 6-2. 既存データ件数確認(2 件、全て scenario_id NULL であること)
-- 期待:total_rows=2, null_scenario_rows=2, not_null_scenario_rows=0
SELECT
  count(*) AS total_rows,
  count(*) FILTER (WHERE scenario_id IS NULL) AS null_scenario_rows,
  count(*) FILTER (WHERE scenario_id IS NOT NULL) AS not_null_scenario_rows
FROM line_monthly_reports;

-- 6-3. UNIQUE 制約・インデックス確認
-- 期待:idx_line_monthly_reports_scenario / idx_line_reports_project /
--       uniq_line_monthly_reports_project_null_scenario /
--       uniq_line_monthly_reports_project_scenario / line_monthly_reports_pkey
--       (旧 line_monthly_reports_project_id_report_month_key は消失)
SELECT
  indexname, indexdef
FROM pg_indexes
WHERE tablename = 'line_monthly_reports'
ORDER BY indexname;

-- 6-4. FK 制約確認
-- 期待:project_id FK + scenario_id FK(本 PR で追加)+ PRIMARY KEY
SELECT
  conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'line_monthly_reports'::regclass
ORDER BY conname;

DO $$
BEGIN
  RAISE NOTICE '=== 段階7-Z SQL マイグレーション完了 ===';
END $$;

COMMIT;

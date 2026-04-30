-- ============================================================
-- 段階5 マイグレーション Step 02: 4 テーブルへの scenario_id NULLABLE 列追加
-- ============================================================
-- 目的:
--   line_scenarios テーブルへの FK 列を 4 テーブル(line_accounts /
--   line_step_sequences / line_inflow_routes / line_followers)に追加。
--   NULLABLE で開始し、Step 03(バックフィル)で値を埋める。
--   この時点では旧コード(account_id ベース等)も並行動作可能。
--
-- 安全性:
--   - 全列 NULLABLE のため既存行への影響なし
--   - インデックスも同一ファイル内で作成(過去パターン:ban-recovery.sql)
--
-- 依存関係:
--   - 前提:step01 が適用済(line_scenarios テーブル存在 + 4 行 INSERT 済)
--   - 後続:step03(バックフィル)、step05(NOT NULL 化)
--
-- 草案参照元:
--   - C:\Users\lmsml\.claude\plans\07-calm-pudding.md §3(ファイル2:supabase-migration-stage5-step02-add-scenario-columns.sql)
--
-- 過去パターン参照元:
--   - supabase-migration-distribute-registration.sql:22-32(複数列 ADD COLUMN + インデックス)
--   - supabase-migration-ban-recovery.sql:13-22(FK + ON DELETE SET NULL + 部分インデックス)
-- ============================================================

-- 事前 SELECT
DO $$
BEGIN
  RAISE NOTICE '[stage5-step02] pre-check';
  RAISE NOTICE '  line_scenarios rows: % (expected: 4)', (SELECT count(*) FROM line_scenarios);
  RAISE NOTICE '  line_accounts rows: % (expected: 21)', (SELECT count(*) FROM line_accounts);
  RAISE NOTICE '  line_step_sequences rows: % (expected: 5)', (SELECT count(*) FROM line_step_sequences);
  RAISE NOTICE '  line_inflow_routes rows: % (expected: 5)', (SELECT count(*) FROM line_inflow_routes);
  RAISE NOTICE '  line_followers rows: % (expected: 12)', (SELECT count(*) FROM line_followers);
END $$;

-- Step 3: line_accounts.scenario_id
ALTER TABLE line_accounts
  ADD COLUMN IF NOT EXISTS scenario_id UUID
    REFERENCES line_scenarios(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_line_accounts_scenario ON line_accounts(scenario_id);

-- Step 5: line_step_sequences.scenario_id
ALTER TABLE line_step_sequences
  ADD COLUMN IF NOT EXISTS scenario_id UUID
    REFERENCES line_scenarios(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_line_step_sequences_scenario ON line_step_sequences(scenario_id);

-- Step 8 前半: line_inflow_routes.scenario_id
ALTER TABLE line_inflow_routes
  ADD COLUMN IF NOT EXISTS scenario_id UUID
    REFERENCES line_scenarios(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_line_inflow_routes_scenario ON line_inflow_routes(scenario_id) WHERE scenario_id IS NOT NULL;

-- Step 9 前半: line_followers.scenario_id(デノーマライズ、集計高速化用)
ALTER TABLE line_followers
  ADD COLUMN IF NOT EXISTS scenario_id UUID
    REFERENCES line_scenarios(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_line_followers_scenario ON line_followers(scenario_id) WHERE scenario_id IS NOT NULL;

-- 事後 SELECT
DO $$
BEGIN
  RAISE NOTICE '[stage5-step02] post-check (all expected: 1 row each)';
END $$;

SELECT table_name, column_name, is_nullable
  FROM information_schema.columns
 WHERE column_name = 'scenario_id'
   AND table_name IN ('line_accounts', 'line_step_sequences', 'line_inflow_routes', 'line_followers')
  ORDER BY table_name;
-- 期待: 4 行(全件 is_nullable=YES)

-- 各テーブルの scenario_id 全件 NULL 確認(バックフィル前)
SELECT 'line_accounts' AS t, count(*) FILTER (WHERE scenario_id IS NULL) AS null_count, count(*) FILTER (WHERE scenario_id IS NOT NULL) AS notnull_count FROM line_accounts
UNION ALL
SELECT 'line_step_sequences', count(*) FILTER (WHERE scenario_id IS NULL), count(*) FILTER (WHERE scenario_id IS NOT NULL) FROM line_step_sequences
UNION ALL
SELECT 'line_inflow_routes', count(*) FILTER (WHERE scenario_id IS NULL), count(*) FILTER (WHERE scenario_id IS NOT NULL) FROM line_inflow_routes
UNION ALL
SELECT 'line_followers', count(*) FILTER (WHERE scenario_id IS NULL), count(*) FILTER (WHERE scenario_id IS NOT NULL) FROM line_followers;
-- 期待: 4 テーブルすべて null_count > 0、notnull_count = 0

-- ============================================================
-- ロールバック SQL(参考、適用前にコメント解除して個別実行)
-- ============================================================
-- step03(バックフィル)未実行前提で安全に実行可
-- バックフィル済の場合、列ドロップで scenario_id 値が消失するが
-- step01 の line_scenarios テーブル自体は残るため、再実行で復旧可能
-- ============================================================
--
-- ALTER TABLE line_followers DROP COLUMN IF EXISTS scenario_id;
-- ALTER TABLE line_inflow_routes DROP COLUMN IF EXISTS scenario_id;
-- ALTER TABLE line_step_sequences DROP COLUMN IF EXISTS scenario_id;
-- ALTER TABLE line_accounts DROP COLUMN IF EXISTS scenario_id;
-- ============================================================

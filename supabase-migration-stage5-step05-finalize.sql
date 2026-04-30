-- ============================================================
-- ⚠️⚠️⚠️ 不可逆操作・適用前 pg_dump 必須 ⚠️⚠️⚠️
-- ============================================================
-- 段階5 マイグレーション Step 05: NOT NULL 化 + 旧列・旧テーブル削除
-- ============================================================
-- ⚠️ 本ファイルは Step 11〜13 を含み、列ドロップ/テーブル削除を実行する
-- ⚠️ 完全なロールバックは不可能(構造復元は可能だが、データ復旧は pg_dump バックアップが必要)
-- ⚠️ 本ファイル実行前に以下を必ず実施:
--    1. Supabase Point-in-Time Recovery 設定状況の確認(契約プラン依存)
--    2. または pg_dump によるバックアップ取得
--    3. 動作確認(MARI / ウマトク / トレサロ / マネーボート)全 TC 通過済
--    4. アプリ側コード(高優先度 5 + 中優先度 4 + 低優先度 5)が scenario_id ベースに移行済
--
-- 9項目判断 9:積極派(段階5 メイン内で全 Step 11〜13 まで完了)
--
-- 推奨実行手順:本ファイル全体を 1 トランザクションで実行せず、
-- Step 11 / Step 12 / Step 13 を別々に BEGIN; ... COMMIT; で実行し、
-- 各ステップ後に動作確認することを推奨(草案 §10 参照)
--
-- 依存関係:
--   - 前提:step01〜step03 適用済 + アプリ側コードデプロイ済(Step 10)
--   - 前提:scenario_id NULL 行が 0 件であること(本ファイル先頭の事前 SELECT で検証)
--   - 後続:なし(段階5 SQL マイグレーションの最終ステップ)
--
-- 草案参照元:
--   - C:\Users\lmsml\.claude\plans\07-calm-pudding.md §6(ファイル5:supabase-migration-stage5-step05-finalize.sql)
--
-- 過去パターン参照元:
--   - supabase-schema-line-inflow-account-nullable.sql:7-11(NOT NULL 化と DROP COLUMN の逆操作パターン)
--   - supabase-migration-rollback-sthreads-sync.sql(2 段階確認:SELECT → DML)
-- ============================================================

-- 事前 SELECT(必須・厳密確認)
DO $$
DECLARE
  null_acc INT;
  null_seq INT;
  null_fol INT;
BEGIN
  RAISE NOTICE '[stage5-step05] pre-check (CRITICAL)';

  SELECT count(*) INTO null_acc FROM line_accounts WHERE scenario_id IS NULL;
  SELECT count(*) INTO null_seq FROM line_step_sequences WHERE scenario_id IS NULL;
  SELECT count(*) INTO null_fol FROM line_followers WHERE scenario_id IS NULL;

  RAISE NOTICE '  line_accounts.scenario_id NULL count: % (must be 0)', null_acc;
  RAISE NOTICE '  line_step_sequences.scenario_id NULL count: % (must be 0)', null_seq;
  RAISE NOTICE '  line_followers.scenario_id NULL count: % (must be 0)', null_fol;

  IF null_acc > 0 OR null_seq > 0 OR null_fol > 0 THEN
    RAISE EXCEPTION 'ABORT: scenario_id NULL rows detected. Run Step 03 backfill first.';
  END IF;

  RAISE NOTICE '  All NOT NULL preconditions satisfied. Proceeding.';
END $$;

-- 既存アプリログ確認(過去 24 時間に同期 cron / 配信 cron でエラー無いか)
-- これは PostgreSQL 内では実行できないため、Vercel ログで別途確認

-- ============================================================
-- Step 11: NOT NULL 化 + account_id ドロップ
-- ============================================================

ALTER TABLE line_accounts ALTER COLUMN scenario_id SET NOT NULL;
ALTER TABLE line_step_sequences ALTER COLUMN scenario_id SET NOT NULL;
ALTER TABLE line_followers ALTER COLUMN scenario_id SET NOT NULL;

-- account_id 列ドロップ(line_step_sequences のみ。line_followers / line_inflow_routes は account_id を維持)
ALTER TABLE line_step_sequences DROP COLUMN IF EXISTS account_id;

-- ============================================================
-- Step 12: line_account_groups + line_accounts.group_name 削除
-- ============================================================

-- 事前確認:closer_visible が true の行があれば中止(運用上の依存可能性)
DO $$
DECLARE
  cv_count INT;
BEGIN
  SELECT count(*) INTO cv_count FROM line_account_groups WHERE closer_visible = true;
  IF cv_count > 0 THEN
    RAISE EXCEPTION 'ABORT: line_account_groups has closer_visible=true rows (%). Manual review required.', cv_count;
  END IF;
END $$;

DROP TABLE IF EXISTS line_account_groups;
ALTER TABLE line_accounts DROP COLUMN IF EXISTS group_name;

-- ============================================================
-- Step 13: line_projects 列削除
-- ============================================================

ALTER TABLE line_projects DROP COLUMN IF EXISTS distribute_enabled;
ALTER TABLE line_projects DROP COLUMN IF EXISTS distribute_count;
ALTER TABLE line_projects DROP COLUMN IF EXISTS reserve_count;
ALTER TABLE line_projects DROP COLUMN IF EXISTS ban_sync_enabled;

-- ============================================================
-- 事後 SELECT
-- ============================================================

DO $$
BEGIN
  RAISE NOTICE '[stage5-step05] post-check';
END $$;

-- Step 11 検証
SELECT column_name, is_nullable
  FROM information_schema.columns
 WHERE table_name IN ('line_accounts', 'line_step_sequences', 'line_followers')
   AND column_name = 'scenario_id'
  ORDER BY table_name;
-- 期待: 3 行、is_nullable=NO

SELECT column_name FROM information_schema.columns
 WHERE table_name = 'line_step_sequences' AND column_name = 'account_id';
-- 期待: 0 行(account_id 消失)

-- Step 12 検証
SELECT to_regclass('public.line_account_groups');
-- 期待: NULL(テーブル消失)

SELECT column_name FROM information_schema.columns
 WHERE table_name = 'line_accounts' AND column_name = 'group_name';
-- 期待: 0 行

-- Step 13 検証
SELECT column_name FROM information_schema.columns
 WHERE table_name = 'line_projects'
   AND column_name IN ('distribute_enabled', 'distribute_count', 'reserve_count', 'ban_sync_enabled');
-- 期待: 0 行

-- ============================================================
-- ロールバック SQL(部分的・limited、参考、適用前にコメント解除して個別実行)
-- ============================================================
-- ⚠️ Step 11 以降は完全ロールバック不可
-- ⚠️ 列再作成は可能だが、データ復旧は pg_dump バックアップから手動 INSERT 必要
-- ⚠️ line_step_sequences.account_id ドロップ後、紐付け情報は完全に失われる
-- ============================================================
--
-- -- Step 11 部分(NOT NULL 解除のみ可、account_id 列復元は構造のみ)
-- ALTER TABLE line_followers ALTER COLUMN scenario_id DROP NOT NULL;
-- ALTER TABLE line_step_sequences ALTER COLUMN scenario_id DROP NOT NULL;
-- ALTER TABLE line_accounts ALTER COLUMN scenario_id DROP NOT NULL;
--
-- -- 以下は構造復元のみ、データは pg_dump バックアップから別途リストア必要
-- ALTER TABLE line_step_sequences ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES line_accounts(id) ON DELETE CASCADE;
-- ALTER TABLE line_accounts ADD COLUMN IF NOT EXISTS group_name TEXT;
--
-- ALTER TABLE line_projects ADD COLUMN IF NOT EXISTS distribute_enabled BOOLEAN NOT NULL DEFAULT false;
-- ALTER TABLE line_projects ADD COLUMN IF NOT EXISTS distribute_count INTEGER NOT NULL DEFAULT 1;
-- ALTER TABLE line_projects ADD COLUMN IF NOT EXISTS reserve_count INTEGER NOT NULL DEFAULT 0;
-- ALTER TABLE line_projects ADD COLUMN IF NOT EXISTS ban_sync_enabled BOOLEAN NOT NULL DEFAULT false;
--
-- -- line_account_groups は CREATE TABLE 文を別途実行(初期定義の supabase-schema-line-groups.sql 参照)
-- ============================================================

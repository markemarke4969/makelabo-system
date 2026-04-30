-- ============================================================
-- 段階5 マイグレーション Step 03: scenario_id バックフィル + MARI sequences マージ
-- ============================================================
-- 目的:
--   Step 02 で追加した scenario_id 列を、本番 DB の現状データに基づいてバックフィル。
--   MARI sequences は全保持(9項目判断 4)、テストデータも履歴として残す。
--
-- 9項目判断適用:
--   - 4: MARI sequences 5件すべてを scenario=mari に紐付け、status は無変更(案 6-A 確定)
--   - 2: スレッズ集客 inflow_routes 2件は scenario_id=NULL 維持
--
-- 案 6-A 採用根拠(草案 §0-A 再調査):
--   - dashboard/page.tsx:6062, 6081 の UI フィルタは sent_at NOT NULL のみで判定
--   - broadcast.ts:42-47 の markBroadcastSent は sent_at のみ更新、status は変更しない
--   - 既存のテスト 4 件は sent_at が 2026-04-21〜23 で NOT NULL → 既に「送信済み一覧」に表示済み
--   - scenario_id バックフィル後も sent_at は変わらず、再配信もされない
--
-- 安全性:
--   - 全 UPDATE に WHERE scenario_id IS NULL 等の冪等性確保条件
--   - 複数回実行しても同じ行は1度しか更新されない
--
-- 依存関係:
--   - 前提:step01(line_scenarios 4 行存在)+ step02(scenario_id NULLABLE 列追加済)
--   - 後続:step05(NOT NULL 化)
--
-- 草案参照元:
--   - C:\Users\lmsml\.claude\plans\07-calm-pudding.md §4(ファイル3:supabase-migration-stage5-step03-backfill-scenarios.sql)
--
-- 過去パターン参照元:
--   - supabase-schema-line-inflow-project.sql:39-44(逆引きバックフィル)
--   - supabase-migration-umatoku-initial-setup.sql:64-92(条件付き UPDATE)
-- ============================================================

-- 事前 SELECT
DO $$
BEGIN
  RAISE NOTICE '[stage5-step03] pre-check';
  RAISE NOTICE '  line_accounts.scenario_id NULL count: % (expected: 21)', (SELECT count(*) FROM line_accounts WHERE scenario_id IS NULL);
  RAISE NOTICE '  line_step_sequences.scenario_id NULL count: % (expected: 5)', (SELECT count(*) FROM line_step_sequences WHERE scenario_id IS NULL);
  RAISE NOTICE '  line_inflow_routes.scenario_id NULL count: % (expected: 5)', (SELECT count(*) FROM line_inflow_routes WHERE scenario_id IS NULL);
  RAISE NOTICE '  line_followers.scenario_id NULL count: % (expected: 12)', (SELECT count(*) FROM line_followers WHERE scenario_id IS NULL);
END $$;

-- ============================================================
-- Step 4: line_accounts.scenario_id バックフィル
-- ============================================================

-- MARI 3 アカウント(group_name=NULL)→ scenario=mari
UPDATE line_accounts
   SET scenario_id = (SELECT id FROM line_scenarios WHERE code = 'mari'),
       updated_at = NOW()
 WHERE project_id = '987d51d5-f6c1-4efd-bfb3-e7f26f878c7e'
   AND scenario_id IS NULL;

-- ウマトク 6 アカウント
UPDATE line_accounts
   SET scenario_id = (SELECT id FROM line_scenarios WHERE code = 'umatoku'),
       updated_at = NOW()
 WHERE project_id = '4f065915-91c2-48a0-a4ec-b8f2f683e351'
   AND group_name = 'ウマトク'
   AND scenario_id IS NULL;

-- トレサロ 6 アカウント
UPDATE line_accounts
   SET scenario_id = (SELECT id FROM line_scenarios WHERE code = 'tresaro'),
       updated_at = NOW()
 WHERE project_id = '4f065915-91c2-48a0-a4ec-b8f2f683e351'
   AND group_name = 'トレサロ'
   AND scenario_id IS NULL;

-- マネーボート 6 アカウント
UPDATE line_accounts
   SET scenario_id = (SELECT id FROM line_scenarios WHERE code = 'moneyboat'),
       updated_at = NOW()
 WHERE project_id = '4f065915-91c2-48a0-a4ec-b8f2f683e351'
   AND group_name = 'マネーボート'
   AND scenario_id IS NULL;

-- ============================================================
-- Step 6: MARI sequences マージ(全保持・案 6-A 確定)
-- ============================================================
-- 5 件すべて旧 standby `b3823d14`(@058phahn)に紐付き
-- 9項目判断 4:全保持(あいさつ active 維持、テスト 4件は status は無変更で sent_at で送信済み判定)
-- ============================================================

-- 5 件すべてを scenario=mari に紐付け
UPDATE line_step_sequences
   SET scenario_id = (SELECT id FROM line_scenarios WHERE code = 'mari'),
       updated_at = NOW()
 WHERE account_id = 'b3823d14-f581-483d-a178-31299052fbe3'
   AND scenario_id IS NULL;
-- 期待: 5 行 UPDATE

-- ※ status の UPDATE は本ファイル(案 6-A 確定)では実行しない
-- 草案 §0-A 参照:sent_at が既に NOT NULL のため、broadcast.ts:253 の抽出条件で再配信されない

-- ============================================================
-- Step 8 後半: line_inflow_routes.scenario_id バックフィル
-- ============================================================
-- MARI 3 件のみ scenario=mari に
-- スレッズ集客 2 件は scenario_id=NULL 維持(9項目判断 2)
-- ============================================================

UPDATE line_inflow_routes
   SET scenario_id = (SELECT id FROM line_scenarios WHERE code = 'mari'),
       updated_at = NOW()
 WHERE project_id = '987d51d5-f6c1-4efd-bfb3-e7f26f878c7e'
   AND scenario_id IS NULL;
-- 期待: 3 行 UPDATE

-- ※ スレッズ集客 inflow_routes 2 件には UPDATE しない(NULL 維持)

-- ============================================================
-- Step 9 後半: line_followers.scenario_id デノーマライズバックフィル
-- ============================================================
-- account 経由の逆引き(過去パターン:supabase-schema-line-inflow-project.sql:39-44)
-- ============================================================

UPDATE line_followers f
   SET scenario_id = a.scenario_id,
       updated_at = NOW()
  FROM line_accounts a
 WHERE f.line_account_id = a.id
   AND f.scenario_id IS NULL
   AND a.scenario_id IS NOT NULL;
-- 期待: 12 行 UPDATE

-- ============================================================
-- 事後 SELECT
-- ============================================================

DO $$
BEGIN
  RAISE NOTICE '[stage5-step03] post-check';
END $$;

-- 4-A: scenario 別アカウント分布
SELECT s.code, count(a.*) AS account_count
  FROM line_scenarios s LEFT JOIN line_accounts a ON a.scenario_id = s.id
  GROUP BY s.code ORDER BY s.code;
-- 期待: mari=3, umatoku=6, tresaro=6, moneyboat=6

-- 6-A: MARI sequences の scenario 紐付け
SELECT s.code, ls.name, ls.kind, ls.status, ls.sent_at IS NOT NULL AS has_sent_at
  FROM line_step_sequences ls JOIN line_scenarios s ON ls.scenario_id = s.id
  ORDER BY ls.name;
-- 期待: 5 行(全件 scenario=mari)、あいさつ(step, sent_at=NULL)、テスト×3 + テストボタン(schedule, sent_at=NOT NULL)

-- 8-A: inflow_routes の scenario 紐付け
SELECT s.code, count(r.*) AS route_count
  FROM line_scenarios s LEFT JOIN line_inflow_routes r ON r.scenario_id = s.id
  GROUP BY s.code ORDER BY s.code;
-- 期待: mari=3, umatoku=0, tresaro=0, moneyboat=0(スレッズ 2 件は NULL のため除外)

SELECT count(*) AS null_routes FROM line_inflow_routes WHERE scenario_id IS NULL;
-- 期待: 2(スレッズ集客 2 件)

-- 9-A: followers の scenario 分布
SELECT s.code, count(f.*) AS follower_count
  FROM line_scenarios s LEFT JOIN line_followers f ON f.scenario_id = s.id
  GROUP BY s.code ORDER BY s.code;
-- 期待: mari に大半、ウマトクに 1〜2 件(BAN 復旧由来)

SELECT count(*) AS unscoped_followers FROM line_followers WHERE scenario_id IS NULL;
-- 期待: 0(全件 scenario_id 埋まっているはず)

-- ============================================================
-- ロールバック SQL(参考、適用前にコメント解除して個別実行)
-- ============================================================
-- step05(NOT NULL 化)未実行前提。列はそのまま、値だけ NULL に戻す
-- ============================================================
--
-- UPDATE line_followers SET scenario_id = NULL WHERE scenario_id IS NOT NULL;
-- UPDATE line_inflow_routes SET scenario_id = NULL WHERE scenario_id IS NOT NULL;
-- UPDATE line_step_sequences SET scenario_id = NULL WHERE scenario_id IS NOT NULL;
-- UPDATE line_accounts SET scenario_id = NULL WHERE scenario_id IS NOT NULL;
-- ============================================================

-- ============================================================
-- オプション SQL:案 6-B(本ファイルでは非採用、参考として併記)
-- ============================================================
-- UI 上で「テスト sequences を completed として明示マーク」要件があれば適用
-- 案 6-A 採用のため、本ファイル実行時には実行しない
-- ============================================================
--
-- UPDATE line_step_sequences
--    SET status = 'completed',
--        updated_at = NOW()
--  WHERE id IN (
--    '8058e19b-44c9-4283-bac0-7db488e91cc6',  -- テスト 4/21
--    '611fe539-4fb4-4a97-8e59-6264fdb7108e',  -- テスト 4/23
--    'f5977d7d-8e32-4a7a-987d-8e7bf29748b7',  -- テスト 4/23
--    '78830ca8-a030-4f85-b9b0-ecc2c4b24115'   -- テストボタン 4/23
--  )
--    AND status = 'active';
-- ============================================================

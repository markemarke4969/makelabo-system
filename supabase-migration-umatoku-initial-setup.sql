-- ============================================================
-- スレッズ集客 (ウマトクグループ) の分散登録 初期設定
-- ============================================================
-- 前提:
--   supabase-migration-distribute-registration.sql を先に実行済みであること。
--
-- 目標状態:
--   案件「スレッズ集客」
--     distribute_enabled = true
--     distribute_count   = 5
--     reserve_count      = 1
--     ban_sync_enabled   = true
--
--   グループ「ウマトク」の 6 アカウント
--     @175hlzxe → role='main',        order_index=1  (マスター、既に main)
--     @959nfmfn → role='distribute',  order_index=2
--     @972lvawx → role='distribute',  order_index=3
--     @254hqkgf → role='distribute',  order_index=4
--     @603pohel → role='distribute',  order_index=5
--     @415glsrb → role='standby',     order_index=0  (予備)
--
-- 実行手順 (3 ステップ):
--   Step 1. 【事前確認】下の SELECT を実行し、basic_id の格納形式と
--           該当6本が全て存在することを確認。
--   Step 2. UPDATE 文を上から順に実行。
--   Step 3. 【事後確認】再度 SELECT を実行し、想定通りに反映されたか確認。
-- ============================================================

-- ----------------------------------------------------------------------------
-- Step 1. 事前確認 SELECT
-- ----------------------------------------------------------------------------
--   - basic_id に '@' が付いているか/付いていないかを確認
--   - 6 行 (@175hlzxe, @959nfmfn, @972lvawx, @254hqkgf, @603pohel, @415glsrb)
--     が全て返ることを確認
--   - 現在の role / order_index を確認
-- ----------------------------------------------------------------------------
SELECT id,
       account_name,
       basic_id,
       role,
       order_index,
       group_name,
       is_active,
       created_at
  FROM line_accounts
 WHERE group_name = 'ウマトク'
 ORDER BY created_at;

-- ----------------------------------------------------------------------------
-- Step 2-a. 案件「スレッズ集客」のフラグ設定
-- ----------------------------------------------------------------------------
UPDATE line_projects
   SET distribute_enabled = true,
       distribute_count   = 5,
       reserve_count      = 1,
       ban_sync_enabled   = true
 WHERE name = 'スレッズ集客';

-- ----------------------------------------------------------------------------
-- Step 2-b. ウマトク 6 本の role / order_index 更新
--   basic_id の格納形式が '@xxx' / 'xxx' どちらでも効くよう IN 条件で両対応。
--   group_name = 'ウマトク' で他案件に同 basic_id があっても巻き込まない。
-- ----------------------------------------------------------------------------
UPDATE line_accounts
   SET role = 'main', order_index = 1, updated_at = NOW()
 WHERE basic_id IN ('175hlzxe', '@175hlzxe')
   AND group_name = 'ウマトク';

UPDATE line_accounts
   SET role = 'distribute', order_index = 2, updated_at = NOW()
 WHERE basic_id IN ('959nfmfn', '@959nfmfn')
   AND group_name = 'ウマトク';

UPDATE line_accounts
   SET role = 'distribute', order_index = 3, updated_at = NOW()
 WHERE basic_id IN ('972lvawx', '@972lvawx')
   AND group_name = 'ウマトク';

UPDATE line_accounts
   SET role = 'distribute', order_index = 4, updated_at = NOW()
 WHERE basic_id IN ('254hqkgf', '@254hqkgf')
   AND group_name = 'ウマトク';

UPDATE line_accounts
   SET role = 'distribute', order_index = 5, updated_at = NOW()
 WHERE basic_id IN ('603pohel', '@603pohel')
   AND group_name = 'ウマトク';

UPDATE line_accounts
   SET role = 'standby', order_index = 0, updated_at = NOW()
 WHERE basic_id IN ('415glsrb', '@415glsrb')
   AND group_name = 'ウマトク';

-- ----------------------------------------------------------------------------
-- Step 3. 事後確認 SELECT
-- ----------------------------------------------------------------------------
--   期待する結果:
--     (order_index, role, basic_id) が
--       (1, 'main',       '(@)175hlzxe')
--       (2, 'distribute', '(@)959nfmfn')
--       (3, 'distribute', '(@)972lvawx')
--       (4, 'distribute', '(@)254hqkgf')
--       (5, 'distribute', '(@)603pohel')
--       (0, 'standby',    '(@)415glsrb')
--     の 6 行。合計が 6 行であること。
-- ----------------------------------------------------------------------------
SELECT order_index,
       role,
       basic_id,
       account_name,
       group_name
  FROM line_accounts
 WHERE group_name = 'ウマトク'
 ORDER BY order_index, basic_id;

SELECT name,
       distribute_enabled,
       distribute_count,
       reserve_count,
       ban_sync_enabled
  FROM line_projects
 WHERE name = 'スレッズ集客';

-- ============================================================
-- 段階6 フェーズC-1 マイグレーション:
--   line_rich_menus に scenario_id + deploy_status 列追加 + line_account_id NULLABLE 化
-- ============================================================
-- 目的:
--   scenario 単位の「代表リッチメニュー」管理を可能にする。
--   既存の account 単位 menu は line_account_id NOT NULL のまま、
--   scenario 代表 menu は line_account_id NULL + scenario_id NOT NULL で新規作成。
--   deploy_status は scenario 一括 deploy の結果(account ごと)を集約保存。
--
-- 安全性:
--   - 全列 NULLABLE で開始、既存行への影響なし
--   - line_account_id NOT NULL → NULLABLE 化は逆方向(NULL 復帰)なので既存データ無影響
--   - rollback は DROP COLUMN + ALTER COLUMN SET NOT NULL で完全可逆
--     (ただし scenario 代表 menu が新規作成済の場合は事前 DELETE 必要)
--
-- 依存関係:
--   前提: 段階5 適用済(line_scenarios テーブル存在、line_accounts.scenario_id NOT NULL)
--   前提: 段階6c-2 適用済(src/lib/scenario-resolve.ts 存在、PR #17 マージ済)
--   後続: 段階7 で line_rich_menu_deploys 履歴テーブル分離(本マイグレーション範囲外)
-- ============================================================

-- 事前 SELECT
DO $$
BEGIN
  RAISE NOTICE '[stage6c-rich-menu] pre-check';
  RAISE NOTICE '  line_rich_menus rows: %', (SELECT count(*) FROM line_rich_menus);
  RAISE NOTICE '  line_rich_menus with line_account_id NOT NULL: %',
    (SELECT count(*) FROM line_rich_menus WHERE line_account_id IS NOT NULL);
  RAISE NOTICE '  line_scenarios rows: % (expected: 4)', (SELECT count(*) FROM line_scenarios);
END $$;

-- A-1) scenario_id NULLABLE 列追加(scenario 削除時は CASCADE で代表 menu も連鎖削除)
ALTER TABLE line_rich_menus
  ADD COLUMN IF NOT EXISTS scenario_id UUID
    REFERENCES line_scenarios(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_line_rich_menus_scenario
  ON line_rich_menus(scenario_id) WHERE scenario_id IS NOT NULL;

-- A-2) line_account_id NULLABLE 化(scenario 代表 menu は account 紐付けなし許容)
ALTER TABLE line_rich_menus
  ALTER COLUMN line_account_id DROP NOT NULL;

-- A-3) deploy_status JSONB 列追加(scenario 単位一括 deploy の集約結果、DEFAULT なし)
-- 形式:
--   {
--     "started_at": "2026-05-02T10:00:00Z",
--     "completed_at": "2026-05-02T10:00:03Z",
--     "total": 3, "succeeded": 2, "failed": 1,
--     "details": [
--       { "account_id": "uuid", "account_name": "MARI-1",
--         "status": "success", "stage": 3,
--         "line_rich_menu_id": "richmenu-xxxx",
--         "deployed_at": "2026-05-02T10:00:02Z" },
--       { "account_id": "uuid", "account_name": "MARI-2",
--         "status": "failed", "stage": 2,
--         "error": "画像アップロード失敗 (413): ...",
--         "http_status": 413 }
--     ]
--   }
ALTER TABLE line_rich_menus
  ADD COLUMN IF NOT EXISTS deploy_status JSONB;

-- A-4) 整合性 CHECK(scenario_id か line_account_id のどちらかは NOT NULL)
ALTER TABLE line_rich_menus
  ADD CONSTRAINT line_rich_menus_scope_check
    CHECK (scenario_id IS NOT NULL OR line_account_id IS NOT NULL)
    NOT VALID;
ALTER TABLE line_rich_menus VALIDATE CONSTRAINT line_rich_menus_scope_check;

-- 事後 SELECT
DO $$
BEGIN
  RAISE NOTICE '[stage6c-rich-menu] post-check';
END $$;

SELECT column_name, is_nullable, data_type
  FROM information_schema.columns
 WHERE table_name = 'line_rich_menus'
   AND column_name IN ('scenario_id', 'line_account_id', 'deploy_status')
 ORDER BY column_name;
-- 期待: 3 行(全 is_nullable=YES)

SELECT
  count(*) FILTER (WHERE scenario_id IS NULL AND line_account_id IS NOT NULL)   AS legacy_account_only,
  count(*) FILTER (WHERE scenario_id IS NOT NULL AND line_account_id IS NULL)   AS scenario_representative,
  count(*) FILTER (WHERE scenario_id IS NOT NULL AND line_account_id IS NOT NULL) AS hybrid,
  count(*) FILTER (WHERE deploy_status IS NOT NULL) AS with_deploy_status
FROM line_rich_menus;
-- 適用直後: legacy_account_only > 0、他は 0

-- ============================================================
-- ロールバック SQL(参考、適用後に scenario 代表 menu を作成済の場合は DELETE が先)
-- ============================================================
-- DELETE FROM line_rich_menus WHERE scenario_id IS NOT NULL AND line_account_id IS NULL;
-- ALTER TABLE line_rich_menus DROP CONSTRAINT IF EXISTS line_rich_menus_scope_check;
-- ALTER TABLE line_rich_menus DROP COLUMN IF EXISTS deploy_status;
-- ALTER TABLE line_rich_menus DROP COLUMN IF EXISTS scenario_id;
-- ALTER TABLE line_rich_menus ALTER COLUMN line_account_id SET NOT NULL;
-- ============================================================

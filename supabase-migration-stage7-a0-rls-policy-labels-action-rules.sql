-- ============================================================
-- 段階7 フェーズ7-A0 マイグレーション:
--   line_labels / line_action_rules への RLS POLICY 追加(pre-existing バグ修正)
-- ============================================================
-- 経緯:
--   段階7 全体設計フェーズ Phase 1 調査(2026-05-02)で、9 テーブル schema
--   状態確認時に line_labels / line_action_rules が RLS 完全未設定であることを発見。
--   段階6 PR #19(rich-menus RLS pre-existing fix)と同じ pre-existing バグで、
--   段階7 着手前のクリーンアップとして独立 PR で事前修正する。
--   プランファイル C:\Users\lmsml\.claude\plans\07-calm-pudding.md
--   §「A. 9 テーブル schema 状態」/ §「7-A0:RLS POLICY 補填」参照。
--
-- 影響:
--   段階7 schema 移行(7-A1)/ パターン F 直 hit 化(7-A2)とは無関係の
--   pre-existing バグ修正。本適用後、line_labels / line_action_rules の書き込み
--   挙動が他テーブル(rich-menus / templates / reminders 等)と整合する。
--   既存 SELECT/INSERT は「Allow all」ポリシーで全許可、現行動作不変。
--
-- 影響ファイル(grep 結果、9 ファイル):
--   - src/app/api/line/labels/route.ts(段階6 c-2 で scenario_id 対応済)
--   - src/app/api/line/labels/assign/route.ts
--   - src/app/api/line/action-rules/route.ts(段階6 c-2 で scenario_id 対応済)
--   - src/app/api/line/export/route.ts
--   - src/app/api/line/reports/route.ts
--   - src/app/api/line/lpro-sync/route.ts
--   - src/lib/account-sync.ts
--   - src/lib/action-rules.ts
--   - src/lib/line-replacer.ts
-- ============================================================

-- line_labels:RLS 有効化(冪等)+ POLICY 追加(冪等)
ALTER TABLE line_labels ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE tablename = 'line_labels'
       AND policyname = 'Allow all for service role'
  ) THEN
    CREATE POLICY "Allow all for service role"
      ON line_labels
      FOR ALL
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- line_action_rules:RLS 有効化(冪等)+ POLICY 追加(冪等)
ALTER TABLE line_action_rules ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE tablename = 'line_action_rules'
       AND policyname = 'Allow all for service role'
  ) THEN
    CREATE POLICY "Allow all for service role"
      ON line_action_rules
      FOR ALL
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- 確認用 SELECT(段階6 PR #19 形式踏襲、cmd / qual / with_check 含む厳密検証)
SELECT tablename, policyname, cmd, qual, with_check
  FROM pg_policies
 WHERE tablename IN ('line_labels', 'line_action_rules')
 ORDER BY tablename;
-- 期待:2 行
--   line_action_rules | Allow all for service role | ALL | true | true
--   line_labels       | Allow all for service role | ALL | true | true

-- ============================================================
-- ロールバック SQL(参考、段階6 PR #19 と同等の運用ドキュメント体裁)
-- ============================================================
-- DROP POLICY IF EXISTS "Allow all for service role" ON line_labels;
-- DROP POLICY IF EXISTS "Allow all for service role" ON line_action_rules;
-- ALTER TABLE line_labels DISABLE ROW LEVEL SECURITY;
-- ALTER TABLE line_action_rules DISABLE ROW LEVEL SECURITY;
-- ============================================================

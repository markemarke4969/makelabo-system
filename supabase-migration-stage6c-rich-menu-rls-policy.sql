-- ============================================================
-- 段階6 フェーズC-1a 追補マイグレーション:
--   line_rich_menus の RLS ポリシー追加(pre-existing バグ修正)
-- ============================================================
-- 経緯:
--   段階6 C-1a 着手時に curl で POST が RLS 違反で 500 エラー判明。
--   調査の結果、line_templates / line_reminders / line_newsletters
--   などの他テーブルには "Allow all for service role" ポリシーが
--   設定されているが、line_rich_menus にだけ未設定だった
--   pre-existing バグと判明。
--   そのため MARI でリッチメニュー機能が一度も使えていなかった。
--
-- 影響:
--   段階6 C-1a の API 拡張とは無関係の pre-existing バグ修正。
--   本適用後、リッチメニュー機能が初めて使用可能になる。
-- ============================================================

CREATE POLICY "Allow all for service role"
  ON line_rich_menus
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- 確認用 SELECT
SELECT tablename, policyname, cmd, qual, with_check
FROM pg_policies
WHERE tablename = 'line_rich_menus';

-- ============================================================
-- ロールバック SQL(参考)
-- ============================================================
-- DROP POLICY IF EXISTS "Allow all for service role" ON line_rich_menus;
-- ============================================================

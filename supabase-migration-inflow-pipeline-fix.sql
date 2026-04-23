-- ============================================================
-- 流入経路パイプライン修復（未適用マイグレーションのまとめ）
-- ============================================================
-- 問題:
--   中継URL経由で友だち追加しても
--     ① 流入経路の人数がカウントされない
--     ② 友達リストに表示されない
--     ③ LINEチャットにも表示されない
-- 原因:
--   webhook ハンドラが参照しているカラムが本番DBに未作成で、
--   follower upsert が SQL エラーで失敗している。
-- このSQLで追加するカラム:
--   - line_followers.inflow_route_id   (UUID, nullable, FK)
--   - line_inflow_clicks.follower_id   (UUID, nullable, FK)
-- 何度実行しても安全（IF NOT EXISTS）。
-- ============================================================

-- 1. line_followers に inflow_route_id
ALTER TABLE line_followers
  ADD COLUMN IF NOT EXISTS inflow_route_id UUID
    REFERENCES line_inflow_routes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_line_followers_inflow_route_id
  ON line_followers(inflow_route_id);

-- 2. line_inflow_clicks に follower_id（消費フラグ兼リンク）
ALTER TABLE line_inflow_clicks
  ADD COLUMN IF NOT EXISTS follower_id UUID
    REFERENCES line_followers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_line_inflow_clicks_follower_id
  ON line_inflow_clicks(follower_id);

-- 3. 未消費クリックの検索を高速化する部分インデックス
CREATE INDEX IF NOT EXISTS idx_line_inflow_clicks_unconsumed
  ON line_inflow_clicks(clicked_at DESC)
  WHERE follower_id IS NULL;

-- 4. 確認用: カラムが追加されたか検証
SELECT
  'line_followers' AS tbl,
  column_name,
  is_nullable,
  data_type
FROM information_schema.columns
WHERE table_name = 'line_followers'
  AND column_name = 'inflow_route_id'
UNION ALL
SELECT
  'line_inflow_clicks' AS tbl,
  column_name,
  is_nullable,
  data_type
FROM information_schema.columns
WHERE table_name = 'line_inflow_clicks'
  AND column_name = 'follower_id';

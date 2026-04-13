-- ========================================
-- 流入経路と友だちの紐付け
-- ========================================
-- 目的: 「流入経路URL経由で登録された友だち数」を正しく集計できるようにする。
--
-- 仕組み:
--   1. /line/r/{project_code}/{inflow_code} アクセス時に line_inflow_clicks に 1 行 insert
--   2. LINE webhook で follow イベントが届いたら、同一案件内で直近 30 分以内の
--      未消費クリック（follower_id IS NULL）のうち最新のものを探し、
--      その inflow_route_id を新規 follower に紐付ける
--   3. 紐付けたクリックには follower_id を埋めて二重マッチを防ぐ
--
-- 制限: LINE からは webhook に流入情報が一切渡らないため、
--       クリックと follow の対応付けは時間窓ヒューリスティック。
--       同時に複数人が登録した場合は取り違えが起きうる点は許容。

-- 1. line_followers に inflow_route_id
alter table line_followers
  add column if not exists inflow_route_id uuid
    references line_inflow_routes(id) on delete set null;

create index if not exists idx_line_followers_inflow_route_id
  on line_followers(inflow_route_id);

-- 2. line_inflow_clicks に follower_id (消費フラグ兼リンク)
alter table line_inflow_clicks
  add column if not exists follower_id uuid
    references line_followers(id) on delete set null;

create index if not exists idx_line_inflow_clicks_follower_id
  on line_inflow_clicks(follower_id);

-- 3. 未消費クリックの検索を高速化する部分インデックス
create index if not exists idx_line_inflow_clicks_unconsumed
  on line_inflow_clicks(clicked_at desc)
  where follower_id is null;

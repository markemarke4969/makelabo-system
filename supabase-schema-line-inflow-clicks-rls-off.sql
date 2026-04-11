-- ========================================
-- line_inflow_clicks の RLS を無効化
-- ========================================
-- 他のLINE系テーブル（line_inflow_routes, line_followers 等）は
-- RLS 無効で運用しているため、これに合わせる。
-- 有効のままだと anon キーの API が SELECT できず、
-- 集計クリック数が常に 0 になる問題が発生する。

alter table line_inflow_clicks disable row level security;

-- 念のため古いポリシーも削除
drop policy if exists "line_inflow_clicks_select_auth" on line_inflow_clicks;
drop policy if exists "line_inflow_clicks_insert_any" on line_inflow_clicks;

-- ========================================
-- 流入経路クリック計測
-- ========================================
-- 中継URL /line/r/[account_code]/[inflow_code] にアクセスされた
-- タイミングで 1 行 insert する。カウントは line_inflow_routes の
-- 集計クエリから参照する。

create table if not exists line_inflow_clicks (
  id uuid primary key default gen_random_uuid(),
  inflow_route_id uuid not null references line_inflow_routes(id) on delete cascade,
  clicked_at timestamptz not null default now(),
  user_agent text,
  ip_address text
);

create index if not exists idx_line_inflow_clicks_route_id
  on line_inflow_clicks(inflow_route_id);

create index if not exists idx_line_inflow_clicks_clicked_at
  on line_inflow_clicks(clicked_at desc);

-- 経路ID × 日付 での集計を高速化したい場合に使う複合インデックス
create index if not exists idx_line_inflow_clicks_route_day
  on line_inflow_clicks(inflow_route_id, clicked_at desc);

-- RLS（必要に応じて。既存テーブルと同じ方針に合わせること）
alter table line_inflow_clicks enable row level security;

-- サービスロール/認証済みからは全件読み書き可、匿名からは insert のみ許可。
-- 中継エンドポイントはサーバー側で supabase サービスキーを使う想定だが、
-- 念のため匿名 insert も許可しておく。
drop policy if exists "line_inflow_clicks_select_auth" on line_inflow_clicks;
create policy "line_inflow_clicks_select_auth"
  on line_inflow_clicks for select
  to authenticated
  using (true);

drop policy if exists "line_inflow_clicks_insert_any" on line_inflow_clicks;
create policy "line_inflow_clicks_insert_any"
  on line_inflow_clicks for insert
  to anon, authenticated
  with check (true);

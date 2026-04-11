-- ========================================
-- line_inflow_routes.account_id を nullable 化
-- ========================================
-- 流入経路は案件単位（project_id）に移行済み。
-- 旧 NOT NULL / UNIQUE(account_id, code) を外す。

alter table line_inflow_routes
  alter column account_id drop not null;

alter table line_inflow_routes
  drop constraint if exists line_inflow_routes_account_id_code_key;

-- 確認
select column_name, is_nullable
  from information_schema.columns
  where table_name = 'line_inflow_routes'
  order by ordinal_position;

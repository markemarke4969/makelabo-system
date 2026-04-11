-- ========================================
-- 流入経路を「案件単位」に変更
-- ========================================
-- BAN対策で予備LINEに切り替わっても中継URLを変えなくて良いよう、
-- 流入経路を個別アカウントではなく「案件（line_projects）」に紐付ける。
--
-- 中継URL: /line/r/{project_code}/{inflow_code}
--   project_code = line_projects.code
--   inflow_code  = line_inflow_routes.code
-- 中継エンドポイントは project から「現在のメインアカウント（role='main' かつ
-- is_active かつ未BAN）」を探してそこに誘導する。
--
-- 実行順:
--   1. line_projects に code カラム追加
--   2. 既存レコードに code を自動採番（必要なら後から手動で差し替え）
--   3. line_inflow_routes に project_id 列追加（account_id は互換維持のため残す）
--   4. 既存流入経路に account.project_id をバックフィル
--   5. (project_id, code) の一意制約を追加

-- 1. line_projects.code
alter table line_projects
  add column if not exists code text;

-- 2. 既存レコードのコードをとりあえず "proj-" + id先頭8文字 で埋める（後から編集可）
update line_projects
  set code = 'proj-' || substring(id::text from 1 for 8)
  where code is null;

-- 重複防止（null は複数許容される挙動）
create unique index if not exists idx_line_projects_code_unique
  on line_projects(code)
  where code is not null;

-- 3. line_inflow_routes.project_id
alter table line_inflow_routes
  add column if not exists project_id uuid references line_projects(id) on delete cascade;

-- 4. 既存データ: account_id → account.project_id → project_id へバックフィル
update line_inflow_routes r
  set project_id = a.project_id
  from line_accounts a
  where r.project_id is null
    and r.account_id = a.id
    and a.project_id is not null;

create index if not exists idx_line_inflow_routes_project_id
  on line_inflow_routes(project_id);

-- 5. (project_id, code) ユニーク
create unique index if not exists idx_line_inflow_routes_project_code_unique
  on line_inflow_routes(project_id, code)
  where project_id is not null;

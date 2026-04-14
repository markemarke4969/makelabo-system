-- ============================================================
-- 登録経路グループ管理
-- ============================================================
-- 流入経路（line_inflow_routes）をグループ化してまとめて分析できるようにする。
-- 例: 「YouTube」「Instagram」「アフィリエイト」でグルーピング。

CREATE TABLE IF NOT EXISTS line_inflow_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID REFERENCES line_accounts(id) ON DELETE CASCADE,
  project_id UUID REFERENCES line_projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT DEFAULT '#3B82F6',
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- account_id か project_id のどちらか必須
ALTER TABLE line_inflow_groups DROP CONSTRAINT IF EXISTS line_inflow_groups_owner_check;
ALTER TABLE line_inflow_groups ADD CONSTRAINT line_inflow_groups_owner_check
  CHECK (account_id IS NOT NULL OR project_id IS NOT NULL);

-- 同一スコープ内で同名を禁止
CREATE UNIQUE INDEX IF NOT EXISTS idx_line_inflow_groups_account_name
  ON line_inflow_groups(account_id, name) WHERE account_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_line_inflow_groups_project_name
  ON line_inflow_groups(project_id, name) WHERE project_id IS NOT NULL;

-- 流入経路にグループIDを追加
ALTER TABLE line_inflow_routes
  ADD COLUMN IF NOT EXISTS group_id UUID REFERENCES line_inflow_groups(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_line_inflow_routes_group_id
  ON line_inflow_routes(group_id);

ALTER TABLE line_inflow_groups ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all for service role" ON line_inflow_groups;
CREATE POLICY "Allow all for service role" ON line_inflow_groups
  FOR ALL USING (true) WITH CHECK (true);

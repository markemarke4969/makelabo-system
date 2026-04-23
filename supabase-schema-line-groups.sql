-- ============================================================
-- LINE アカウントグループ管理テーブル
-- グループ単位のメタデータ（クローザー表示フラグ等）
-- ============================================================
CREATE TABLE IF NOT EXISTS line_account_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES line_projects(id) ON DELETE CASCADE,
  group_name TEXT NOT NULL,
  closer_visible BOOLEAN NOT NULL DEFAULT false,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(project_id, group_name)
);

ALTER TABLE line_account_groups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for service role" ON line_account_groups FOR ALL USING (true) WITH CHECK (true);

-- フォロワーに担当クローザーIDを追加
ALTER TABLE line_followers ADD COLUMN IF NOT EXISTS closer_id UUID DEFAULT NULL;
CREATE INDEX IF NOT EXISTS idx_line_followers_closer_id ON line_followers(closer_id);

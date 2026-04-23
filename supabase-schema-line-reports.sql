-- ============================================================
-- 月次レポート
-- ============================================================
CREATE TABLE IF NOT EXISTS line_monthly_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES line_projects(id) ON DELETE CASCADE,
  report_month TEXT NOT NULL, -- 'YYYY-MM' 形式
  report_data JSONB NOT NULL DEFAULT '{}',
  csv_content TEXT DEFAULT NULL,
  status TEXT NOT NULL DEFAULT 'generated', -- generated, sent
  sent_at TIMESTAMPTZ DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(project_id, report_month)
);

CREATE INDEX IF NOT EXISTS idx_line_reports_project ON line_monthly_reports(project_id, report_month DESC);

ALTER TABLE line_monthly_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for service role" ON line_monthly_reports FOR ALL USING (true) WITH CHECK (true);

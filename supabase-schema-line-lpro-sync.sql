-- ============================================================
-- Lpro データ同期ログ
-- ============================================================
CREATE TABLE IF NOT EXISTS line_lpro_sync_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  total_rows INT NOT NULL DEFAULT 0,
  updated_count INT NOT NULL DEFAULT 0,
  created_count INT NOT NULL DEFAULT 0,
  skipped_count INT NOT NULL DEFAULT 0,
  error_count INT NOT NULL DEFAULT 0,
  errors JSONB DEFAULT '[]',
  duration_ms INT DEFAULT 0
);

ALTER TABLE line_lpro_sync_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for service role" ON line_lpro_sync_logs FOR ALL USING (true) WITH CHECK (true);

-- ============================================================
-- メイン→予備 自動同期の履歴テーブル
-- ============================================================
-- 目的:
--   6時間ごとの自動同期 (/api/cron/line-sync-main-to-backup) の
--   実行結果を記録し、cron と手動ボタンの二重実行防止にも使う。
--
-- ステータス:
--   running / success / partial / failed
--   - running  : 実行中（二重起動防止用ロック兼務）
--   - success  : 全対象同期成功
--   - partial  : 一部スキップ or 失敗あり
--   - failed   : 全体失敗
-- ============================================================

CREATE TABLE IF NOT EXISTS line_sync_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES line_projects(id) ON DELETE CASCADE,
  source_account_id UUID REFERENCES line_accounts(id) ON DELETE SET NULL,
  target_account_id UUID REFERENCES line_accounts(id) ON DELETE SET NULL,
  synced_items JSONB,
  status TEXT NOT NULL DEFAULT 'running',
  error_message TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_line_sync_history_project
  ON line_sync_history(project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_line_sync_history_running
  ON line_sync_history(status) WHERE status = 'running';

ALTER TABLE line_sync_history ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE tablename = 'line_sync_history'
       AND policyname = 'Allow all for service role'
  ) THEN
    CREATE POLICY "Allow all for service role"
      ON line_sync_history FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

-- 確認用
SELECT table_name FROM information_schema.tables
 WHERE table_name = 'line_sync_history';

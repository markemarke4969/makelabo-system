-- ============================================================
-- 掘り起こし配信（CS専用配信）
-- ============================================================
CREATE TABLE IF NOT EXISTS line_reengagement_broadcasts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES line_accounts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  target_condition JSONB DEFAULT NULL,
  status TEXT NOT NULL DEFAULT 'draft', -- draft / scheduled / sent / paused (段階8-2-E-3-2 で値拡張、CHECK 制約なし)
  sent_at TIMESTAMPTZ DEFAULT NULL,
  sent_count INT DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS line_reengagement_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  broadcast_id UUID NOT NULL REFERENCES line_reengagement_broadcasts(id) ON DELETE CASCADE,
  msg_order INT NOT NULL DEFAULT 1,
  msg_type TEXT NOT NULL DEFAULT 'text',
  payload JSONB DEFAULT '{}',
  body TEXT DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE line_reengagement_broadcasts ENABLE ROW LEVEL SECURITY;
ALTER TABLE line_reengagement_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for service role" ON line_reengagement_broadcasts FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for service role" ON line_reengagement_messages FOR ALL USING (true) WITH CHECK (true);

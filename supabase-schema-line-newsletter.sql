-- ============================================================
-- メルマガ（ニュースレター）管理テーブル
-- ============================================================
CREATE TABLE IF NOT EXISTS line_newsletters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES line_accounts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  subject TEXT NOT NULL DEFAULT '',
  body_html TEXT DEFAULT '',
  body_text TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft', -- draft, scheduled, sent
  scheduled_at TIMESTAMPTZ DEFAULT NULL,
  sent_at TIMESTAMPTZ DEFAULT NULL,
  sent_count INT DEFAULT 0,
  target_condition JSONB DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS line_newsletter_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  newsletter_id UUID NOT NULL REFERENCES line_newsletters(id) ON DELETE CASCADE,
  follower_id UUID NOT NULL REFERENCES line_followers(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'sent', -- sent, bounced, opened, clicked
  sent_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE line_newsletters ENABLE ROW LEVEL SECURITY;
ALTER TABLE line_newsletter_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for service role" ON line_newsletters FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for service role" ON line_newsletter_logs FOR ALL USING (true) WITH CHECK (true);

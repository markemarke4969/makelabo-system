-- ============================================================
-- SMS機能
-- ============================================================

-- SMSクレジット残高
CREATE TABLE IF NOT EXISTS line_sms_credits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES line_projects(id) ON DELETE CASCADE,
  balance INT NOT NULL DEFAULT 0, -- 残クレジット（1通=1クレジット）
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(project_id)
);

-- SMSクレジット購入履歴
CREATE TABLE IF NOT EXISTS line_sms_credit_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES line_projects(id) ON DELETE CASCADE,
  amount INT NOT NULL, -- 購入クレジット数
  type TEXT NOT NULL DEFAULT 'charge', -- charge, consume
  description TEXT DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- SMS送信履歴
CREATE TABLE IF NOT EXISTS line_sms_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES line_accounts(id) ON DELETE CASCADE,
  follower_id UUID DEFAULT NULL REFERENCES line_followers(id) ON DELETE SET NULL,
  phone_number TEXT NOT NULL,
  message_text TEXT NOT NULL,
  credits_used INT NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'sent', -- sent, failed
  error_message TEXT DEFAULT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_line_sms_logs_account ON line_sms_logs(account_id);

ALTER TABLE line_sms_credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE line_sms_credit_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE line_sms_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for service role" ON line_sms_credits FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for service role" ON line_sms_credit_history FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for service role" ON line_sms_logs FOR ALL USING (true) WITH CHECK (true);

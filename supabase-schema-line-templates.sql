-- ============================================================
-- LINE テンプレート管理テーブル
-- ============================================================
CREATE TABLE IF NOT EXISTS line_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES line_accounts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  group_name TEXT DEFAULT NULL,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS line_template_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES line_templates(id) ON DELETE CASCADE,
  msg_order INT NOT NULL DEFAULT 1,
  msg_type TEXT NOT NULL DEFAULT 'text',
  payload JSONB DEFAULT '{}',
  body TEXT DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS無効（サービスロールのみアクセス）
ALTER TABLE line_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE line_template_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for service role" ON line_templates FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for service role" ON line_template_messages FOR ALL USING (true) WITH CHECK (true);

-- ============================================================
-- ステップメッセージ timing カラム追加
-- ============================================================
ALTER TABLE line_step_messages ADD COLUMN IF NOT EXISTS timing_mode TEXT DEFAULT 'immediate';
ALTER TABLE line_step_messages ADD COLUMN IF NOT EXISTS delivery_days INT DEFAULT NULL;
ALTER TABLE line_step_messages ADD COLUMN IF NOT EXISTS delivery_time TEXT DEFAULT NULL;

-- ============================================================
-- カスタムフィールド
-- ============================================================
CREATE TABLE IF NOT EXISTS line_custom_fields (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES line_accounts(id) ON DELETE CASCADE,
  field_key TEXT NOT NULL,
  field_label TEXT NOT NULL,
  field_type TEXT NOT NULL DEFAULT 'text', -- text, email, phone, select, number, date
  options JSONB DEFAULT NULL, -- selectの場合の選択肢
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(account_id, field_key)
);

CREATE TABLE IF NOT EXISTS line_follower_custom_values (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  follower_id UUID NOT NULL REFERENCES line_followers(id) ON DELETE CASCADE,
  field_id UUID NOT NULL REFERENCES line_custom_fields(id) ON DELETE CASCADE,
  value TEXT DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(follower_id, field_id)
);

ALTER TABLE line_custom_fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE line_follower_custom_values ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for service role" ON line_custom_fields FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for service role" ON line_follower_custom_values FOR ALL USING (true) WITH CHECK (true);

-- ============================================================
-- リマインダ配信
-- ============================================================
CREATE TABLE IF NOT EXISTS line_reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES line_accounts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  base_date_field TEXT NOT NULL DEFAULT 'custom', -- 'custom' or カスタムフィールドのfield_key
  status TEXT NOT NULL DEFAULT 'active',
  target_condition JSONB DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS line_reminder_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reminder_id UUID NOT NULL REFERENCES line_reminders(id) ON DELETE CASCADE,
  msg_order INT NOT NULL DEFAULT 1,
  offset_days INT NOT NULL DEFAULT 0, -- 基準日からの日数（マイナス=前、プラス=後）
  offset_time TEXT DEFAULT '09:00', -- 配信時刻 HH:MM
  msg_type TEXT NOT NULL DEFAULT 'text',
  payload JSONB DEFAULT '{}',
  body TEXT DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS line_reminder_enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reminder_id UUID NOT NULL REFERENCES line_reminders(id) ON DELETE CASCADE,
  follower_id UUID NOT NULL REFERENCES line_followers(id) ON DELETE CASCADE,
  base_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  last_sent_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(reminder_id, follower_id)
);

ALTER TABLE line_reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE line_reminder_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE line_reminder_enrollments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for service role" ON line_reminders FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for service role" ON line_reminder_messages FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for service role" ON line_reminder_enrollments FOR ALL USING (true) WITH CHECK (true);

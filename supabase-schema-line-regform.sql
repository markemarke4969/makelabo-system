-- ============================================================
-- 登録フォーム機能
-- ============================================================

-- 登録フォーム定義
CREATE TABLE IF NOT EXISTS line_registration_forms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES line_accounts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT DEFAULT NULL,
  status TEXT NOT NULL DEFAULT 'active', -- active, inactive
  thank_you_message TEXT DEFAULT '登録ありがとうございます！',
  -- 登録後アクション
  post_action_type TEXT DEFAULT NULL, -- label_add, start_sequence
  post_action_config JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 登録フォーム項目
CREATE TABLE IF NOT EXISTS line_registration_form_fields (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id UUID NOT NULL REFERENCES line_registration_forms(id) ON DELETE CASCADE,
  field_order INT NOT NULL DEFAULT 1,
  field_label TEXT NOT NULL,
  field_type TEXT NOT NULL DEFAULT 'text', -- text, email, phone, number, textarea, select, radio, checkbox, date, hidden
  options JSONB DEFAULT '[]', -- select/radio/checkbox の選択肢
  is_required BOOLEAN NOT NULL DEFAULT true,
  placeholder TEXT DEFAULT NULL,
  -- 回答の保存先カスタムフィールド
  save_to_field_id UUID DEFAULT NULL REFERENCES line_custom_fields(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 登録フォーム送信データ
CREATE TABLE IF NOT EXISTS line_registration_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id UUID NOT NULL REFERENCES line_registration_forms(id) ON DELETE CASCADE,
  follower_id UUID DEFAULT NULL REFERENCES line_followers(id) ON DELETE SET NULL,
  line_user_id TEXT DEFAULT NULL,
  data JSONB NOT NULL DEFAULT '{}', -- {field_id: value}
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_line_regforms_account ON line_registration_forms(account_id);
CREATE INDEX IF NOT EXISTS idx_line_regform_fields_form ON line_registration_form_fields(form_id, field_order);
CREATE INDEX IF NOT EXISTS idx_line_regsubs_form ON line_registration_submissions(form_id);

ALTER TABLE line_registration_forms ENABLE ROW LEVEL SECURITY;
ALTER TABLE line_registration_form_fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE line_registration_submissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for service role" ON line_registration_forms FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for service role" ON line_registration_form_fields FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for service role" ON line_registration_submissions FOR ALL USING (true) WITH CHECK (true);

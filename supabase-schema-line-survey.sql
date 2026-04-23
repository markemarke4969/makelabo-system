-- ============================================================
-- シナリオ内アンケート機能
-- ============================================================

-- アンケート定義
CREATE TABLE IF NOT EXISTS line_surveys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES line_accounts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT DEFAULT NULL,
  status TEXT NOT NULL DEFAULT 'active', -- active, inactive
  thank_you_message TEXT DEFAULT 'ご回答ありがとうございました！',
  -- 回答後アクション
  post_action_type TEXT DEFAULT NULL, -- label_add, start_sequence
  post_action_config JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- アンケート質問
CREATE TABLE IF NOT EXISTS line_survey_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_id UUID NOT NULL REFERENCES line_surveys(id) ON DELETE CASCADE,
  question_order INT NOT NULL DEFAULT 1,
  question_text TEXT NOT NULL,
  question_type TEXT NOT NULL DEFAULT 'text', -- text, select, multi_select, email, phone, number
  options JSONB DEFAULT '[]', -- select/multi_select の選択肢 [{label, value}]
  is_required BOOLEAN NOT NULL DEFAULT true,
  -- 回答の保存先カスタムフィールド
  save_to_field_id UUID DEFAULT NULL REFERENCES line_custom_fields(id) ON DELETE SET NULL,
  -- 回答に応じたラベル付与設定 {value: label_id} のマッピング
  label_mapping JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- アンケート回答
CREATE TABLE IF NOT EXISTS line_survey_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_id UUID NOT NULL REFERENCES line_surveys(id) ON DELETE CASCADE,
  follower_id UUID NOT NULL REFERENCES line_followers(id) ON DELETE CASCADE,
  line_user_id TEXT NOT NULL,
  answers JSONB NOT NULL DEFAULT '{}', -- {question_id: answer_value}
  responded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(survey_id, follower_id)
);

CREATE INDEX IF NOT EXISTS idx_line_surveys_account ON line_surveys(account_id);
CREATE INDEX IF NOT EXISTS idx_line_survey_questions_survey ON line_survey_questions(survey_id, question_order);
CREATE INDEX IF NOT EXISTS idx_line_survey_responses_survey ON line_survey_responses(survey_id);
CREATE INDEX IF NOT EXISTS idx_line_survey_responses_follower ON line_survey_responses(follower_id);

ALTER TABLE line_surveys ENABLE ROW LEVEL SECURITY;
ALTER TABLE line_survey_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE line_survey_responses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for service role" ON line_surveys FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for service role" ON line_survey_questions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for service role" ON line_survey_responses FOR ALL USING (true) WITH CHECK (true);

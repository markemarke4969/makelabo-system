-- ============================================================
-- 段階5 並行作業 (§16-9 パスX): line_message_clicks テーブル新設
-- ============================================================
-- 目的:
--   配信メッセージ内 URL のクリック計測テーブルを新設。
--   LINE 開封率は仕様上不可能のため、クリック率を代替指標とする。
--   段階5 メイン実装と独立、並行で進められる。
--
-- 9項目判断 7: パスX(先行)+ scenario_id NULLABLE 先取り
--   段階5 完了後に scenario_id を NOT NULL 化する別マイグレーション SQL を実行する想定
--   (本ファイル末尾のコメント参照)
--
-- 注意:
--   line_step_enrollments テーブルは本番不在のため、step_enrollment_id は
--   FK なしの UUID 列として追加。将来テーブル本体作成時に FK を追加する。
--
-- 依存関係:
--   - 前提:line_step_sequences / line_step_messages / line_followers / line_projects 存在
--           line_scenarios 存在(step01 適用済)
--   - 後続:アプリ側コード(URL 書き換え + 中継エンドポイント)実装は別 PR
--           段階5 完了後に scenario_id NOT NULL 化(本ファイル末尾コメント参照)
--   - 並行:本ファイルは段階5 メイン(step01〜step03, step05)と並行実行可能
--
-- 草案参照元:
--   - C:\Users\lmsml\.claude\plans\07-calm-pudding.md §5(ファイル4:supabase-migration-stage5-step04-message-clicks.sql)
--
-- 過去パターン参照元:
--   - supabase-migration-inflow-pipeline-fix.sql:18-37(複数 FK 追加 + 部分インデックス)
--   - supabase-schema-line-inflow-clicks.sql(クリック計測テーブルの基本形)
-- ============================================================

-- 事前 SELECT
DO $$
BEGIN
  RAISE NOTICE '[stage5-step04] pre-check';
  RAISE NOTICE '  line_message_clicks exists? %', (SELECT to_regclass('public.line_message_clicks'));
  RAISE NOTICE '  line_step_sequences rows: %', (SELECT count(*) FROM line_step_sequences);
  RAISE NOTICE '  line_step_messages rows: %', (SELECT count(*) FROM line_step_messages);
  RAISE NOTICE '  line_step_enrollments exists? %', (SELECT to_regclass('public.line_step_enrollments'));
END $$;

-- メインテーブル
CREATE TABLE IF NOT EXISTS line_message_clicks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- 配信特定(段階5 で sequence_id の意味が account_id ベースから scenario_id ベースに変わるが、id 自体は維持)
  broadcast_sequence_id UUID NOT NULL REFERENCES line_step_sequences(id) ON DELETE CASCADE,
  step_message_id UUID NOT NULL REFERENCES line_step_messages(id) ON DELETE CASCADE,

  -- enrollment(本番不在のため FK なしで UUID のみ。将来 FK 追加検討)
  step_enrollment_id UUID,

  -- scenario_id(段階5 用、最初から NULLABLE で含める。段階5 完了後 NOT NULL 化)
  scenario_id UUID REFERENCES line_scenarios(id) ON DELETE SET NULL,
  -- project_id デノーマライズ(scenario_id 不在時のフォールバック集計用)
  project_id UUID REFERENCES line_projects(id) ON DELETE CASCADE,

  -- URL 計測情報
  url_index INTEGER NOT NULL DEFAULT 0,
  original_url TEXT NOT NULL,
  click_token TEXT NOT NULL UNIQUE,

  -- クリック情報
  clicked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  user_agent TEXT,
  ip_address TEXT,

  -- フォロワー紐付け(LIFF 経由で取得時のみ)
  follower_id UUID REFERENCES line_followers(id) ON DELETE SET NULL,
  line_user_id TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- インデックス(過去パターン:inflow-pipeline-fix.sql / inflow-clicks.sql)
CREATE INDEX IF NOT EXISTS idx_line_message_clicks_sequence
  ON line_message_clicks(broadcast_sequence_id, clicked_at DESC);
CREATE INDEX IF NOT EXISTS idx_line_message_clicks_message
  ON line_message_clicks(step_message_id);
CREATE INDEX IF NOT EXISTS idx_line_message_clicks_token
  ON line_message_clicks(click_token);
CREATE INDEX IF NOT EXISTS idx_line_message_clicks_scenario
  ON line_message_clicks(scenario_id, clicked_at DESC) WHERE scenario_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_line_message_clicks_project
  ON line_message_clicks(project_id, clicked_at DESC);
CREATE INDEX IF NOT EXISTS idx_line_message_clicks_follower
  ON line_message_clicks(follower_id) WHERE follower_id IS NOT NULL;

-- RLS(line_inflow_clicks と同じ方針:authenticated 全許可)
ALTER TABLE line_message_clicks ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE tablename = 'line_message_clicks' AND policyname = 'allow_all_authenticated'
  ) THEN
    CREATE POLICY allow_all_authenticated ON line_message_clicks FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

-- 事後 SELECT
SELECT to_regclass('public.line_message_clicks') AS exists;
SELECT column_name, data_type, is_nullable FROM information_schema.columns
 WHERE table_name = 'line_message_clicks' ORDER BY ordinal_position;

-- ============================================================
-- ロールバック SQL(参考、適用前にコメント解除して個別実行)
-- ============================================================
-- §16-9 アプリ側実装(URL 書き換え + 中継エンドポイント)が稼働中の場合、
-- 本テーブル削除でクリック計測機能が停止する。アプリ側影響を確認してから実行
-- ============================================================
--
-- DROP TABLE IF EXISTS line_message_clicks CASCADE;
-- ============================================================

-- ============================================================
-- 段階5 完了後の NOT NULL 化(別マイグレーション SQL として後日実行)
-- ============================================================
-- 段階5 メイン完了後、本テーブルの scenario_id を NOT NULL 化する手順:
-- ============================================================
--
-- -- バックフィル(broadcast_sequence_id 経由で scenario_id 取得)
-- UPDATE line_message_clicks c
--    SET scenario_id = s.scenario_id
--   FROM line_step_sequences s
--  WHERE c.broadcast_sequence_id = s.id
--    AND c.scenario_id IS NULL
--    AND s.scenario_id IS NOT NULL;
--
-- -- 全件 NOT NULL を確認後
-- ALTER TABLE line_message_clicks ALTER COLUMN scenario_id SET NOT NULL;
-- ============================================================

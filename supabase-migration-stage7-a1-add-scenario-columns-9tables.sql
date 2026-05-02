-- ============================================================
-- 段階7 フェーズ7-A1 マイグレーション:
--   9 テーブル + line_scenarios への scenario_id / closer_visible 列追加
-- ============================================================
-- 目的:
--   段階6 で対応済の 9 テーブル(段階6 c-2 で IN 句集約経由で動作中)に
--   scenario_id 列を追加し、段階7-A2 でパターン F 直 hit クエリへ移行するための
--   schema 前提条件を整える。
--   加えて line_scenarios.closer_visible 列を追加し、段階5 Step 12 で削除した
--   line_account_groups.closer_visible の機能を scenario 単位で再設計する。
--
-- 安全性:
--   - 9 テーブルの scenario_id 列は全て NULLABLE で開始 → 既存 row への影響なし
--   - 各部分インデックス WHERE scenario_id IS NOT NULL → 全行 NULL のため作成時実質ゼロサイズ、ロック時間 < 100ms 想定
--   - line_scenarios.closer_visible は NOT NULL DEFAULT false で追加 → 既存 4 scenario に false が書き込まれる
--     (段階5 以前の line_account_groups.closer_visible NOT NULL DEFAULT false と完全整合、
--      石井さん 2026-05-02 判断、フェイルセーフ運用)
--
-- 依存関係:
--   - 前提:段階5 Step 01 適用済(line_scenarios テーブル存在 + 4 行 INSERT 済)
--   - 前提:段階6 PR #14〜#21 適用済(段階6 完全完了、9 テーブル CRUD 動作中)
--   - 前提:段階7-A0 適用済(line_labels / line_action_rules への RLS POLICY 追加、PR #22 / 806d0dc)
--   - 後続:段階7-A2(パターン F 直 hit 化、9 ルート GET API 書き換え)
--
-- ON DELETE 戦略(プランファイル §「A. 9 テーブル schema 状態」表 A 通り):
--   - line_labels                    : CASCADE  (scenario の付随物)
--   - line_templates                 : SET NULL (設定資産として scenario 跨ぎ再利用可能)
--   - line_custom_fields             : SET NULL (設定資産)
--   - line_action_rules              : CASCADE  (scenario 単位の自動化)
--   - line_reminders                 : CASCADE  (scenario 単位配信)
--   - line_newsletters               : CASCADE  (scenario 単位配信)
--   - line_surveys                   : CASCADE  (scenario 単位配信)
--   - line_registration_forms        : CASCADE  (scenario 単位登録動線)
--   - line_reengagement_broadcasts   : CASCADE  (scenario 単位配信)
--
-- 草案参照元:
--   - C:\Users\lmsml\.claude\plans\07-calm-pudding.md §「SQL マイグレーション草案 7-A1」
--
-- 実装時の修正(事前報告で発見、石井さん 2026-05-02 判断):
--   - プラン記載 line_reengagement → 実コード line_reengagement_broadcasts に修正
--   - closer_visible DEFAULT true → false に変更
--
-- 過去パターン参照元:
--   - supabase-migration-stage5-step02-add-scenario-columns.sql(4 テーブル ADD COLUMN テンプレ)
--   - supabase-migration-stage6c-rich-menu-scenario.sql(line_rich_menus への scenario_id 追加実績)
-- ============================================================

-- 事前 SELECT(本番適用前のベースライン記録)
DO $$
BEGIN
  RAISE NOTICE '[stage7-a1] pre-check';
  RAISE NOTICE '  line_scenarios rows: % (expected: 4)', (SELECT count(*) FROM line_scenarios);
  RAISE NOTICE '  line_labels rows: %', (SELECT count(*) FROM line_labels);
  RAISE NOTICE '  line_templates rows: %', (SELECT count(*) FROM line_templates);
  RAISE NOTICE '  line_custom_fields rows: %', (SELECT count(*) FROM line_custom_fields);
  RAISE NOTICE '  line_action_rules rows: %', (SELECT count(*) FROM line_action_rules);
  RAISE NOTICE '  line_reminders rows: %', (SELECT count(*) FROM line_reminders);
  RAISE NOTICE '  line_newsletters rows: %', (SELECT count(*) FROM line_newsletters);
  RAISE NOTICE '  line_surveys rows: %', (SELECT count(*) FROM line_surveys);
  RAISE NOTICE '  line_registration_forms rows: %', (SELECT count(*) FROM line_registration_forms);
  RAISE NOTICE '  line_reengagement_broadcasts rows: %', (SELECT count(*) FROM line_reengagement_broadcasts);
END $$;

-- ============================================================
-- 1. 9 テーブルへの scenario_id 列追加 + 部分インデックス作成
-- ============================================================

-- 1-1) line_labels:CASCADE
ALTER TABLE line_labels
  ADD COLUMN IF NOT EXISTS scenario_id UUID
    REFERENCES line_scenarios(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_line_labels_scenario
  ON line_labels(scenario_id) WHERE scenario_id IS NOT NULL;

-- 1-2) line_templates:SET NULL(資産性)
ALTER TABLE line_templates
  ADD COLUMN IF NOT EXISTS scenario_id UUID
    REFERENCES line_scenarios(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_line_templates_scenario
  ON line_templates(scenario_id) WHERE scenario_id IS NOT NULL;

-- 1-3) line_custom_fields:SET NULL(資産性)
ALTER TABLE line_custom_fields
  ADD COLUMN IF NOT EXISTS scenario_id UUID
    REFERENCES line_scenarios(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_line_custom_fields_scenario
  ON line_custom_fields(scenario_id) WHERE scenario_id IS NOT NULL;

-- 1-4) line_action_rules:CASCADE
ALTER TABLE line_action_rules
  ADD COLUMN IF NOT EXISTS scenario_id UUID
    REFERENCES line_scenarios(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_line_action_rules_scenario
  ON line_action_rules(scenario_id) WHERE scenario_id IS NOT NULL;

-- 1-5) line_reminders:CASCADE
ALTER TABLE line_reminders
  ADD COLUMN IF NOT EXISTS scenario_id UUID
    REFERENCES line_scenarios(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_line_reminders_scenario
  ON line_reminders(scenario_id) WHERE scenario_id IS NOT NULL;

-- 1-6) line_newsletters:CASCADE
ALTER TABLE line_newsletters
  ADD COLUMN IF NOT EXISTS scenario_id UUID
    REFERENCES line_scenarios(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_line_newsletters_scenario
  ON line_newsletters(scenario_id) WHERE scenario_id IS NOT NULL;

-- 1-7) line_surveys:CASCADE
ALTER TABLE line_surveys
  ADD COLUMN IF NOT EXISTS scenario_id UUID
    REFERENCES line_scenarios(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_line_surveys_scenario
  ON line_surveys(scenario_id) WHERE scenario_id IS NOT NULL;

-- 1-8) line_registration_forms:CASCADE
ALTER TABLE line_registration_forms
  ADD COLUMN IF NOT EXISTS scenario_id UUID
    REFERENCES line_scenarios(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_line_registration_forms_scenario
  ON line_registration_forms(scenario_id) WHERE scenario_id IS NOT NULL;

-- 1-9) line_reengagement_broadcasts:CASCADE
--   注:プラン記載 line_reengagement は実コード line_reengagement_broadcasts への誤記、
--       事前報告 §9 で発見、石井さん 2026-05-02 判断で実コード優先
ALTER TABLE line_reengagement_broadcasts
  ADD COLUMN IF NOT EXISTS scenario_id UUID
    REFERENCES line_scenarios(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_line_reengagement_broadcasts_scenario
  ON line_reengagement_broadcasts(scenario_id) WHERE scenario_id IS NOT NULL;

-- ============================================================
-- 2. line_scenarios.closer_visible 列追加(段階5 line_account_groups.closer_visible の再設計)
-- ============================================================
--   石井さん 2026-05-02 判断:DEFAULT false(段階5 以前の line_account_groups.closer_visible NOT NULL DEFAULT false と完全整合)
--   既存 4 scenario に false が書き込まれ、closer 不可視で運用開始。
--   必要に応じて石井さんが Supabase Dashboard or 将来の UI から明示的に true に切り替える運用。
ALTER TABLE line_scenarios
  ADD COLUMN IF NOT EXISTS closer_visible BOOLEAN NOT NULL DEFAULT false;

-- ============================================================
-- 事後 SELECT(検証)
-- ============================================================

DO $$
BEGIN
  RAISE NOTICE '[stage7-a1] post-check';
END $$;

-- 検証 1:9 テーブル + line_scenarios.closer_visible 列追加確認
-- 期待:10 行(9 個 scenario_id + 1 個 closer_visible)
SELECT table_name, column_name, data_type, is_nullable, column_default
  FROM information_schema.columns
 WHERE (column_name = 'scenario_id'
        AND table_name IN (
          'line_labels',
          'line_templates',
          'line_custom_fields',
          'line_action_rules',
          'line_reminders',
          'line_newsletters',
          'line_surveys',
          'line_registration_forms',
          'line_reengagement_broadcasts'
        ))
    OR (column_name = 'closer_visible' AND table_name = 'line_scenarios')
 ORDER BY table_name, column_name;
-- 期待:10 行
--   - 9 テーブル × scenario_id : data_type=uuid / is_nullable=YES / column_default=NULL
--   - line_scenarios × closer_visible : data_type=boolean / is_nullable=NO / column_default='false'

-- 検証 2:9 部分インデックス確認
-- 期待:9 行
SELECT indexname, tablename
  FROM pg_indexes
 WHERE indexname LIKE 'idx_line_%_scenario'
   AND indexname IN (
     'idx_line_labels_scenario',
     'idx_line_templates_scenario',
     'idx_line_custom_fields_scenario',
     'idx_line_action_rules_scenario',
     'idx_line_reminders_scenario',
     'idx_line_newsletters_scenario',
     'idx_line_surveys_scenario',
     'idx_line_registration_forms_scenario',
     'idx_line_reengagement_broadcasts_scenario'
   )
 ORDER BY indexname;
-- 期待:9 行(各 tablename と一致)

-- 検証 3:line_scenarios の全 4 scenario が closer_visible=false で書き込まれていることを保証
-- 期待:4 行、全 closer_visible=false
SELECT id, code, name, closer_visible
  FROM line_scenarios
 ORDER BY code;
-- 期待:4 行
--   90c5db09... | mari      | MARI         | false
--   37842084... | moneyboat | マネーボート | false
--   e8dc993b... | tresaro   | トレサロ     | false
--   f0aee0fe... | umatoku   | ウマトク     | false

-- 検証 4:9 テーブルの scenario_id 全件 NULL 確認(7-A2 の直 hit 化前のベースライン)
-- 期待:9 テーブル全て null_count > 0、notnull_count = 0
SELECT 'line_labels' AS t,
       count(*) FILTER (WHERE scenario_id IS NULL) AS null_count,
       count(*) FILTER (WHERE scenario_id IS NOT NULL) AS notnull_count
  FROM line_labels
UNION ALL
SELECT 'line_templates', count(*) FILTER (WHERE scenario_id IS NULL), count(*) FILTER (WHERE scenario_id IS NOT NULL) FROM line_templates
UNION ALL
SELECT 'line_custom_fields', count(*) FILTER (WHERE scenario_id IS NULL), count(*) FILTER (WHERE scenario_id IS NOT NULL) FROM line_custom_fields
UNION ALL
SELECT 'line_action_rules', count(*) FILTER (WHERE scenario_id IS NULL), count(*) FILTER (WHERE scenario_id IS NOT NULL) FROM line_action_rules
UNION ALL
SELECT 'line_reminders', count(*) FILTER (WHERE scenario_id IS NULL), count(*) FILTER (WHERE scenario_id IS NOT NULL) FROM line_reminders
UNION ALL
SELECT 'line_newsletters', count(*) FILTER (WHERE scenario_id IS NULL), count(*) FILTER (WHERE scenario_id IS NOT NULL) FROM line_newsletters
UNION ALL
SELECT 'line_surveys', count(*) FILTER (WHERE scenario_id IS NULL), count(*) FILTER (WHERE scenario_id IS NOT NULL) FROM line_surveys
UNION ALL
SELECT 'line_registration_forms', count(*) FILTER (WHERE scenario_id IS NULL), count(*) FILTER (WHERE scenario_id IS NOT NULL) FROM line_registration_forms
UNION ALL
SELECT 'line_reengagement_broadcasts', count(*) FILTER (WHERE scenario_id IS NULL), count(*) FILTER (WHERE scenario_id IS NOT NULL) FROM line_reengagement_broadcasts
 ORDER BY t;
-- 期待:9 行、全 notnull_count=0(7-A2 で値書き込み開始予定)

-- ============================================================
-- ロールバック SQL(参考、適用前にコメント解除して個別実行)
-- ============================================================
-- 7-A2(列値書き込み)未実行前提で安全に実行可。
-- 7-A2 実行後の rollback は scenario_id 値が消失するが、line_scenarios テーブル自体は残るため
-- 再実行で復旧可能。closer_visible は手動でデータ書き戻しが必要(現行 false / 将来 true 設定)。
-- ============================================================
--
-- ALTER TABLE line_scenarios DROP COLUMN IF EXISTS closer_visible;
--
-- DROP INDEX IF EXISTS idx_line_reengagement_broadcasts_scenario;
-- DROP INDEX IF EXISTS idx_line_registration_forms_scenario;
-- DROP INDEX IF EXISTS idx_line_surveys_scenario;
-- DROP INDEX IF EXISTS idx_line_newsletters_scenario;
-- DROP INDEX IF EXISTS idx_line_reminders_scenario;
-- DROP INDEX IF EXISTS idx_line_action_rules_scenario;
-- DROP INDEX IF EXISTS idx_line_custom_fields_scenario;
-- DROP INDEX IF EXISTS idx_line_templates_scenario;
-- DROP INDEX IF EXISTS idx_line_labels_scenario;
--
-- ALTER TABLE line_reengagement_broadcasts DROP COLUMN IF EXISTS scenario_id;
-- ALTER TABLE line_registration_forms DROP COLUMN IF EXISTS scenario_id;
-- ALTER TABLE line_surveys DROP COLUMN IF EXISTS scenario_id;
-- ALTER TABLE line_newsletters DROP COLUMN IF EXISTS scenario_id;
-- ALTER TABLE line_reminders DROP COLUMN IF EXISTS scenario_id;
-- ALTER TABLE line_action_rules DROP COLUMN IF EXISTS scenario_id;
-- ALTER TABLE line_custom_fields DROP COLUMN IF EXISTS scenario_id;
-- ALTER TABLE line_templates DROP COLUMN IF EXISTS scenario_id;
-- ALTER TABLE line_labels DROP COLUMN IF EXISTS scenario_id;
-- ============================================================

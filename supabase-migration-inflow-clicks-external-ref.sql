-- ============================================================
-- PR-Harness: line_inflow_clicks.external_ref 追加
-- ============================================================
-- 目的:
--   中継URL ?ref=<任意文字列> を click 行に保存し、外部システム
--   (副業診断アプリ等)から follow 引当状態を inflow-lookup API
--   経由で照会できるようにする。
--
-- 設計判断(2026-05-13 決裁):
--   - UNIQUE 制約は付けない(同一 ref で複数タップが想定される)
--   - NULL 許容(既存案件 / ?ref 無し中継URL は NULL のまま)
--   - 文字列のまま保存(UUID 形式チェックなし、汎用 external_ref)
--   - 部分インデックス(WHERE external_ref IS NOT NULL)で
--     既存 click 全件への影響を最小化
--
-- 影響評価:
--   - MARI 等の既存案件中継URL: 影響ゼロ(?ref なしの click は external_ref=NULL)
--   - follow webhook 引当ロジック: 変更なし
--   - /api/line/inflow-{routes,groups,backfill,stats}: 影響なし(新カラム未参照)
--   - ADD COLUMN は PG 11+ で metadata 変更のみ → 即座完了、本番稼働中でも安全
--
-- 適用方法:
--   Supabase SQL Editor から本ファイルを実行する(石井さん手作業)。
--
-- 何度実行しても安全(IF NOT EXISTS)。
--
-- ロールバック(必要時):
--   DROP INDEX IF EXISTS idx_line_inflow_clicks_external_ref_clicked_at;
--   DROP INDEX IF EXISTS idx_line_inflow_clicks_external_ref;
--   ALTER TABLE line_inflow_clicks DROP COLUMN IF EXISTS external_ref;
--   ※ 緊急時はコード側を先に revert する方が安全
--     (カラム残置でも前方互換、書き込まれない限り無害)
-- ============================================================

-- ===== Step 1: external_ref カラム追加 =====
ALTER TABLE line_inflow_clicks
  ADD COLUMN IF NOT EXISTS external_ref text;

-- ===== Step 2: 部分インデックス(NULL 行を含めず容量最小化)=====

-- lookup API は external_ref 完全一致で引く想定
CREATE INDEX IF NOT EXISTS idx_line_inflow_clicks_external_ref
  ON line_inflow_clicks(external_ref)
  WHERE external_ref IS NOT NULL;

-- 「同一 ref で複数 click 時の最新採用」クエリ高速化(複合)
CREATE INDEX IF NOT EXISTS idx_line_inflow_clicks_external_ref_clicked_at
  ON line_inflow_clicks(external_ref, clicked_at DESC)
  WHERE external_ref IS NOT NULL;

-- ===== Step 3: 検証 SELECT =====
SELECT column_name, is_nullable, data_type
FROM information_schema.columns
WHERE table_name = 'line_inflow_clicks'
  AND column_name = 'external_ref';
-- 期待: 1 行(external_ref / YES / text)

SELECT indexname
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'line_inflow_clicks'
  AND indexname IN (
    'idx_line_inflow_clicks_external_ref',
    'idx_line_inflow_clicks_external_ref_clicked_at'
  )
ORDER BY indexname;
-- 期待: 2 行返却

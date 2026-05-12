-- ============================================================
-- PR#2-A: matching_diagnoses に AI セクション永続化用カラムを追加
-- ============================================================
-- 目的:
--   PR#2(LINE登録直後の10割版詳細レポート配信)の前提として、
--   結果ページ表示時に Claude API で生成した 3 セクション(strength / animal / risk)
--   を DB に永続化する。現状はメモリのみ保持で、ページ離脱で消えるため、
--   LINE 配信側(line/webhook → lookup API)から読み取れない。
--
-- 追加カラム:
--   - ai_strength_section text       : 強みセクション本文(フル版)
--   - ai_animal_section   text       : 動物タイプセクション本文(フル版)
--   - ai_risk_section     text       : リスクセクション本文(フル版)
--   - ai_generated_at     timestamptz: AI 生成完了時刻
--   - ai_generation_status text      : 'pending' / 'ready' / 'failed'(default 'pending')
--   - report_delivered_at timestamptz: LINE 配信完了時刻(冪等性)
--
-- 追加インデックス:
--   - matching_diagnoses_report_idx(ai_generation_status, report_delivered_at)
--     PR#2-D の cron 再試行(failed の絞り込み)と配信状態の高速参照のため
--
-- 適用方法:
--   Supabase SQL Editor から本ファイルを実行する(石井さん手作業)。
--
-- 安全性:
--   - ALTER TABLE ADD COLUMN IF NOT EXISTS で idempotent
--   - 既存行の値は NULL(ai_generation_status のみ default 'pending')
--   - 既存 INSERT/UPDATE には影響なし(新規カラムはすべて NULL 許容 or default 付き)
--
-- ロールバック(必要時):
--   ALTER TABLE public.matching_diagnoses
--     DROP COLUMN IF EXISTS ai_strength_section,
--     DROP COLUMN IF EXISTS ai_animal_section,
--     DROP COLUMN IF EXISTS ai_risk_section,
--     DROP COLUMN IF EXISTS ai_generated_at,
--     DROP COLUMN IF EXISTS ai_generation_status,
--     DROP COLUMN IF EXISTS report_delivered_at;
--   DROP INDEX IF EXISTS matching_diagnoses_report_idx;
-- ============================================================

ALTER TABLE public.matching_diagnoses
  ADD COLUMN IF NOT EXISTS ai_strength_section text,
  ADD COLUMN IF NOT EXISTS ai_animal_section   text,
  ADD COLUMN IF NOT EXISTS ai_risk_section     text,
  ADD COLUMN IF NOT EXISTS ai_generated_at     timestamptz,
  ADD COLUMN IF NOT EXISTS ai_generation_status text
    CHECK (ai_generation_status IN ('pending','ready','failed'))
    DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS report_delivered_at timestamptz;

CREATE INDEX IF NOT EXISTS matching_diagnoses_report_idx
  ON public.matching_diagnoses (ai_generation_status, report_delivered_at);

-- 検証(SELECT は SQL Editor 上の表示確認用):
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'matching_diagnoses'
  AND column_name IN (
    'ai_strength_section',
    'ai_animal_section',
    'ai_risk_section',
    'ai_generated_at',
    'ai_generation_status',
    'report_delivered_at'
  )
ORDER BY column_name;
-- 期待: 6 行返却、status 列のみ default='pending'、他は default NULL

SELECT
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'matching_diagnoses'
  AND indexname = 'matching_diagnoses_report_idx';
-- 期待: 1 行返却

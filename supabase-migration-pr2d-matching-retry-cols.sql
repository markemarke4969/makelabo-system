-- ============================================================
-- PR#2-D: matching_diagnoses に ai_retry_count + line_redeliver_count 列追加
-- ============================================================
-- 目的:
--   (1) ai_retry_count: AI 生成 cron 再試行のコスト暴走防止(5 回上限)
--       matching-ai-retry cron が 1 時間毎に failed を再試行する際、
--       試行前にカウンタ +1。5 回到達で対象外になり Chatwork に通知。
--   (2) line_redeliver_count: LINE 再配信失敗の通知発火制御(5 回上限)
--       matching-line-redeliver cron が 1 時間毎に ready 未配信を再配信する際、
--       HTTP 失敗時のみカウンタ +1(skipped は無害カウントしない)。
--       5 回到達で対象外になり Chatwork に通知。
--
-- リセット手段:
--   admin が Supabase で UPDATE matching_diagnoses SET ai_retry_count=0 等で
--   再試行再開可能。
--
-- 影響評価:
--   - 既存全行は ai_retry_count=0 / line_redeliver_count=0 デフォルト → 挙動変更ゼロ
--   - インデックス不要(matching_diagnoses_report_idx で十分)
--   - RLS / 権限は touch なし
--   - ADD COLUMN は PG 11+ で metadata 変更のみ → 本番稼働中でも安全
--
-- 何度実行しても安全(IF NOT EXISTS)。
--
-- 適用方法:
--   Supabase SQL Editor から本ファイルを実行する(石井さん手作業)。
--
-- ロールバック(必要時):
--   ALTER TABLE matching_diagnoses DROP COLUMN IF EXISTS line_redeliver_count;
--   ALTER TABLE matching_diagnoses DROP COLUMN IF EXISTS ai_retry_count;
-- ============================================================

ALTER TABLE matching_diagnoses
  ADD COLUMN IF NOT EXISTS ai_retry_count INT NOT NULL DEFAULT 0;

ALTER TABLE matching_diagnoses
  ADD COLUMN IF NOT EXISTS line_redeliver_count INT NOT NULL DEFAULT 0;

-- 検証
SELECT column_name, is_nullable, data_type, column_default
  FROM information_schema.columns
 WHERE table_name = 'matching_diagnoses'
   AND column_name IN ('ai_retry_count', 'line_redeliver_count')
 ORDER BY column_name;
-- 期待: 2 行
--   ai_retry_count       | NO | integer | 0
--   line_redeliver_count | NO | integer | 0

-- 既存行への影響確認
SELECT count(*) AS total_rows,
       count(*) FILTER (WHERE ai_retry_count > 0) AS with_retry,
       count(*) FILTER (WHERE line_redeliver_count > 0) AS with_redeliver
  FROM matching_diagnoses;
-- 期待(本 SQL 直後): total > 0 / with_retry = 0 / with_redeliver = 0

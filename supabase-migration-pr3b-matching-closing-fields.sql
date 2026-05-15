-- ============================================================
-- supabase-migration-pr3b-matching-closing-fields.sql
-- 目的: 成約管理 6 項目(5 列追加 + 1 つは consultation_status 値拡張)
--
-- 関連 PR: PR#3-B(makelabo-system: ダッシュボード成約管理新規)
-- 設計プラン: C:\Users\lmsml\.claude\plans\pr-3-crispy-volcano.md §3-1
--
-- 実行方法:
--   1. Supabase ダッシュボード → SQL Editor
--   2. 本 SQL 全文を貼り付け
--   3. Run
--   4. 末尾の検証 SELECT が 5 行返ることを確認
--
-- 既存稼働への影響:
--   - すべて IF NOT EXISTS / 部分インデックス(WHERE 句付き) → 既存行に影響なし
--   - 既存 matching_diagnoses の他列・データには触らない
--   - consultation_status は CHECK 制約なし(text NOT NULL DEFAULT 'pending')のため
--     アプリ層で 6 値拡張(closed / lost / on_hold)するだけで DDL 変更は不要
--
-- ロールバック手順: 本 SQL 末尾のコメント部分を参照
-- ============================================================

ALTER TABLE matching_diagnoses
  ADD COLUMN IF NOT EXISTS meeting_date     date,
  ADD COLUMN IF NOT EXISTS meeting_time     text,
  ADD COLUMN IF NOT EXISTS closing_amount   integer,
  ADD COLUMN IF NOT EXISTS closing_product  text,
  ADD COLUMN IF NOT EXISTS closer_memo      text;

-- 成約済 / 失注 / 保留 行を KPI 集計しやすくする部分インデックス
CREATE INDEX IF NOT EXISTS idx_matching_diagnoses_closing_status
  ON matching_diagnoses (consultation_status, updated_at DESC)
  WHERE consultation_status IN ('closed', 'lost', 'on_hold');

-- ============================================================
-- 検証 SELECT(期待: 5 行返却)
-- ============================================================
SELECT column_name, data_type, is_nullable
  FROM information_schema.columns
 WHERE table_name = 'matching_diagnoses'
   AND column_name IN (
     'meeting_date',
     'meeting_time',
     'closing_amount',
     'closing_product',
     'closer_memo'
   )
 ORDER BY column_name;

-- ============================================================
-- ロールバック SQL(必要時のみ実行):
--
-- DROP INDEX IF EXISTS idx_matching_diagnoses_closing_status;
-- ALTER TABLE matching_diagnoses
--   DROP COLUMN IF EXISTS closer_memo,
--   DROP COLUMN IF EXISTS closing_product,
--   DROP COLUMN IF EXISTS closing_amount,
--   DROP COLUMN IF EXISTS meeting_time,
--   DROP COLUMN IF EXISTS meeting_date;
--
-- 注意: 列 DROP すると PR#3-B 以降で書き込んだ成約データは消失する。
-- ============================================================

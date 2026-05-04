-- ============================================================
-- 段階8-2-E-3-2: 掘り起こし配信の予約送信化
-- ============================================================
-- 実行日:2026-05-04(石井さん手動実行、Supabase Dashboard SQL Editor)
-- 背景:
--   line_reengagement_broadcasts に scheduled_at 列を追加し、
--   予約送信機能(指定時刻での自動送信)を有効化。
--   既存の即時送信機能(PUT action=send)は維持。
--
-- 設計判断:
--   - scheduled_at TIMESTAMPTZ NULLABLE
--     NULL → 即時送信扱い(現状の status='draft' フロー維持)
--     値あり → 予約送信(status='scheduled' で INSERT、cron が時刻到来後に拾う)
--   - status enum は CHECK 制約なし(supabase-schema-line-reengagement.sql L9 で確認済)
--     → 'draft' / 'scheduled' / 'sent' / 'paused' をアプリ層で流すだけで OK、SQL マイグレ不要
--   - 部分インデックス(WHERE status='scheduled'):cron が頻繁に SELECT するため
--
-- 安全性(autocommit / idempotent):
--   - ADD COLUMN IF NOT EXISTS:列重複追加防止
--   - CREATE INDEX IF NOT EXISTS:インデックス重複作成防止
--   - 既存 row の scheduled_at は NULL のまま(即時送信扱い、後方互換)
--   - BEGIN/COMMIT 不使用(過去の Supabase SQL Editor の autocommit 落ち教訓踏襲)
--
-- 実行手順:Step 1 → Step 2 → Step 3 を順次実行
-- ============================================================

-- ===== Step 1: 列追加 =====
ALTER TABLE line_reengagement_broadcasts
  ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ;

-- ===== Step 2: 部分インデックス作成(cron の SELECT 高速化) =====
-- status='scheduled' の row を scheduled_at <= NOW() で抽出する用途
CREATE INDEX IF NOT EXISTS idx_line_reengagement_broadcasts_scheduled
  ON line_reengagement_broadcasts(scheduled_at)
  WHERE status = 'scheduled';

-- ===== Step 3: 検証 =====
-- 検証 1:列追加確認
SELECT column_name, data_type, is_nullable, column_default
  FROM information_schema.columns
 WHERE table_name = 'line_reengagement_broadcasts'
   AND column_name = 'scheduled_at';
-- 期待:1 行(data_type=timestamp with time zone, is_nullable=YES, column_default=NULL)

-- 検証 2:インデックス追加確認
SELECT indexname, indexdef
  FROM pg_indexes
 WHERE tablename = 'line_reengagement_broadcasts'
   AND indexname = 'idx_line_reengagement_broadcasts_scheduled';
-- 期待:1 行

-- 検証 3:既存 row の scheduled_at が NULL のまま(後方互換)
SELECT count(*) AS total,
       count(*) FILTER (WHERE scheduled_at IS NULL) AS null_count,
       count(*) FILTER (WHERE scheduled_at IS NOT NULL) AS not_null_count
  FROM line_reengagement_broadcasts;
-- 期待:total=N、null_count=N、not_null_count=0(全件 NULL、既存即時送信扱い維持)

-- ============================================================
-- ロールバック SQL(参考、適用前にコメント解除して個別実行)
-- ============================================================
-- DROP INDEX IF EXISTS idx_line_reengagement_broadcasts_scheduled;
-- ALTER TABLE line_reengagement_broadcasts DROP COLUMN IF EXISTS scheduled_at;
-- ============================================================

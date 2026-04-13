-- ========================================
-- LINE 予約配信 機能拡張
-- Supabase SQL Editor で実行してください
-- 複数回実行しても安全（IF NOT EXISTS / ADD COLUMN IF NOT EXISTS）
-- 前提: supabase-schema-line-step.sql を先に実行済みであること
-- ========================================

-- ----------------------------------------
-- 1. line_step_sequences に予約配信用カラムを追加
-- ----------------------------------------
alter table line_step_sequences
  add column if not exists kind text not null default 'step';
-- kind: 'step' = ステップ配信 / 'schedule' = 予約配信

alter table line_step_sequences
  add column if not exists scheduled_at timestamptz;
-- 予約配信の送信予定日時（kind='schedule' のときのみ使用）

alter table line_step_sequences
  add column if not exists sent_at timestamptz;
-- 予約配信の送信完了日時（Cron が埋める。NULL なら未送信）

alter table line_step_sequences
  add column if not exists target_condition jsonb;
-- 配信対象条件（将来のラベル絞り込み用。MVP では NULL = 全友だち）

-- 予約配信の Cron 抽出用インデックス
-- (kind='schedule' AND scheduled_at <= now() AND sent_at IS NULL)
create index if not exists idx_line_step_sequences_schedule
  on line_step_sequences(kind, scheduled_at, sent_at);

-- ----------------------------------------
-- 2. 送信ログテーブル（誰に届いたか全員分を記録）
-- ----------------------------------------
create table if not exists line_broadcast_logs (
  id uuid primary key default gen_random_uuid(),
  sequence_id uuid not null references line_step_sequences(id) on delete cascade,
  account_id uuid not null references line_accounts(id) on delete cascade,
  line_user_id text not null,
  status text not null default 'success',
  -- 'success' = 送信成功 / 'failed' = 送信失敗
  error_message text,
  sent_at timestamptz not null default now()
);

create index if not exists idx_line_broadcast_logs_sequence
  on line_broadcast_logs(sequence_id);

create index if not exists idx_line_broadcast_logs_account
  on line_broadcast_logs(account_id, sent_at desc);

create index if not exists idx_line_broadcast_logs_user
  on line_broadcast_logs(line_user_id, sent_at desc);

-- ----------------------------------------
-- 既存データのマイグレーション
-- すでに [予約] プレフィックス付きで登録されたシーケンスを kind='schedule' に変換
-- ----------------------------------------
update line_step_sequences
  set kind = 'schedule',
      name = regexp_replace(name, '^\[予約\]\s*', '')
  where name like '[予約]%'
    and kind = 'step';

-- ========================================
-- LINE ステップ配信 / 予約配信 テーブル定義
-- Supabase 管理画面の SQL Editor で実行してください
-- 複数回実行しても安全（IF NOT EXISTS / ADD COLUMN IF NOT EXISTS）
-- ========================================

-- シーケンス（配信の大枠 = ステップ配信1件 / 予約配信1件）
create table if not exists line_step_sequences (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references line_accounts(id) on delete cascade,
  name text not null,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_line_step_sequences_account_id
  on line_step_sequences(account_id);

-- 既存環境互換: 古い環境で status カラムが無い場合のため
alter table line_step_sequences
  add column if not exists status text not null default 'active';

-- メッセージ（シーケンス内の各ステップ = 1通目、2通目...）
create table if not exists line_step_messages (
  id uuid primary key default gen_random_uuid(),
  sequence_id uuid not null references line_step_sequences(id) on delete cascade,
  step_order integer not null,
  delay_minutes integer not null default 0,
  media text,
  title text,
  body text,
  msg_type text,
  payload jsonb,
  status text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 既存環境に対する後方互換 ALTER（列が無ければ追加）
alter table line_step_messages
  add column if not exists msg_type text;
alter table line_step_messages
  add column if not exists payload jsonb;

create index if not exists idx_line_step_messages_sequence_id
  on line_step_messages(sequence_id);
create index if not exists idx_line_step_messages_order
  on line_step_messages(sequence_id, step_order);

-- ========================================
-- LINE ステップ配信 エンロールメント追跡テーブル
-- Supabase SQL Editor で実行してください
-- 複数回実行しても安全（IF NOT EXISTS）
-- 前提: supabase-schema-line-step.sql を先に実行済みであること
-- ========================================

-- フォロワーがどのシーケンスに登録され、どこまで送信済みかを追跡
create table if not exists line_step_enrollments (
  id uuid primary key default gen_random_uuid(),
  sequence_id uuid not null references line_step_sequences(id) on delete cascade,
  follower_id uuid not null references line_followers(id) on delete cascade,
  account_id uuid not null,
  line_user_id text not null,
  enrolled_at timestamptz not null default now(),
  last_sent_step integer not null default 0,  -- 最後に送信した step_order（0=まだ送ってない）
  status text not null default 'active',      -- active / completed / cancelled
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 同一フォロワー×シーケンスは1回だけ
create unique index if not exists idx_line_step_enrollments_unique
  on line_step_enrollments(sequence_id, follower_id);

-- cron 抽出用: active なエンロールメントを効率的に引く
create index if not exists idx_line_step_enrollments_active
  on line_step_enrollments(status, account_id);

create index if not exists idx_line_step_enrollments_follower
  on line_step_enrollments(follower_id);

-- ============================================================
-- LINE ハーネス 全テーブル定義（新Supabaseプロジェクト用）
-- Supabase 管理画面の SQL Editor に貼り付けて実行してください
-- 複数回実行しても安全（IF NOT EXISTS）
-- ============================================================

-- ========================================
-- 1. 案件（project）
-- ========================================
create table if not exists line_projects (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  color text default '#06C755',
  sort_order integer default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ========================================
-- 2. ユーザー × 案件リンク（権限管理）
-- ========================================
create table if not exists line_user_projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  project_id uuid not null references line_projects(id) on delete cascade,
  role text not null default 'viewer',
  created_at timestamptz not null default now(),
  unique (user_id, project_id)
);

create index if not exists idx_line_user_projects_user_id on line_user_projects(user_id);
create index if not exists idx_line_user_projects_project_id on line_user_projects(project_id);

-- ========================================
-- 3. LINE公式アカウント
-- ========================================
create table if not exists line_accounts (
  id uuid primary key default gen_random_uuid(),
  account_name text,
  channel_id text,
  basic_id text,
  channel_secret text,
  channel_access_token text,
  group_name text,
  project_id uuid references line_projects(id) on delete set null,
  role text default 'main',
  is_active boolean not null default true,
  banned_at timestamptz,
  greeting_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_line_accounts_project_id on line_accounts(project_id);
create index if not exists idx_line_accounts_channel_id on line_accounts(channel_id);

-- ========================================
-- 4. 友だち（フォロワー）
-- ========================================
create table if not exists line_followers (
  id uuid primary key default gen_random_uuid(),
  line_account_id uuid not null references line_accounts(id) on delete cascade,
  line_user_id text not null,
  display_name text,
  picture_url text,
  status text not null default 'following',
  memo text,
  is_test boolean not null default false,
  followed_at timestamptz not null default now(),
  unfollowed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (line_account_id, line_user_id)
);

create index if not exists idx_line_followers_account_id on line_followers(line_account_id);
create index if not exists idx_line_followers_user_id on line_followers(line_user_id);
create index if not exists idx_line_followers_is_test on line_followers(is_test);

-- ========================================
-- 5. メッセージ（受信/送信）
-- ========================================
create table if not exists line_messages (
  id uuid primary key default gen_random_uuid(),
  line_account_id uuid not null references line_accounts(id) on delete cascade,
  line_user_id text not null,
  direction text not null,
  message_type text not null,
  message_text text,
  raw_event jsonb,
  line_message_id text,
  reply_token text,
  sent_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  is_read boolean not null default false
);

create index if not exists idx_line_messages_account_id on line_messages(line_account_id);
create index if not exists idx_line_messages_user_id on line_messages(line_user_id);
create index if not exists idx_line_messages_sent_at on line_messages(sent_at desc);
create index if not exists idx_line_messages_unread on line_messages(line_user_id, direction) where is_read = false;

-- ========================================
-- 6. Webhook 受信ログ（診断用）
-- ========================================
create table if not exists line_webhook_logs (
  id uuid primary key default gen_random_uuid(),
  received_at timestamptz not null default now(),
  signature_header text,
  body_preview text,
  matched_account_id uuid,
  matched_channel_id text,
  verify_result text,
  event_types jsonb
);

create index if not exists idx_line_webhook_logs_received_at on line_webhook_logs(received_at desc);
create index if not exists idx_line_webhook_logs_matched_account_id on line_webhook_logs(matched_account_id);

-- ========================================
-- 7. 流入経路
-- ========================================
create table if not exists line_inflow_routes (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references line_accounts(id) on delete cascade,
  name text not null,
  code text not null,
  url text,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_id, code)
);

create index if not exists idx_line_inflow_routes_account_id on line_inflow_routes(account_id);

-- ========================================
-- 8. 予備アカウントプール（BAN対策）
-- ========================================
create table if not exists line_account_pool (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references line_projects(id) on delete cascade,
  account_id uuid not null references line_accounts(id) on delete cascade,
  status text not null default 'ready',
  activated_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_line_account_pool_project_id on line_account_pool(project_id);
create index if not exists idx_line_account_pool_status on line_account_pool(status);

-- ========================================
-- 9. BAN履歴
-- ========================================
create table if not exists line_ban_history (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references line_projects(id) on delete set null,
  banned_account_id uuid references line_accounts(id) on delete set null,
  new_account_id uuid references line_accounts(id) on delete set null,
  note text,
  detected_at timestamptz not null default now()
);

create index if not exists idx_line_ban_history_project_id on line_ban_history(project_id);
create index if not exists idx_line_ban_history_detected_at on line_ban_history(detected_at desc);

-- ========================================
-- 10. ステップ配信シーケンス
-- ========================================
create table if not exists line_step_sequences (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references line_accounts(id) on delete cascade,
  name text not null,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_line_step_sequences_account_id on line_step_sequences(account_id);

-- ========================================
-- 11. ステップメッセージ
-- ========================================
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
  status text default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_line_step_messages_sequence_id on line_step_messages(sequence_id);
create index if not exists idx_line_step_messages_order on line_step_messages(sequence_id, step_order);

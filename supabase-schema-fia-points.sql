-- ========================================
-- fiaポイントシステム テーブル定義
-- ========================================
-- Supabase管理画面の「SQL Editor」に貼り付けて実行してください
-- ※ fiana_profiles テーブルが既に存在する前提です

-- ========================================
-- 1. fiana_profiles にポイント残高カラム追加
-- ========================================
alter table fiana_profiles add column if not exists fia_points integer default 0;
alter table fiana_profiles add column if not exists fia_level integer default 1;

-- ========================================
-- 2. ポイント台帳テーブル（全取引履歴）
--    将来のトークン化に備え、全付与・消化を記録
-- ========================================
create table if not exists fia_points_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  amount integer not null,               -- 正=付与、負=消化
  balance_after integer not null,         -- 取引後の残高
  action text not null,                   -- 行動カテゴリ
  description text,                       -- 表示用テキスト
  metadata jsonb default '{}',            -- 拡張データ（トークン化時に利用）
  created_at timestamptz default now()
);

-- インデックス
create index if not exists idx_fia_ledger_user on fia_points_ledger(user_id);
create index if not exists idx_fia_ledger_created on fia_points_ledger(user_id, created_at desc);
create index if not exists idx_fia_ledger_action on fia_points_ledger(user_id, action);

-- RLS
alter table fia_points_ledger enable row level security;

create policy "Users can view own ledger"
  on fia_points_ledger for select
  using (auth.uid() = user_id);

create policy "Users can insert own ledger"
  on fia_points_ledger for insert
  with check (auth.uid() = user_id);

-- ========================================
-- 3. システム体験開放テーブル
-- ========================================
create table if not exists fia_system_unlocks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  system_id text not null,                -- EA_SYSTEMS の id
  unlocked_at timestamptz default now(),
  expires_at timestamptz not null,        -- 体験期限
  fia_cost integer not null               -- 消費したfiaポイント
);

create index if not exists idx_fia_unlocks_user on fia_system_unlocks(user_id);

alter table fia_system_unlocks enable row level security;

create policy "Users can view own unlocks"
  on fia_system_unlocks for select
  using (auth.uid() = user_id);

create policy "Users can insert own unlocks"
  on fia_system_unlocks for insert
  with check (auth.uid() = user_id);

-- ========================================
-- 4. デイリーチェックイン管理（重複付与防止）
-- ========================================
create table if not exists fia_daily_checkins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  checkin_date date not null default current_date,
  action text not null,                   -- 'login', 'walking', 'early_bird' 等
  created_at timestamptz default now(),
  unique(user_id, checkin_date, action)   -- 1日1回制限
);

alter table fia_daily_checkins enable row level security;

create policy "Users can view own checkins"
  on fia_daily_checkins for select
  using (auth.uid() = user_id);

create policy "Users can insert own checkins"
  on fia_daily_checkins for insert
  with check (auth.uid() = user_id);

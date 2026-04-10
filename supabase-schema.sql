-- ========================================
-- フィアナ投資アプリ Supabase テーブル定義
-- ========================================
-- Supabase管理画面の「SQL Editor」に貼り付けて実行してください

-- プロフィールテーブル
create table if not exists fiana_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade unique not null,
  display_name text,
  diagnosis_type text,
  diagnosis_label text,
  diagnosis_answers jsonb,
  virtual_deposit integer,
  lot_size numeric(4,2),
  trial_start_date date,
  monthly_expenses jsonb,
  email text,
  birthday date,
  mbti text,
  animal_type text,
  auth_provider text default 'email',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ※既存テーブルにカラムを追加する場合は以下を実行:
-- alter table fiana_profiles add column if not exists email text;
-- alter table fiana_profiles add column if not exists birthday date;
-- alter table fiana_profiles add column if not exists mbti text;
-- alter table fiana_profiles add column if not exists animal_type text;
-- alter table fiana_profiles add column if not exists auth_provider text default 'email';

-- RLS（行レベルセキュリティ）を有効化
alter table fiana_profiles enable row level security;

-- ユーザーは自分のプロフィールのみ操作可能
create policy "Users can view own profile"
  on fiana_profiles for select
  using (auth.uid() = user_id);

create policy "Users can insert own profile"
  on fiana_profiles for insert
  with check (auth.uid() = user_id);

create policy "Users can update own profile"
  on fiana_profiles for update
  using (auth.uid() = user_id);

-- updated_atの自動更新トリガー
create or replace function update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger fiana_profiles_updated_at
  before update on fiana_profiles
  for each row
  execute function update_updated_at_column();

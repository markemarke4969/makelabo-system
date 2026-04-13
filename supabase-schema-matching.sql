-- ========================================
-- 副業マッチング診断 テーブル
-- ========================================
-- 目的: 診断結果 + 面談予約を一元管理。
--       クローザーダッシュボードから閲覧可能にする。
--
-- 構成:
--   1. matching_diagnoses     -- 診断結果（1回答 = 1レコード）
--   2. matching_consultations -- 面談予約
--
-- 備考:
--   - 認証不要（LINE経由の匿名ユーザーが回答するため）
--   - RLS は off（管理画面からの読み取りにサービスロールを使うため）
--   - 複数回実行しても安全（IF NOT EXISTS）
-- ========================================

-- ----------------------------------------
-- 1. 診断結果
-- ----------------------------------------
create table if not exists matching_diagnoses (
  id uuid primary key default gen_random_uuid(),

  -- 回答者情報
  name text,
  birthday date,
  line_user_id text,          -- LIFF連携後に入る（任意）

  -- 診断結果
  answers jsonb not null,     -- ["a","b","c",...] 12問の回答
  type_id text not null,      -- steady, global, auto, analyst, challenger, high_return
  scores jsonb not null,      -- { keiba: 10, shopee: 5, ... }
  top_products text[] not null, -- ["fx_auto","keiba"]

  -- 面談関連
  consultation_status text not null default 'pending',  -- pending / booked / done / cancelled
  assigned_closer text,       -- クローザー名

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_matching_diagnoses_created
  on matching_diagnoses(created_at desc);

create index if not exists idx_matching_diagnoses_status
  on matching_diagnoses(consultation_status);

create index if not exists idx_matching_diagnoses_line
  on matching_diagnoses(line_user_id)
  where line_user_id is not null;

-- ----------------------------------------
-- 2. 面談予約
-- ----------------------------------------
create table if not exists matching_consultations (
  id uuid primary key default gen_random_uuid(),
  diagnosis_id uuid not null references matching_diagnoses(id) on delete cascade,

  -- 予約情報
  preferred_date date not null,
  preferred_time text not null,       -- "10:00" / "14:00" など
  contact_method text not null default 'phone',  -- phone / zoom / line

  -- クローザー対応
  assigned_closer text,
  status text not null default 'pending',  -- pending / confirmed / done / cancelled
  closer_notes text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_matching_consultations_diagnosis
  on matching_consultations(diagnosis_id);

create index if not exists idx_matching_consultations_date
  on matching_consultations(preferred_date, preferred_time);

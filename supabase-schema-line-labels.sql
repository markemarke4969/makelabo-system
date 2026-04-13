-- ========================================
-- LINE ラベル機能 DB化
-- ========================================
-- 目的: これまで画面内 React state だけで保持していたラベルを DB 管理にする。
--       これによりアクション管理（label_added トリガー / ラベル条件 / ラベル追加・削除アクション）が
--       バックエンドから評価・実行できるようになる。
--
-- 構成:
--   1. line_labels           -- ラベル定義（アカウント単位）
--   2. line_follower_labels  -- フォロワー × ラベルの付与関係（多対多）
--
-- 備考:
--   - ラベルはアカウント単位（line_accounts.id）で管理する。
--     案件単位にするとチャットUIのラベル表示が複数アカ混在して煩雑になるため。
--   - 複数回実行しても安全（IF NOT EXISTS）。
-- ========================================

-- ----------------------------------------
-- 1. ラベル定義
-- ----------------------------------------
create table if not exists line_labels (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references line_accounts(id) on delete cascade,
  name text not null,
  color text not null default '#3B82F6',
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_line_labels_account
  on line_labels(account_id, sort_order);

-- 同一アカウント内でラベル名の重複を避ける（任意）
create unique index if not exists uq_line_labels_account_name
  on line_labels(account_id, name);

-- ----------------------------------------
-- 2. フォロワー × ラベル（多対多）
-- ----------------------------------------
create table if not exists line_follower_labels (
  label_id uuid not null references line_labels(id) on delete cascade,
  follower_id uuid not null references line_followers(id) on delete cascade,
  assigned_at timestamptz not null default now(),
  primary key (label_id, follower_id)
);

create index if not exists idx_line_follower_labels_follower
  on line_follower_labels(follower_id);
create index if not exists idx_line_follower_labels_label
  on line_follower_labels(label_id);

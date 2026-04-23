-- ============================================================
-- LINE リッチメニュー
-- ============================================================
create table if not exists line_rich_menus (
  id uuid primary key default gen_random_uuid(),
  line_account_id uuid references line_accounts(id) on delete cascade not null,
  name text not null,                                 -- 管理名称
  line_rich_menu_id text,                             -- LINE API 返却の rich menu id
  image_url text,                                     -- 中継/ストレージの画像URL
  size_type text not null default 'large',            -- 'large' (2500x1686) / 'compact' (2500x843)
  chat_bar_text text not null default 'メニュー',     -- メニュー開閉ボタンテキスト
  selected boolean not null default true,             -- 初期表示状態(true=開く)
  is_default boolean not null default false,          -- デフォルトリッチメニュー
  template_type text not null default 'L1',           -- レイアウトテンプレート
  areas jsonb not null default '[]'::jsonb,           -- エリアごとのアクション設定
  status text not null default 'draft',               -- 'draft' / 'deployed'
  deployed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_line_rich_menus_account on line_rich_menus(line_account_id);
create index if not exists idx_line_rich_menus_default on line_rich_menus(line_account_id) where is_default = true;

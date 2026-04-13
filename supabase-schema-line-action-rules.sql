-- ========================================
-- LINE アクション管理
-- ========================================
-- 目的: 「トリガー → 条件 → アクション」の1セットを「ルール」として保存し、
--       webhook（friend追加・メッセージ受信・ラベル付与・シナリオ完了）および
--       cron（登録日から〇日後）で自動実行する。
--
-- 構成:
--   1. line_action_rules      -- ルール定義
--   2. line_action_executions -- 実行キュー兼ログ
--
-- 実行モデル:
--   - webhook 駆動: 発火時に即 execute、または条件に delay がある場合は
--                   scheduled_at を未来にしてキューに積む
--   - cron 駆動:    scheduled_at <= now() AND status='pending' の行を拾って実行
-- ========================================

-- ----------------------------------------
-- 1. ルール定義
-- ----------------------------------------
create table if not exists line_action_rules (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references line_accounts(id) on delete cascade,
  name text not null,
  status text not null default 'active',
  -- 'active' | 'paused'

  -- トリガー種別
  trigger_type text not null,
  -- 'follow'              : 友だち追加時
  -- 'label_added'         : ラベル追加時
  -- 'message_received'    : メッセージ受信時
  -- 'sequence_completed'  : ステップ配信完了時（最終メッセージ送信時）

  -- トリガー補足情報（トリガー種別ごとに必要な ID を格納）
  trigger_config jsonb not null default '{}'::jsonb,
  --   label_added         : { "label_id": "<uuid>" } （特定ラベル指定時。空なら任意ラベル）
  --   sequence_completed  : { "sequence_id": "<uuid>" } （特定シーケンス指定時。空なら任意）
  --   message_received    : { "keyword": "..." } （キーワード指定時。空なら全受信）
  --   follow              : {} （補足不要）

  -- 条件（AND 評価）
  conditions jsonb not null default '[]'::jsonb,
  --   [
  --     { "type": "label_in",           "label_ids": ["<uuid>", ...] },
  --     { "type": "inflow_route_in",    "route_ids": ["<uuid>", ...] },
  --     { "type": "days_after_follow",  "days": 3 }   -- 登録日 + N日後に実行（delay）
  --   ]

  -- アクション
  action_type text not null,
  -- 'start_sequence' : シナリオ配信開始
  -- 'label_add'      : ラベル追加
  -- 'label_remove'   : ラベル削除
  -- 'move_sequence'  : 別シナリオへ移動（旧シナリオを停止 → 新シナリオ開始）
  -- 'webhook'        : 外部 Webhook 送信

  action_config jsonb not null default '{}'::jsonb,
  --   start_sequence  : { "sequence_id": "<uuid>" }
  --   label_add       : { "label_id": "<uuid>" }
  --   label_remove    : { "label_id": "<uuid>" }
  --   move_sequence   : { "from_sequence_id": "<uuid>", "to_sequence_id": "<uuid>" }
  --   webhook         : { "url": "https://...", "method": "POST" }

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_line_action_rules_account
  on line_action_rules(account_id, status);
create index if not exists idx_line_action_rules_trigger_type
  on line_action_rules(trigger_type);

-- ----------------------------------------
-- 2. 実行キュー兼ログ
-- ----------------------------------------
-- 1件の発火ごとに1行作られる。
--   - 即実行: scheduled_at = now() でインサート → webhook が直後に更新
--   - 遅延  : scheduled_at = 未来時刻でインサート（status='pending'）→ cron が拾う
--   - 実行後: status='success'/'failed'/'skipped' に更新、executed_at 埋める
create table if not exists line_action_executions (
  id uuid primary key default gen_random_uuid(),
  rule_id uuid not null references line_action_rules(id) on delete cascade,
  account_id uuid not null references line_accounts(id) on delete cascade,
  follower_id uuid references line_followers(id) on delete set null,
  line_user_id text,

  trigger_event jsonb,
  -- 発火したときの補足情報（message_text / label_id / sequence_id など）

  status text not null default 'pending',
  -- 'pending' | 'success' | 'failed' | 'skipped'

  scheduled_at timestamptz not null default now(),
  -- 実行予定時刻（即実行なら now()、遅延なら未来時刻）

  executed_at timestamptz,
  -- 実際に実行された時刻

  error_message text,

  created_at timestamptz not null default now()
);

-- cron 抽出用: pending かつ scheduled_at が到来したもの
create index if not exists idx_line_action_executions_pending
  on line_action_executions(scheduled_at)
  where status = 'pending';

create index if not exists idx_line_action_executions_rule
  on line_action_executions(rule_id, created_at desc);
create index if not exists idx_line_action_executions_account
  on line_action_executions(account_id, created_at desc);
create index if not exists idx_line_action_executions_follower
  on line_action_executions(follower_id);

-- 同一ルール × 同一フォロワーの二重実行を防ぐ部分ユニーク
-- （message_received のような毎回発火するトリガーは除外したいので、
--  MVP ではアプリ側で dedup するだけにしてユニーク制約は張らない）

-- ============================================================
-- 段階8-2-E-4: 本番 sent_at リセット SQL(石井さん側 Supabase Dashboard 実行)
-- ============================================================
-- 実行日:2026-05-04(石井さん手動実行)
-- 背景:
--   段階8-2-E-3-3(PR #43)で line-tick cron が 1 分毎発火に変更。
--   旧 broadcast.ts のロジックで「main account の follower 0 件」時に
--   no_followers skip → markBroadcastSent → 永久に sent_at 設定済み(届かない)
--   状態に陥った row を sent_at NULL に戻し、本 PR 修正後の cron で再送可能にする。
--
--   段階8-2-E-4 の修正で processBroadcastSequence は scenario 配下統合 + skip 経路
--   分岐に変更されたため、リセット後の cron 発火で main + standby の followers に
--   正しく配信される。
--
-- 実行手順:Step 1(SELECT で対象列挙、目視確認)→ Step 2(個別 UPDATE)
-- 安全性:autocommit / idempotent(IF EXISTS / WHERE 句で多重実行可能)
-- ============================================================

-- ===== Step 1: 対象 row 列挙(目視確認、何も変更しない)=====

-- 1-A. 段階8-2-E-4 の修正対象期間(本日テスト時刻以降)に sent_at 更新済の予約配信
SELECT
  id,
  name,
  scheduled_at,
  sent_at,
  status,
  scenario_id,
  account_id
FROM line_step_sequences
WHERE kind = 'schedule'
  AND scheduled_at >= '2026-05-04T00:00:00Z'
  AND sent_at IS NOT NULL
ORDER BY scheduled_at;
-- 期待:本日中に作成・予約され、誤って sent_at 設定された row が列挙される
-- 確認後、Step 2 で個別 UPDATE する row の id をメモする

-- 1-B. 同様に掘り起こし配信(line_reengagement_broadcasts)の sent 化済 row
SELECT
  id,
  name,
  scheduled_at,
  sent_at,
  sent_count,
  status,
  scenario_id,
  account_id
FROM line_reengagement_broadcasts
WHERE (scheduled_at >= '2026-05-04T00:00:00Z' OR created_at >= '2026-05-04T00:00:00Z')
  AND status = 'sent'
ORDER BY scheduled_at, created_at;
-- 期待:本日中の sent 化済 row(誤送信完了マーク含む)が列挙される

-- 1-C. broadcast.ts 修正で status='inactive' に変更される条件相当(account_or_token_missing)
-- 既に status='inactive' になった row があれば確認(本 PR 修正後に発生する想定)
SELECT
  id,
  name,
  scheduled_at,
  status,
  updated_at
FROM line_step_sequences
WHERE kind = 'schedule'
  AND status = 'inactive'
ORDER BY updated_at DESC
LIMIT 50;
-- 本 PR 適用前は通常 0 件、適用後に account 解決失敗で inactive 化された row が出る

-- ===== Step 2: 個別 UPDATE(対象 id を Step 1 で確認後に実行)=====

-- 2-A. 予約配信(line_step_sequences kind='schedule')の sent_at リセット
-- 注意:本 PR 修正前に作成された row のみリセット推奨。
--       「明示的に送信完了済み(LINE に既に届いた)」row は触らないこと。
--       Step 1-A の SELECT 結果で sent_at が「届かなかった」row のみ id を指定する。
UPDATE line_step_sequences
SET sent_at = NULL,
    status = 'active',
    updated_at = NOW()
WHERE id IN (
  -- 石井さんが Step 1-A の SELECT 結果から「届かなかった」row の id を指定
  -- 例:
  -- 'd8ce1b59-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
  -- '<sequence-id-2>',
  -- '<sequence-id-3>'
)
  AND sent_at IS NOT NULL;
-- 期待:指定した N 行が update される
-- AND sent_at IS NOT NULL で既に NULL の row には触らない(idempotent)

-- 2-B. 掘り起こし配信(line_reengagement_broadcasts)の sent 化リセット
-- scheduled_at NOT NULL → 'scheduled' に戻す(cron が拾い直す)
-- scheduled_at NULL → 'draft' に戻す(手動再送のみ可能)
UPDATE line_reengagement_broadcasts
SET status = CASE WHEN scheduled_at IS NOT NULL THEN 'scheduled' ELSE 'draft' END,
    sent_at = NULL,
    sent_count = 0,
    updated_at = NOW()
WHERE id IN (
  -- 石井さんが Step 1-B の SELECT 結果から「届かなかった」row の id を指定
  -- 例:
  -- '<reengagement-id-1>'
)
  AND status = 'sent';

-- ===== Step 3: 検証(リセット後)=====

-- 3-A. リセット後の予約配信 row 状態
SELECT id, name, scheduled_at, sent_at, status
FROM line_step_sequences
WHERE id IN (
  -- Step 2-A で指定した id
)
ORDER BY scheduled_at;
-- 期待:sent_at NULL、status='active'

-- 3-B. リセット後の掘り起こし配信 row 状態
SELECT id, name, scheduled_at, sent_at, sent_count, status
FROM line_reengagement_broadcasts
WHERE id IN (
  -- Step 2-B で指定した id
)
ORDER BY scheduled_at;
-- 期待:sent_at NULL、sent_count=0、status='scheduled' or 'draft'

-- ============================================================
-- ロールバック(必要時、Step 2 を取り消し)
-- ============================================================
-- 注意:ロールバックすると「届かなかった row が再度 sent 扱い」になり、cron で
--       再送されない状態に戻る。通常はロールバック不要。
-- ============================================================
-- UPDATE line_step_sequences SET sent_at = '<元の sent_at 値>' WHERE id = '...';
-- UPDATE line_reengagement_broadcasts SET status='sent', sent_at='...', sent_count=N WHERE id='...';
-- ============================================================

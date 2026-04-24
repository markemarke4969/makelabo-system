-- ============================================================
-- 案件ごとの BAN対策自動同期 有効フラグ
-- ============================================================
-- 目的:
--   /api/cron/line-sync-main-to-backup が全案件を無条件に同期して
--   しまっていた問題を解消し、「この案件は同期する」という明示的な
--   オプトイン方式に切り替える。
--
-- 方針:
--   - デフォルト false (同期されない)
--   - 動作確認済みの MARI のみ初期値 true
--   - 他の案件は運用者がダッシュボードから個別に有効化する
-- ============================================================

ALTER TABLE line_projects
  ADD COLUMN IF NOT EXISTS ban_sync_enabled BOOLEAN NOT NULL DEFAULT false;

-- MARI のみ有効化（すでに動作確認済み）
UPDATE line_projects
   SET ban_sync_enabled = true
 WHERE code = 'mari';

-- 確認用
SELECT id, name, code, ban_sync_enabled
  FROM line_projects
 ORDER BY sort_order, name;

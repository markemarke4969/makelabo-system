-- ============================================================================
-- スレッズ集客等、誤同期されたデータの復旧SQL
-- ============================================================================
-- ⚠ このファイルは「まず中身を確認してから」実行するためのものです。
-- ⚠ DELETE 文はすべてコメントアウトされています。
-- ⚠ SELECT で影響範囲を確認し、問題なければコメントを外して実行してください。
--
-- 前提:
--   ・この SQL は supabase-migration-project-sync-enabled.sql 適用後に使います
--     (ban_sync_enabled カラムが存在していること)
--   ・MARI 以外の案件 (code != 'mari') を誤同期として扱います。
--   ・line_sync_history.status が 'success' / 'partial' のレコードを対象に、
--     target_account_id (予備アカウント) に書き込まれた可能性のある行を特定します。
--
-- 注意:
--   ・greeting_message は元の値を保持していないため完全復旧は不可。
--     Step 4 で「同期前の値不明」の予備アカウントを一覧表示するので、
--     運用者が個別に値を戻してください。
--   ・label / custom_field / inflow_route / rich_menu は
--     created_at が「最初の誤同期時刻」以降の行 = 同期で追加されたもの
--     という判定で削除します (既存行は残ります)。
--   ・step_sequences は同期で "上書き insert" された可能性があるため、
--     「メインと同名のシーケンス」かつ「updated_at が最初の誤同期時刻以降」
--     のものを対象にします。削除すると配下の line_step_messages も
--     CASCADE で消えます。
--
-- 実行順序:
--   [Step 0] 影響を受ける target_account_id 一覧を確認
--   [Step 1] ラベル
--   [Step 2] カスタムフィールド
--   [Step 3] 流入経路
--   [Step 4] 挨拶メッセージ (※要手動対応)
--   [Step 5] ステップ配信シーケンス + メッセージ
--   [Step 6] リッチメニュー
--   [Step 7] line_sync_history を誤同期分だけ論理削除 (status='rolledback')
-- ============================================================================

-- ----------------------------------------------------------------------------
-- [Step 0] 誤同期の影響範囲確認
-- ----------------------------------------------------------------------------
-- 下記の SELECT を実行して、削除対象になる予備アカウント一覧を把握してください。
-- ----------------------------------------------------------------------------
SELECT
  h.target_account_id,
  a.account_name            AS target_name,
  a.group_name              AS target_group,
  p.name                    AS project_name,
  p.code                    AS project_code,
  MIN(h.started_at)         AS first_bad_sync_at,
  MAX(h.completed_at)       AS last_bad_sync_at,
  COUNT(*)                  AS sync_count
FROM line_sync_history h
JOIN line_projects   p ON p.id = h.project_id
LEFT JOIN line_accounts a ON a.id = h.target_account_id
WHERE h.target_account_id IS NOT NULL
  AND (p.code IS DISTINCT FROM 'mari')
  AND h.status IN ('success', 'partial')
GROUP BY h.target_account_id, a.account_name, a.group_name, p.name, p.code
ORDER BY p.name, target_name;

-- ----------------------------------------------------------------------------
-- [Step 1] ラベル
-- ----------------------------------------------------------------------------
-- まず削除候補を確認:
-- ----------------------------------------------------------------------------
SELECT l.id, l.account_id, a.account_name AS target_name,
       l.name, l.color, l.created_at
  FROM line_labels l
  JOIN line_accounts a  ON a.id = l.account_id
  JOIN (
    SELECT h.target_account_id,
           MIN(h.started_at) AS first_bad_sync_at
      FROM line_sync_history h
      JOIN line_projects p ON p.id = h.project_id
     WHERE p.code IS DISTINCT FROM 'mari'
       AND h.status IN ('success','partial')
     GROUP BY h.target_account_id
  ) hmin ON hmin.target_account_id = l.account_id
 WHERE l.created_at >= hmin.first_bad_sync_at
 ORDER BY a.account_name, l.name;

-- 問題なければ下をアンコメントして実行:
-- DELETE FROM line_labels
--  WHERE id IN (
--    SELECT l.id FROM line_labels l
--      JOIN (
--        SELECT h.target_account_id, MIN(h.started_at) AS first_bad_sync_at
--          FROM line_sync_history h
--          JOIN line_projects p ON p.id = h.project_id
--         WHERE p.code IS DISTINCT FROM 'mari'
--           AND h.status IN ('success','partial')
--         GROUP BY h.target_account_id
--      ) hmin ON hmin.target_account_id = l.account_id
--     WHERE l.created_at >= hmin.first_bad_sync_at
--  );

-- ----------------------------------------------------------------------------
-- [Step 2] カスタムフィールド
-- ----------------------------------------------------------------------------
-- 削除候補確認:
-- ----------------------------------------------------------------------------
SELECT f.id, f.account_id, a.account_name AS target_name,
       f.field_key, f.field_label, f.created_at
  FROM line_custom_fields f
  JOIN line_accounts a ON a.id = f.account_id
  JOIN (
    SELECT h.target_account_id, MIN(h.started_at) AS first_bad_sync_at
      FROM line_sync_history h
      JOIN line_projects p ON p.id = h.project_id
     WHERE p.code IS DISTINCT FROM 'mari'
       AND h.status IN ('success','partial')
     GROUP BY h.target_account_id
  ) hmin ON hmin.target_account_id = f.account_id
 WHERE f.created_at >= hmin.first_bad_sync_at
 ORDER BY a.account_name, f.field_key;

-- 問題なければアンコメント:
-- DELETE FROM line_custom_fields
--  WHERE id IN (
--    SELECT f.id FROM line_custom_fields f
--      JOIN (
--        SELECT h.target_account_id, MIN(h.started_at) AS first_bad_sync_at
--          FROM line_sync_history h
--          JOIN line_projects p ON p.id = h.project_id
--         WHERE p.code IS DISTINCT FROM 'mari'
--           AND h.status IN ('success','partial')
--         GROUP BY h.target_account_id
--      ) hmin ON hmin.target_account_id = f.account_id
--     WHERE f.created_at >= hmin.first_bad_sync_at
--  );

-- ----------------------------------------------------------------------------
-- [Step 3] 流入経路
-- ----------------------------------------------------------------------------
-- 削除候補確認:
-- ----------------------------------------------------------------------------
SELECT r.id, r.account_id, a.account_name AS target_name,
       r.code AS route_code, r.name AS route_name, r.created_at
  FROM line_inflow_routes r
  JOIN line_accounts a ON a.id = r.account_id
  JOIN (
    SELECT h.target_account_id, MIN(h.started_at) AS first_bad_sync_at
      FROM line_sync_history h
      JOIN line_projects p ON p.id = h.project_id
     WHERE p.code IS DISTINCT FROM 'mari'
       AND h.status IN ('success','partial')
     GROUP BY h.target_account_id
  ) hmin ON hmin.target_account_id = r.account_id
 WHERE r.created_at >= hmin.first_bad_sync_at
 ORDER BY a.account_name, r.code;

-- 問題なければアンコメント:
-- DELETE FROM line_inflow_routes
--  WHERE id IN (
--    SELECT r.id FROM line_inflow_routes r
--      JOIN (
--        SELECT h.target_account_id, MIN(h.started_at) AS first_bad_sync_at
--          FROM line_sync_history h
--          JOIN line_projects p ON p.id = h.project_id
--         WHERE p.code IS DISTINCT FROM 'mari'
--           AND h.status IN ('success','partial')
--         GROUP BY h.target_account_id
--      ) hmin ON hmin.target_account_id = r.account_id
--     WHERE r.created_at >= hmin.first_bad_sync_at
--  );

-- ----------------------------------------------------------------------------
-- [Step 4] 挨拶メッセージ (自動復旧不可 → 手動対応)
-- ----------------------------------------------------------------------------
-- 下記一覧の予備アカウントは、同期で greeting_message が上書きされた
-- 可能性があります。運用者が各アカウントの greeting_message を
-- 確認の上、本来の値に手動で戻してください。
-- ----------------------------------------------------------------------------
SELECT DISTINCT
  a.id,
  a.account_name,
  a.group_name,
  p.name  AS project_name,
  a.greeting_message
FROM line_accounts a
JOIN line_projects p ON p.id = a.project_id
JOIN line_sync_history h ON h.target_account_id = a.id
WHERE p.code IS DISTINCT FROM 'mari'
  AND h.status IN ('success','partial')
ORDER BY p.name, a.account_name;

-- 手動で戻す例:
-- UPDATE line_accounts SET greeting_message = NULL WHERE id = '予備のUUID';
-- UPDATE line_accounts SET greeting_message = '元の文言' WHERE id = '予備のUUID';

-- ----------------------------------------------------------------------------
-- [Step 5] ステップ配信シーケンス + メッセージ
-- ----------------------------------------------------------------------------
-- 削除候補確認 (sequences 側):
-- ----------------------------------------------------------------------------
SELECT s.id, s.account_id, a.account_name AS target_name,
       s.name AS sequence_name, s.kind, s.status,
       s.created_at, s.updated_at
  FROM line_step_sequences s
  JOIN line_accounts a ON a.id = s.account_id
  JOIN (
    SELECT h.target_account_id, MIN(h.started_at) AS first_bad_sync_at
      FROM line_sync_history h
      JOIN line_projects p ON p.id = h.project_id
     WHERE p.code IS DISTINCT FROM 'mari'
       AND h.status IN ('success','partial')
     GROUP BY h.target_account_id
  ) hmin ON hmin.target_account_id = s.account_id
 WHERE s.updated_at >= hmin.first_bad_sync_at
 ORDER BY a.account_name, s.name;

-- sequences を削除すると cascade で line_step_messages も消えます。
-- 問題なければアンコメント:
-- DELETE FROM line_step_sequences
--  WHERE id IN (
--    SELECT s.id FROM line_step_sequences s
--      JOIN (
--        SELECT h.target_account_id, MIN(h.started_at) AS first_bad_sync_at
--          FROM line_sync_history h
--          JOIN line_projects p ON p.id = h.project_id
--         WHERE p.code IS DISTINCT FROM 'mari'
--           AND h.status IN ('success','partial')
--         GROUP BY h.target_account_id
--      ) hmin ON hmin.target_account_id = s.account_id
--     WHERE s.updated_at >= hmin.first_bad_sync_at
--  );

-- ----------------------------------------------------------------------------
-- [Step 6] リッチメニュー (line_rich_menu_id はコピーしていないので LINE API 側は無傷)
-- ----------------------------------------------------------------------------
SELECT m.id, m.line_account_id, a.account_name AS target_name,
       m.name, m.image_url, m.status, m.created_at
  FROM line_rich_menus m
  JOIN line_accounts a ON a.id = m.line_account_id
  JOIN (
    SELECT h.target_account_id, MIN(h.started_at) AS first_bad_sync_at
      FROM line_sync_history h
      JOIN line_projects p ON p.id = h.project_id
     WHERE p.code IS DISTINCT FROM 'mari'
       AND h.status IN ('success','partial')
     GROUP BY h.target_account_id
  ) hmin ON hmin.target_account_id = m.line_account_id
 WHERE m.created_at >= hmin.first_bad_sync_at
 ORDER BY a.account_name, m.name;

-- 問題なければアンコメント:
-- DELETE FROM line_rich_menus
--  WHERE id IN (
--    SELECT m.id FROM line_rich_menus m
--      JOIN (
--        SELECT h.target_account_id, MIN(h.started_at) AS first_bad_sync_at
--          FROM line_sync_history h
--          JOIN line_projects p ON p.id = h.project_id
--         WHERE p.code IS DISTINCT FROM 'mari'
--           AND h.status IN ('success','partial')
--         GROUP BY h.target_account_id
--      ) hmin ON hmin.target_account_id = m.line_account_id
--     WHERE m.created_at >= hmin.first_bad_sync_at
--  );

-- ----------------------------------------------------------------------------
-- [Step 7] line_sync_history を「取り消し済み」にマーク
-- ----------------------------------------------------------------------------
-- 履歴自体は残しますが、誤同期だとわかるようにステータスを
-- 'rolledback' に変えておきます (集計やダッシュボードでの誤認防止)。
-- ----------------------------------------------------------------------------
-- UPDATE line_sync_history
--    SET status = 'rolledback',
--        error_message = COALESCE(error_message, '') || ' / rolled back by rollback-sthreads-sync.sql'
--  WHERE id IN (
--    SELECT h.id FROM line_sync_history h
--      JOIN line_projects p ON p.id = h.project_id
--     WHERE p.code IS DISTINCT FROM 'mari'
--       AND h.status IN ('success','partial')
--  );

-- ----------------------------------------------------------------------------
-- 復旧完了確認
-- ----------------------------------------------------------------------------
SELECT status, COUNT(*)
  FROM line_sync_history
 GROUP BY status
 ORDER BY status;

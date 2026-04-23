-- line_messages に is_read カラムを追加（既読永続化用）
ALTER TABLE line_messages ADD COLUMN IF NOT EXISTS is_read boolean NOT NULL DEFAULT false;

-- 未読メッセージ検索用の部分インデックス
CREATE INDEX IF NOT EXISTS idx_line_messages_unread ON line_messages(line_user_id, direction) WHERE is_read = false;

-- Supabaseリアルタイム購読を有効化
ALTER PUBLICATION supabase_realtime ADD TABLE line_messages;

-- ============================================================
-- PR#2-B: line_custom_fields に is_hidden + default_value 列追加
-- ============================================================
-- 目的:
--   (1) is_hidden: matching_* 7 個の custom_fields を「クローザー操作画面から
--       見えない」状態で保持する(配信本文の {field:キー} 置換には使うが、
--       ダッシュボード UI には一覧表示しない)
--   (2) default_value: follower 個別値が無い field について
--       buildReplacerContext で fallback 値として利用(構想 §4-1-B 方式)
--
-- 影響評価:
--   - 既存全行は is_hidden=false / default_value=NULL がデフォルト → 挙動変更ゼロ
--   - インデックス不要(custom_fields は通常 数十件規模、フルスキャンで十分)
--   - RLS / 権限は touch なし
--   - ADD COLUMN は PG 11+ で metadata 変更のみ → 即座完了、本番稼働中でも安全
--
-- 適用方法:
--   Supabase SQL Editor から本ファイルを実行する(石井さん手作業)。
--
-- 何度実行しても安全(IF NOT EXISTS)。
--
-- ロールバック(必要時):
--   ALTER TABLE line_custom_fields DROP COLUMN IF EXISTS default_value;
--   ALTER TABLE line_custom_fields DROP COLUMN IF EXISTS is_hidden;
--   ※ 緊急時はコード側を先に revert する方が安全
--     (列残置でも前方互換、参照されない限り無害)
-- ============================================================

-- ===== Step 1: is_hidden 列追加(NOT NULL DEFAULT false)=====
ALTER TABLE line_custom_fields
  ADD COLUMN IF NOT EXISTS is_hidden BOOLEAN NOT NULL DEFAULT false;

-- ===== Step 2: default_value 列追加(NULLABLE TEXT)=====
ALTER TABLE line_custom_fields
  ADD COLUMN IF NOT EXISTS default_value TEXT;

-- ===== Step 3: 検証 SELECT =====
SELECT column_name, is_nullable, data_type, column_default
  FROM information_schema.columns
 WHERE table_name = 'line_custom_fields'
   AND column_name IN ('is_hidden', 'default_value')
 ORDER BY column_name;
-- 期待: 2 行
--   default_value | YES | text    | NULL
--   is_hidden     | NO  | boolean | false

-- 参考: 既存行への影響確認(全行で is_hidden=false / default_value=NULL のはず)
SELECT count(*) AS total_rows,
       count(*) FILTER (WHERE is_hidden = true) AS hidden_rows,
       count(*) FILTER (WHERE default_value IS NOT NULL) AS with_default
  FROM line_custom_fields;
-- 期待: total > 0 / hidden_rows = 0 / with_default = 0(本 SQL 直後の状態)

-- ============================================================
-- supabase-migration-pr3c-matching-closers.sql
-- 目的: クローザー名マスタテーブル新設(将来の複数クローザー対応)
--
-- 関連 PR: PR#3-C(makelabo-system: クローザーダッシュボード UX 改善)
-- 設計プラン: C:\Users\lmsml\.claude\plans\matching-dashboard-ux-plan-tranquil-cook.md
--
-- 実行方法:
--   1. Supabase ダッシュボード → SQL Editor
--   2. 本 SQL 全文を貼り付け
--   3. Run
--   4. 末尾の検証 SELECT が「未割当」1 行を返すことを確認
--
-- 既存稼働への影響:
--   - 新規テーブル追加のみ。既存 matching_diagnoses / matching_consultations への変更なし
--   - matching_diagnoses.assigned_closer は text のまま(名前文字列を保存する既存挙動を維持)
--   - 将来テーブル ID 参照に切り替える場合は別 PR で対応
--   - RLS は matching テリトリー方針に従い off(supabaseAdmin 経由運用)
--
-- 運用:
--   - クローザー追加:Supabase Table Editor で Insert row(name / company / sort_order)
--   - クローザー削除:active=false に更新(物理削除しない・既存 assigned_closer 文字列は残る)
--
-- ロールバック手順: 本 SQL 末尾のコメント部分を参照
-- ============================================================

CREATE TABLE IF NOT EXISTS matching_closers (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  company     text,
  active      boolean NOT NULL DEFAULT true,
  sort_order  integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- プルダウン取得用(active=true 行を sort_order, name 順で読む)
CREATE INDEX IF NOT EXISTS idx_matching_closers_active_sort
  ON matching_closers (active, sort_order, name);

-- matching テリトリー方針に従い RLS off
ALTER TABLE matching_closers DISABLE ROW LEVEL SECURITY;

-- 初期データ:「未割当」を sort_order=999 で必ず末尾固定
INSERT INTO matching_closers (name, sort_order)
  SELECT '未割当', 999
  WHERE NOT EXISTS (SELECT 1 FROM matching_closers WHERE name = '未割当');

-- ============================================================
-- 検証 SELECT(期待: 「未割当」1 行)
-- ============================================================
SELECT id, name, company, active, sort_order
  FROM matching_closers
 WHERE active = true
 ORDER BY sort_order ASC, name ASC;

-- ============================================================
-- ロールバック SQL(必要時のみ実行):
--
-- DROP INDEX IF EXISTS idx_matching_closers_active_sort;
-- DROP TABLE IF EXISTS matching_closers;
--
-- 注意: テーブル DROP すると登録済みクローザー情報が消失する。
--       matching_diagnoses.assigned_closer は text 文字列なので影響なし。
-- ============================================================

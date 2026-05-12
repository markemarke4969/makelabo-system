-- ========================================
-- PR#1' ロールバック: matching_line_bridge 撤去
-- ========================================
-- 目的:
--   PR#1 で導入した bind API + LIFF 中継経路は、5/5 ギャップ調査の誤り
--   (ハーネス LIFF の用途取り違え) により不要と判明したため撤去する。
--   それに伴い、bind API が UPSERT していた matching_line_bridge テーブルも
--   不要となるため、本ロールバック SQL で削除する。
--
-- 前提:
--   - 本ファイルを実行する前に、アプリ側コード (bind API / LIFF 中継ページ)
--     は既に削除済みであること。
--   - matching_line_bridge は副業診断アプリ側専用のテーブルで、
--     ハーネス側 (line_*) からの参照は無いため、安全に DROP できる。
--
-- 適用方法:
--   Supabase SQL Editor から本ファイルを実行する (石井さん手作業)。
-- ========================================

drop index if exists idx_matching_line_bridge_line_user;
drop table if exists matching_line_bridge;

-- ============================================================
-- 段階8-2-A: line_monthly_reports DROP
-- ============================================================
-- 実行日:2026-05-04(石井さん手動実行、Supabase Dashboard SQL Editor)
-- 背景:
--   月次レポート機能不要確定(2026-05-04 引継ぎ開発ログ 第 4 部)。
--   段階7-Z / 7-Zh / 7-C2 で実装した負債(line_monthly_reports
--   テーブル + scenario_id 列 + 部分 UNIQUE 等)の一括清算。
--   段階8-2-C(scenario 削除機能)実装前に、scenario 削除時の
--   部分 UNIQUE 衝突源(本テーブル)を消すことが目的。
-- 影響範囲:
--   - line_monthly_reports テーブル削除
--   - 関連インデックス・部分 UNIQUE・FK 制約・RLS POLICY すべて自動削除
--   - 他テーブルへの影響:なし(参照 FK 0 件確認済)
--   - アプリ側コード:依然として line_monthly_reports を参照する API /
--     dashboard / cron が残存(段階8-2-B のスコープで削除予定)
--     → DROP 後にこれらが叩かれると 500 / "relation does not exist" エラー
--     → 段階8-2-B 完了までの間、月次 cron(0 0 1 * *)とレポート画面の
--        押下は失敗する(運用上致命ではないが認識しておく)
-- 実行手順:Step 1 → Step 2 → Step 3 を順次実行
-- ============================================================

-- ===== Step 1: 削除前確認 SELECT =====
SELECT id, project_id, scenario_id, report_month, status, sent_at, created_at
FROM line_monthly_reports
ORDER BY created_at;
-- 期待:2 行(MARI 2026-04 NULL + MARI 2026-04 NOT NULL)、
--       または 5/1 月次 cron で生成された追加行を含む N 行
-- 想定外時:0 行 → DROP は問題なく可能だが、状態の食い違いを石井さんに報告
--           想定 2 行と全く異なる構成 → Claude.ai に報告して再判断

-- 補助:scenarios の現在件数も控えておく(Step 3 検証で使う)
SELECT COUNT(*) AS scenarios_count_before FROM line_scenarios;

-- ===== Step 2: DROP TABLE 実行 =====
DROP TABLE IF EXISTS line_monthly_reports CASCADE;
-- IF EXISTS:既に削除済の場合のエラー回避
-- CASCADE:本ブロック §2 で参照 FK 0 件確認済のため実質効果なしだが念のため付与
--         (将来別経路で参照が追加されていた場合の安全策)
-- 想定外時:permission denied 等 → service_role / postgres 権限で実行されているか確認

-- ===== Step 3: 削除後検証 =====
-- 検証 1: テーブル自体が存在しないこと
SELECT to_regclass('public.line_monthly_reports') AS table_exists;
-- 期待:NULL(テーブル存在しない)

-- 検証 2: line_scenarios が壊れていないこと(scenario_id 参照元が消えただけで
--         参照先 line_scenarios 自体は無傷であるべき)
SELECT COUNT(*) AS scenarios_count_after FROM line_scenarios;
-- 期待:Step 1 の scenarios_count_before と同値

-- 検証 3: 関連インデックスも全削除されていること(残存していたら異常)
SELECT indexname FROM pg_indexes WHERE tablename = 'line_monthly_reports';
-- 期待:0 行

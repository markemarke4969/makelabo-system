-- ============================================================
-- 段階5 マイグレーション Step 1+2: line_scenarios テーブル新設 + 初期 4 行 INSERT
-- ============================================================
-- 目的:
--   案件単位 → シナリオ単位への移行のコアテーブルを新設。
--   現状の (project_id, group_name) 構造を line_scenarios へ正規化。
--
-- 9 項目判断 6:1グループ=1シナリオ並列、is_default 概念は使わない方針
--   → is_default 列は完全削除案を採用(草案 §8 推奨)
--
-- 安全性:
--   - 複数回実行可(IF NOT EXISTS / ON CONFLICT DO NOTHING)
--   - 既存テーブルへの影響なし(本ファイルは新規追加のみ)
--
-- 依存関係:
--   - 前提:line_projects テーブルが存在し、code='mari' / code='threads' の 2 行が存在
--   - 後続:step02(scenario_id 列追加)、step03(バックフィル)、step05(NOT NULL 化)
--
-- 草案参照元:
--   - C:\Users\lmsml\.claude\plans\07-calm-pudding.md §2(ファイル1:supabase-migration-stage5-step01-create-scenarios.sql)
--
-- 過去パターン参照元:
--   - supabase-schema-line-groups.sql:5-14(CREATE TABLE 標準形)
--   - supabase-migration-sync-history.sql:16-27, 37-47(RLS ポリシー DO ブロック)
--   - supabase-migration-umatoku-initial-setup.sql:50-57(初期データ INSERT パターン)
-- ============================================================

-- Step 1-A: 事前 SELECT(現状確認)
DO $$
BEGIN
  RAISE NOTICE '[stage5-step01] pre-check start';
  RAISE NOTICE '  line_scenarios exists? %', (SELECT to_regclass('public.line_scenarios'));
  RAISE NOTICE '  line_projects rows: %', (SELECT count(*) FROM line_projects);
  RAISE NOTICE '  expected: line_scenarios=NULL, line_projects=2';
END $$;

-- Step 1-B: line_scenarios テーブル新設
CREATE TABLE IF NOT EXISTS line_scenarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES line_projects(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  distribute_enabled BOOLEAN NOT NULL DEFAULT false,
  distribute_count INTEGER NOT NULL DEFAULT 1,
  reserve_count INTEGER NOT NULL DEFAULT 0,
  ban_sync_enabled BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT line_scenarios_project_code_unique UNIQUE (project_id, code)
);

CREATE INDEX IF NOT EXISTS idx_line_scenarios_project ON line_scenarios(project_id);
CREATE INDEX IF NOT EXISTS idx_line_scenarios_project_sort ON line_scenarios(project_id, sort_order);

-- RLS 有効化 + ポリシー(過去テーブルと同じ:authenticated 全許可)
ALTER TABLE line_scenarios ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE tablename = 'line_scenarios' AND policyname = 'allow_all_authenticated'
  ) THEN
    CREATE POLICY allow_all_authenticated ON line_scenarios FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

-- Step 2: 初期 4 行 INSERT
-- 値の根拠は草案 §1 / §0-A、および本番 DB 照会(2026-04-30)の line_projects 値
-- sort_order=0 は LIFF URL fallback 用に「主シナリオ用に永続的に予約」する運用ルール(草案 §9)
INSERT INTO line_scenarios (project_id, code, name, distribute_enabled, distribute_count, reserve_count, ban_sync_enabled, sort_order)
VALUES
  -- MARI(コード=mari)、現状の line_projects.distribute_* / ban_sync_enabled をそのまま継承
  ('987d51d5-f6c1-4efd-bfb3-e7f26f878c7e', 'mari',      'MARI',          false, 1, 0, true, 0),
  -- スレッズ集客 配下 3 シナリオ(1グループ=1シナリオ並列)
  ('4f065915-91c2-48a0-a4ec-b8f2f683e351', 'umatoku',   'ウマトク',       true,  5, 1, true, 0),
  ('4f065915-91c2-48a0-a4ec-b8f2f683e351', 'tresaro',   'トレサロ',       false, 1, 5, true, 1),
  ('4f065915-91c2-48a0-a4ec-b8f2f683e351', 'moneyboat', 'マネーボート',   false, 1, 5, true, 2)
ON CONFLICT (project_id, code) DO NOTHING;

-- Step 1-C: 事後 SELECT(検証)
DO $$
BEGIN
  RAISE NOTICE '[stage5-step01] post-check';
  RAISE NOTICE '  line_scenarios rows: % (expected: 4)', (SELECT count(*) FROM line_scenarios);
END $$;

SELECT s.code, s.name, p.code AS project_code, s.distribute_enabled, s.distribute_count, s.reserve_count, s.ban_sync_enabled
  FROM line_scenarios s JOIN line_projects p ON s.project_id = p.id
  ORDER BY p.code, s.sort_order;
-- 期待: mari / umatoku / tresaro / moneyboat の 4 行

-- ============================================================
-- ロールバック SQL(参考、適用前にコメント解除して個別実行)
-- ============================================================
-- Step 02 以降が未実行(他テーブルに FK 追加していない)前提で安全に実行可
-- Step 02 以降が実行済なら、先に step02〜step05 のロールバックが必要
-- ============================================================
--
-- DELETE FROM line_scenarios;
-- DROP TABLE IF EXISTS line_scenarios CASCADE;
-- ============================================================

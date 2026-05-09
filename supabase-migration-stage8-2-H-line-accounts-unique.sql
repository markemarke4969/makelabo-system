-- ============================================================
-- 段階8-2-H: line_accounts に UNIQUE 制約追加(silent fail 防御層強化)
-- ============================================================
-- 背景:
--   2026-05-09 AI副業診断で UI silent state バグにより 10件→20件 重複登録が発生(削除済)。
--   PR #46 で UI 側の二重押下防止は実装済。本マイグレーションで DB 層に防御を追加し、
--   API 直叩き / SQL 直叩き / 別経路からの重複登録も DB レベルで弾く。
--
-- 適用方針:
--   - Supabase Dashboard SQL Editor で1回の Run で実行(DO ブロック1つで完結)
--   - 冪等(再実行しても何も起こらない)
--   - 既存重複が残っていた場合は RAISE EXCEPTION で安全停止
--
-- 適用前確認 SQL(石井さんが事前に Supabase で実行・0件確認済):
--   SELECT scenario_id, channel_id, COUNT(*) FROM line_accounts
--   WHERE channel_id IS NOT NULL
--   GROUP BY scenario_id, channel_id HAVING COUNT(*) > 1;  -- 0件
--
--   SELECT scenario_id, basic_id, COUNT(*) FROM line_accounts
--   WHERE basic_id IS NOT NULL
--   GROUP BY scenario_id, basic_id HAVING COUNT(*) > 1;    -- 0件
--
-- 注意点:
--   - PostgreSQL の UNIQUE 制約は NULL 同士の重複を許可する標準動作。
--     scenario_id が NULL の line_accounts(=「シナリオ未設定」)は重複を許す状態が残る。
--     scenario_id NOT NULL 化は別タスクで検討する(本 PR スコープ外)。
--   - 制約違反時、API 側は SQLSTATE 23505 を検知して 409 Conflict を返却する
--     (src/app/api/line/accounts/route.ts POST、本 PR で同時実装済)。
-- ============================================================

DO $$
BEGIN
  -- (1) (scenario_id, channel_id) UNIQUE
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'line_accounts_scenario_channel_unique'
      AND conrelid = 'line_accounts'::regclass
  ) THEN
    -- 安全装置:重複が残っていたら制約追加を中断
    IF EXISTS (
      SELECT 1 FROM (
        SELECT scenario_id, channel_id, COUNT(*) AS cnt
        FROM line_accounts
        WHERE channel_id IS NOT NULL
        GROUP BY scenario_id, channel_id
        HAVING COUNT(*) > 1
      ) AS dups
    ) THEN
      RAISE EXCEPTION '(scenario_id, channel_id) に重複が存在します。先に削除してから再実行してください';
    END IF;

    ALTER TABLE line_accounts
      ADD CONSTRAINT line_accounts_scenario_channel_unique
      UNIQUE (scenario_id, channel_id);

    RAISE NOTICE 'ADDED: line_accounts_scenario_channel_unique';
  ELSE
    RAISE NOTICE 'SKIP: line_accounts_scenario_channel_unique already exists';
  END IF;

  -- (2) (scenario_id, basic_id) UNIQUE
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'line_accounts_scenario_basic_unique'
      AND conrelid = 'line_accounts'::regclass
  ) THEN
    IF EXISTS (
      SELECT 1 FROM (
        SELECT scenario_id, basic_id, COUNT(*) AS cnt
        FROM line_accounts
        WHERE basic_id IS NOT NULL
        GROUP BY scenario_id, basic_id
        HAVING COUNT(*) > 1
      ) AS dups
    ) THEN
      RAISE EXCEPTION '(scenario_id, basic_id) に重複が存在します。先に削除してから再実行してください';
    END IF;

    ALTER TABLE line_accounts
      ADD CONSTRAINT line_accounts_scenario_basic_unique
      UNIQUE (scenario_id, basic_id);

    RAISE NOTICE 'ADDED: line_accounts_scenario_basic_unique';
  ELSE
    RAISE NOTICE 'SKIP: line_accounts_scenario_basic_unique already exists';
  END IF;
END $$;

-- 適用後確認 SQL(石井さんが SQL Editor で別途実行):
--   SELECT conname, pg_get_constraintdef(oid)
--   FROM pg_constraint
--   WHERE conrelid = 'line_accounts'::regclass
--     AND contype = 'u'
--   ORDER BY conname;
--
-- 期待:
--   line_accounts_scenario_basic_unique   | UNIQUE (scenario_id, basic_id)
--   line_accounts_scenario_channel_unique | UNIQUE (scenario_id, channel_id)

-- ============================================================
-- PR#2-B: aifukugyo シナリオへの custom_fields + step_sequence + step_messages seed
-- ============================================================
-- 前提:
--   - line_projects に code='aifukugyo' 行が存在
--   - line_scenarios に project_id=<aifukugyo> の行が存在
--     (段階8-2-F の暫定 INSERT、id='96bfeac0-..' を SELECT で動的解決)
--   - line_accounts(@334hjuzm 等)が aifukugyo project に紐付き、
--     scenario_id 設定済 + role='main' + is_active=true(未設定なら本 SQL は中止)
--   - supabase-migration-pr2b-custom-fields-cols.sql(is_hidden + default_value 列追加)
--     を先に実行済
--
-- 配信本文の構造:
--   - 1 sequence(kind='step')+ 3 行の step_messages(step_order=1/2/3、delay=0)
--   - 各行は msg_type='branch' で、`matching_strength op:'exists'` 条件評価
--     - ready(matching_strength 値あり)→ ready 版本文
--     - pending/failed(値なし or 空)→ 行 1 のみ defaultMessage(pending 本文)
--       行 2/3 は defaultMessage=NULL → buildLineMessage が null 返却 → スキップ
--   - webhook の delay=0 ループ修正で「3 行 → 1 push にまとめる」予定なので
--     ready 時は 1 通知に 3 ブロック / pending 時は 1 通知に 1 ブロック
--
-- aifukugyo 専用:他案件への影響ゼロ(他 scenario の sequences/messages は touch なし)
--
-- 何度実行しても安全(IF NOT EXISTS / ON CONFLICT DO UPDATE / WHERE NOT EXISTS)
--
-- 適用方法:
--   Supabase SQL Editor から本ファイルを実行する(石井さん手作業)。
--
-- ロールバック(必要時)は本ファイル末尾のコメントブロックを参照。
-- ============================================================

DO $$
DECLARE
  v_scenario_id UUID;
  v_account_id UUID;
  v_sequence_id UUID;
BEGIN
  -- ===== Step 1-a: aifukugyo scenario_id を取得(無ければ中止)=====
  SELECT s.id INTO v_scenario_id
    FROM line_scenarios s
    JOIN line_projects p ON p.id = s.project_id
   WHERE p.code = 'aifukugyo'
   ORDER BY s.sort_order
   LIMIT 1;

  IF v_scenario_id IS NULL THEN
    RAISE EXCEPTION 'ABORT: aifukugyo の line_scenarios 行が見つかりません。先に scenario 作成が必要です。';
  END IF;
  RAISE NOTICE '[pr2b-seed] aifukugyo scenario_id = %', v_scenario_id;

  -- ===== Step 1-b: aifukugyo の main account_id 取得 =====
  -- (line_custom_fields.account_id NOT NULL のため必須)
  SELECT a.id INTO v_account_id
    FROM line_accounts a
   WHERE a.scenario_id = v_scenario_id
     AND COALESCE(a.role, 'main') = 'main'
     AND COALESCE(a.is_active, true) = true
   ORDER BY a.created_at
   LIMIT 1;

  IF v_account_id IS NULL THEN
    RAISE EXCEPTION 'ABORT: aifukugyo scenario 配下に role=main の active account が見つかりません。先に line_accounts.scenario_id 紐付けが必要です。';
  END IF;
  RAISE NOTICE '[pr2b-seed] aifukugyo main account_id = %', v_account_id;

  -- ===== Step 2: line_custom_fields seed(7 個、is_hidden=true)=====
  -- ON CONFLICT は (account_id, field_key) の UNIQUE 前提
  -- (supabase-schema-line-templates.sql:49)
  -- matching_cta_url のみ default_value に仮 URL を投入
  -- (予約システム完成後にハーネス管理画面 or Supabase で差替)
  INSERT INTO line_custom_fields
    (account_id, scenario_id, field_key, field_label, field_type, is_hidden, default_value, sort_order)
  VALUES
    (v_account_id, v_scenario_id, 'matching_diagnosis_id',  '副業診断: 診断ID',           'text', true, NULL,                                       1001),
    (v_account_id, v_scenario_id, 'matching_type_name',     '副業診断: タイプ名',         'text', true, NULL,                                       1002),
    (v_account_id, v_scenario_id, 'matching_animal',        '副業診断: 動物タイプ',       'text', true, NULL,                                       1003),
    (v_account_id, v_scenario_id, 'matching_strength',      '副業診断: 本質的な強み本文', 'text', true, NULL,                                       1004),
    (v_account_id, v_scenario_id, 'matching_animal_text',   '副業診断: 動物タイプ本文',   'text', true, NULL,                                       1005),
    (v_account_id, v_scenario_id, 'matching_risk',          '副業診断: リスク本文',       'text', true, NULL,                                       1006),
    (v_account_id, v_scenario_id, 'matching_cta_url',       '副業診断: 無料相談リンク',   'text', true, 'https://aifukugyo.example.com/consult',    1007)
  ON CONFLICT (account_id, field_key) DO UPDATE
    SET field_label   = EXCLUDED.field_label,
        field_type    = EXCLUDED.field_type,
        is_hidden     = true,
        default_value = COALESCE(line_custom_fields.default_value, EXCLUDED.default_value),  -- 既存値があれば尊重
        sort_order    = EXCLUDED.sort_order;

  -- ===== Step 3: line_step_sequences seed(1 行、kind='step')=====
  INSERT INTO line_step_sequences
    (account_id, scenario_id, name, status, kind)
  SELECT v_account_id, v_scenario_id, 'AI レポート初動 3 ブロック配信', 'active', 'step'
   WHERE NOT EXISTS (
     SELECT 1 FROM line_step_sequences
      WHERE scenario_id = v_scenario_id
        AND kind = 'step'
        AND name = 'AI レポート初動 3 ブロック配信'
   );

  -- ===== Step 4: 上記 sequence の id を取得 =====
  SELECT id INTO v_sequence_id
    FROM line_step_sequences
   WHERE scenario_id = v_scenario_id
     AND kind = 'step'
     AND name = 'AI レポート初動 3 ブロック配信'
   LIMIT 1;

  IF v_sequence_id IS NULL THEN
    RAISE EXCEPTION 'ABORT: 直前の Step 3 で sequence が作成されていません。';
  END IF;
  RAISE NOTICE '[pr2b-seed] sequence_id = %', v_sequence_id;

  -- ===== Step 5: line_step_messages seed(3 行、step_order=1/2/3、delay=0、branch 構造)=====

  -- 行 1: 「ブロック 1」(ready) / 「現在 AI が最終チェック中」(pending=defaultMessage)
  INSERT INTO line_step_messages
    (sequence_id, step_order, delay_minutes, msg_type, body, payload, status, timing_mode)
  SELECT v_sequence_id, 1, 0, 'branch',
         'AI レポート ブロック 1 / 3',
         jsonb_build_object(
           'msgType', 'branch',
           'branches', jsonb_build_array(
             jsonb_build_object(
               'condition', jsonb_build_object(
                 'custom_field', jsonb_build_object('key', 'matching_strength', 'op', 'exists')
               ),
               'message', jsonb_build_object(
                 'msgType', 'text',
                 'body', E'お待たせしました!{display_name} さんの診断結果をお届けします。\n\nあなたのタイプは『{field:matching_type_name}』× {field:matching_animal}\n\n■ あなたの本質的な強み\n{field:matching_strength}'
               )
             )
           ),
           'defaultMessage', jsonb_build_object(
             'msgType', 'text',
             'body', '現在 AI が最終チェック中です。完了後にお届けしますので、もう少しお待ちください。'
           )
         ),
         'active', 'immediate'
  WHERE NOT EXISTS (SELECT 1 FROM line_step_messages WHERE sequence_id = v_sequence_id AND step_order = 1);

  -- 行 2: 「ブロック 2」(ready) / NULL(pending = スキップ)
  INSERT INTO line_step_messages
    (sequence_id, step_order, delay_minutes, msg_type, body, payload, status, timing_mode)
  SELECT v_sequence_id, 2, 0, 'branch',
         'AI レポート ブロック 2 / 3',
         jsonb_build_object(
           'msgType', 'branch',
           'branches', jsonb_build_array(
             jsonb_build_object(
               'condition', jsonb_build_object(
                 'custom_field', jsonb_build_object('key', 'matching_strength', 'op', 'exists')
               ),
               'message', jsonb_build_object(
                 'msgType', 'text',
                 'body', E'■ {field:matching_animal} タイプのあなたへ\n{field:matching_animal_text}'
               )
             )
           ),
           'defaultMessage', NULL
         ),
         'active', 'immediate'
  WHERE NOT EXISTS (SELECT 1 FROM line_step_messages WHERE sequence_id = v_sequence_id AND step_order = 2);

  -- 行 3: 「ブロック 3 + CTA」(ready) / NULL(pending = スキップ)
  INSERT INTO line_step_messages
    (sequence_id, step_order, delay_minutes, msg_type, body, payload, status, timing_mode)
  SELECT v_sequence_id, 3, 0, 'branch',
         'AI レポート ブロック 3 / 3 + CTA',
         jsonb_build_object(
           'msgType', 'branch',
           'branches', jsonb_build_array(
             jsonb_build_object(
               'condition', jsonb_build_object(
                 'custom_field', jsonb_build_object('key', 'matching_strength', 'op', 'exists')
               ),
               'message', jsonb_build_object(
                 'msgType', 'text',
                 'body', E'■ 今のあなたに潜むリスク\n{field:matching_risk}\n\nここまで読んでくださってありがとうございます。\n{display_name} さんの強みを活かして、最初の一歩を踏み出してみませんか?\n無料相談はこちらから ↓\n{field:matching_cta_url}'
               )
             )
           ),
           'defaultMessage', NULL
         ),
         'active', 'immediate'
  WHERE NOT EXISTS (SELECT 1 FROM line_step_messages WHERE sequence_id = v_sequence_id AND step_order = 3);

  RAISE NOTICE '[pr2b-seed] seed 完了';
END $$;

-- ============================================================
-- 検証 SELECT(本 SQL 末尾で実行、結果を確認)
-- ============================================================

-- 検証 1: scenario + sequence の存在
SELECT s.code AS scenario_code, s.name AS scenario_name,
       seq.name AS sequence_name, seq.kind, seq.status
  FROM line_scenarios s
  JOIN line_projects p ON p.id = s.project_id
  JOIN line_step_sequences seq ON seq.scenario_id = s.id
 WHERE p.code = 'aifukugyo'
   AND seq.name = 'AI レポート初動 3 ブロック配信';
-- 期待: 1 行

-- 検証 2: step_messages 3 行
SELECT msg.step_order, msg.delay_minutes, msg.msg_type, msg.status
  FROM line_step_messages msg
  JOIN line_step_sequences seq ON seq.id = msg.sequence_id
  JOIN line_scenarios s ON s.id = seq.scenario_id
  JOIN line_projects p ON p.id = s.project_id
 WHERE p.code = 'aifukugyo'
   AND seq.name = 'AI レポート初動 3 ブロック配信'
 ORDER BY msg.step_order;
-- 期待: 3 行 / step_order 1,2,3 / delay 0,0,0 / msg_type branch,branch,branch / active

-- 検証 3: custom_fields 7 個 / is_hidden=true / matching_cta_url のみ default_value
SELECT field_key, field_label, is_hidden, default_value
  FROM line_custom_fields f
  JOIN line_accounts a ON a.id = f.account_id
  JOIN line_scenarios s ON s.id = a.scenario_id
  JOIN line_projects p ON p.id = s.project_id
 WHERE p.code = 'aifukugyo'
   AND f.field_key LIKE 'matching_%'
 ORDER BY f.sort_order;
-- 期待: 7 行 / すべて is_hidden=true / matching_cta_url のみ default_value 非NULL

-- ============================================================
-- ロールバック(必要時)
-- ============================================================
-- DELETE FROM line_step_messages msg
--  USING line_step_sequences seq, line_scenarios s, line_projects p
--  WHERE msg.sequence_id = seq.id
--    AND seq.scenario_id = s.id
--    AND s.project_id = p.id
--    AND p.code = 'aifukugyo'
--    AND seq.name = 'AI レポート初動 3 ブロック配信';
--
-- DELETE FROM line_step_sequences seq
--  USING line_scenarios s, line_projects p
--  WHERE seq.scenario_id = s.id
--    AND s.project_id = p.id
--    AND p.code = 'aifukugyo'
--    AND seq.name = 'AI レポート初動 3 ブロック配信';
--
-- DELETE FROM line_custom_fields f
--  USING line_accounts a, line_scenarios s, line_projects p
--  WHERE f.account_id = a.id
--    AND a.scenario_id = s.id
--    AND s.project_id = p.id
--    AND p.code = 'aifukugyo'
--    AND f.field_key LIKE 'matching_%';
-- ============================================================

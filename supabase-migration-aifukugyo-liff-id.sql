-- ============================================================
-- AI副業診断(aifukugyo)用 LIFF ID 投入
-- ============================================================
-- 目的:
--   副業診断アプリ専用の LIFF アプリ ID `2010052399-B7Poj7Gn` を
--   line_projects テーブルの code='aifukugyo' 行の liff_id カラムに投入する。
--
-- 経緯:
--   PR#1' で Vercel 環境変数 NEXT_PUBLIC_MATCHING_LIFF_ID を撤去するにあたり、
--   設計上の本筋(src/lib/line.ts:13-21 getLiffIdForProject 経由の DB 参照)へ
--   LIFF ID を移植する必要がある。
--
--   ハーネス側コメント(src/lib/line.ts:17)抜粋:
--     「クロスプロバイダー LIFF 問題回避のため、案件単位で LIFF ID を切り替える設計」
--
--   DB に LIFF ID が未投入のままだと、getLiffIdForProject('aifukugyo') は
--   env fallback (= NEXT_PUBLIC_LIFF_ID, MARI 用 `2009889729-u55Bs7p0`) を
--   返してしまい、別プロバイダー配下の副業診断アプリでは LIFF init が失敗する。
--
-- PR#2(AI レポート配信)前提条件:
--   本 SQL の実行が PR#2 着手の必須準備。
--   配信メッセージに埋め込む LIFF URL (https://liff.line.me/<LIFF_ID>?project=aifukugyo)
--   は src/app/liff/redirect/page.tsx を経由し、内部で /api/liff/config?project=aifukugyo
--   を叩いて DB から LIFF ID を取得する。
--
-- 適用方法:
--   Supabase SQL Editor から本ファイルを実行する(石井さん手作業)。
--
-- 安全性:
--   - WHERE code = 'aifukugyo' で限定(他の行 mari / threads は一切触らない)
--   - Step 1 で対象行の存在を確認、無ければ EXCEPTION で中止
--   - Step 2 で既存値を表示。既存値が NULL でない場合は WARNING を出し、
--     上書きしてよいか石井さんに判断を委ねる(本 SQL は idempotent なので
--     再実行可)
--   - Step 3 の UPDATE は WHERE code='aifukugyo' に限定済
--   - 関連 memory: supabase_territory_rule.md(matching_* OK / line_* NG)
--     line_projects は ハーネス側テーブルだが、本件は副業診断アプリ用
--     データの整備であり、aifukugyo 行のみへの限定操作のため安全と判断。
-- ============================================================

-- ===== Step 1: 対象行の存在確認(無ければ中止)=====
DO $$
DECLARE
  target_count INTEGER;
BEGIN
  SELECT count(*) INTO target_count
    FROM line_projects
   WHERE code = 'aifukugyo';

  RAISE NOTICE '[aifukugyo-liff-id] Step 1: pre-check';
  RAISE NOTICE '  line_projects rows where code=aifukugyo : %', target_count;

  IF target_count = 0 THEN
    RAISE EXCEPTION 'ABORT: line_projects に code=''aifukugyo'' の行が存在しません。先に案件作成が必要です。';
  END IF;

  IF target_count > 1 THEN
    RAISE EXCEPTION 'ABORT: line_projects に code=''aifukugyo'' の行が複数(%件)存在します。一意性が壊れているため手動確認が必要です。', target_count;
  END IF;
END $$;

-- ===== Step 2: 既存値の表示 + 上書き警告 =====
DO $$
DECLARE
  current_liff_id TEXT;
BEGIN
  SELECT liff_id INTO current_liff_id
    FROM line_projects
   WHERE code = 'aifukugyo';

  RAISE NOTICE '[aifukugyo-liff-id] Step 2: current value';
  RAISE NOTICE '  current liff_id : %', COALESCE(current_liff_id, '(NULL)');

  IF current_liff_id IS NOT NULL AND current_liff_id <> '2010052399-B7Poj7Gn' THEN
    RAISE WARNING '!!! 既存値が NULL でも target 値とも異なります。上書きすると元の値(%)が失われます。問題なければ Step 3 を続行してください。', current_liff_id;
  ELSIF current_liff_id = '2010052399-B7Poj7Gn' THEN
    RAISE NOTICE '  既に target 値が投入済です(idempotent: 再実行しても無害)。';
  ELSE
    RAISE NOTICE '  既存値は NULL のため新規投入になります。';
  END IF;
END $$;

-- ===== Step 3: UPDATE 実行(WHERE で aifukugyo 限定) =====
UPDATE line_projects
   SET liff_id = '2010052399-B7Poj7Gn'
 WHERE code = 'aifukugyo';

-- ===== Step 4: 投入結果の検証 =====
SELECT id, name, code, liff_id
  FROM line_projects
 WHERE code = 'aifukugyo';
-- 期待: 1 行 / code='aifukugyo' / liff_id='2010052399-B7Poj7Gn'

-- 参考: 他の行への影響が無いことを目視確認
SELECT code, liff_id
  FROM line_projects
 ORDER BY sort_order;
-- 期待: aifukugyo のみ更新、mari / threads は元の値のまま
--       (mari は NEXT_PUBLIC_LIFF_ID と同じ '2009889729-u55Bs7p0' か、
--        独自に DB 投入されていればその値。本 SQL では一切触らない。)

-- ============================================================
-- ロールバック(必要時)
-- ============================================================
-- UPDATE line_projects SET liff_id = NULL WHERE code = 'aifukugyo';
-- ※ ロールバックすると getLiffIdForProject('aifukugyo') は
--   NEXT_PUBLIC_LIFF_ID (MARI 用) に fallback してしまうため、
--   PR#2 配信前のロールバックは慎重に。
-- ============================================================

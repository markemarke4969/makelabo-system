-- ========================================
-- 副業診断アプリ × LINEハーネス 橋渡しテーブル
-- ========================================
-- 目的:
--   診断結果 (matching_diagnoses.id) と LINE User ID (LIFF 経由で取得)、
--   ハーネス側シナリオ ID / プロジェクト ID を 1 レコードで紐付ける。
--
-- 設計方針:
--   - scenario_id / project_id はハーネス側 line_scenarios.id / projects.id の
--     UUID を保存するが、ハーネステーブルへの FK は張らない。
--     (副業診断アプリ側のテリトリーとハーネス側のテリトリーを論理的に分離する意図)
--   - diagnosis_id への FK のみ張り、ON DELETE RESTRICT で連鎖削除事故を防ぐ。
--   - 1 診断につき 1 ブリッジレコード (diagnosis_id UNIQUE)。
--   - bind API は UPSERT (onConflict: diagnosis_id) で line_user_id を後付け更新する。
--
-- 適用方法:
--   Supabase SQL Editor から本ファイルを実行する (石井さん手作業)。
-- ========================================

create table if not exists matching_line_bridge (
  id uuid primary key default gen_random_uuid(),

  -- 診断結果への参照 (1 診断 = 1 ブリッジレコード)
  diagnosis_id uuid not null
    references matching_diagnoses(id) on delete restrict,

  -- LIFF 経由で取得する LINE User ID。bind API 呼出し前は null。
  line_user_id text,

  -- ハーネス側 line_scenarios.id の UUID (FK は張らない: 論理分離のため)
  scenario_id uuid not null,

  -- ハーネス側 projects.id の UUID (FK は張らない: 同上)
  project_id uuid not null,

  -- レコード作成時刻 (CTA クリック直後の bind API 呼出し時刻)
  created_at timestamptz not null default now(),

  -- LIFF で line_user_id を取得し bind が成功した時刻
  bound_at timestamptz,

  -- 1 診断につき 1 レコード
  constraint matching_line_bridge_diagnosis_id_unique unique (diagnosis_id)
);

create index if not exists idx_matching_line_bridge_line_user
  on matching_line_bridge(line_user_id)
  where line_user_id is not null;

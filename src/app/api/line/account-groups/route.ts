import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";

// ============================================================
// 段階5(案B)で本エンドポイントは廃止予定
// ============================================================
// 段階5 Step 12 で line_account_groups テーブルそのものを削除予定。
// シナリオ単位への移行に伴い、line_account_groups の概念は line_scenarios に
// 取り込まれた(/api/line/projects の GET レスポンスで scenarios 配列として返される)。
//
// 本エンドポイントは Step 12 適用までの後方互換のために残置:
//   - GET:テーブル不在(Step 12 適用後)なら空配列を返却(呼び出し元が壊れないため)
//   - PUT:テーブル不在なら 410 Gone を返却(設定変更は line_scenarios 側で実施する想定)
//
// 完全削除は Step 12 適用 + 呼び出し元 UI の置換完了後に別タスクで実施。
// 草案出典: C:\Users\lmsml\.claude\plans\07-calm-pudding.md §11(低優先度・account-groups)
// ============================================================

// グループ設定を取得
export async function GET(request: NextRequest) {
  const projectId = request.nextUrl.searchParams.get("project_id");
  if (!projectId) {
    return Response.json({ error: "project_id is required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("line_account_groups")
    .select("*")
    .eq("project_id", projectId)
    .order("sort_order", { ascending: true });

  if (error) {
    // テーブル不在(Step 12 適用後)→ 空配列を返却し呼び出し元が壊れないようにする
    if (/line_account_groups/i.test(error.message) || error.code === "PGRST205") {
      console.warn(
        "[account-groups GET] line_account_groups テーブル未作成 → 段階5 Step 12 適用済と判断、空配列を返却",
      );
      return Response.json([]);
    }
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json(data ?? []);
}

// グループ設定をUPSERT（closer_visible等）
export async function PUT(request: NextRequest) {
  const body = await request.json();
  const { project_id, group_name, closer_visible } = body;

  if (!project_id || !group_name) {
    return Response.json({ error: "project_id and group_name are required" }, { status: 400 });
  }

  const { error } = await supabase
    .from("line_account_groups")
    .upsert(
      {
        project_id,
        group_name,
        closer_visible: !!closer_visible,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "project_id,group_name" },
    );

  if (error) {
    // テーブル不在(Step 12 適用後)→ 410 Gone(設定変更は line_scenarios 側で実施)
    if (/line_account_groups/i.test(error.message) || error.code === "PGRST205") {
      return Response.json(
        {
          error:
            "line_account_groups は段階5 で廃止されました。シナリオ設定は /api/line/projects(scenarios 配列)を使用してください。",
        },
        { status: 410 },
      );
    }
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ ok: true });
}

import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";

// ============================================================
// scenario 依存件数取得 API(段階8-2-C)
// ============================================================
// GET /api/line/scenarios/dependents?id=<scenarioId>
//   削除前に scenario 配下の各テーブル件数を取得し、削除影響をユーザに表示する。
//
// レスポンス:
//   {
//     followers: N,
//     accounts: N,
//     inflow_routes: N,
//     step_sequences: N,
//     rich_menus: N,
//     labels: N,
//     action_rules: N,
//     others: N   // reminders + newsletters + surveys + registration_forms +
//                 // reengagement_broadcasts + click_tokens + message_clicks +
//                 // templates + custom_fields の合計
//   }
//
// テーブル不在(scenario_id 列未追加環境)時の fallback:
//   - count クエリでエラーが出れば 0 として扱い、レスポンスは継続
//   - 本番(段階5/7-A1 適用済)では発火しない想定
// ============================================================

const MAIN_TABLES = [
  "line_followers",
  "line_accounts",
  "line_inflow_routes",
  "line_step_sequences",
  "line_rich_menus",
  "line_labels",
  "line_action_rules",
] as const;

const OTHER_TABLES = [
  "line_reminders",
  "line_newsletters",
  "line_surveys",
  "line_registration_forms",
  "line_reengagement_broadcasts",
  "line_click_tokens",
  "line_message_clicks",
  "line_templates",
  "line_custom_fields",
] as const;

async function countByScenario(table: string, scenarioId: string): Promise<number> {
  const { count, error } = await supabase
    .from(table)
    .select("*", { count: "exact", head: true })
    .eq("scenario_id", scenarioId);
  if (error) {
    // テーブル不在 / 列不在(scenario_id 未追加環境)→ 0 扱いで継続
    console.warn(`[scenarios/dependents] ${table} count failed:`, error.message);
    return 0;
  }
  return count ?? 0;
}

export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");
  if (!id) {
    return Response.json({ error: "id is required" }, { status: 400 });
  }

  // 主要 7 テーブル + その他 9 テーブルの件数を並列取得
  const mainCounts = await Promise.all(
    MAIN_TABLES.map((t) => countByScenario(t, id)),
  );
  const otherCounts = await Promise.all(
    OTHER_TABLES.map((t) => countByScenario(t, id)),
  );

  const others = otherCounts.reduce((sum, n) => sum + n, 0);

  return Response.json({
    followers: mainCounts[0],
    accounts: mainCounts[1],
    inflow_routes: mainCounts[2],
    step_sequences: mainCounts[3],
    rich_menus: mainCounts[4],
    labels: mainCounts[5],
    action_rules: mainCounts[6],
    others,
  });
}

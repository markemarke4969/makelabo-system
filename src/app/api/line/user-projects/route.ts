import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";

// ============================================================
// ユーザーの担当案件一覧を取得(段階5 案B 対応・後方互換維持)
// ============================================================
// projects/page.tsx の初期化フロー(useEffect)はこのエンドポイントを叩く。
// 段階5 で各 project に scenarios 配列を埋め込む必要がある(line_scenarios 利用可能時のみ)。
// 元の /api/line/projects と同じパターンで scenarios を取得 → 各 project に埋め込み。
//
// line_scenarios テーブル不在(Step 01 未適用)の場合は scenarios=[] で返却し、
// UI 側は古い project レベルの設定欄(BAN対策同期 / 分散登録)を表示する後方互換挙動になる。
// ============================================================

interface ScenarioRow {
  id: string;
  project_id: string;
  code: string | null;
  name: string;
  distribute_enabled: boolean | null;
  distribute_count: number | null;
  reserve_count: number | null;
  ban_sync_enabled: boolean | null;
  sort_order: number | null;
}

/**
 * line_scenarios 全件を取得。テーブル不在(Step 01 未適用)の場合は null を返す。
 */
async function fetchAllScenarios(): Promise<ScenarioRow[] | null> {
  const r = await supabase
    .from("line_scenarios")
    .select("id, project_id, code, name, distribute_enabled, distribute_count, reserve_count, ban_sync_enabled, sort_order")
    .order("sort_order", { ascending: true });
  if (r.error) {
    if (/line_scenarios/i.test(r.error.message) || r.error.code === "PGRST205") {
      return null; // テーブル不在 → 後方互換 fallback
    }
    // その他のエラーは projects 一覧の取得を妨げない(既存 UI 互換)
    console.warn("[user-projects] scenarios fetch failed:", r.error.message);
    return null;
  }
  return (r.data ?? []) as ScenarioRow[];
}

/**
 * 各 project に scenarios 配列を埋め込む。
 * scenarios が null(テーブル不在 or 取得失敗)なら全 project に空配列をセット。
 */
function enrichProjectsWithScenarios(
  projects: Array<Record<string, unknown> & { id: string }>,
  scenarios: ScenarioRow[] | null,
): Array<Record<string, unknown>> {
  return projects.map((p) => ({
    ...p,
    scenarios:
      scenarios === null
        ? []
        : scenarios.filter((s) => s.project_id === p.id),
  }));
}

// ユーザーの担当案件一覧を取得
export async function GET(request: NextRequest) {
  const userId = request.nextUrl.searchParams.get("user_id");

  // line_scenarios を一度取得しておく(以降のすべてのレスポンスで使い回す)
  const scenarios = await fetchAllScenarios();

  if (!userId) {
    // user_idなし → 全案件を返す（ゲスト用）
    const { data, error } = await supabase
      .from("line_projects")
      .select("*")
      .order("sort_order", { ascending: true });

    if (error) return Response.json({ error: error.message }, { status: 500 });
    const enriched = enrichProjectsWithScenarios(
      (data ?? []) as Array<Record<string, unknown> & { id: string }>,
      scenarios,
    );
    return Response.json(enriched);
  }

  // user_idあり → 紐付け案件のみ返す
  const { data, error } = await supabase
    .from("line_user_projects")
    .select("project_id, role, line_projects(*)")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });

  if (error) return Response.json({ error: error.message }, { status: 500 });

  // 紐付けが0件なら全案件を返す（管理者 or 未設定）
  if (!data || data.length === 0) {
    const { data: allProjects, error: allErr } = await supabase
      .from("line_projects")
      .select("*")
      .order("sort_order", { ascending: true });

    if (allErr) return Response.json({ error: allErr.message }, { status: 500 });
    const enriched = enrichProjectsWithScenarios(
      (allProjects ?? []) as Array<Record<string, unknown> & { id: string }>,
      scenarios,
    );
    return Response.json(enriched);
  }

  // 紐付け案件を返す
  const projects = data
    .map((d) => d.line_projects)
    .filter((p): p is NonNullable<typeof p> => !!p);

  const enriched = enrichProjectsWithScenarios(
    projects as unknown as Array<Record<string, unknown> & { id: string }>,
    scenarios,
  );
  return Response.json(enriched);
}

// ユーザーに案件を紐付け
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { user_id, project_id, role } = body;

  if (!user_id || !project_id) {
    return Response.json({ error: "user_id and project_id are required" }, { status: 400 });
  }

  const { error } = await supabase
    .from("line_user_projects")
    .upsert({ user_id, project_id, role: role || "member" }, { onConflict: "user_id,project_id" });

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}

// ユーザーから案件の紐付けを削除
export async function DELETE(request: NextRequest) {
  const body = await request.json();
  const { user_id, project_id } = body;

  if (!user_id || !project_id) {
    return Response.json({ error: "user_id and project_id are required" }, { status: 400 });
  }

  const { error } = await supabase
    .from("line_user_projects")
    .delete()
    .eq("user_id", user_id)
    .eq("project_id", project_id);

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}

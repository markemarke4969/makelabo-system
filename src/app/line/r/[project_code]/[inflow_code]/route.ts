import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// 中継URL: /line/r/{project_code}/{inflow_code}
//   project_code = line_projects.code
//   inflow_code  = line_inflow_routes.code
//
// フロー(段階5 案B 対応・後方互換維持):
//   1. project_code から project を特定
//   2. その project に紐付く流入経路(inflow_code)を取得
//      ※ inflow_route.scenario_id 列があればそれも取得(段階5 Step 02 適用後)
//   3. クリックを line_inflow_clicks に記録
//   4. その project / scenario の「現在のメインアカウント」を選出
//      優先順位:
//        4-A. inflow_route.scenario_id が NOT NULL → その scenario 配下の main を優先
//        4-B. scenario_id 不明 / 不在 → project 配下の sort_order 最小シナリオ(line_scenarios 利用可なら)
//        4-C. line_scenarios 不在(Step 01 未適用)→ 従来パス(project_id 経由で main 選定)
//      各シナリオ内では: role='main' かつ banned_at IS NULL > role='main' > 任意 active
//   5. そのアカウントの basic_id で友だち追加URLへ302リダイレクト
//
// 目的: BAN で予備LINEに切り替わっても、同じ中継URLで自動的に現行メインへ誘導する。
//       段階5 では scenario 単位の解決に拡張、ただし過去配信 URL の互換性維持。
//
// 草案出典: C:\Users\lmsml\.claude\plans\07-calm-pudding.md §9, §11(高優先度 5-2)

interface AccountRow {
  id: string;
  basic_id: string | null;
  role: string | null;
  is_active: boolean;
  banned_at: string | null;
  created_at: string;
}

/**
 * project 配下の sort_order 最小シナリオを取得(草案 §9 案β + sort_order=0 予約ルール)。
 * line_scenarios 不在の環境では null + legacyFallback=true。
 */
async function fetchDefaultScenarioId(projectId: string): Promise<{
  scenarioId: string | null;
  legacyFallback: boolean;
}> {
  const r = await supabase
    .from("line_scenarios")
    .select("id")
    .eq("project_id", projectId)
    .order("sort_order", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (r.error) {
    if (/line_scenarios/i.test(r.error.message) || r.error.code === "PGRST205") {
      return { scenarioId: null, legacyFallback: true };
    }
    // その他のエラーは fallback 扱い(中継URL の可用性最優先)
    return { scenarioId: null, legacyFallback: true };
  }
  return { scenarioId: (r.data?.id as string | undefined) ?? null, legacyFallback: false };
}

/**
 * scenario_id でアカウント絞り込み。列不在(Step 02 未適用)なら null + columnMissing=true。
 */
async function fetchAccountsByScenario(scenarioId: string): Promise<{
  accounts: AccountRow[] | null;
  columnMissing: boolean;
}> {
  const r = await supabase
    .from("line_accounts")
    .select("id, basic_id, role, is_active, banned_at, created_at")
    .eq("scenario_id", scenarioId)
    .eq("is_active", true)
    .order("created_at", { ascending: true });
  if (r.error) {
    if (/scenario_id/i.test(r.error.message)) {
      return { accounts: null, columnMissing: true };
    }
    // その他のエラーは fallback 扱い
    return { accounts: null, columnMissing: true };
  }
  return { accounts: (r.data ?? []) as AccountRow[], columnMissing: false };
}

/**
 * 従来パス:project_id でアカウント絞り込み(後方互換)
 */
async function fetchAccountsByProject(projectId: string): Promise<AccountRow[] | null> {
  const r = await supabase
    .from("line_accounts")
    .select("id, basic_id, role, is_active, banned_at, created_at")
    .eq("project_id", projectId)
    .eq("is_active", true)
    .order("created_at", { ascending: true });
  if (r.error) return null;
  return (r.data ?? []) as AccountRow[];
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ project_code: string; inflow_code: string }> },
) {
  const { project_code, inflow_code } = await params;

  // 1. project 特定
  const { data: project, error: projErr } = await supabase
    .from("line_projects")
    .select("id, name, code")
    .eq("code", project_code)
    .maybeSingle();

  if (projErr || !project) {
    return new Response(`案件が見つかりません (code=${project_code})`, { status: 404 });
  }

  // 2. 流入経路 特定(scenario_id 列があれば取得、無ければ fallback)
  let routeId: string | null = null;
  let routeScenarioId: string | null = null;
  {
    const r = await supabase
      .from("line_inflow_routes")
      .select("id, code, is_active, scenario_id")
      .eq("project_id", project.id)
      .eq("code", inflow_code)
      .maybeSingle();
    if (r.error && /scenario_id/i.test(r.error.message)) {
      // scenario_id 列が無い(Step 02 未適用)→ 従来 select で再取得
      const fb = await supabase
        .from("line_inflow_routes")
        .select("id, code, is_active")
        .eq("project_id", project.id)
        .eq("code", inflow_code)
        .maybeSingle();
      if (fb.error || !fb.data) {
        return new Response(`流入経路が見つかりません (code=${inflow_code})`, { status: 404 });
      }
      routeId = fb.data.id as string;
      routeScenarioId = null;
    } else if (r.error || !r.data) {
      return new Response(`流入経路が見つかりません (code=${inflow_code})`, { status: 404 });
    } else {
      routeId = r.data.id as string;
      routeScenarioId = (r.data.scenario_id as string | null) ?? null;
    }
  }

  // 3. クリックログ記録（失敗してもリダイレクトは実行）
  const userAgent = request.headers.get("user-agent");
  const ipAddress =
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    request.headers.get("x-real-ip") ??
    null;
  const { error: insertErr } = await supabase.from("line_inflow_clicks").insert({
    inflow_route_id: routeId,
    user_agent: userAgent,
    ip_address: ipAddress,
  });
  if (insertErr) {
    console.error("[inflow click insert] error:", insertErr.message);
  }

  // 4. 現在のメインアカウントを選出(段階5 案B + 後方互換)
  let accounts: AccountRow[] | null = null;

  // 4-A: inflow_route.scenario_id が直接判明していればそれを使う
  if (routeScenarioId) {
    const sc = await fetchAccountsByScenario(routeScenarioId);
    if (!sc.columnMissing && sc.accounts && sc.accounts.length > 0) {
      accounts = sc.accounts;
    }
  }

  // 4-B: scenario_id 不明 / 列不在 → project の sort_order 最小シナリオ経由
  if (!accounts) {
    const def = await fetchDefaultScenarioId(project.id);
    if (!def.legacyFallback && def.scenarioId) {
      const sc = await fetchAccountsByScenario(def.scenarioId);
      if (!sc.columnMissing && sc.accounts && sc.accounts.length > 0) {
        accounts = sc.accounts;
      }
    }
  }

  // 4-C: line_scenarios 不在 or scenario 経由でアカウント取得失敗 → 従来パス
  if (!accounts) {
    accounts = await fetchAccountsByProject(project.id);
  }

  if (!accounts || accounts.length === 0) {
    return new Response("このアクティブなLINEアカウントが見つかりません", { status: 404 });
  }

  // 優先順位: main & not banned > main > any active
  const mainNotBanned = accounts.find((a) => a.role === "main" && !a.banned_at);
  const mainAny = accounts.find((a) => a.role === "main");
  const fallback = accounts[0];
  const target = mainNotBanned ?? mainAny ?? fallback;

  if (!target?.basic_id) {
    return new Response("LINE Basic IDが未設定です", { status: 500 });
  }

  // 5. LINE 友だち追加URLへリダイレクト
  const destination = `https://line.me/R/ti/p/@${target.basic_id}`;
  return Response.redirect(destination, 302);
}

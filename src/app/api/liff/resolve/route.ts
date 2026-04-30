import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";

// ============================================================
// 現メイン判定 API
// ============================================================
// GET /api/liff/resolve?project=mari[&scenario=<code>]
//   → { success: true, addUrl: "https://line.me/R/ti/p/@xxxxxx", mainAccountId: "..." }
//
// 目的:
//   LIFF 中継ページから呼ばれ、指定案件・指定シナリオの現在アクティブな
//   メインアカウント (role='main' AND is_active=true) を特定し、
//   友だち追加URL を返す。
//
// シナリオ解決ロジック(段階5 案B、9項目判断 7 / 草案 §9):
//   1. ?scenario=<code> 明示指定があればそれを採用
//   2. 省略時は line_scenarios.sort_order 最小(案β + sort_order=0 予約ルール)
//   3. line_scenarios テーブル / scenario_id 列が存在しない環境(Step 01〜03 未適用)では
//      従来パス(project_id + role='main')に fallback
// ============================================================

interface AccountRow {
  id: string;
  basic_id: string | null;
  account_name: string | null;
}

interface ScenarioRow {
  id: string;
  code: string | null;
  sort_order: number | null;
}

/**
 * 指定 project 配下のシナリオを解決する。
 * - scenarioCode 指定 → 一致するシナリオを返す(無ければ null)
 * - scenarioCode なし → sort_order 最小のシナリオを返す(草案 §9 案β + sort_order=0 予約ルール)
 * - line_scenarios テーブルが存在しない場合は null を返す(呼び出し側で従来パスへ fallback)
 */
async function resolveScenario(projectId: string, scenarioCode: string | null): Promise<{
  scenario: ScenarioRow | null;
  legacyFallback: boolean;
  error?: string;
}> {
  if (scenarioCode) {
    const r = await supabase
      .from("line_scenarios")
      .select("id, code, sort_order")
      .eq("project_id", projectId)
      .eq("code", scenarioCode)
      .limit(1)
      .maybeSingle();
    if (r.error) {
      // テーブル不在(Step 01 未適用)→ 従来パスへ
      if (/line_scenarios/i.test(r.error.message) || r.error.code === "PGRST205") {
        return { scenario: null, legacyFallback: true };
      }
      return { scenario: null, legacyFallback: false, error: r.error.message };
    }
    return { scenario: (r.data as ScenarioRow | null) ?? null, legacyFallback: false };
  }

  // scenario 省略時:sort_order 最小
  const r = await supabase
    .from("line_scenarios")
    .select("id, code, sort_order")
    .eq("project_id", projectId)
    .order("sort_order", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (r.error) {
    if (/line_scenarios/i.test(r.error.message) || r.error.code === "PGRST205") {
      return { scenario: null, legacyFallback: true };
    }
    return { scenario: null, legacyFallback: false, error: r.error.message };
  }
  return { scenario: (r.data as ScenarioRow | null) ?? null, legacyFallback: false };
}

/**
 * scenario_id ベースで main アカウントを取得。
 * scenario_id 列が存在しない環境では null を返し、呼び出し側で従来パスへ fallback。
 */
async function findMainByScenario(scenarioId: string): Promise<{
  account: AccountRow | null;
  columnMissing: boolean;
  error?: string;
}> {
  const r = await supabase
    .from("line_accounts")
    .select("id, basic_id, account_name")
    .eq("scenario_id", scenarioId)
    .eq("role", "main")
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();
  if (r.error) {
    // scenario_id 列が無い(Step 02 未適用)→ 呼び出し側で従来パス
    if (/scenario_id/i.test(r.error.message)) {
      return { account: null, columnMissing: true };
    }
    return { account: null, columnMissing: false, error: r.error.message };
  }
  return { account: (r.data as AccountRow | null) ?? null, columnMissing: false };
}

/**
 * 従来パス(後方互換):project_id + role='main' + is_active=true で main を取得
 */
async function findMainByProject(projectId: string): Promise<{
  account: AccountRow | null;
  error?: string;
}> {
  const r = await supabase
    .from("line_accounts")
    .select("id, basic_id, account_name")
    .eq("project_id", projectId)
    .eq("role", "main")
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();
  if (r.error) {
    return { account: null, error: r.error.message };
  }
  return { account: (r.data as AccountRow | null) ?? null };
}

export async function GET(request: NextRequest) {
  const projectCode = request.nextUrl.searchParams.get("project")?.trim();
  const scenarioCode = request.nextUrl.searchParams.get("scenario")?.trim() || null;
  if (!projectCode) {
    return Response.json({ success: false, error: "project code is required" }, { status: 400 });
  }

  // project コード → project_id
  const { data: project, error: projErr } = await supabase
    .from("line_projects")
    .select("id, name, code")
    .eq("code", projectCode)
    .maybeSingle();
  if (projErr) {
    return Response.json({ success: false, error: `project lookup failed: ${projErr.message}` }, { status: 500 });
  }
  if (!project) {
    return Response.json({ success: false, error: `project not found: ${projectCode}` }, { status: 404 });
  }

  // 1) scenario 解決を試みる(段階5 案B、Step 01 適用後はこちらで解決)
  const scenarioResult = await resolveScenario(project.id, scenarioCode);
  if (scenarioResult.error) {
    return Response.json({ success: false, error: `scenario lookup failed: ${scenarioResult.error}` }, { status: 500 });
  }

  let main: AccountRow | null = null;

  if (!scenarioResult.legacyFallback && scenarioResult.scenario) {
    // 2) scenario が解決できた場合:scenario_id 経由で main 取得
    const accResult = await findMainByScenario(scenarioResult.scenario.id);
    if (accResult.error) {
      return Response.json({ success: false, error: `account lookup failed: ${accResult.error}` }, { status: 500 });
    }
    if (accResult.columnMissing) {
      // scenario_id 列が無い(Step 02 未適用)→ 従来パスへ
      const fb = await findMainByProject(project.id);
      if (fb.error) {
        return Response.json({ success: false, error: `account lookup failed: ${fb.error}` }, { status: 500 });
      }
      main = fb.account;
    } else {
      main = accResult.account;
    }
  } else if (scenarioResult.legacyFallback) {
    // 3) line_scenarios テーブル不在(Step 01 未適用)→ 従来パス
    const fb = await findMainByProject(project.id);
    if (fb.error) {
      return Response.json({ success: false, error: `account lookup failed: ${fb.error}` }, { status: 500 });
    }
    main = fb.account;
  } else if (scenarioCode) {
    // 4) scenario 明示指定があったが該当無し → 404
    return Response.json(
      { success: false, error: `scenario not found: project=${projectCode}, scenario=${scenarioCode}` },
      { status: 404 },
    );
  } else {
    // 5) line_scenarios アクセスは成功したが行が無い(scenarios 未投入)→ 従来パス
    const fb = await findMainByProject(project.id);
    if (fb.error) {
      return Response.json({ success: false, error: `account lookup failed: ${fb.error}` }, { status: 500 });
    }
    main = fb.account;
  }

  if (!main) {
    return Response.json(
      { success: false, error: "現在利用可能なアカウントがありません" },
      { status: 404 },
    );
  }
  if (!main.basic_id) {
    return Response.json(
      { success: false, error: "メインアカウントに basic_id が設定されていません" },
      { status: 500 },
    );
  }

  const addUrl = `https://line.me/R/ti/p/@${main.basic_id}`;
  return Response.json({
    success: true,
    addUrl,
    mainAccountId: main.id,
    projectCode: project.code,
    scenarioCode: scenarioResult.scenario?.code ?? null,
  });
}

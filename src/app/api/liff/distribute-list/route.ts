import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

// ============================================================
// 分散登録対象リスト取得 API(振り分け方式・B1 実装 2026-04-28)
// ============================================================
// GET /api/liff/distribute-list?project=<code>[&scenario=<code>][&group=<group_name>][&user_id=<line_user_id>]
//
// 【段階5(案B)対応】2026-04-30 追加:
//   - scenario クエリ任意対応(明示指定 → そのシナリオで動作)
//   - scenario 省略時、group クエリがあれば group_name → scenario_code 自動変換(mapGroupToScenarioCode)
//   - 両方省略時は project_id 配下の sort_order 最小シナリオ(草案 §9 案β + sort_order=0 予約ルール)
//   - line_scenarios テーブル不在 / scenario_id 列不在の環境では従来パス(project_id + group_name)に fallback
//
// 【分散案件 (scenario.distribute_enabled = true 優先 / なければ project.distribute_enabled = true) の場合】
//   - 振り分けロジック(B1):
//       (a) user_id 指定時、既存 follower があればそのアカウントを返却(再振り分けなし)
//       (b) 既存 follower なし or user_id 未指定時、friend 数最少のアカウントを選ぶ
//           同数は order_index 昇順タイブレーカー(main を含む順序)
//   - 振り分けた1件のみを accounts 配列に入れて返却(クライアントは list[0] にリダイレクト)
//
// 【非分散案件 (distribute_enabled = false) の場合】※ MARI 互換維持
//   - 従来通り role='main' の1件のみを返却
//   - クライアント側の分岐をシンプルにするため distributeEnabled=false 付き
//
// 詳細:設計図05 §3 / 2026-04-28_LINEハーネス_段階3残務整理.md(B1) /
//       C:\Users\lmsml\.claude\plans\07-calm-pudding.md §9, §11
// ============================================================

interface AccountRow {
  id: string;
  basic_id: string | null;
  account_name: string | null;
  role: string | null;
  order_index?: number | null;
  is_active: boolean;
  group_name?: string | null;
}

interface ScenarioRow {
  id: string;
  code: string | null;
  sort_order: number | null;
  distribute_enabled: boolean | null;
  distribute_count: number | null;
}

/**
 * group_name → scenario_code の対応表(草案 §9 確定)
 */
function mapGroupToScenarioCode(groupName: string | null | undefined): string | null {
  if (!groupName) return null;
  const map: Record<string, string> = {
    "ウマトク": "umatoku",
    "トレサロ": "tresaro",
    "マネーボート": "moneyboat",
  };
  return map[groupName] ?? null;
}

/**
 * project_id 配下のシナリオを解決する。
 * - scenarioCode 明示 → 一致するシナリオ
 * - groupName から推論できる scenario_code があればそれ
 * - 上記両方無し → sort_order 最小(案β + sort_order=0 予約ルール)
 * - line_scenarios テーブル不在 → null + legacyFallback=true
 */
async function resolveScenario(
  projectId: string,
  scenarioCode: string | null,
  groupName: string | null,
): Promise<{ scenario: ScenarioRow | null; legacyFallback: boolean; error?: string }> {
  const inferredCode = scenarioCode ?? mapGroupToScenarioCode(groupName);

  if (inferredCode) {
    const r = await supabaseAdmin
      .from("line_scenarios")
      .select("id, code, sort_order, distribute_enabled, distribute_count")
      .eq("project_id", projectId)
      .eq("code", inferredCode)
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

  // sort_order 最小 fallback
  const r = await supabaseAdmin
    .from("line_scenarios")
    .select("id, code, sort_order, distribute_enabled, distribute_count")
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
 * scenario_id でアカウント絞り込み。
 * 列が無い場合は columnMissing=true を返し、呼び出し側で従来パス(group_name 等)にフォールバック。
 */
async function fetchAccountsByScenario(scenarioId: string): Promise<{
  accounts: AccountRow[];
  columnMissing: boolean;
  error?: string;
}> {
  // order_index あり版を試行
  let r = await supabaseAdmin
    .from("line_accounts")
    .select("id, basic_id, account_name, role, order_index, is_active, group_name")
    .eq("scenario_id", scenarioId)
    .eq("is_active", true);
  if (r.error && /order_index/.test(r.error.message)) {
    const fb = await supabaseAdmin
      .from("line_accounts")
      .select("id, basic_id, account_name, role, is_active, group_name")
      .eq("scenario_id", scenarioId)
      .eq("is_active", true);
    if (fb.error) {
      if (/scenario_id/i.test(fb.error.message)) {
        return { accounts: [], columnMissing: true };
      }
      return { accounts: [], columnMissing: false, error: fb.error.message };
    }
    const rows = (fb.data ?? []) as Array<Omit<AccountRow, "order_index">>;
    return {
      accounts: rows.map((a) => ({ ...a, order_index: 0 })),
      columnMissing: false,
    };
  }
  if (r.error) {
    if (/scenario_id/i.test(r.error.message)) {
      return { accounts: [], columnMissing: true };
    }
    return { accounts: [], columnMissing: false, error: r.error.message };
  }
  return { accounts: (r.data ?? []) as AccountRow[], columnMissing: false };
}

/**
 * 従来パス:project + (group_name あれば) でアカウント絞り込み
 */
async function fetchAccountsByLegacy(
  projectId: string,
  groupName: string | null,
): Promise<{ accounts: AccountRow[]; error?: string }> {
  const baseSelect = "id, basic_id, account_name, role, order_index, is_active, group_name";
  const fbSelect = "id, basic_id, account_name, role, is_active, group_name";

  let q = supabaseAdmin
    .from("line_accounts")
    .select(baseSelect)
    .eq("project_id", projectId)
    .eq("is_active", true);
  if (groupName) q = q.eq("group_name", groupName);
  const r = await q;
  if (r.error && /order_index/.test(r.error.message)) {
    let fbq = supabaseAdmin
      .from("line_accounts")
      .select(fbSelect)
      .eq("project_id", projectId)
      .eq("is_active", true);
    if (groupName) fbq = fbq.eq("group_name", groupName);
    const fb = await fbq;
    if (fb.error) {
      return { accounts: [], error: fb.error.message };
    }
    const rows = (fb.data ?? []) as Array<Omit<AccountRow, "order_index">>;
    return { accounts: rows.map((a) => ({ ...a, order_index: 0 })) };
  }
  if (r.error) {
    return { accounts: [], error: r.error.message };
  }
  return { accounts: (r.data ?? []) as AccountRow[] };
}

export async function GET(request: NextRequest) {
  const projectCode = request.nextUrl.searchParams.get("project")?.trim();
  const scenarioCode = request.nextUrl.searchParams.get("scenario")?.trim() || null;
  const groupName = request.nextUrl.searchParams.get("group")?.trim() || null;
  const lineUserId = request.nextUrl.searchParams.get("user_id")?.trim();

  if (!projectCode) {
    return Response.json({ success: false, error: "project code is required" }, { status: 400 });
  }

  // project 解決 (+ distribute_* も取得、カラム未作成 fallback 付き)
  let project: {
    id: string;
    name: string;
    code: string | null;
    distribute_enabled?: boolean | null;
    distribute_count?: number | null;
  } | null = null;
  {
    const r = await supabaseAdmin
      .from("line_projects")
      .select("id, name, code, distribute_enabled, distribute_count")
      .eq("code", projectCode)
      .maybeSingle();
    if (r.error && /distribute_enabled|distribute_count/.test(r.error.message)) {
      const fb = await supabaseAdmin
        .from("line_projects")
        .select("id, name, code")
        .eq("code", projectCode)
        .maybeSingle();
      if (fb.error) {
        return Response.json({ success: false, error: fb.error.message }, { status: 500 });
      }
      project = fb.data
        ? { ...(fb.data as { id: string; name: string; code: string | null }), distribute_enabled: false, distribute_count: 1 }
        : null;
    } else if (r.error) {
      return Response.json({ success: false, error: r.error.message }, { status: 500 });
    } else {
      project = r.data as typeof project;
    }
  }

  if (!project) {
    return Response.json({ success: false, error: `project not found: ${projectCode}` }, { status: 404 });
  }

  // ============================================================
  // scenario 解決(段階5、Step 01 適用後はこちら優先)
  // ============================================================
  const scenarioResult = await resolveScenario(project.id, scenarioCode, groupName);
  if (scenarioResult.error) {
    return Response.json({ success: false, error: `scenario lookup failed: ${scenarioResult.error}` }, { status: 500 });
  }

  // distribute_enabled / distribute_count は scenario 値優先、なければ project 値
  const scenario = scenarioResult.scenario;
  const distributeEnabled = scenario
    ? !!scenario.distribute_enabled
    : !!project.distribute_enabled;
  const distributeCount = scenario
    ? scenario.distribute_count ?? 1
    : project.distribute_count ?? 1;

  // ============================================================
  // 非分散案件: main 1件だけ返す (MARI 互換、従来挙動維持)
  // ============================================================
  if (!distributeEnabled) {
    let accounts: AccountRow[] = [];
    if (scenario && !scenarioResult.legacyFallback) {
      const sc = await fetchAccountsByScenario(scenario.id);
      if (sc.error) {
        return Response.json({ success: false, error: sc.error }, { status: 500 });
      }
      if (sc.columnMissing) {
        // scenario_id 列が無い(Step 02 未適用)→ project + group fallback
        const fb = await fetchAccountsByLegacy(project.id, null);
        if (fb.error) {
          return Response.json({ success: false, error: fb.error }, { status: 500 });
        }
        accounts = fb.accounts;
      } else {
        accounts = sc.accounts;
      }
    } else {
      // line_scenarios 不在 or scenario が見つからない → 従来パス
      const fb = await fetchAccountsByLegacy(project.id, null);
      if (fb.error) {
        return Response.json({ success: false, error: fb.error }, { status: 500 });
      }
      accounts = fb.accounts;
    }

    const main = accounts.find((a) => a.role === "main");
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
    const bid = main.basic_id.replace(/^@/, "");
    return Response.json({
      success: true,
      distributeEnabled: false,
      distributeCount: 1,
      scenarioCode: scenario?.code ?? null,
      accounts: [
        {
          id: main.id,
          basic_id: bid,
          account_name: main.account_name,
          order_index: 1,
          role: "main",
          addUrl: `https://line.me/R/ti/p/@${bid}`,
        },
      ],
    });
  }

  // ============================================================
  // 分散案件: 振り分け方式
  // ============================================================
  // scenario 経由なら group クエリは省略可(scenario 自体がグループを表現)
  // scenario 未解決の従来パスでは group クエリ必須(MARI 以外)
  if (!scenario && !groupName) {
    return Response.json(
      {
        success: false,
        error: "group_required",
        message:
          "分散案件では group クエリパラメータ(または scenario クエリ)が必須です。例: ?project=threads&group=ウマトク または ?project=threads&scenario=umatoku",
      },
      { status: 400 },
    );
  }

  // アカウント取得
  let accounts: AccountRow[] = [];
  if (scenario && !scenarioResult.legacyFallback) {
    const sc = await fetchAccountsByScenario(scenario.id);
    if (sc.error) {
      return Response.json({ success: false, error: sc.error }, { status: 500 });
    }
    if (sc.columnMissing) {
      // scenario_id 列が無い(Step 02 未適用)→ project + group_name の従来パス
      if (!groupName) {
        return Response.json(
          { success: false, error: "scenario_id 列が無いため group クエリが必須です" },
          { status: 400 },
        );
      }
      const fb = await fetchAccountsByLegacy(project.id, groupName);
      if (fb.error) {
        return Response.json({ success: false, error: fb.error }, { status: 500 });
      }
      accounts = fb.accounts;
    } else {
      accounts = sc.accounts;
    }
  } else {
    // 従来パス
    const fb = await fetchAccountsByLegacy(project.id, groupName);
    if (fb.error) {
      return Response.json({ success: false, error: fb.error }, { status: 500 });
    }
    accounts = fb.accounts;
  }

  // main + distribute のみ + basic_id あり
  const targets = accounts
    .filter((a) => (a.role === "main" || a.role === "distribute") && !!a.basic_id)
    .sort((a, b) => {
      const oa = a.order_index ?? 0;
      const ob = b.order_index ?? 0;
      if (oa !== ob) return oa - ob;
      // 同 order_index の場合は main を優先
      if (a.role === "main" && b.role !== "main") return -1;
      if (b.role === "main" && a.role !== "main") return 1;
      return 0;
    });

  if (targets.length === 0) {
    return Response.json(
      {
        success: false,
        error: `振り分け対象アカウントがありません (project=${projectCode}, scenario=${scenario?.code ?? "(none)"}, group=${groupName ?? "(none)"})`,
      },
      { status: 404 },
    );
  }

  const targetIds = targets.map((t) => t.id);

  // ============================================================
  // 振り分けロジック
  // ============================================================
  // (a) user_id 指定時、既存 follower があればそのアカウントを返す(再振り分けしない)
  // (b) なければ friend 数最少 + order_index 昇順タイブレーカーで選ぶ
  // ============================================================

  let assignedAccountId: string | null = null;

  if (lineUserId) {
    const { data: existing, error: fErr } = await supabaseAdmin
      .from("line_followers")
      .select("line_account_id, status")
      .eq("line_user_id", lineUserId)
      .in("line_account_id", targetIds);
    if (fErr) {
      return Response.json(
        { success: false, error: `follower lookup failed: ${fErr.message}` },
        { status: 500 },
      );
    }
    if (existing && existing.length > 0) {
      // status='following' を優先、なければ最初の1件(unfollowed 等の状態でも account を返す)
      const following = existing.find((f) => f.status === "following");
      assignedAccountId = ((following ?? existing[0]).line_account_id as string) ?? null;
    }
  }

  // 振り分けロジック(既存 follower なし、または user_id 未指定の場合)
  if (!assignedAccountId) {
    const { data: followerRows, error: countErr } = await supabaseAdmin
      .from("line_followers")
      .select("line_account_id")
      .in("line_account_id", targetIds)
      .eq("status", "following");
    if (countErr) {
      return Response.json(
        { success: false, error: `follower count failed: ${countErr.message}` },
        { status: 500 },
      );
    }
    const countMap = new Map<string, number>();
    for (const id of targetIds) countMap.set(id, 0);
    for (const row of followerRows ?? []) {
      const id = row.line_account_id as string;
      countMap.set(id, (countMap.get(id) ?? 0) + 1);
    }
    // targets は order_index 昇順でソート済みなので、
    // 同数なら先頭(order_index 最少)が選ばれる
    let minCount = Infinity;
    let chosen: AccountRow | null = null;
    for (const t of targets) {
      const c = countMap.get(t.id) ?? 0;
      if (c < minCount) {
        minCount = c;
        chosen = t;
      }
    }
    if (chosen) {
      assignedAccountId = chosen.id;
    }
  }

  // 選ばれたアカウントを特定
  const assigned = targets.find((t) => t.id === assignedAccountId);
  if (!assigned || !assigned.basic_id) {
    return Response.json(
      { success: false, error: "振り分けたアカウントが特定できません" },
      { status: 500 },
    );
  }

  const bid = assigned.basic_id.replace(/^@/, "");

  return Response.json({
    success: true,
    distributeEnabled: true,
    distributeCount, // 参考値(振り分け方式では返却は常に1件)
    scenarioCode: scenario?.code ?? null,
    assignedAccountId: assigned.id,
    accounts: [
      {
        id: assigned.id,
        basic_id: bid,
        account_name: assigned.account_name,
        order_index: assigned.order_index ?? 0,
        role: assigned.role,
        addUrl: `https://line.me/R/ti/p/@${bid}`,
      },
    ],
  });
}

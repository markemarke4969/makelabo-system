import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";

// ============================================================
// 案件管理 API(段階5 案B 対応・後方互換維持)
// ============================================================
// GET:projects 一覧 + 各 project に紐付く scenarios 配列(line_scenarios 利用可能時のみ)
//      line_scenarios 不在(Step 01 未適用)の場合は各 project の scenarios=[] で返却
// POST:project 新規作成(既存挙動維持)
// PUT:project 更新 + オプションで scenarios 配列を受け取り line_scenarios も更新
//     scenarios 配列が指定されなければ従来挙動(line_projects のみ更新)
//     段階移行期は line_projects.distribute_* と line_scenarios.distribute_* の二重書きで両立
// DELETE:既存挙動維持
//
// 草案出典: C:\Users\lmsml\.claude\plans\07-calm-pudding.md §11(中優先度・projects)
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

interface ScenarioInput {
  id?: string;
  code?: string;
  name?: string;
  distribute_enabled?: boolean;
  distribute_count?: number;
  reserve_count?: number;
  ban_sync_enabled?: boolean;
  sort_order?: number;
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
    throw new Error(`scenarios fetch: ${r.error.message}`);
  }
  return (r.data ?? []) as ScenarioRow[];
}

export async function GET() {
  const { data, error } = await supabase
    .from("line_projects")
    .select("*")
    .order("sort_order", { ascending: true });

  if (error) return Response.json({ error: error.message }, { status: 500 });

  // line_scenarios を取得して各 project に scenarios 配列を埋め込む
  let scenarios: ScenarioRow[] | null = null;
  try {
    scenarios = await fetchAllScenarios();
  } catch (e) {
    // scenario fetch のエラーは projects 一覧の取得を妨げない(既存 UI 互換)
    console.warn("[projects GET] scenarios fetch failed:", (e as Error).message);
    scenarios = null;
  }

  const projects = (data ?? []) as Array<Record<string, unknown> & { id: string }>;
  const enriched = projects.map((p) => ({
    ...p,
    scenarios:
      scenarios === null
        ? [] // line_scenarios 不在 → 空配列(UI 側で従来表示にフォールバック)
        : scenarios.filter((s) => s.project_id === p.id),
  }));

  return Response.json(enriched);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const {
    name, description, color, sort_order, code,
    ban_sync_enabled,
    distribute_enabled, distribute_count, reserve_count,
  } = body;

  if (!name || !String(name).trim()) {
    return Response.json({ error: "name is required" }, { status: 400 });
  }

  const insertBody: Record<string, unknown> = {
    name: String(name).trim(),
    description: description?.trim() || null,
    color: color || "#06C755",
    sort_order: Number.isFinite(Number(sort_order)) ? Number(sort_order) : 0,
  };
  if (typeof code === "string" && code.trim()) {
    insertBody.code = code.trim();
  }
  if (typeof ban_sync_enabled === "boolean") {
    insertBody.ban_sync_enabled = ban_sync_enabled;
  }
  if (typeof distribute_enabled === "boolean") {
    insertBody.distribute_enabled = distribute_enabled;
  }
  if (Number.isFinite(Number(distribute_count))) {
    insertBody.distribute_count = Number(distribute_count);
  }
  if (Number.isFinite(Number(reserve_count))) {
    insertBody.reserve_count = Number(reserve_count);
  }

  let { data, error } = await supabase
    .from("line_projects")
    .insert(insertBody)
    .select("*")
    .single();

  // distribute_* カラム未作成環境への fallback
  if (error && /distribute_enabled|distribute_count|reserve_count/.test(error.message)) {
    const retry = { ...insertBody };
    delete retry.distribute_enabled;
    delete retry.distribute_count;
    delete retry.reserve_count;
    ({ data, error } = await supabase
      .from("line_projects")
      .insert(retry)
      .select("*")
      .single());
  }

  // ban_sync_enabled カラム未作成環境への fallback
  if (error && /ban_sync_enabled/.test(error.message)) {
    const retry = { ...insertBody };
    delete retry.ban_sync_enabled;
    delete retry.distribute_enabled;
    delete retry.distribute_count;
    delete retry.reserve_count;
    ({ data, error } = await supabase
      .from("line_projects")
      .insert(retry)
      .select("*")
      .single());
  }

  if (error) {
    console.error("[projects POST] error:", error);
    const code = (error as { code?: string }).code;
    if (code === "23505") {
      return Response.json({ error: `案件名「${name}」は既に存在します` }, { status: 400 });
    }
    if (code === "42P01") {
      return Response.json({ error: "line_projects テーブルが存在しません" }, { status: 500 });
    }
    return Response.json({ error: error.message, code }, { status: 500 });
  }

  return Response.json({ ok: true, project: data });
}

export async function PUT(request: NextRequest) {
  const body = await request.json();
  const {
    id, name, description, color, sort_order, code,
    ban_sync_enabled,
    distribute_enabled, distribute_count, reserve_count,
    scenarios, // 段階5 案B:scenario 配列(オプション、line_scenarios 更新用)
  } = body as Record<string, unknown> & { id?: string; scenarios?: ScenarioInput[] };

  if (!id) {
    return Response.json({ error: "id is required" }, { status: 400 });
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (name !== undefined) updates.name = String(name).trim();
  if (description !== undefined) updates.description = (description as string | null | undefined)?.toString().trim() || null;
  if (color !== undefined) updates.color = color;
  if (sort_order !== undefined) updates.sort_order = Number(sort_order) || 0;
  if (code !== undefined) {
    const trimmed = typeof code === "string" ? code.trim() : "";
    updates.code = trimmed || null;
  }
  if (typeof ban_sync_enabled === "boolean") {
    updates.ban_sync_enabled = ban_sync_enabled;
  }
  if (typeof distribute_enabled === "boolean") {
    updates.distribute_enabled = distribute_enabled;
  }
  if (distribute_count !== undefined && Number.isFinite(Number(distribute_count))) {
    updates.distribute_count = Number(distribute_count);
  }
  if (reserve_count !== undefined && Number.isFinite(Number(reserve_count))) {
    updates.reserve_count = Number(reserve_count);
  }

  let { error } = await supabase.from("line_projects").update(updates).eq("id", id);

  // updated_at カラム未作成の場合は fallback
  if (error && /updated_at/.test(error.message)) {
    const { updated_at: _omit, ...rest } = updates as Record<string, unknown>;
    void _omit;
    ({ error } = await supabase.from("line_projects").update(rest).eq("id", id));
  }

  // distribute_* カラム未作成環境への fallback(Step 13 適用後を含む)
  if (error && /distribute_enabled|distribute_count|reserve_count/.test(error.message)) {
    const retry = { ...updates };
    delete retry.distribute_enabled;
    delete retry.distribute_count;
    delete retry.reserve_count;
    ({ error } = await supabase.from("line_projects").update(retry).eq("id", id));
  }

  // ban_sync_enabled カラム未作成環境への fallback(Step 13 適用後を含む)
  if (error && /ban_sync_enabled/.test(error.message)) {
    const retry = { ...updates };
    delete retry.ban_sync_enabled;
    delete retry.distribute_enabled;
    delete retry.distribute_count;
    delete retry.reserve_count;
    ({ error } = await supabase.from("line_projects").update(retry).eq("id", id));
  }

  if (error) {
    const pgCode = (error as { code?: string }).code;
    if (pgCode === "23505") {
      return Response.json(
        { error: `案件コード「${code}」は既に使われています。別のコードにしてください。` },
        { status: 400 },
      );
    }
    return Response.json({ error: error.message }, { status: 500 });
  }

  // ============================================================
  // 段階5 案B:scenarios 配列が含まれていれば line_scenarios も更新(段階移行期の二重書き)
  // ============================================================
  // - 既存 scenario(id 指定):distribute_* / ban_sync_enabled / sort_order / name / code を更新
  // - line_scenarios 不在(Step 01 未適用)の場合:エラーを握りつぶし、project レベル更新のみ成功扱い
  // - 本タスクでは新規 scenario の INSERT は扱わない(別エンドポイントまたは別タスクで)
  // ============================================================
  const scenarioErrors: string[] = [];
  if (Array.isArray(scenarios) && scenarios.length > 0) {
    for (const s of scenarios) {
      if (!s || typeof s !== "object" || !s.id) continue;
      const sUpdates: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (typeof s.name === "string") sUpdates.name = s.name.trim();
      if (typeof s.code === "string") sUpdates.code = s.code.trim();
      if (typeof s.distribute_enabled === "boolean") sUpdates.distribute_enabled = s.distribute_enabled;
      if (Number.isFinite(Number(s.distribute_count))) sUpdates.distribute_count = Number(s.distribute_count);
      if (Number.isFinite(Number(s.reserve_count))) sUpdates.reserve_count = Number(s.reserve_count);
      if (typeof s.ban_sync_enabled === "boolean") sUpdates.ban_sync_enabled = s.ban_sync_enabled;
      if (Number.isFinite(Number(s.sort_order))) sUpdates.sort_order = Number(s.sort_order);

      const r = await supabase.from("line_scenarios").update(sUpdates).eq("id", s.id);
      if (r.error) {
        if (/line_scenarios/i.test(r.error.message) || r.error.code === "PGRST205") {
          // テーブル不在 → 後方互換、scenarios 更新は無視して project 更新だけで成功扱い
          scenarioErrors.push("line_scenarios table missing (Step 01 unapplied)");
          break; // 以降の scenario も無意味なので中断
        }
        scenarioErrors.push(`scenario ${s.id}: ${r.error.message}`);
      }
    }
  }

  return Response.json({ ok: true, scenarioErrors: scenarioErrors.length > 0 ? scenarioErrors : undefined });
}

export async function DELETE(request: NextRequest) {
  const body = await request.json();
  const { id } = body;

  if (!id) {
    return Response.json({ error: "id is required" }, { status: 400 });
  }

  // 紐付く user_projects を先に削除（FK 対策）
  await supabase.from("line_user_projects").delete().eq("project_id", id);

  const { error } = await supabase.from("line_projects").delete().eq("id", id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}

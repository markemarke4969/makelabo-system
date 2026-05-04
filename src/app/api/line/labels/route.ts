import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";
import { resolveAccountIdsFromScenario, resolveScenarioFromAccount } from "@/lib/scenario-resolve";

// ------------------------------------------------------------
// GET /api/line/labels?account_id=<uuid> または ?scenario_id=<uuid>
//   → ラベル一覧 + 付与済みフォロワーID配列を返す
//   レスポンス: [{ id, name, color, sort_order, assigned_user_ids: string[] }]
//   assigned_user_ids は line_followers.line_user_id を採用（UI 側が line_user_id で扱っているため）
//
// 段階6c2: scenario_id クエリ追加(配下 account_ids 解決 → IN 句集約)。
// 同名ラベルが配下複数 account にある場合は N 個重複表示(段階7 で schema 移行 + マージ)。
// ------------------------------------------------------------
export async function GET(request: NextRequest) {
  const accountId = request.nextUrl.searchParams.get("account_id");
  const scenarioId = request.nextUrl.searchParams.get("scenario_id");
  if (!accountId && !scenarioId) {
    return Response.json({ error: "account_id or scenario_id is required" }, { status: 400 });
  }

  // 段階7-A2: 案 Y(過渡期ハイブリッド)直 hit 化
  // - scenario_id 直 hit(7-A1 で列追加済、部分インデックス活用)
  // - OR 句で「scenario_id NULL かつ配下 account_id IN 句」も拾う(MARI 既存 row 後方互換、過渡期)
  // - 段階8 で scenario_id バックフィル完了後、OR 句後半部分を除去する cleanup PR で技術負債解消
  let lblQuery = supabase
    .from("line_labels")
    .select("id, name, color, sort_order, created_at")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });
  if (scenarioId && !accountId) {
    const resolved = await resolveAccountIdsFromScenario(scenarioId);
    if (resolved.account_ids.length === 0) {
      lblQuery = lblQuery.eq("scenario_id", scenarioId);
    } else {
      const idsList = resolved.account_ids.map((id) => `"${id}"`).join(",");
      lblQuery = lblQuery.or(`scenario_id.eq.${scenarioId},and(scenario_id.is.null,account_id.in.(${idsList}))`);
    }
  } else if (accountId) {
    lblQuery = lblQuery.eq("account_id", accountId);
  }

  let { data: labels, error: lblErr } = await lblQuery;

  // 7-A1 未適用環境 fallback(本番では発火しない想定):scenario_id 列なしエラー → IN 句集約に切替
  if (lblErr && scenarioId && !accountId && /scenario_id/i.test(lblErr.message)) {
    const resolved = await resolveAccountIdsFromScenario(scenarioId);
    if (resolved.account_ids.length === 0) return Response.json([]);
    const fb = await supabase
      .from("line_labels")
      .select("id, name, color, sort_order, created_at")
      .in("account_id", resolved.account_ids)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: false });
    labels = fb.data;
    lblErr = fb.error;
  }

  if (lblErr) {
    return Response.json({ error: lblErr.message }, { status: 500 });
  }

  const labelIds = (labels ?? []).map((l) => l.id as string);
  if (labelIds.length === 0) {
    return Response.json([]);
  }

  // 付与関係を取得 → follower_id → line_user_id の逆引き
  const { data: assigns, error: asErr } = await supabase
    .from("line_follower_labels")
    .select("label_id, follower_id")
    .in("label_id", labelIds);

  if (asErr) {
    return Response.json({ error: asErr.message }, { status: 500 });
  }

  const followerIds = Array.from(new Set((assigns ?? []).map((a) => a.follower_id as string)));
  const idToUserId = new Map<string, string>();
  if (followerIds.length > 0) {
    const { data: fols } = await supabase
      .from("line_followers")
      .select("id, line_user_id")
      .in("id", followerIds);
    for (const f of fols ?? []) {
      idToUserId.set(f.id as string, f.line_user_id as string);
    }
  }

  const assignedMap = new Map<string, string[]>();
  for (const a of assigns ?? []) {
    const userId = idToUserId.get(a.follower_id as string);
    if (!userId) continue;
    const arr = assignedMap.get(a.label_id as string) ?? [];
    arr.push(userId);
    assignedMap.set(a.label_id as string, arr);
  }

  const result = (labels ?? []).map((l) => ({
    id: l.id,
    name: l.name,
    color: l.color,
    sort_order: l.sort_order,
    created_at: l.created_at,
    assigned_users: assignedMap.get(l.id as string) ?? [],
  }));

  return Response.json(result);
}

// ------------------------------------------------------------
// POST /api/line/labels
//   body: { account_id, name, color?, sort_order? }
// ------------------------------------------------------------
export async function POST(request: NextRequest) {
  const body = await request.json();
  if (!body.account_id || !body.name) {
    return Response.json({ error: "account_id and name are required" }, { status: 400 });
  }

  // 段階8-2-E-1: account_id から scenario_id を解決して INSERT に同梱(段階7-A1 負債清算)
  const { scenario_id: resolvedScenarioId } = await resolveScenarioFromAccount(body.account_id);

  const { data, error } = await supabase
    .from("line_labels")
    .insert({
      account_id: body.account_id,
      scenario_id: resolvedScenarioId,
      name: body.name,
      color: body.color ?? "#3B82F6",
      sort_order: body.sort_order ?? 0,
    })
    .select("id, name, color, sort_order, created_at")
    .single();

  if (error) {
    const pgCode = (error as { code?: string }).code;
    if (pgCode === "23505") {
      return Response.json(
        { error: `ラベル名「${body.name}」は既に存在します` },
        { status: 400 },
      );
    }
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ ok: true, label: { ...data, assigned_users: [] } });
}

// ------------------------------------------------------------
// PATCH /api/line/labels
//   body: { id, name?, color?, sort_order? }
// ------------------------------------------------------------
export async function PATCH(request: NextRequest) {
  const body = await request.json();
  if (!body.id) {
    return Response.json({ error: "id is required" }, { status: 400 });
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.name !== undefined) updates.name = body.name;
  if (body.color !== undefined) updates.color = body.color;
  if (body.sort_order !== undefined) updates.sort_order = body.sort_order;

  const { error } = await supabase
    .from("line_labels")
    .update(updates)
    .eq("id", body.id);

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
  return Response.json({ ok: true });
}

// ------------------------------------------------------------
// DELETE /api/line/labels
//   body: { id }
// ------------------------------------------------------------
export async function DELETE(request: NextRequest) {
  const body = await request.json();
  if (!body.id) {
    return Response.json({ error: "id is required" }, { status: 400 });
  }

  const { error } = await supabase
    .from("line_labels")
    .delete()
    .eq("id", body.id);

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
  return Response.json({ ok: true });
}

import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";
import { resolveAccountIdsFromScenario, resolveScenarioFromAccount } from "@/lib/scenario-resolve";

// 段階6c2: scenario_id クエリ追加(配下 account_ids 解決 → IN 句集約)。

// ------------------------------------------------------------
// GET /api/line/action-rules?account_id=<uuid> または ?scenario_id=<uuid>
// ------------------------------------------------------------
export async function GET(request: NextRequest) {
  const accountId = request.nextUrl.searchParams.get("account_id");
  const scenarioId = request.nextUrl.searchParams.get("scenario_id");
  if (!accountId && !scenarioId) {
    return Response.json({ error: "account_id or scenario_id is required" }, { status: 400 });
  }

  // 段階7-A2: 案 Y(過渡期ハイブリッド)直 hit 化
  let query = supabase
    .from("line_action_rules")
    .select("*")
    .order("created_at", { ascending: false });
  if (scenarioId && !accountId) {
    const resolved = await resolveAccountIdsFromScenario(scenarioId);
    if (resolved.account_ids.length === 0) {
      query = query.eq("scenario_id", scenarioId);
    } else {
      const idsList = resolved.account_ids.map((id) => `"${id}"`).join(",");
      query = query.or(`scenario_id.eq.${scenarioId},and(scenario_id.is.null,account_id.in.(${idsList}))`);
    }
  } else if (accountId) {
    query = query.eq("account_id", accountId);
  }

  let { data, error } = await query;

  // 7-A1 未適用環境 fallback
  if (error && scenarioId && !accountId && /scenario_id/i.test(error.message)) {
    const resolved = await resolveAccountIdsFromScenario(scenarioId);
    if (resolved.account_ids.length === 0) return Response.json([]);
    ({ data, error } = await supabase
      .from("line_action_rules")
      .select("*")
      .in("account_id", resolved.account_ids)
      .order("created_at", { ascending: false }));
  }

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
  return Response.json(data ?? []);
}

// ------------------------------------------------------------
// POST /api/line/action-rules
//   body: {
//     account_id, name, status?,
//     trigger_type, trigger_config?,
//     conditions?, action_type, action_config
//   }
// ------------------------------------------------------------
export async function POST(request: NextRequest) {
  const body = await request.json();
  if (!body.account_id || !body.name || !body.trigger_type || !body.action_type) {
    return Response.json(
      { error: "account_id, name, trigger_type, action_type are required" },
      { status: 400 },
    );
  }

  // 段階8-2-E-1: account_id から scenario_id を解決して INSERT に同梱(段階7-A1 負債清算)
  const { scenario_id: resolvedScenarioId } = await resolveScenarioFromAccount(body.account_id);

  const { data, error } = await supabase
    .from("line_action_rules")
    .insert({
      account_id: body.account_id,
      scenario_id: resolvedScenarioId,
      name: body.name,
      status: body.status ?? "active",
      trigger_type: body.trigger_type,
      trigger_config: body.trigger_config ?? {},
      conditions: body.conditions ?? [],
      action_type: body.action_type,
      action_config: body.action_config ?? {},
    })
    .select("id")
    .single();

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
  return Response.json({ ok: true, id: data.id });
}

// ------------------------------------------------------------
// PATCH /api/line/action-rules
//   body: { id, ...updates }
// ------------------------------------------------------------
export async function PATCH(request: NextRequest) {
  const body = await request.json();
  if (!body.id) {
    return Response.json({ error: "id is required" }, { status: 400 });
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const k of [
    "name",
    "status",
    "trigger_type",
    "trigger_config",
    "conditions",
    "action_type",
    "action_config",
  ]) {
    if (body[k] !== undefined) updates[k] = body[k];
  }

  const { error } = await supabase
    .from("line_action_rules")
    .update(updates)
    .eq("id", body.id);

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
  return Response.json({ ok: true });
}

// ------------------------------------------------------------
// DELETE /api/line/action-rules
// ------------------------------------------------------------
export async function DELETE(request: NextRequest) {
  const body = await request.json();
  if (!body.id) {
    return Response.json({ error: "id is required" }, { status: 400 });
  }

  const { error } = await supabase
    .from("line_action_rules")
    .delete()
    .eq("id", body.id);

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
  return Response.json({ ok: true });
}

import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";

// ------------------------------------------------------------
// GET /api/line/action-rules?account_id=<uuid>
// ------------------------------------------------------------
export async function GET(request: NextRequest) {
  const accountId = request.nextUrl.searchParams.get("account_id");
  if (!accountId) {
    return Response.json({ error: "account_id is required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("line_action_rules")
    .select("*")
    .eq("account_id", accountId)
    .order("created_at", { ascending: false });

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

  const { data, error } = await supabase
    .from("line_action_rules")
    .insert({
      account_id: body.account_id,
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

import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";
import { resolveAccountIdsFromScenario } from "@/lib/scenario-resolve";

// 段階6b2: scenario_id クエリ追加(scenario 配下統合表示)。
// line_newsletters には scenario_id 列なし(段階7 で schema 移行検討)→ IN 句集約。

export async function GET(request: NextRequest) {
  const accountId = request.nextUrl.searchParams.get("account_id");
  const scenarioId = request.nextUrl.searchParams.get("scenario_id");
  if (!accountId && !scenarioId) {
    return Response.json({ error: "account_id or scenario_id is required" }, { status: 400 });
  }

  let scenarioAccountIds: string[] | null = null;
  if (scenarioId && !accountId) {
    const resolved = await resolveAccountIdsFromScenario(scenarioId);
    if (resolved.account_ids.length === 0) return Response.json([]);
    scenarioAccountIds = resolved.account_ids;
  }

  let query = supabase
    .from("line_newsletters")
    .select("*")
    .order("created_at", { ascending: false });
  if (scenarioAccountIds) query = query.in("account_id", scenarioAccountIds);
  else if (accountId) query = query.eq("account_id", accountId);

  const { data, error } = await query;

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data ?? []);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  if (!body.account_id || !body.name) {
    return Response.json({ error: "account_id and name are required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("line_newsletters")
    .insert({
      account_id: body.account_id,
      name: body.name,
      subject: body.subject || "",
      body_html: body.body_html || "",
      body_text: body.body_text || "",
      status: body.status || "draft",
      scheduled_at: body.scheduled_at || null,
      target_condition: body.target_condition ?? null,
    })
    .select("id")
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true, id: data!.id });
}

export async function PUT(request: NextRequest) {
  const body = await request.json();
  if (!body.id) return Response.json({ error: "id is required" }, { status: 400 });

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.name !== undefined) updates.name = body.name;
  if (body.subject !== undefined) updates.subject = body.subject;
  if (body.body_html !== undefined) updates.body_html = body.body_html;
  if (body.body_text !== undefined) updates.body_text = body.body_text;
  if (body.status !== undefined) updates.status = body.status;
  if (body.scheduled_at !== undefined) updates.scheduled_at = body.scheduled_at;

  const { error } = await supabase
    .from("line_newsletters")
    .update(updates)
    .eq("id", body.id);

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const body = await request.json();
  if (!body.id) return Response.json({ error: "id is required" }, { status: 400 });

  const { error } = await supabase.from("line_newsletters").delete().eq("id", body.id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}

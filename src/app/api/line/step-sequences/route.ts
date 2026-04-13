import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  const accountId = request.nextUrl.searchParams.get("account_id");
  const kind = request.nextUrl.searchParams.get("kind");

  let query = supabase
    .from("line_step_sequences")
    .select("*, messages:line_step_messages(*)")
    .order("created_at", { ascending: false });

  if (accountId) query = query.eq("account_id", accountId);
  if (kind) query = query.eq("kind", kind);

  const { data, error } = await query;

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  // Sort nested messages by step_order
  const sorted = (data ?? []).map((seq: any) => ({
    ...seq,
    messages: (seq.messages ?? []).sort(
      (a: any, b: any) => a.step_order - b.step_order
    ),
  }));

  return Response.json(sorted);
}

export async function POST(request: NextRequest) {
  const body = await request.json();

  if (!body.account_id || !body.name) {
    return Response.json({ error: "account_id and name are required" }, { status: 400 });
  }

  const insertRow: Record<string, unknown> = {
    account_id: body.account_id,
    name: body.name,
  };
  if (body.kind !== undefined) insertRow.kind = body.kind;
  if (body.scheduled_at !== undefined) insertRow.scheduled_at = body.scheduled_at;
  if (body.target_condition !== undefined) insertRow.target_condition = body.target_condition;

  let { data, error } = await supabase
    .from("line_step_sequences")
    .insert(insertRow)
    .select("id")
    .single();

  // kind/scheduled_at カラム未作成環境への fallback
  if (error && /(kind|scheduled_at|target_condition)/.test(error.message)) {
    const fb = await supabase
      .from("line_step_sequences")
      .insert({ account_id: body.account_id, name: body.name })
      .select("id")
      .single();
    data = fb.data;
    error = fb.error;
  }

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ ok: true, id: data!.id });
}

export async function PUT(request: NextRequest) {
  const body = await request.json();

  if (!body.id) {
    return Response.json({ error: "id is required" }, { status: 400 });
  }

  const updates: Record<string, any> = {
    updated_at: new Date().toISOString(),
  };
  if (body.name !== undefined) updates.name = body.name;
  if (body.status !== undefined) updates.status = body.status;
  if (body.kind !== undefined) updates.kind = body.kind;
  if (body.scheduled_at !== undefined) updates.scheduled_at = body.scheduled_at;
  if (body.sent_at !== undefined) updates.sent_at = body.sent_at;
  if (body.target_condition !== undefined) updates.target_condition = body.target_condition;

  let { error } = await supabase
    .from("line_step_sequences")
    .update(updates)
    .eq("id", body.id);

  // カラム未作成環境への fallback
  if (error && /(kind|scheduled_at|sent_at|target_condition)/.test(error.message)) {
    const {
      kind: _k,
      scheduled_at: _s,
      sent_at: _sa,
      target_condition: _tc,
      ...rest
    } = updates;
    void _k; void _s; void _sa; void _tc;
    ({ error } = await supabase
      .from("line_step_sequences")
      .update(rest)
      .eq("id", body.id));
  }

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const body = await request.json();

  if (!body.id) {
    return Response.json({ error: "id is required" }, { status: 400 });
  }

  const { error } = await supabase
    .from("line_step_sequences")
    .delete()
    .eq("id", body.id);

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ ok: true });
}

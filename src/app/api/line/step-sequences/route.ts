import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  const accountId = request.nextUrl.searchParams.get("account_id");

  let query = supabase
    .from("line_step_sequences")
    .select("*, messages:line_step_messages(*)")
    .order("created_at", { ascending: false });

  if (accountId) {
    query = query.eq("account_id", accountId);
  }

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

  const { data, error } = await supabase
    .from("line_step_sequences")
    .insert({
      account_id: body.account_id,
      name: body.name,
    })
    .select("id")
    .single();

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ ok: true, id: data.id });
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

  const { error } = await supabase
    .from("line_step_sequences")
    .update(updates)
    .eq("id", body.id);

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

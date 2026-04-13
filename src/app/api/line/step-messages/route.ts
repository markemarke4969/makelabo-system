import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  const sequenceId = request.nextUrl.searchParams.get("sequence_id");

  if (!sequenceId) {
    return Response.json({ error: "sequence_id is required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("line_step_messages")
    .select("*")
    .eq("sequence_id", sequenceId)
    .order("step_order", { ascending: true });

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json(data);
}

export async function POST(request: NextRequest) {
  const body = await request.json();

  if (!body.sequence_id || body.step_order === undefined) {
    return Response.json({ error: "sequence_id and step_order are required" }, { status: 400 });
  }

  const insertRow: Record<string, unknown> = {
    sequence_id: body.sequence_id,
    step_order: body.step_order,
    delay_minutes: body.delay_minutes ?? 0,
    media: body.media || null,
    title: body.title || null,
    body: body.body || null,
    msg_type: body.msg_type || null,
    payload: body.payload ?? null,
    status: body.status || "active",
    timing_mode: body.timing_mode || "immediate",
    delivery_days: body.delivery_days ?? null,
    delivery_time: body.delivery_time ?? null,
  };

  let { data, error } = await supabase
    .from("line_step_messages")
    .insert(insertRow)
    .select("id")
    .single();

  // 古い環境（新カラム未作成）への fallback
  if (error && /(msg_type|payload|timing_mode|delivery_days|delivery_time)/.test(error.message)) {
    const { msg_type: _m, payload: _p, timing_mode: _tm, delivery_days: _dd, delivery_time: _dt, ...rest } = insertRow;
    void _m; void _p; void _tm; void _dd; void _dt;
    ({ data, error } = await supabase
      .from("line_step_messages")
      .insert(rest)
      .select("id")
      .single());
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
  if (body.step_order !== undefined) updates.step_order = body.step_order;
  if (body.delay_minutes !== undefined) updates.delay_minutes = body.delay_minutes;
  if (body.media !== undefined) updates.media = body.media;
  if (body.title !== undefined) updates.title = body.title;
  if (body.body !== undefined) updates.body = body.body;
  if (body.status !== undefined) updates.status = body.status;
  if (body.timing_mode !== undefined) updates.timing_mode = body.timing_mode;
  if (body.delivery_days !== undefined) updates.delivery_days = body.delivery_days;
  if (body.delivery_time !== undefined) updates.delivery_time = body.delivery_time;

  const { error } = await supabase
    .from("line_step_messages")
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
    .from("line_step_messages")
    .delete()
    .eq("id", body.id);

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ ok: true });
}

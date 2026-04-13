import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  const accountId = request.nextUrl.searchParams.get("account_id");
  if (!accountId) {
    return Response.json({ error: "account_id is required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("line_reminders")
    .select("*, line_reminder_messages(*)")
    .eq("account_id", accountId)
    .order("created_at", { ascending: false });

  if (error) return Response.json({ error: error.message }, { status: 500 });

  const reminders = (data ?? []).map((r: Record<string, unknown>) => ({
    ...r,
    messages: ((r.line_reminder_messages as Record<string, unknown>[]) ?? []).sort(
      (a: Record<string, unknown>, b: Record<string, unknown>) =>
        ((a.msg_order as number) ?? 0) - ((b.msg_order as number) ?? 0),
    ),
  }));

  return Response.json(reminders);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  if (!body.account_id || !body.name) {
    return Response.json({ error: "account_id and name are required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("line_reminders")
    .insert({
      account_id: body.account_id,
      name: body.name,
      base_date_field: body.base_date_field || "custom",
      status: "active",
      target_condition: body.target_condition ?? null,
    })
    .select("id")
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });

  if (body.messages && Array.isArray(body.messages) && body.messages.length > 0) {
    const msgs = body.messages.map((m: Record<string, unknown>, i: number) => ({
      reminder_id: data!.id,
      msg_order: i + 1,
      offset_days: m.offset_days ?? 0,
      offset_time: m.offset_time || "09:00",
      msg_type: m.msg_type || "text",
      payload: m.payload ?? {},
      body: m.body || null,
    }));
    const { error: msgError } = await supabase.from("line_reminder_messages").insert(msgs);
    if (msgError) return Response.json({ error: msgError.message }, { status: 500 });
  }

  return Response.json({ ok: true, id: data!.id });
}

export async function PUT(request: NextRequest) {
  const body = await request.json();
  if (!body.id) return Response.json({ error: "id is required" }, { status: 400 });

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.name !== undefined) updates.name = body.name;
  if (body.status !== undefined) updates.status = body.status;
  if (body.base_date_field !== undefined) updates.base_date_field = body.base_date_field;

  const { error } = await supabase
    .from("line_reminders")
    .update(updates)
    .eq("id", body.id);

  if (error) return Response.json({ error: error.message }, { status: 500 });

  // メッセージの更新（全削除→再挿入）
  if (body.messages && Array.isArray(body.messages)) {
    await supabase.from("line_reminder_messages").delete().eq("reminder_id", body.id);
    if (body.messages.length > 0) {
      const msgs = body.messages.map((m: Record<string, unknown>, i: number) => ({
        reminder_id: body.id,
        msg_order: i + 1,
        offset_days: m.offset_days ?? 0,
        offset_time: m.offset_time || "09:00",
        msg_type: m.msg_type || "text",
        payload: m.payload ?? {},
        body: m.body || null,
      }));
      await supabase.from("line_reminder_messages").insert(msgs);
    }
  }

  return Response.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const body = await request.json();
  if (!body.id) return Response.json({ error: "id is required" }, { status: 400 });

  const { error } = await supabase.from("line_reminders").delete().eq("id", body.id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}

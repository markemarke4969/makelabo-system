import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  const accountId = request.nextUrl.searchParams.get("account_id");
  if (!accountId) {
    return Response.json({ error: "account_id is required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("line_templates")
    .select("*, line_template_messages(*)")
    .eq("account_id", accountId)
    .order("sort_order", { ascending: true });

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  // メッセージをmsg_order順にソート
  const templates = (data ?? []).map((t: Record<string, unknown>) => ({
    ...t,
    messages: ((t.line_template_messages as Record<string, unknown>[]) ?? []).sort(
      (a: Record<string, unknown>, b: Record<string, unknown>) =>
        ((a.msg_order as number) ?? 0) - ((b.msg_order as number) ?? 0),
    ),
  }));

  return Response.json(templates);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  if (!body.account_id || !body.name) {
    return Response.json({ error: "account_id and name are required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("line_templates")
    .insert({
      account_id: body.account_id,
      name: body.name,
      group_name: body.group_name || null,
    })
    .select("id")
    .single();

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  // メッセージも一緒に作成
  if (body.messages && Array.isArray(body.messages) && body.messages.length > 0) {
    const msgs = body.messages.map((m: Record<string, unknown>, i: number) => ({
      template_id: data!.id,
      msg_order: i + 1,
      msg_type: m.msg_type || "text",
      payload: m.payload ?? {},
      body: m.body || null,
    }));
    const { error: msgError } = await supabase.from("line_template_messages").insert(msgs);
    if (msgError) {
      return Response.json({ error: msgError.message }, { status: 500 });
    }
  }

  return Response.json({ ok: true, id: data!.id });
}

export async function PUT(request: NextRequest) {
  const body = await request.json();
  if (!body.id) {
    return Response.json({ error: "id is required" }, { status: 400 });
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.name !== undefined) updates.name = body.name;
  if (body.group_name !== undefined) updates.group_name = body.group_name;
  if (body.sort_order !== undefined) updates.sort_order = body.sort_order;

  const { error } = await supabase
    .from("line_templates")
    .update(updates)
    .eq("id", body.id);

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  // メッセージの置き換え（全削除→再挿入）
  if (body.messages && Array.isArray(body.messages)) {
    await supabase.from("line_template_messages").delete().eq("template_id", body.id);
    if (body.messages.length > 0) {
      const msgs = body.messages.map((m: Record<string, unknown>, i: number) => ({
        template_id: body.id,
        msg_order: i + 1,
        msg_type: m.msg_type || "text",
        payload: m.payload ?? {},
        body: m.body || null,
      }));
      const { error: msgError } = await supabase.from("line_template_messages").insert(msgs);
      if (msgError) {
        return Response.json({ error: msgError.message }, { status: 500 });
      }
    }
  }

  return Response.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const body = await request.json();
  if (!body.id) {
    return Response.json({ error: "id is required" }, { status: 400 });
  }

  const { error } = await supabase.from("line_templates").delete().eq("id", body.id);
  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ ok: true });
}

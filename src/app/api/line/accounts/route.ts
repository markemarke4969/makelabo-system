import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  const projectId = request.nextUrl.searchParams.get("project_id");

  const buildQuery = (includeGreeting: boolean) => {
    const cols = includeGreeting
      ? "id, channel_id, account_name, basic_id, is_active, group_name, project_id, role, greeting_message"
      : "id, channel_id, account_name, basic_id, is_active, group_name, project_id, role";
    let q = supabase.from("line_accounts").select(cols).order("created_at", { ascending: false });
    if (projectId) q = q.eq("project_id", projectId);
    return q;
  };

  let { data, error } = await buildQuery(true);
  // greeting_message カラム未作成の場合は fallback
  if (error && /greeting_message/.test(error.message)) {
    ({ data, error } = await buildQuery(false));
  }

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json(data);
}

export async function POST(request: NextRequest) {
  const body = await request.json();

  const { data, error } = await supabase
    .from("line_accounts")
    .insert({
      account_name: body.account_name || null,
      channel_id: body.channel_id,
      basic_id: body.basic_id || null,
      channel_secret: body.channel_secret,
      channel_access_token: body.channel_access_token,
      group_name: body.group_name || null,
      project_id: body.project_id || null,
      role: body.role || "main",
      greeting_message: body.greeting_message || null,
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

  // 提供されたフィールドのみ更新（空文字で既存値を消さない）
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.account_name !== undefined) updates.account_name = body.account_name || null;
  if (body.channel_id !== undefined && body.channel_id !== "") updates.channel_id = body.channel_id;
  if (body.basic_id !== undefined) updates.basic_id = body.basic_id || null;
  // secret/token は空文字の場合「変更しない」扱い（GET で返していないので編集時は空になる）
  if (body.channel_secret !== undefined && body.channel_secret !== "") updates.channel_secret = body.channel_secret;
  if (body.channel_access_token !== undefined && body.channel_access_token !== "") updates.channel_access_token = body.channel_access_token;
  if (body.group_name !== undefined) updates.group_name = body.group_name || null;
  if (body.project_id !== undefined) updates.project_id = body.project_id || null;
  if (body.is_active !== undefined) updates.is_active = body.is_active;
  if (body.role !== undefined) updates.role = body.role || null;
  if (body.greeting_message !== undefined) updates.greeting_message = body.greeting_message || null;

  let { error } = await supabase
    .from("line_accounts")
    .update(updates)
    .eq("id", body.id);

  // greeting_message カラム未作成時の fallback
  if (error && /greeting_message/.test(error.message)) {
    const { greeting_message: _omit, ...rest } = updates as Record<string, unknown>;
    void _omit;
    ({ error } = await supabase.from("line_accounts").update(rest).eq("id", body.id));
  }

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const body = await request.json();
  const { id, detach } = body;

  if (!id) {
    return Response.json({ error: "id is required" }, { status: 400 });
  }

  // detach=true の場合は案件から外すだけ（project_id を null に）、行は残す
  if (detach) {
    const { error } = await supabase
      .from("line_accounts")
      .update({ project_id: null, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ ok: true, detached: true });
  }

  // 完全削除: followers と messages もカスケード削除
  await supabase.from("line_messages").delete().eq("line_account_id", id);
  await supabase.from("line_followers").delete().eq("line_account_id", id);

  const { error } = await supabase.from("line_accounts").delete().eq("id", id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}

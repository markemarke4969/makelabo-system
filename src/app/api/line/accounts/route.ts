import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  const projectId = request.nextUrl.searchParams.get("project_id");

  let query = supabase
    .from("line_accounts")
    .select("id, channel_id, account_name, basic_id, is_active, group_name, project_id")
    .order("created_at", { ascending: false });

  if (projectId) {
    query = query.eq("project_id", projectId);
  }

  const { data, error } = await query;

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

  const { error } = await supabase
    .from("line_accounts")
    .update({
      account_name: body.account_name || null,
      channel_id: body.channel_id,
      basic_id: body.basic_id || null,
      channel_secret: body.channel_secret,
      channel_access_token: body.channel_access_token,
      group_name: body.group_name || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", body.id);

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ ok: true });
}

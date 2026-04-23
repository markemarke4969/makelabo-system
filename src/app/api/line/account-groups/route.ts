import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";

// グループ設定を取得
export async function GET(request: NextRequest) {
  const projectId = request.nextUrl.searchParams.get("project_id");
  if (!projectId) {
    return Response.json({ error: "project_id is required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("line_account_groups")
    .select("*")
    .eq("project_id", projectId)
    .order("sort_order", { ascending: true });

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json(data ?? []);
}

// グループ設定をUPSERT（closer_visible等）
export async function PUT(request: NextRequest) {
  const body = await request.json();
  const { project_id, group_name, closer_visible } = body;

  if (!project_id || !group_name) {
    return Response.json({ error: "project_id and group_name are required" }, { status: 400 });
  }

  const { error } = await supabase
    .from("line_account_groups")
    .upsert(
      {
        project_id,
        group_name,
        closer_visible: !!closer_visible,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "project_id,group_name" },
    );

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ ok: true });
}

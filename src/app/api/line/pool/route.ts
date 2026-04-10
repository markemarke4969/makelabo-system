import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";

// プールにアカウントを追加
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { project_id, account_id } = body;

  if (!project_id || !account_id) {
    return Response.json({ error: "project_id and account_id are required" }, { status: 400 });
  }

  const { error } = await supabase
    .from("line_account_pool")
    .insert({ project_id, account_id, status: "ready" });

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ ok: true });
}

// プールからアカウントを削除
export async function DELETE(request: NextRequest) {
  const body = await request.json();
  const { id } = body;

  if (!id) {
    return Response.json({ error: "id is required" }, { status: 400 });
  }

  const { error } = await supabase
    .from("line_account_pool")
    .delete()
    .eq("id", id);

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ ok: true });
}

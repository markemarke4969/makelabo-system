import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";

// ユーザーの担当案件一覧を取得
export async function GET(request: NextRequest) {
  const userId = request.nextUrl.searchParams.get("user_id");

  if (!userId) {
    // user_idなし → 全案件を返す（ゲスト用）
    const { data, error } = await supabase
      .from("line_projects")
      .select("*")
      .order("sort_order", { ascending: true });

    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json(data);
  }

  // user_idあり → 紐付け案件のみ返す
  const { data, error } = await supabase
    .from("line_user_projects")
    .select("project_id, role, line_projects(*)")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });

  if (error) return Response.json({ error: error.message }, { status: 500 });

  // 紐付けが0件なら全案件を返す（管理者 or 未設定）
  if (!data || data.length === 0) {
    const { data: allProjects, error: allErr } = await supabase
      .from("line_projects")
      .select("*")
      .order("sort_order", { ascending: true });

    if (allErr) return Response.json({ error: allErr.message }, { status: 500 });
    return Response.json(allProjects);
  }

  // 紐付け案件を返す
  const projects = data
    .map((d) => d.line_projects)
    .filter((p): p is NonNullable<typeof p> => !!p);

  return Response.json(projects);
}

// ユーザーに案件を紐付け
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { user_id, project_id, role } = body;

  if (!user_id || !project_id) {
    return Response.json({ error: "user_id and project_id are required" }, { status: 400 });
  }

  const { error } = await supabase
    .from("line_user_projects")
    .upsert({ user_id, project_id, role: role || "member" }, { onConflict: "user_id,project_id" });

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}

// ユーザーから案件の紐付けを削除
export async function DELETE(request: NextRequest) {
  const body = await request.json();
  const { user_id, project_id } = body;

  if (!user_id || !project_id) {
    return Response.json({ error: "user_id and project_id are required" }, { status: 400 });
  }

  const { error } = await supabase
    .from("line_user_projects")
    .delete()
    .eq("user_id", user_id)
    .eq("project_id", project_id);

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}

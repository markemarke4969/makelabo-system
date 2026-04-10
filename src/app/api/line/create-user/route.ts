import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { email, password, project_ids } = body;

  if (!email || !password) {
    return Response.json({ error: "email and password are required" }, { status: 400 });
  }

  // Service Role Keyでユーザー作成（Admin API）
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    return Response.json({ error: "SUPABASE_SERVICE_ROLE_KEY is not configured" }, { status: 500 });
  }

  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const { data: userData, error: userError } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (userError) {
    return Response.json({ error: userError.message }, { status: 400 });
  }

  const userId = userData.user.id;

  // 案件紐付け
  if (project_ids && Array.isArray(project_ids) && project_ids.length > 0) {
    const rows = project_ids.map((pid: string) => ({
      user_id: userId,
      project_id: pid,
      role: "member",
    }));

    const { error: linkError } = await supabase
      .from("line_user_projects")
      .insert(rows);

    if (linkError) {
      return Response.json({ error: `ユーザーは作成済みですが案件紐付けに失敗: ${linkError.message}` }, { status: 500 });
    }
  }

  return Response.json({ ok: true, user_id: userId });
}

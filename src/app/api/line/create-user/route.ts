import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { loginIdToEmail, isValidLoginId } from "@/lib/login-id";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const {
    email: rawEmail,
    password,
    name,
    closer_name,
    is_closer,
    is_admin,
    owner_project_ids,
    viewer_project_ids,
    project_ids, // 互換用
  } = body;

  if (!rawEmail || !password) {
    return Response.json({ error: "ログインIDとパスワードを入力してください" }, { status: 400 });
  }

  const input = String(rawEmail).trim();
  // ID 形式（@を含まない）なら英数記号バリデーション
  if (!input.includes("@") && !isValidLoginId(input)) {
    return Response.json(
      { error: "ログインIDは英数字・ . _ - のみ、3〜50文字で入力してください" },
      { status: 400 },
    );
  }
  const email = loginIdToEmail(input);

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    return Response.json({ error: "SUPABASE_SERVICE_ROLE_KEY is not configured" }, { status: 500 });
  }

  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { data: userData, error: userError } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      name: name ?? null,
      closer_name: closer_name ?? null,
      is_closer: !!is_closer,
      is_admin: !!is_admin,
      // 管理画面表示用。※平文保存。管理者のみが閲覧できる前提
      password_memo: password,
    },
  });

  if (userError) {
    return Response.json({ error: userError.message }, { status: 400 });
  }

  const userId = userData.user.id;

  // ロール別に紐付け（owner=担当, viewer=閲覧のみ）。
  // owner に含まれる案件は viewer として二重挿入しない（owner優先）。
  const owners: string[] = Array.isArray(owner_project_ids) ? owner_project_ids : [];
  const viewers: string[] = Array.isArray(viewer_project_ids) ? viewer_project_ids : [];
  const viewersOnly = viewers.filter((v) => !owners.includes(v));

  const rows = [
    ...owners.map((pid) => ({ user_id: userId, project_id: pid, role: "owner" })),
    ...viewersOnly.map((pid) => ({ user_id: userId, project_id: pid, role: "viewer" })),
    // 旧形式との互換性
    ...(Array.isArray(project_ids) && owners.length === 0 && viewers.length === 0
      ? project_ids.map((pid: string) => ({ user_id: userId, project_id: pid, role: "member" }))
      : []),
  ];

  if (rows.length > 0) {
    const { error: linkError } = await supabase.from("line_user_projects").insert(rows);
    if (linkError) {
      return Response.json(
        { error: `ユーザーは作成済みですが案件紐付けに失敗: ${linkError.message}` },
        { status: 500 },
      );
    }
  }

  return Response.json({ ok: true, user_id: userId });
}

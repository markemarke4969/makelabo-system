import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { loginIdToEmail, isValidLoginId } from "@/lib/login-id";

// ユーザー一覧取得（プロフィール + 担当/閲覧可能案件を含む）
export async function GET() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    return Response.json({ error: "SUPABASE_SERVICE_ROLE_KEY is not configured" }, { status: 500 });
  }

  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { data: listData, error: listErr } = await adminClient.auth.admin.listUsers({ perPage: 200 });
  if (listErr) {
    return Response.json({ error: listErr.message }, { status: 500 });
  }

  const users = listData.users ?? [];
  const userIds = users.map((u) => u.id);

  // 関連する user_projects を一括取得
  const { data: links } = userIds.length > 0
    ? await supabase
        .from("line_user_projects")
        .select("user_id, project_id, role")
        .in("user_id", userIds)
    : { data: [] as { user_id: string; project_id: string; role: string }[] };

  const linksByUser = new Map<string, { project_id: string; role: string }[]>();
  for (const l of links ?? []) {
    const arr = linksByUser.get(l.user_id) ?? [];
    arr.push({ project_id: l.project_id, role: l.role });
    linksByUser.set(l.user_id, arr);
  }

  const result = users.map((u) => {
    const userLinks = linksByUser.get(u.id) ?? [];
    const owner_project_ids = userLinks.filter((l) => l.role === "owner").map((l) => l.project_id);
    const viewer_project_ids = userLinks
      .filter((l) => l.role === "viewer" || l.role === "member")
      .map((l) => l.project_id);
    const meta = (u.user_metadata ?? {}) as Record<string, unknown>;
    return {
      id: u.id,
      email: u.email,
      created_at: u.created_at,
      name: (meta.name as string | null) ?? null,
      closer_name: (meta.closer_name as string | null) ?? null,
      is_closer: !!(meta.is_closer),
      is_admin: !!(meta.is_admin),
      password_memo: (meta.password_memo as string | null) ?? null,
      owner_project_ids,
      viewer_project_ids,
    };
  });

  return Response.json(result);
}

// プロフィール/パスワード/案件紐付けを更新
export async function PATCH(request: NextRequest) {
  const body = await request.json();
  const { id, email, password, name, closer_name, is_closer, is_admin, owner_project_ids, viewer_project_ids } = body;

  if (!id) {
    return Response.json({ error: "id is required" }, { status: 400 });
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    return Response.json({ error: "SUPABASE_SERVICE_ROLE_KEY is not configured" }, { status: 500 });
  }

  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const updates: Record<string, unknown> = {};
  if (email !== undefined) {
    const input = String(email).trim();
    if (input && !input.includes("@") && !isValidLoginId(input)) {
      return Response.json(
        { error: "IDは英数字・ . _ - のみ、3〜50文字で入力してください" },
        { status: 400 },
      );
    }
    updates.email = loginIdToEmail(input);
  }
  if (password) updates.password = password;
  if (name !== undefined || closer_name !== undefined || is_closer !== undefined || is_admin !== undefined || password) {
    // 既存のメタデータを取得してマージ（password_memo を保持／更新）
    const { data: existing } = await adminClient.auth.admin.getUserById(id);
    const prevMeta = (existing?.user?.user_metadata ?? {}) as Record<string, unknown>;
    updates.user_metadata = {
      ...prevMeta,
      ...(name !== undefined ? { name } : {}),
      ...(closer_name !== undefined ? { closer_name } : {}),
      ...(is_closer !== undefined ? { is_closer: !!is_closer } : {}),
      ...(is_admin !== undefined ? { is_admin: !!is_admin } : {}),
      ...(password ? { password_memo: password } : {}),
    };
  }

  if (Object.keys(updates).length > 0) {
    const { error } = await adminClient.auth.admin.updateUserById(id, updates);
    if (error) return Response.json({ error: error.message }, { status: 400 });
  }

  // 案件紐付けを置き換え
  if (Array.isArray(owner_project_ids) || Array.isArray(viewer_project_ids)) {
    const owners: string[] = Array.isArray(owner_project_ids) ? owner_project_ids : [];
    const viewers: string[] = Array.isArray(viewer_project_ids) ? viewer_project_ids : [];
    const viewersOnly = viewers.filter((v) => !owners.includes(v));

    const { error: delErr } = await supabase.from("line_user_projects").delete().eq("user_id", id);
    if (delErr) return Response.json({ error: delErr.message }, { status: 500 });

    const rows = [
      ...owners.map((pid) => ({ user_id: id, project_id: pid, role: "owner" })),
      ...viewersOnly.map((pid) => ({ user_id: id, project_id: pid, role: "viewer" })),
    ];
    if (rows.length > 0) {
      const { error: insErr } = await supabase.from("line_user_projects").insert(rows);
      if (insErr) return Response.json({ error: insErr.message }, { status: 500 });
    }
  }

  return Response.json({ ok: true });
}

// ユーザーを削除
export async function DELETE(request: NextRequest) {
  const body = await request.json();
  const { id } = body;

  if (!id) {
    return Response.json({ error: "id is required" }, { status: 400 });
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    return Response.json({ error: "SUPABASE_SERVICE_ROLE_KEY is not configured" }, { status: 500 });
  }

  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  await supabase.from("line_user_projects").delete().eq("user_id", id);
  const { error } = await adminClient.auth.admin.deleteUser(id);
  if (error) return Response.json({ error: error.message }, { status: 400 });

  return Response.json({ ok: true });
}

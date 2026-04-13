import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";

// ------------------------------------------------------------
// GET /api/line/labels?account_id=<uuid>
//   → ラベル一覧 + 付与済みフォロワーID配列を返す
//   レスポンス: [{ id, name, color, sort_order, assigned_user_ids: string[] }]
//   assigned_user_ids は line_followers.line_user_id を採用（UI 側が line_user_id で扱っているため）
// ------------------------------------------------------------
export async function GET(request: NextRequest) {
  const accountId = request.nextUrl.searchParams.get("account_id");
  if (!accountId) {
    return Response.json({ error: "account_id is required" }, { status: 400 });
  }

  const { data: labels, error: lblErr } = await supabase
    .from("line_labels")
    .select("id, name, color, sort_order, created_at")
    .eq("account_id", accountId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });

  if (lblErr) {
    return Response.json({ error: lblErr.message }, { status: 500 });
  }

  const labelIds = (labels ?? []).map((l) => l.id as string);
  if (labelIds.length === 0) {
    return Response.json([]);
  }

  // 付与関係を取得 → follower_id → line_user_id の逆引き
  const { data: assigns, error: asErr } = await supabase
    .from("line_follower_labels")
    .select("label_id, follower_id")
    .in("label_id", labelIds);

  if (asErr) {
    return Response.json({ error: asErr.message }, { status: 500 });
  }

  const followerIds = Array.from(new Set((assigns ?? []).map((a) => a.follower_id as string)));
  const idToUserId = new Map<string, string>();
  if (followerIds.length > 0) {
    const { data: fols } = await supabase
      .from("line_followers")
      .select("id, line_user_id")
      .in("id", followerIds);
    for (const f of fols ?? []) {
      idToUserId.set(f.id as string, f.line_user_id as string);
    }
  }

  const assignedMap = new Map<string, string[]>();
  for (const a of assigns ?? []) {
    const userId = idToUserId.get(a.follower_id as string);
    if (!userId) continue;
    const arr = assignedMap.get(a.label_id as string) ?? [];
    arr.push(userId);
    assignedMap.set(a.label_id as string, arr);
  }

  const result = (labels ?? []).map((l) => ({
    id: l.id,
    name: l.name,
    color: l.color,
    sort_order: l.sort_order,
    created_at: l.created_at,
    assigned_users: assignedMap.get(l.id as string) ?? [],
  }));

  return Response.json(result);
}

// ------------------------------------------------------------
// POST /api/line/labels
//   body: { account_id, name, color?, sort_order? }
// ------------------------------------------------------------
export async function POST(request: NextRequest) {
  const body = await request.json();
  if (!body.account_id || !body.name) {
    return Response.json({ error: "account_id and name are required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("line_labels")
    .insert({
      account_id: body.account_id,
      name: body.name,
      color: body.color ?? "#3B82F6",
      sort_order: body.sort_order ?? 0,
    })
    .select("id, name, color, sort_order, created_at")
    .single();

  if (error) {
    const pgCode = (error as { code?: string }).code;
    if (pgCode === "23505") {
      return Response.json(
        { error: `ラベル名「${body.name}」は既に存在します` },
        { status: 400 },
      );
    }
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ ok: true, label: { ...data, assigned_users: [] } });
}

// ------------------------------------------------------------
// PATCH /api/line/labels
//   body: { id, name?, color?, sort_order? }
// ------------------------------------------------------------
export async function PATCH(request: NextRequest) {
  const body = await request.json();
  if (!body.id) {
    return Response.json({ error: "id is required" }, { status: 400 });
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.name !== undefined) updates.name = body.name;
  if (body.color !== undefined) updates.color = body.color;
  if (body.sort_order !== undefined) updates.sort_order = body.sort_order;

  const { error } = await supabase
    .from("line_labels")
    .update(updates)
    .eq("id", body.id);

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
  return Response.json({ ok: true });
}

// ------------------------------------------------------------
// DELETE /api/line/labels
//   body: { id }
// ------------------------------------------------------------
export async function DELETE(request: NextRequest) {
  const body = await request.json();
  if (!body.id) {
    return Response.json({ error: "id is required" }, { status: 400 });
  }

  const { error } = await supabase
    .from("line_labels")
    .delete()
    .eq("id", body.id);

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
  return Response.json({ ok: true });
}

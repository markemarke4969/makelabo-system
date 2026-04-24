import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET() {
  const { data, error } = await supabase
    .from("line_projects")
    .select("*")
    .order("sort_order", { ascending: true });

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { name, description, color, sort_order, code, ban_sync_enabled } = body;

  if (!name || !String(name).trim()) {
    return Response.json({ error: "name is required" }, { status: 400 });
  }

  const insertBody: Record<string, unknown> = {
    name: String(name).trim(),
    description: description?.trim() || null,
    color: color || "#06C755",
    sort_order: Number.isFinite(Number(sort_order)) ? Number(sort_order) : 0,
  };
  if (typeof code === "string" && code.trim()) {
    insertBody.code = code.trim();
  }
  if (typeof ban_sync_enabled === "boolean") {
    insertBody.ban_sync_enabled = ban_sync_enabled;
  }

  let { data, error } = await supabase
    .from("line_projects")
    .insert(insertBody)
    .select("*")
    .single();

  // ban_sync_enabled カラム未作成環境への fallback
  if (error && /ban_sync_enabled/.test(error.message)) {
    const retry = { ...insertBody };
    delete retry.ban_sync_enabled;
    ({ data, error } = await supabase
      .from("line_projects")
      .insert(retry)
      .select("*")
      .single());
  }

  if (error) {
    console.error("[projects POST] error:", error);
    const code = (error as { code?: string }).code;
    if (code === "23505") {
      return Response.json({ error: `案件名「${name}」は既に存在します` }, { status: 400 });
    }
    if (code === "42P01") {
      return Response.json({ error: "line_projects テーブルが存在しません" }, { status: 500 });
    }
    return Response.json({ error: error.message, code }, { status: 500 });
  }

  return Response.json({ ok: true, project: data });
}

export async function PUT(request: NextRequest) {
  const body = await request.json();
  const { id, name, description, color, sort_order, code, ban_sync_enabled } = body;

  if (!id) {
    return Response.json({ error: "id is required" }, { status: 400 });
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (name !== undefined) updates.name = String(name).trim();
  if (description !== undefined) updates.description = description?.trim() || null;
  if (color !== undefined) updates.color = color;
  if (sort_order !== undefined) updates.sort_order = Number(sort_order) || 0;
  if (code !== undefined) {
    const trimmed = typeof code === "string" ? code.trim() : "";
    updates.code = trimmed || null;
  }
  if (typeof ban_sync_enabled === "boolean") {
    updates.ban_sync_enabled = ban_sync_enabled;
  }

  let { error } = await supabase.from("line_projects").update(updates).eq("id", id);

  // updated_at カラム未作成の場合は fallback
  if (error && /updated_at/.test(error.message)) {
    const { updated_at: _omit, ...rest } = updates as Record<string, unknown>;
    void _omit;
    ({ error } = await supabase.from("line_projects").update(rest).eq("id", id));
  }

  // ban_sync_enabled カラム未作成環境への fallback
  if (error && /ban_sync_enabled/.test(error.message)) {
    const { ban_sync_enabled: _omit2, ...rest } = updates as Record<string, unknown>;
    void _omit2;
    ({ error } = await supabase.from("line_projects").update(rest).eq("id", id));
  }

  if (error) {
    const pgCode = (error as { code?: string }).code;
    if (pgCode === "23505") {
      return Response.json(
        { error: `案件コード「${code}」は既に使われています。別のコードにしてください。` },
        { status: 400 },
      );
    }
    return Response.json({ error: error.message }, { status: 500 });
  }
  return Response.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const body = await request.json();
  const { id } = body;

  if (!id) {
    return Response.json({ error: "id is required" }, { status: 400 });
  }

  // 紐付く user_projects を先に削除（FK 対策）
  await supabase.from("line_user_projects").delete().eq("project_id", id);

  const { error } = await supabase.from("line_projects").delete().eq("id", id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}

import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET() {
  const { data, error } = await supabase
    .from("line_followers")
    .select("*")
    .order("followed_at", { ascending: false });

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json(data);
}

export async function DELETE(request: NextRequest) {
  const { ids, all } = await request.json();

  if (all) {
    // 全件削除: messages → followers
    const { error: msgErr } = await supabase.from("line_messages").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    if (msgErr) return Response.json({ error: msgErr.message }, { status: 500 });

    const { error } = await supabase.from("line_followers").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    if (error) return Response.json({ error: error.message }, { status: 500 });

    return Response.json({ ok: true, deleted: "all" });
  }

  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return Response.json({ error: "ids or all is required" }, { status: 400 });
  }

  // 対象ユーザーのline_user_idを取得
  const { data: targets } = await supabase
    .from("line_followers")
    .select("line_user_id")
    .in("id", ids);

  const userIds = (targets ?? []).map((t) => t.line_user_id);

  // messages削除
  if (userIds.length > 0) {
    await supabase.from("line_messages").delete().in("line_user_id", userIds);
  }

  // followers削除
  const { error } = await supabase.from("line_followers").delete().in("id", ids);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ ok: true, deleted: ids.length });
}

import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  const userId = request.nextUrl.searchParams.get("user_id");

  let query = supabase
    .from("line_messages")
    .select("*")
    .order("sent_at", { ascending: true })
    .limit(500);

  if (userId) {
    query = query.eq("line_user_id", userId);
  }

  const { data, error } = await query;

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json(data);
}

// 既読にする（指定ユーザーの受信メッセージを既読化）
export async function PATCH(request: NextRequest) {
  const body = await request.json();
  const { line_user_id } = body;

  if (!line_user_id) {
    return Response.json({ error: "line_user_id is required" }, { status: 400 });
  }

  const { error } = await supabase
    .from("line_messages")
    .update({ is_read: true })
    .eq("line_user_id", line_user_id)
    .eq("direction", "incoming")
    .eq("is_read", false);

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ ok: true });
}

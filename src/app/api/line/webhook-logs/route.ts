import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  const userId = request.nextUrl.searchParams.get("user_id");

  if (!userId) {
    return Response.json({ error: "user_id is required" }, { status: 400 });
  }

  // line_messagesから全イベント取得（follow/unfollow/message等すべて）
  const { data: messages, error } = await supabase
    .from("line_messages")
    .select("*")
    .eq("line_user_id", userId)
    .order("sent_at", { ascending: false });

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({
    messages: messages ?? [],
    webhooks: [],
  });
}

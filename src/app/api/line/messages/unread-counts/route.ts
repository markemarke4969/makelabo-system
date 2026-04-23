import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";

// 未読メッセージ件数を効率的に取得
export async function GET(request: NextRequest) {
  const accountId = request.nextUrl.searchParams.get("account_id");

  let query = supabase
    .from("line_messages")
    .select("line_user_id")
    .eq("direction", "incoming")
    .eq("is_read", false);

  if (accountId) {
    query = query.eq("line_account_id", accountId);
  }

  const { data, error } = await query;

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  // line_user_id ごとにカウント
  const counts: Record<string, number> = {};
  for (const row of data ?? []) {
    counts[row.line_user_id] = (counts[row.line_user_id] || 0) + 1;
  }

  return Response.json(counts);
}

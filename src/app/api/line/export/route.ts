import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  const type = request.nextUrl.searchParams.get("type") ?? "followers";

  if (type === "followers") {
    const { data, error } = await supabase
      .from("line_followers")
      .select("*")
      .order("followed_at", { ascending: false });

    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    const headers = ["ID", "LINE User ID", "表示名", "ステータス", "友だち追加日時", "ブロック日時", "登録日時"];
    const rows = (data ?? []).map((r) => [
      r.id,
      r.line_user_id,
      r.display_name ?? "",
      r.status,
      r.followed_at,
      r.unfollowed_at ?? "",
      r.created_at,
    ]);

    const csv = [headers, ...rows].map((r) => r.map((c: string) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const bom = "\uFEFF";

    return new Response(bom + csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="line_followers_${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  }

  if (type === "messages") {
    const userId = request.nextUrl.searchParams.get("user_id");
    let query = supabase
      .from("line_messages")
      .select("*")
      .order("sent_at", { ascending: false });

    if (userId) {
      query = query.eq("line_user_id", userId);
    }

    const { data, error } = await query;

    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    const headers = ["ID", "LINE User ID", "方向", "種別", "テキスト", "送信日時"];
    const rows = (data ?? []).map((r) => [
      r.id,
      r.line_user_id,
      r.direction === "incoming" ? "受信" : "送信",
      r.message_type,
      r.message_text ?? "",
      r.sent_at,
    ]);

    const csv = [headers, ...rows].map((r) => r.map((c: string) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const bom = "\uFEFF";

    return new Response(bom + csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="line_messages_${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  }

  return Response.json({ error: "Invalid type" }, { status: 400 });
}

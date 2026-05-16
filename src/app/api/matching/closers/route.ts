import { supabaseAdmin as supabase } from "@/lib/supabase";

// PR#3-C: クローザー名マスタ取得
// active=true 行を sort_order ASC, name ASC で返す。
// 「未割当」は sort_order=999 で末尾固定(matching_closers migration の初期データ)。
export async function GET() {
  const { data, error } = await supabase
    .from("matching_closers")
    .select("id, name, company, sort_order")
    .eq("active", true)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json(data ?? []);
}

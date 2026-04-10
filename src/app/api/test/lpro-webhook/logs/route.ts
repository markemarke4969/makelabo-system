import { supabase } from "@/lib/supabase";

export async function GET() {
  const { data, error } = await supabase
    .from("test_webhook")
    .select("*")
    .order("received_at", { ascending: false })
    .limit(100);

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json(data);
}

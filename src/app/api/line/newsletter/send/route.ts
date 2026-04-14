import { NextRequest } from "next/server";
import { dispatchNewsletter } from "@/lib/newsletter";
import { supabase } from "@/lib/supabase";

export const maxDuration = 300;

/**
 * 指定したメルマガを即時送信、または予約設定する。
 * POST { id, mode: "now" | "schedule", scheduled_at?: string }
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const { id, mode, scheduled_at } = body ?? {};
  if (!id) return Response.json({ error: "id is required" }, { status: 400 });

  if (mode === "schedule") {
    if (!scheduled_at) {
      return Response.json({ error: "scheduled_at is required" }, { status: 400 });
    }
    const { error } = await supabase
      .from("line_newsletters")
      .update({
        status: "scheduled",
        scheduled_at,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ ok: true, mode: "schedule", scheduled_at });
  }

  // 即時送信
  const result = await dispatchNewsletter(id);
  if (!result.ok) return Response.json({ ...result, ok: false }, { status: 500 });
  return Response.json(result);
}

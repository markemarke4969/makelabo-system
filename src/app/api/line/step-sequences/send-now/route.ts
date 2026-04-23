import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";
import { processBroadcastSequence, type BroadcastSequenceRow } from "@/lib/broadcast";

export const maxDuration = 300;

/**
 * 指定した予約配信シーケンスを今すぐ配信する。
 * POST body: { id: string }
 *
 * 既に sent_at が埋まっている/ kind が "schedule" でない場合はエラーを返す。
 * 対象フォロワーが0件でも完了扱いにする（processBroadcastSequence の挙動）。
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const id = body?.id as string | undefined;
  if (!id) {
    return Response.json({ error: "id is required" }, { status: 400 });
  }

  const { data: seq, error } = await supabase
    .from("line_step_sequences")
    .select("id, account_id, name, scheduled_at, target_condition, kind, sent_at")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
  if (!seq) {
    return Response.json({ error: "sequence not found" }, { status: 404 });
  }
  if (seq.kind !== "schedule") {
    return Response.json({ error: "not a scheduled broadcast" }, { status: 400 });
  }
  if (seq.sent_at) {
    return Response.json({ error: "already sent" }, { status: 400 });
  }

  try {
    const result = await processBroadcastSequence(seq as BroadcastSequenceRow);
    return Response.json({ ok: true, ...result });
  } catch (e) {
    console.error("[send-now] error:", e);
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}

import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";
import { fireTrigger } from "@/lib/action-rules";

// ------------------------------------------------------------
// POST /api/line/labels/assign
//   body: { label_id, line_user_id, account_id, assigned?: boolean }
//     assigned: true  = 付与   (default)
//     assigned: false = 解除
//
//   line_user_id → follower_id への解決をこの API 内で行うことで、
//   クライアント側を line_user_id 中心で統一できる。
// ------------------------------------------------------------
export async function POST(request: NextRequest) {
  const body = await request.json();
  const labelId: string | undefined = body.label_id;
  const lineUserId: string | undefined = body.line_user_id;
  const accountId: string | undefined = body.account_id;
  const assigned: boolean = body.assigned !== false; // default true

  if (!labelId || !lineUserId || !accountId) {
    return Response.json(
      { error: "label_id, line_user_id, account_id are required" },
      { status: 400 },
    );
  }

  // follower_id を解決
  const { data: follower, error: fErr } = await supabase
    .from("line_followers")
    .select("id")
    .eq("line_account_id", accountId)
    .eq("line_user_id", lineUserId)
    .maybeSingle();

  if (fErr) {
    return Response.json({ error: fErr.message }, { status: 500 });
  }
  if (!follower) {
    return Response.json(
      { error: `follower not found (account=${accountId}, user=${lineUserId})` },
      { status: 404 },
    );
  }

  if (assigned) {
    // upsert: 既に付与済みなら no-op
    const { error } = await supabase
      .from("line_follower_labels")
      .upsert(
        { label_id: labelId, follower_id: follower.id },
        { onConflict: "label_id,follower_id" },
      );
    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }
    // アクションルール発火（label_added）
    await fireTrigger("label_added", {
      account_id: accountId,
      line_user_id: lineUserId,
      follower_id: follower.id,
      label_id: labelId,
    });
  } else {
    const { error } = await supabase
      .from("line_follower_labels")
      .delete()
      .eq("label_id", labelId)
      .eq("follower_id", follower.id);
    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }
  }

  return Response.json({ ok: true });
}

import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";

// ============================================================
// scenario 削除 API(段階8-2-C)
// ============================================================
// DELETE /api/line/scenarios { id }
//   - 過去パターン(accounts / projects DELETE)踏襲、body に { id } を渡す
//   - 配下テーブルの ON DELETE 動作は DB 側に委譲
//     CASCADE  : line_step_sequences / line_rich_menus / line_labels / line_action_rules /
//                line_reminders / line_newsletters / line_surveys / line_registration_forms /
//                line_reengagement_broadcasts
//     SET NULL : line_accounts / line_inflow_routes / line_followers / line_click_tokens /
//                line_message_clicks / line_templates / line_custom_fields
//   - 削除前の依存件数表示は GET /api/line/scenarios/dependents?id=xxx を参照
// ============================================================

export async function DELETE(request: NextRequest) {
  const body = await request.json();
  const { id } = body as { id?: string };

  if (!id) {
    return Response.json({ error: "id is required" }, { status: 400 });
  }

  console.log("[scenarios DELETE] id=", id);

  const { error } = await supabase.from("line_scenarios").delete().eq("id", id);
  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
  return Response.json({ ok: true });
}

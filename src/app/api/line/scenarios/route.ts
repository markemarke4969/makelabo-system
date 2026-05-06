import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";

// ============================================================
// scenarios API
// ============================================================
// POST   /api/line/scenarios       新規 scenario 作成(段階8-2-F)
// DELETE /api/line/scenarios { id } 削除(段階8-2-C)
//
// GET / PUT は /api/line/projects に集約(GET は projects 配下に scenarios 配列を埋め込み、
// PUT は scenarios 配列の二重書きで既存 scenario を更新)。
//
// ── DELETE 配下テーブルの ON DELETE 動作(DB 側に委譲)
//   CASCADE  : line_step_sequences / line_rich_menus / line_labels / line_action_rules /
//              line_reminders / line_newsletters / line_surveys / line_registration_forms /
//              line_reengagement_broadcasts
//   SET NULL : line_accounts / line_inflow_routes / line_followers / line_click_tokens /
//              line_message_clicks / line_templates / line_custom_fields
//   依存件数表示は GET /api/line/scenarios/dependents?id=xxx を参照
// ============================================================

const SCENARIO_CODE_PATTERN = /^[a-zA-Z0-9_-]+$/;

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "request body must be valid JSON" }, { status: 400 });
  }

  const project_id = typeof body.project_id === "string" ? body.project_id.trim() : "";
  const codeInput = typeof body.code === "string" ? body.code.trim() : "";
  const nameInput = typeof body.name === "string" ? body.name.trim() : "";

  if (!project_id) {
    return Response.json({ error: "project_id は必須です" }, { status: 400 });
  }
  if (!codeInput) {
    return Response.json({ error: "code は必須です" }, { status: 400 });
  }
  if (!SCENARIO_CODE_PATTERN.test(codeInput)) {
    return Response.json(
      { error: "code は半角英数・ハイフン・アンダースコアのみ使用できます" },
      { status: 400 },
    );
  }
  if (!nameInput) {
    return Response.json({ error: "name は必須です" }, { status: 400 });
  }

  const insertBody: Record<string, unknown> = {
    project_id,
    code: codeInput,
    name: nameInput,
    distribute_enabled: typeof body.distribute_enabled === "boolean" ? body.distribute_enabled : false,
    distribute_count: Number.isFinite(Number(body.distribute_count)) ? Number(body.distribute_count) : 1,
    reserve_count: Number.isFinite(Number(body.reserve_count)) ? Number(body.reserve_count) : 0,
    ban_sync_enabled: typeof body.ban_sync_enabled === "boolean" ? body.ban_sync_enabled : false,
    closer_visible: typeof body.closer_visible === "boolean" ? body.closer_visible : false,
    sort_order: Number.isFinite(Number(body.sort_order)) ? Number(body.sort_order) : 0,
  };

  const { data, error } = await supabase
    .from("line_scenarios")
    .insert(insertBody)
    .select("*")
    .single();

  if (error) {
    console.error("[scenarios POST] error:", error);
    const pgCode = (error as { code?: string }).code;
    if (pgCode === "23505") {
      return Response.json(
        { error: `シナリオコード「${codeInput}」は既にこの案件で使われています`, code: pgCode },
        { status: 409 },
      );
    }
    if (pgCode === "23503") {
      return Response.json(
        { error: `指定された案件(project_id=${project_id})が存在しません`, code: pgCode },
        { status: 400 },
      );
    }
    return Response.json({ error: error.message, code: pgCode }, { status: 500 });
  }

  return Response.json({ ok: true, scenario: data });
}

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

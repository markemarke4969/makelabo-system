import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const SCENARIO_ID = process.env.MATCHING_SCENARIO_ID;
const PROJECT_ID = process.env.MATCHING_PROJECT_ID;
const BRIDGE_URL = process.env.MATCHING_BRIDGE_URL;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest) {
  if (!SCENARIO_ID || !PROJECT_ID || !BRIDGE_URL) {
    return Response.json(
      {
        success: false,
        error:
          "サーバー側の環境変数 (MATCHING_SCENARIO_ID / MATCHING_PROJECT_ID / MATCHING_BRIDGE_URL) が未設定です",
      },
      { status: 500 },
    );
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return Response.json(
      { success: false, error: "リクエストボディが不正です" },
      { status: 400 },
    );
  }

  const { diagnosis_id, line_user_id } = body as {
    diagnosis_id?: unknown;
    line_user_id?: unknown;
  };

  if (typeof diagnosis_id !== "string" || !UUID_RE.test(diagnosis_id)) {
    return Response.json(
      { success: false, error: "diagnosis_id が不正です" },
      { status: 400 },
    );
  }
  if (typeof line_user_id !== "string" || line_user_id.length === 0) {
    return Response.json(
      { success: false, error: "line_user_id が不正です" },
      { status: 400 },
    );
  }

  const now = new Date().toISOString();

  const { error } = await supabase
    .from("matching_line_bridge")
    .upsert(
      {
        diagnosis_id,
        line_user_id,
        scenario_id: SCENARIO_ID,
        project_id: PROJECT_ID,
        bound_at: now,
      },
      { onConflict: "diagnosis_id" },
    );

  if (error) {
    return Response.json(
      { success: false, error: error.message },
      { status: 500 },
    );
  }

  return Response.json({
    success: true,
    redirect_url: BRIDGE_URL,
  });
}

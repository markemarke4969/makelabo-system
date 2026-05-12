import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

// ============================================================
// AI セクション永続化 + 公開 lookup API
// ============================================================
// POST /api/matching/diagnoses/[id]/ai-sections
//   - 結果ページ(matching/result/page.tsx)から呼ばれ、Claude API 生成結果を
//     matching_diagnoses の ai_* カラムに UPDATE する
//   - 認証: anon(diagnosisId が UUID で推測困難。書き込み時点で
//     クライアントは既に自分の diagnosis_id を localStorage に保持済み)
//
// GET /api/matching/diagnoses/[id]/ai-sections
//   - LINE ハーネス側(line/webhook)が follow イベント時に呼ぶ公開 IF
//   - Bearer 認証: `MATCHING_PUBLIC_LOOKUP_TOKEN`
//   - レスポンス:{ status: 'pending'|'ready'|'failed', sections?: {strength,animal,risk},
//                  typeName?, animal? }
//
// モジュール境界(matching ↔ line):
//   - line 側からは本 GET を Bearer 付きで叩く以外に matching テーブルへの
//     アクセス手段を持たない(構想第17章準拠)
//
// 実装注:
//   `@/lib/supabase` の `supabaseAdmin` (lazy proxy)を使用する。
//   module top-level で `createClient(URL!, KEY!)` を直接呼ぶと、Next.js 16 の
//   ビルド時 page data collection で env 未設定の Preview 環境ではビルド失敗するため。
// ============================================================

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type AiSectionStatus = "pending" | "ready" | "failed";

function isAiSectionStatus(v: unknown): v is AiSectionStatus {
  return v === "pending" || v === "ready" || v === "failed";
}

// ------------------------------------------------------------
// POST: 生成結果を ai_* カラムに UPDATE
// ------------------------------------------------------------
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  if (!UUID_RE.test(id)) {
    return Response.json(
      { error: "diagnosis_id が不正です" },
      { status: 400 },
    );
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return Response.json(
      { error: "リクエストボディが不正です" },
      { status: 400 },
    );
  }

  const { strengthSection, animalSection, riskSection, status } = body as {
    strengthSection?: unknown;
    animalSection?: unknown;
    riskSection?: unknown;
    status?: unknown;
  };

  const nextStatus: AiSectionStatus = isAiSectionStatus(status)
    ? status
    : "ready";

  if (nextStatus === "ready") {
    if (
      typeof strengthSection !== "string" ||
      typeof animalSection !== "string" ||
      typeof riskSection !== "string"
    ) {
      return Response.json(
        {
          error:
            "status=ready のときは strengthSection / animalSection / riskSection (string) すべて必須",
        },
        { status: 400 },
      );
    }
  }

  const now = new Date().toISOString();

  const updateBody: {
    ai_strength_section?: string;
    ai_animal_section?: string;
    ai_risk_section?: string;
    ai_generated_at?: string | null;
    ai_generation_status: AiSectionStatus;
    updated_at: string;
  } = {
    ai_generation_status: nextStatus,
    updated_at: now,
  };

  if (nextStatus === "ready") {
    updateBody.ai_strength_section = strengthSection as string;
    updateBody.ai_animal_section = animalSection as string;
    updateBody.ai_risk_section = riskSection as string;
    updateBody.ai_generated_at = now;
  }

  const { data, error } = await supabaseAdmin
    .from("matching_diagnoses")
    .update(updateBody)
    .eq("id", id)
    .select("id, ai_generation_status, ai_generated_at")
    .maybeSingle();

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return Response.json(
      { error: `diagnosis not found: ${id}` },
      { status: 404 },
    );
  }

  return Response.json({
    ok: true,
    id: data.id,
    status: data.ai_generation_status,
    generatedAt: data.ai_generated_at,
  });
}

// ------------------------------------------------------------
// GET: line/webhook から呼ばれる公開 IF(Bearer 認証)
// ------------------------------------------------------------
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const expected = process.env.MATCHING_PUBLIC_LOOKUP_TOKEN;
  if (!expected) {
    return Response.json(
      { error: "MATCHING_PUBLIC_LOOKUP_TOKEN が未設定です" },
      { status: 500 },
    );
  }

  const authHeader = request.headers.get("authorization") ?? "";
  const presented = authHeader.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length).trim()
    : "";

  if (!presented || presented !== expected) {
    return Response.json(
      { error: "unauthorized" },
      { status: 401 },
    );
  }

  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return Response.json({ error: "diagnosis_id が不正です" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("matching_diagnoses")
    .select(
      "id, type_id, answers, ai_strength_section, ai_animal_section, ai_risk_section, ai_generation_status, ai_generated_at",
    )
    .eq("id", id)
    .maybeSingle();

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }

  const status: AiSectionStatus = isAiSectionStatus(data.ai_generation_status)
    ? data.ai_generation_status
    : "pending";

  if (status !== "ready") {
    return Response.json({
      status,
      generatedAt: data.ai_generated_at,
    });
  }

  return Response.json({
    status,
    generatedAt: data.ai_generated_at,
    sections: {
      strength: data.ai_strength_section ?? "",
      animal: data.ai_animal_section ?? "",
      risk: data.ai_risk_section ?? "",
    },
    typeId: data.type_id,
  });
}

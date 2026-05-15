import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

// ============================================================
// アンケート lookup API(PR#3-A)
// ============================================================
// GET /api/line/survey-lookup?ref=<external_ref>
// Authorization: Bearer ${LINE_SURVEY_LOOKUP_TOKEN}
//
// 副業診断アプリ(matching)ダッシュボードがクローザー商談前に
// 電話番号を取得するための公開 IF。中継 URL ?ref=<diagnosis_id>
// 経由で line_inflow_clicks に保存された follower_id を起点に、
// アンケート回答(question_type='phone')から電話番号を返す。
//
// 認証:
//   `Authorization: Bearer ${LINE_SURVEY_LOOKUP_TOKEN}` 完全一致比較
//   既存 inflow-lookup と同じ Bearer パターン(構想第17章準拠)
//
// レスポンス(全 200 ・status 文字列で分岐):
//   - { status: "found",            phone, answered_at }
//   - { status: "not_responded" }                          ← survey 設定あり/未回答
//   - { status: "not_found_survey" }                       ← phone 型 question 未設定
//   - { status: "no_follower" }                            ← ref から follower 引当不可
//   - 400: { error: "ref is required" }
//   - 401: { error: "unauthorized" }
//   - 500: { error: <message> }
//
// モジュール境界:
//   本 API は line テリトリー完結。matching の DB は触らない。
// ============================================================

export const dynamic = "force-dynamic";

type LookupStatus =
  | "found"
  | "not_responded"
  | "not_found_survey"
  | "no_follower";

function unauthorized(): Response {
  return Response.json({ error: "unauthorized" }, { status: 401 });
}

function badRequest(message: string): Response {
  return Response.json({ error: message }, { status: 400 });
}

function serverError(message: string): Response {
  return Response.json({ error: message }, { status: 500 });
}

function ok<T extends object>(body: T): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

export async function GET(request: NextRequest): Promise<Response> {
  // 1. Bearer 認証
  const expected = process.env.LINE_SURVEY_LOOKUP_TOKEN;
  if (!expected) {
    return serverError("LINE_SURVEY_LOOKUP_TOKEN が未設定です");
  }

  const authHeader = request.headers.get("authorization") ?? "";
  const presented = authHeader.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length).trim()
    : "";

  if (!presented || presented !== expected) {
    return unauthorized();
  }

  // 2. ref バリデーション
  const ref = request.nextUrl.searchParams.get("ref")?.trim();
  if (!ref) {
    return badRequest("ref is required");
  }

  // 3. external_ref で click 行を取得(最新 clicked_at)
  const { data: clicks, error: clickErr } = await supabaseAdmin
    .from("line_inflow_clicks")
    .select("follower_id, clicked_at")
    .eq("external_ref", ref)
    .order("clicked_at", { ascending: false });

  if (clickErr) {
    return serverError(`click lookup failed: ${clickErr.message}`);
  }

  // bound 行優先
  const boundClick = clicks?.find(
    (c: { follower_id: string | null }) => c.follower_id !== null,
  );
  const followerId = boundClick?.follower_id ?? null;

  if (!followerId) {
    return ok({ status: "no_follower" as LookupStatus });
  }

  // 4. follower 取得(account_id を確定)
  const { data: follower, error: followerErr } = await supabaseAdmin
    .from("line_followers")
    .select("id, line_account_id")
    .eq("id", followerId)
    .maybeSingle();

  if (followerErr) {
    return serverError(`follower lookup failed: ${followerErr.message}`);
  }
  if (!follower) {
    return ok({ status: "no_follower" as LookupStatus });
  }

  const accountId = (follower as { line_account_id: string | null })
    .line_account_id;
  if (!accountId) {
    return ok({ status: "no_follower" as LookupStatus });
  }

  // 5. このアカウントの surveys を取得
  const { data: surveys, error: surveysErr } = await supabaseAdmin
    .from("line_surveys")
    .select("id")
    .eq("account_id", accountId);

  if (surveysErr) {
    return serverError(`surveys lookup failed: ${surveysErr.message}`);
  }
  const surveyIds = (surveys ?? []).map((s: { id: string }) => s.id);
  if (surveyIds.length === 0) {
    return ok({ status: "not_found_survey" as LookupStatus });
  }

  // 6. phone 型 question の id 一覧を取得
  const { data: phoneQuestions, error: pqErr } = await supabaseAdmin
    .from("line_survey_questions")
    .select("id, survey_id, save_to_field_id")
    .in("survey_id", surveyIds)
    .eq("question_type", "phone");

  if (pqErr) {
    return serverError(`questions lookup failed: ${pqErr.message}`);
  }

  type PhoneQ = {
    id: string;
    survey_id: string;
    save_to_field_id: string | null;
  };
  const phoneQs = (phoneQuestions ?? []) as PhoneQ[];
  if (phoneQs.length === 0) {
    return ok({ status: "not_found_survey" as LookupStatus });
  }

  // 7. follower の responses を新しい順に取得
  const { data: responses, error: respErr } = await supabaseAdmin
    .from("line_survey_responses")
    .select("survey_id, answers, responded_at")
    .eq("follower_id", followerId)
    .in("survey_id", surveyIds)
    .order("responded_at", { ascending: false });

  if (respErr) {
    return serverError(`responses lookup failed: ${respErr.message}`);
  }

  // 8. 各 response の answers から phone question の回答を探す
  type Resp = {
    survey_id: string;
    answers: Record<string, string> | null;
    responded_at: string | null;
  };
  for (const r of (responses ?? []) as Resp[]) {
    if (!r.answers) continue;
    const qsForSurvey = phoneQs.filter((q) => q.survey_id === r.survey_id);
    for (const q of qsForSurvey) {
      const phone = r.answers[q.id];
      if (typeof phone === "string" && phone.trim().length > 0) {
        return ok({
          status: "found" as LookupStatus,
          phone: phone.trim(),
          answered_at: r.responded_at,
        });
      }
    }
  }

  // 9. フォールバック: phone question の save_to_field_id 経由で
  //    line_follower_custom_values に保存された値を見る
  const saveFieldIds = phoneQs
    .map((q) => q.save_to_field_id)
    .filter((v): v is string => typeof v === "string" && v.length > 0);

  if (saveFieldIds.length > 0) {
    const { data: customs, error: cvErr } = await supabaseAdmin
      .from("line_follower_custom_values")
      .select("field_id, value, updated_at")
      .eq("follower_id", followerId)
      .in("field_id", saveFieldIds)
      .order("updated_at", { ascending: false });

    if (cvErr) {
      return serverError(`custom values lookup failed: ${cvErr.message}`);
    }

    type CV = { field_id: string; value: string | null; updated_at: string | null };
    const cvHit = (customs ?? []).find(
      (c: CV) => typeof c.value === "string" && c.value.trim().length > 0,
    ) as CV | undefined;

    if (cvHit) {
      return ok({
        status: "found" as LookupStatus,
        phone: (cvHit.value as string).trim(),
        answered_at: cvHit.updated_at,
      });
    }
  }

  // 10. survey 設定あり・未回答
  return ok({ status: "not_responded" as LookupStatus });
}

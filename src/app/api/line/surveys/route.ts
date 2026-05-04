import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";
import { resolveAccountIdsFromScenario, resolveScenarioFromAccount } from "@/lib/scenario-resolve";

// 段階6c2: scenario_id クエリ追加(配下 account_ids 解決 → IN 句集約)。

// アンケート一覧取得
export async function GET(request: NextRequest) {
  const accountId = request.nextUrl.searchParams.get("account_id");
  const scenarioId = request.nextUrl.searchParams.get("scenario_id");
  if (!accountId && !scenarioId) {
    return Response.json({ error: "account_id or scenario_id required" }, { status: 400 });
  }

  // 段階7-A2: 案 Y(過渡期ハイブリッド)直 hit 化
  let query = supabase
    .from("line_surveys")
    .select("*")
    .order("created_at", { ascending: false });
  if (scenarioId && !accountId) {
    const resolved = await resolveAccountIdsFromScenario(scenarioId);
    if (resolved.account_ids.length === 0) {
      query = query.eq("scenario_id", scenarioId);
    } else {
      const idsList = resolved.account_ids.map((id) => `"${id}"`).join(",");
      query = query.or(`scenario_id.eq.${scenarioId},and(scenario_id.is.null,account_id.in.(${idsList}))`);
    }
  } else if (accountId) {
    query = query.eq("account_id", accountId);
  }

  let { data, error } = await query;

  // 7-A1 未適用環境 fallback
  if (error && scenarioId && !accountId && /scenario_id/i.test(error.message)) {
    const resolved = await resolveAccountIdsFromScenario(scenarioId);
    if (resolved.account_ids.length === 0) return Response.json([]);
    ({ data, error } = await supabase
      .from("line_surveys")
      .select("*")
      .in("account_id", resolved.account_ids)
      .order("created_at", { ascending: false }));
  }

  if (error) return Response.json({ error: error.message }, { status: 500 });

  // 質問と回答数を結合
  const ids = (data ?? []).map((s) => s.id as string);
  const questionsMap: Record<string, unknown[]> = {};
  const responseCounts: Record<string, number> = {};

  if (ids.length > 0) {
    const { data: questions } = await supabase
      .from("line_survey_questions")
      .select("*")
      .in("survey_id", ids)
      .order("question_order", { ascending: true });

    for (const q of questions ?? []) {
      const sid = q.survey_id as string;
      if (!questionsMap[sid]) questionsMap[sid] = [];
      questionsMap[sid].push(q);
    }

    const { data: responses } = await supabase
      .from("line_survey_responses")
      .select("survey_id")
      .in("survey_id", ids);

    for (const r of responses ?? []) {
      const sid = r.survey_id as string;
      responseCounts[sid] = (responseCounts[sid] || 0) + 1;
    }
  }

  const result = (data ?? []).map((s) => ({
    ...s,
    questions: questionsMap[s.id as string] ?? [],
    response_count: responseCounts[s.id as string] ?? 0,
  }));

  return Response.json(result);
}

// アンケート作成
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { account_id, name, description, thank_you_message, post_action_type, post_action_config, questions } = body;

  if (!account_id || !name) return Response.json({ error: "account_id and name required" }, { status: 400 });

  // 段階8-2-E-1: account_id から scenario_id を解決して INSERT に同梱(段階7-A1 負債清算)
  const { scenario_id: resolvedScenarioId } = await resolveScenarioFromAccount(account_id);

  const { data: survey, error } = await supabase
    .from("line_surveys")
    .insert({
      account_id,
      scenario_id: resolvedScenarioId,
      name,
      description: description ?? null,
      thank_you_message: thank_you_message ?? "ご回答ありがとうございました！",
      post_action_type: post_action_type ?? null,
      post_action_config: post_action_config ?? {},
    })
    .select("id")
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });

  // 質問保存
  if (Array.isArray(questions) && questions.length > 0) {
    const qRows = questions.map((q: Record<string, unknown>, idx: number) => ({
      survey_id: survey.id,
      question_order: idx + 1,
      question_text: q.question_text ?? "",
      question_type: q.question_type ?? "text",
      options: q.options ?? [],
      is_required: q.is_required !== false,
      save_to_field_id: q.save_to_field_id ?? null,
      label_mapping: q.label_mapping ?? {},
    }));
    await supabase.from("line_survey_questions").insert(qRows);
  }

  return Response.json({ ok: true, id: survey.id });
}

// アンケート削除
export async function DELETE(request: NextRequest) {
  const body = await request.json();
  const { id } = body;
  if (!id) return Response.json({ error: "id required" }, { status: 400 });

  await supabase.from("line_survey_responses").delete().eq("survey_id", id);
  await supabase.from("line_survey_questions").delete().eq("survey_id", id);
  const { error } = await supabase.from("line_surveys").delete().eq("id", id);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ ok: true });
}

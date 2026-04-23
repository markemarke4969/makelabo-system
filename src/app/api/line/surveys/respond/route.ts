import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";

// アンケート回答を保存
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { survey_id, line_user_id, answers } = body;

  if (!survey_id || !line_user_id || !answers) {
    return Response.json({ error: "survey_id, line_user_id, answers required" }, { status: 400 });
  }

  // アンケート情報取得
  const { data: survey } = await supabase
    .from("line_surveys")
    .select("*, account_id")
    .eq("id", survey_id)
    .single();

  if (!survey) return Response.json({ error: "survey not found" }, { status: 404 });

  // フォロワー取得
  const { data: follower } = await supabase
    .from("line_followers")
    .select("id")
    .eq("line_account_id", survey.account_id)
    .eq("line_user_id", line_user_id)
    .maybeSingle();

  if (!follower) return Response.json({ error: "follower not found" }, { status: 404 });

  // 回答を保存（upsert: 同一ユーザーは上書き）
  const { error: respErr } = await supabase
    .from("line_survey_responses")
    .upsert(
      {
        survey_id,
        follower_id: follower.id,
        line_user_id,
        answers,
        responded_at: new Date().toISOString(),
      },
      { onConflict: "survey_id,follower_id" },
    );

  if (respErr) return Response.json({ error: respErr.message }, { status: 500 });

  // 質問ごとの後処理
  const { data: questions } = await supabase
    .from("line_survey_questions")
    .select("*")
    .eq("survey_id", survey_id);

  for (const q of questions ?? []) {
    const qId = q.id as string;
    const answer = (answers as Record<string, string>)[qId];
    if (!answer) continue;

    // カスタムフィールドに保存
    if (q.save_to_field_id) {
      await supabase.from("line_follower_custom_values").upsert(
        {
          follower_id: follower.id,
          field_id: q.save_to_field_id,
          value: answer,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "follower_id,field_id" },
      );
    }

    // ラベル付与（label_mapping: {value: label_id}）
    const mapping = (q.label_mapping ?? {}) as Record<string, string>;
    const labelId = mapping[answer];
    if (labelId) {
      await supabase.from("line_follower_labels").upsert(
        { label_id: labelId, follower_id: follower.id },
        { onConflict: "label_id,follower_id" },
      );
    }
  }

  // 回答後アクション
  if (survey.post_action_type === "label_add") {
    const cfg = (survey.post_action_config ?? {}) as Record<string, string>;
    if (cfg.label_id) {
      await supabase.from("line_follower_labels").upsert(
        { label_id: cfg.label_id, follower_id: follower.id },
        { onConflict: "label_id,follower_id" },
      );
    }
  }

  return Response.json({
    ok: true,
    thank_you_message: survey.thank_you_message ?? "ご回答ありがとうございました！",
  });
}

// アンケート情報取得（公開ページ用）
export async function GET(request: NextRequest) {
  const surveyId = request.nextUrl.searchParams.get("survey_id");
  if (!surveyId) return Response.json({ error: "survey_id required" }, { status: 400 });

  const { data: survey } = await supabase
    .from("line_surveys")
    .select("id, name, description, status")
    .eq("id", surveyId)
    .single();

  if (!survey) return Response.json({ error: "not found" }, { status: 404 });
  if (survey.status !== "active") return Response.json({ error: "inactive" }, { status: 400 });

  const { data: questions } = await supabase
    .from("line_survey_questions")
    .select("id, question_order, question_text, question_type, options, is_required")
    .eq("survey_id", surveyId)
    .order("question_order", { ascending: true });

  return Response.json({ ...survey, questions: questions ?? [] });
}

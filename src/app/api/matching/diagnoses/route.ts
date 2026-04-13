import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// POST: 診断結果を保存 / ダッシュボード操作
export async function POST(request: NextRequest) {
  const body = await request.json();

  // 削除
  if (body._action === "delete") {
    const { error } = await supabase
      .from("matching_diagnoses")
      .delete()
      .eq("id", body.diagnosisId);
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ ok: true });
  }

  // ダッシュボードからのクローザー割り当て
  if (body._action === "assign_closer") {
    const { error } = await supabase
      .from("matching_diagnoses")
      .update({
        assigned_closer: body.closer,
        updated_at: new Date().toISOString(),
      })
      .eq("id", body.diagnosisId);
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ ok: true });
  }

  // ダッシュボードからのステータス変更
  if (body._action === "update_status") {
    const { error } = await supabase
      .from("matching_diagnoses")
      .update({
        consultation_status: body.status,
        updated_at: new Date().toISOString(),
      })
      .eq("id", body.diagnosisId);
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ ok: true });
  }

  // 通常の診断結果保存
  const { name, birthday, answers, typeId, scores, topProducts, lineUserId } =
    body;

  if (!answers || !typeId || !scores || !topProducts) {
    return Response.json({ error: "必須項目が不足しています" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("matching_diagnoses")
    .insert({
      name: name || null,
      birthday: birthday || null,
      line_user_id: lineUserId || null,
      answers,
      type_id: typeId,
      scores,
      top_products: topProducts,
    })
    .select("id")
    .single();

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ id: data.id });
}

// GET: クローザーダッシュボード用 — 一覧取得
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const limit = Number(searchParams.get("limit") || "50");

  let query = supabase
    .from("matching_diagnoses")
    .select("*, matching_consultations(*)")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (status) {
    query = query.eq("consultation_status", status);
  }

  const { data, error } = await query;

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json(data);
}

import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// POST: 面談予約を保存
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { diagnosisId, preferredDate, preferredTime, contactMethod } = body;

  if (!diagnosisId || !preferredDate || !preferredTime) {
    return Response.json({ error: "必須項目が不足しています" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("matching_consultations")
    .insert({
      diagnosis_id: diagnosisId,
      preferred_date: preferredDate,
      preferred_time: preferredTime,
      contact_method: contactMethod || "phone",
    })
    .select("id")
    .single();

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  // 診断レコードのステータスも更新
  await supabase
    .from("matching_diagnoses")
    .update({
      consultation_status: "booked",
      updated_at: new Date().toISOString(),
    })
    .eq("id", diagnosisId);

  return Response.json({ id: data.id });
}

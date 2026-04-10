import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

// GET: ウェビナー一覧取得
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const projectName = searchParams.get("project") || "ハピネス";
  const limit = parseInt(searchParams.get("limit") || "50", 10);

  // プロジェクトIDを取得
  const { data: project } = await supabase
    .from("projects")
    .select("id")
    .eq("name", projectName)
    .single();

  if (!project) {
    return NextResponse.json({ error: "案件が見つかりません" }, { status: 404 });
  }

  const { data, error } = await supabase
    .from("webinars")
    .select(`
      id,
      project_id,
      date,
      title,
      theme,
      script_url,
      transcript_url,
      registrant_count,
      live_viewer_count,
      kw_sender_count,
      application_count,
      application_rate,
      seated_count,
      seated_rate,
      appointment_count,
      interview_rate,
      close_count,
      close_rate_on_appointment,
      close_rate_on_seated,
      close_unit_price,
      revenue,
      deposit_amount,
      created_at
    `)
    .eq("project_id", project.id)
    .order("date", { ascending: false })
    .limit(limit);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data });
}

// POST: ウェビナーを新規登録
export async function POST(request: NextRequest) {
  const body = await request.json();

  // バリデーション
  if (!body.title) {
    return NextResponse.json({ error: "タイトルは必須です" }, { status: 400 });
  }

  // プロジェクトIDを取得
  const projectName = body.project_name || "ハピネス";
  const { data: project } = await supabase
    .from("projects")
    .select("id")
    .eq("name", projectName)
    .single();

  if (!project) {
    return NextResponse.json({ error: "案件が見つかりません" }, { status: 404 });
  }

  const { data, error } = await supabase
    .from("webinars")
    .insert({
      project_id: project.id,
      date: body.date || null,
      title: body.title,
      theme: body.theme || null,
      script_url: body.script_url || null,
      transcript_url: body.transcript_url || null,
      registrant_count: body.registrant_count || 0,
      live_viewer_count: body.live_viewer_count || 0,
      kw_sender_count: body.kw_sender_count || 0,
      application_count: body.application_count || 0,
      application_rate: body.application_rate || 0,
      seated_count: body.seated_count || 0,
      seated_rate: body.seated_rate || 0,
      appointment_count: body.appointment_count || 0,
      interview_rate: body.interview_rate || 0,
      close_count: body.close_count || 0,
      close_rate_on_appointment: body.close_rate_on_appointment || 0,
      close_rate_on_seated: body.close_rate_on_seated || 0,
      close_unit_price: body.close_unit_price || 0,
      revenue: body.revenue || 0,
      deposit_amount: body.deposit_amount || 0,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data }, { status: 201 });
}

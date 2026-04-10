import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

// GET: 月次目標一覧取得
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
    .from("monthly_targets")
    .select(`
      id,
      year_month,
      project_id,
      target_revenue,
      target_opt_in,
      target_appointment,
      target_close_count,
      target_roas,
      created_at
    `)
    .eq("project_id", project.id)
    .order("year_month", { ascending: false })
    .limit(limit);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data });
}

// POST: 月次目標を新規登録
export async function POST(request: NextRequest) {
  const body = await request.json();

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
    .from("monthly_targets")
    .insert({
      year_month: body.year_month || null,
      project_id: project.id,
      target_revenue: body.target_revenue || 0,
      target_opt_in: body.target_opt_in || 0,
      target_appointment: body.target_appointment || 0,
      target_close_count: body.target_close_count || 0,
      target_roas: body.target_roas || 0,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data }, { status: 201 });
}

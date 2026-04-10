import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

// GET: 動画パフォーマンス一覧取得
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
    .from("video_performance")
    .select(`
      id,
      project_id,
      scenario_type,
      video_number,
      video_url,
      video_title,
      year_month,
      view_count,
      click_count,
      click_rate,
      avg_watch_rate,
      attributed_close_count,
      attributed_revenue,
      conversion_rate,
      performance_rank,
      memo,
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

// POST: 動画パフォーマンスを新規登録
export async function POST(request: NextRequest) {
  const body = await request.json();

  // バリデーション
  if (!body.scenario_type) {
    return NextResponse.json({ error: "シナリオタイプは必須です" }, { status: 400 });
  }
  if (!body.year_month) {
    return NextResponse.json({ error: "年月は必須です" }, { status: 400 });
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
    .from("video_performance")
    .insert({
      project_id: project.id,
      scenario_type: body.scenario_type,
      video_number: body.video_number || null,
      video_url: body.video_url || null,
      video_title: body.video_title || null,
      year_month: body.year_month,
      view_count: body.view_count || 0,
      click_count: body.click_count || 0,
      click_rate: body.click_rate || 0,
      avg_watch_rate: body.avg_watch_rate || 0,
      attributed_close_count: body.attributed_close_count || 0,
      attributed_revenue: body.attributed_revenue || 0,
      conversion_rate: body.conversion_rate || 0,
      performance_rank: body.performance_rank || null,
      memo: body.memo || null,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data }, { status: 201 });
}

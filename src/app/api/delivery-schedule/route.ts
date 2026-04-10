import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

// GET: 配信スケジュール一覧取得
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
    .from("delivery_schedule")
    .select(`
      id,
      project_id,
      date,
      delivery_time,
      delivery_item,
      target_segment,
      is_completed,
      memo,
      manuscript_url,
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

// POST: 配信スケジュールを新規登録
export async function POST(request: NextRequest) {
  const body = await request.json();

  // バリデーション
  if (!body.delivery_item) {
    return NextResponse.json({ error: "配信項目は必須です" }, { status: 400 });
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
    .from("delivery_schedule")
    .insert({
      project_id: project.id,
      date: body.date || null,
      delivery_time: body.delivery_time || null,
      delivery_item: body.delivery_item,
      target_segment: body.target_segment || null,
      is_completed: body.is_completed || false,
      memo: body.memo || null,
      manuscript_url: body.manuscript_url || null,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data }, { status: 201 });
}

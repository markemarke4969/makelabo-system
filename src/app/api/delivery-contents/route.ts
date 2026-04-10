import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

// GET: 配信コンテンツ一覧取得
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
    .from("delivery_contents")
    .select(`
      id,
      project_id,
      date,
      channel,
      title,
      body,
      manuscript_url,
      target_segment,
      delivery_time,
      is_approved,
      send_count,
      open_count,
      open_rate,
      click_count,
      click_rate,
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

// POST: 配信コンテンツを新規登録
export async function POST(request: NextRequest) {
  const body = await request.json();

  // バリデーション
  if (!body.channel) {
    return NextResponse.json({ error: "チャネルは必須です" }, { status: 400 });
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
    .from("delivery_contents")
    .insert({
      project_id: project.id,
      date: body.date || null,
      channel: body.channel,
      title: body.title || null,
      body: body.body || null,
      manuscript_url: body.manuscript_url || null,
      target_segment: body.target_segment || null,
      delivery_time: body.delivery_time || null,
      is_approved: body.is_approved || false,
      send_count: body.send_count || 0,
      open_count: body.open_count || 0,
      open_rate: body.open_rate || 0,
      click_count: body.click_count || 0,
      click_rate: body.click_rate || 0,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data }, { status: 201 });
}

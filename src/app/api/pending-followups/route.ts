import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

// GET: 保留フォローアップ一覧取得
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
    .from("pending_followups")
    .select(`
      id,
      appointment_id,
      project_id,
      closer_id,
      contact_date,
      contact_method,
      result,
      next_action_date,
      memo,
      created_at
    `)
    .eq("project_id", project.id)
    .order("contact_date", { ascending: false })
    .limit(limit);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data });
}

// POST: 保留フォローアップを新規登録
export async function POST(request: NextRequest) {
  const body = await request.json();

  // バリデーション
  if (!body.appointment_id) {
    return NextResponse.json({ error: "面談IDは必須です" }, { status: 400 });
  }
  if (!body.contact_date) {
    return NextResponse.json({ error: "連絡日は必須です" }, { status: 400 });
  }
  if (!body.contact_method) {
    return NextResponse.json({ error: "連絡方法は必須です" }, { status: 400 });
  }
  if (!body.result) {
    return NextResponse.json({ error: "結果は必須です" }, { status: 400 });
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

  // closer_idをスタッフ名から引く
  let closerId = null;
  if (body.closer_name) {
    const { data: closer } = await supabase
      .from("staff")
      .select("id")
      .eq("name", body.closer_name)
      .single();
    closerId = closer?.id || null;
  }

  const { data, error } = await supabase
    .from("pending_followups")
    .insert({
      appointment_id: body.appointment_id,
      project_id: project.id,
      closer_id: closerId,
      contact_date: body.contact_date,
      contact_method: body.contact_method,
      result: body.result,
      next_action_date: body.next_action_date || null,
      memo: body.memo || null,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data }, { status: 201 });
}

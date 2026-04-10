import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

// GET: WBSタスク一覧取得
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
    .from("project_tasks")
    .select(`
      id,
      project_id,
      phase,
      task_name,
      due_date,
      department,
      is_completed,
      reverse_days,
      work_days,
      reference_url,
      memo,
      created_at
    `)
    .eq("project_id", project.id)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data });
}

// POST: WBSタスクを新規登録
export async function POST(request: NextRequest) {
  const body = await request.json();

  // バリデーション
  if (!body.task_name) {
    return NextResponse.json({ error: "タスク名は必須です" }, { status: 400 });
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
    .from("project_tasks")
    .insert({
      project_id: project.id,
      phase: body.phase || null,
      task_name: body.task_name,
      due_date: body.due_date || null,
      department: body.department || null,
      is_completed: body.is_completed || false,
      reverse_days: body.reverse_days || 0,
      work_days: body.work_days || 0,
      reference_url: body.reference_url || null,
      memo: body.memo || null,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data }, { status: 201 });
}

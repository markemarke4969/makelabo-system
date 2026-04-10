import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const project = searchParams.get("project");

  let query = supabase.from("cs_templates").select("*");

  if (project) {
    const { data: projectData } = await supabase
      .from("projects")
      .select("id")
      .eq("name", project)
      .single();

    if (projectData) {
      query = query.eq("project_id", projectData.id);
    }
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

export async function POST(request: NextRequest) {
  const body = await request.json();

  const { title, body: templateBody, category } = body;

  if (!title || !templateBody) {
    return NextResponse.json(
      { error: "title と body は必須です" },
      { status: 400 }
    );
  }

  const projectName = body.project_name ?? "ハピネス";

  const { data: projectData, error: projectError } = await supabase
    .from("projects")
    .select("id")
    .eq("name", projectName)
    .single();

  if (projectError || !projectData) {
    return NextResponse.json(
      { error: "プロジェクトが見つかりません" },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("cs_templates")
    .insert({
      project_id: projectData.id,
      title,
      body: templateBody,
      category,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}

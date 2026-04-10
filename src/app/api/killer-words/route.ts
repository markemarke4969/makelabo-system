import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const project = searchParams.get("project");

  let query = supabase.from("killer_words").select("*");

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

  const {
    project_id,
    word,
    context,
    department,
    shared_to,
    effectiveness_score,
    submitted_by,
  } = body;

  if (!word) {
    return NextResponse.json(
      { error: "word は必須です" },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("killer_words")
    .insert({
      project_id,
      word,
      context,
      department,
      shared_to,
      effectiveness_score,
      submitted_by,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}

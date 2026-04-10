import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const project = searchParams.get("project");

  let query = supabase.from("daily_pokesaro_inflow").select("*");

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
    date,
    inflow_count,
    source,
    deal_count_on_date,
    registered_from_deal,
    guidance_rate,
  } = body;

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
    .from("daily_pokesaro_inflow")
    .insert({
      date,
      project_id: projectData.id,
      inflow_count,
      source,
      deal_count_on_date,
      registered_from_deal,
      guidance_rate,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}

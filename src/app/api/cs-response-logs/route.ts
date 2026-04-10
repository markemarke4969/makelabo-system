import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const project = searchParams.get("project");

  let query = supabase.from("cs_response_logs").select("*");

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
    customer_name,
    response_type,
    template_id,
    content,
    is_alert,
    alert_reason,
  } = body;

  const { data, error } = await supabase
    .from("cs_response_logs")
    .insert({
      project_id,
      customer_name,
      response_type,
      template_id,
      content,
      is_alert: is_alert ?? false,
      alert_reason,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}

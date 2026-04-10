import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const project = searchParams.get("project");

  let query = supabase.from("daily_funnel_detail").select("*");

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
    channel_name,
    scenario_type,
    video1_click,
    video2_click,
    video3_click,
    video4_click,
    video5_click,
    lp_click,
    target_reach,
    block_count,
    block_rate,
    voice_registration,
    voice_appointment,
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

  const { data: channelData, error: channelError } = await supabase
    .from("ad_channels")
    .select("id")
    .eq("channel_name", channel_name)
    .single();

  if (channelError || !channelData) {
    return NextResponse.json(
      { error: "広告チャネルが見つかりません" },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("daily_funnel_detail")
    .insert({
      date,
      project_id: projectData.id,
      channel_id: channelData.id,
      scenario_type,
      video1_click,
      video2_click,
      video3_click,
      video4_click,
      video5_click,
      lp_click,
      target_reach,
      block_count,
      block_rate,
      voice_registration,
      voice_appointment,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}

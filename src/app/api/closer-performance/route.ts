import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const project = searchParams.get("project");

  let query = supabase.from("monthly_closer_performance").select("*");

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
    year_month,
    closer_name,
    product_type,
    interview_count,
    close_count,
    close_rate,
    close_amount,
    deposit_amount,
    avg_unit_price,
    pending_count,
    unpaid_amount,
    unpaid_count,
    cooling_off_count,
    refund_rate,
    refund_amount,
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

  const { data: staffData, error: staffError } = await supabase
    .from("staff")
    .select("id")
    .eq("closer_name", closer_name)
    .single();

  if (staffError || !staffData) {
    return NextResponse.json(
      { error: "クローザーが見つかりません" },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("monthly_closer_performance")
    .insert({
      year_month,
      project_id: projectData.id,
      closer_id: staffData.id,
      product_type,
      interview_count,
      close_count,
      close_rate,
      close_amount,
      deposit_amount,
      avg_unit_price,
      pending_count,
      unpaid_amount,
      unpaid_count,
      cooling_off_count,
      refund_rate,
      refund_amount,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}

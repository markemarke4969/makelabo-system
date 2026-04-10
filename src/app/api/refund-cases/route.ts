import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const project = searchParams.get("project");

  let query = supabase.from("refund_cases").select("*");

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
    refund_no,
    case_type,
    status,
    source_name,
    company_name,
    customer_name,
    center_name,
    staff_name,
    closer_name,
    next_call_date,
    contact_info,
    description,
    requested_amount,
    bank_amount,
    credit_amount,
    settlement_amount,
    installments,
    next_payment_date,
    handling_fee,
    fee_paid,
    settlement_paid,
    is_blocked,
    blocked_amount,
    memo,
  } = body;

  if (!customer_name) {
    return NextResponse.json(
      { error: "顧客名は必須です" },
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
    .from("refund_cases")
    .insert({
      refund_no,
      project_id: projectData.id,
      case_type,
      status,
      source_name,
      company_name,
      customer_name,
      center_name,
      staff_name,
      closer_name,
      next_call_date,
      contact_info,
      description,
      requested_amount,
      bank_amount,
      credit_amount,
      settlement_amount,
      installments,
      next_payment_date,
      handling_fee,
      fee_paid,
      settlement_paid,
      is_blocked,
      blocked_amount,
      memo,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}

import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

// GET: 入金追跡一覧取得
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
    .from("deposit_tracking")
    .select(`
      id,
      project_id,
      appointment_id,
      closer_id,
      customer_name,
      deal_amount,
      payment_method,
      installment_total,
      installment_current,
      deposited_amount,
      remaining_amount,
      next_payment_date,
      status,
      deal_date,
      last_deposit_date,
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

// POST: 入金追跡を新規登録
export async function POST(request: NextRequest) {
  const body = await request.json();

  // バリデーション
  if (!body.deal_amount) {
    return NextResponse.json({ error: "成約金額は必須です" }, { status: 400 });
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
    .from("deposit_tracking")
    .insert({
      project_id: project.id,
      appointment_id: body.appointment_id || null,
      closer_id: closerId,
      customer_name: body.customer_name || null,
      deal_amount: body.deal_amount,
      payment_method: body.payment_method || null,
      installment_total: body.installment_total || null,
      installment_current: body.installment_current || null,
      deposited_amount: body.deposited_amount || 0,
      remaining_amount: body.remaining_amount || 0,
      next_payment_date: body.next_payment_date || null,
      status: body.status || null,
      deal_date: body.deal_date || null,
      last_deposit_date: body.last_deposit_date || null,
      memo: body.memo || null,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data }, { status: 201 });
}

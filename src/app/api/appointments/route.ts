import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

// GET: 面談記録一覧取得
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
    .from("appointments")
    .select(`
      id,
      customer_name,
      keyword,
      keyword_date,
      appointment_date,
      interview_date,
      source,
      reservation_status,
      interview_result,
      deal_amount,
      deposit_amount,
      payment_method,
      trigger_source,
      customer_note,
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

// POST: 面談記録を新規登録
export async function POST(request: NextRequest) {
  const body = await request.json();

  // バリデーション
  if (!body.customer_name) {
    return NextResponse.json({ error: "顧客名は必須です" }, { status: 400 });
  }

  // ハピネスのproject_idを取得
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

  // channel_idをチャネル名から引く
  let channelId = null;
  if (body.channel_name) {
    const { data: channel } = await supabase
      .from("ad_channels")
      .select("id")
      .eq("name", body.channel_name)
      .single();
    channelId = channel?.id || null;
  }

  const { data, error } = await supabase
    .from("appointments")
    .insert({
      project_id: project.id,
      channel_id: channelId,
      closer_id: closerId,
      customer_name: body.customer_name,
      keyword: body.keyword || null,
      keyword_date: body.keyword_date || null,
      appointment_date: body.appointment_date || null,
      interview_date: body.interview_date || null,
      source: body.source || null,
      reservation_status: body.reservation_status || null,
      interview_result: body.interview_result || null,
      deal_amount: body.deal_amount || 0,
      deposit_amount: body.deposit_amount || 0,
      payment_method: body.payment_method || null,
      trigger_source: body.trigger_source || null,
      customer_note: body.customer_note || null,
      memo: body.memo || null,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data }, { status: 201 });
}

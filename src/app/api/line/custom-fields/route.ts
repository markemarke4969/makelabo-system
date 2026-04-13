import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";

// カスタムフィールド定義の CRUD
export async function GET(request: NextRequest) {
  const accountId = request.nextUrl.searchParams.get("account_id");
  const followerId = request.nextUrl.searchParams.get("follower_id");

  if (followerId) {
    // フォロワーの全カスタム値を取得
    const { data, error } = await supabase
      .from("line_follower_custom_values")
      .select("*, line_custom_fields(*)")
      .eq("follower_id", followerId);
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json(data ?? []);
  }

  if (!accountId) {
    return Response.json({ error: "account_id is required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("line_custom_fields")
    .select("*")
    .eq("account_id", accountId)
    .order("sort_order", { ascending: true });

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data ?? []);
}

export async function POST(request: NextRequest) {
  const body = await request.json();

  // フォロワーの値を保存
  if (body.follower_id && body.field_id) {
    const { error } = await supabase
      .from("line_follower_custom_values")
      .upsert({
        follower_id: body.follower_id,
        field_id: body.field_id,
        value: body.value ?? null,
        updated_at: new Date().toISOString(),
      }, { onConflict: "follower_id,field_id" });
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ ok: true });
  }

  // フィールド定義を作成
  if (!body.account_id || !body.field_key || !body.field_label) {
    return Response.json({ error: "account_id, field_key, field_label are required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("line_custom_fields")
    .insert({
      account_id: body.account_id,
      field_key: body.field_key,
      field_label: body.field_label,
      field_type: body.field_type || "text",
      options: body.options ?? null,
      sort_order: body.sort_order ?? 0,
    })
    .select("id")
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true, id: data!.id });
}

export async function PUT(request: NextRequest) {
  const body = await request.json();
  if (!body.id) return Response.json({ error: "id is required" }, { status: 400 });

  const updates: Record<string, unknown> = {};
  if (body.field_label !== undefined) updates.field_label = body.field_label;
  if (body.field_type !== undefined) updates.field_type = body.field_type;
  if (body.options !== undefined) updates.options = body.options;
  if (body.sort_order !== undefined) updates.sort_order = body.sort_order;

  const { error } = await supabase
    .from("line_custom_fields")
    .update(updates)
    .eq("id", body.id);

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const body = await request.json();
  if (!body.id) return Response.json({ error: "id is required" }, { status: 400 });

  const { error } = await supabase
    .from("line_custom_fields")
    .delete()
    .eq("id", body.id);

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}

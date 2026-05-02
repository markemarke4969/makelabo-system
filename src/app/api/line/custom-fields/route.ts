import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";
import { resolveAccountIdsFromScenario } from "@/lib/scenario-resolve";

// 段階6c2: scenario_id クエリ追加(配下 account_ids 解決 → IN 句集約)。
// follower_id パスは個別 follower の値取得、scenario 概念無関係 → 拡張対象外。

// カスタムフィールド定義の CRUD
export async function GET(request: NextRequest) {
  const accountId = request.nextUrl.searchParams.get("account_id");
  const scenarioId = request.nextUrl.searchParams.get("scenario_id");
  const followerId = request.nextUrl.searchParams.get("follower_id");

  if (followerId) {
    // フォロワーの全カスタム値を取得(scenario_id とは独立、follower 単位)
    const { data, error } = await supabase
      .from("line_follower_custom_values")
      .select("*, line_custom_fields(*)")
      .eq("follower_id", followerId);
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json(data ?? []);
  }

  if (!accountId && !scenarioId) {
    return Response.json({ error: "account_id or scenario_id is required" }, { status: 400 });
  }

  let scenarioAccountIds: string[] | null = null;
  if (scenarioId && !accountId) {
    const resolved = await resolveAccountIdsFromScenario(scenarioId);
    if (resolved.account_ids.length === 0) return Response.json([]);
    scenarioAccountIds = resolved.account_ids;
  }

  let query = supabase
    .from("line_custom_fields")
    .select("*")
    .order("sort_order", { ascending: true });
  if (scenarioAccountIds) query = query.in("account_id", scenarioAccountIds);
  else if (accountId) query = query.eq("account_id", accountId);

  const { data, error } = await query;

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

import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";
import { resolveAccountIdsFromScenario, resolveScenarioFromAccount } from "@/lib/scenario-resolve";

// 段階6c2: scenario_id クエリ追加(配下 account_ids 解決 → IN 句集約)。
// follower_id パスは個別 follower の値取得、scenario 概念無関係 → 拡張対象外。

// カスタムフィールド定義の CRUD
//
// PR#2-B: is_hidden=true の field はクローザー操作画面に出さない方針。
//   - デフォルトで `is_hidden=false` のみ返す
//   - `?include_hidden=true` を付けたときのみ hidden 含む全件返す(管理用途の保険)
//   - follower_id 経路は JOIN 後にクライアント側で hidden を除外(配信本文置換時の
//     buildReplacerContext は別経路で取得するため、本 API でフィルタしても支障なし)
export async function GET(request: NextRequest) {
  const accountId = request.nextUrl.searchParams.get("account_id");
  const scenarioId = request.nextUrl.searchParams.get("scenario_id");
  const followerId = request.nextUrl.searchParams.get("follower_id");
  const includeHidden =
    request.nextUrl.searchParams.get("include_hidden") === "true";

  if (followerId) {
    // フォロワーの全カスタム値を取得(scenario_id とは独立、follower 単位)
    const { data, error } = await supabase
      .from("line_follower_custom_values")
      .select("*, line_custom_fields(*)")
      .eq("follower_id", followerId);
    if (error) return Response.json({ error: error.message }, { status: 500 });
    // is_hidden=true の field を持つ行を除外(クローザー画面の友達詳細モーダル等)
    const rows = (data ?? []) as Array<{
      line_custom_fields?: { is_hidden?: boolean } | null;
    } & Record<string, unknown>>;
    const filtered = includeHidden
      ? rows
      : rows.filter((r) => r.line_custom_fields?.is_hidden !== true);
    return Response.json(filtered);
  }

  if (!accountId && !scenarioId) {
    return Response.json({ error: "account_id or scenario_id is required" }, { status: 400 });
  }

  // 段階7-A2: 案 Y(過渡期ハイブリッド)直 hit 化
  let query = supabase
    .from("line_custom_fields")
    .select("*")
    .order("sort_order", { ascending: true });
  if (scenarioId && !accountId) {
    const resolved = await resolveAccountIdsFromScenario(scenarioId);
    if (resolved.account_ids.length === 0) {
      query = query.eq("scenario_id", scenarioId);
    } else {
      const idsList = resolved.account_ids.map((id) => `"${id}"`).join(",");
      query = query.or(`scenario_id.eq.${scenarioId},and(scenario_id.is.null,account_id.in.(${idsList}))`);
    }
  } else if (accountId) {
    query = query.eq("account_id", accountId);
  }
  if (!includeHidden) {
    query = query.eq("is_hidden", false);
  }

  let { data, error } = await query;

  // 7-A1 未適用環境 fallback
  if (error && scenarioId && !accountId && /scenario_id/i.test(error.message)) {
    const resolved = await resolveAccountIdsFromScenario(scenarioId);
    if (resolved.account_ids.length === 0) return Response.json([]);
    let fbQuery = supabase
      .from("line_custom_fields")
      .select("*")
      .in("account_id", resolved.account_ids)
      .order("sort_order", { ascending: true });
    if (!includeHidden) fbQuery = fbQuery.eq("is_hidden", false);
    ({ data, error } = await fbQuery);
  }

  // is_hidden 列なし環境 fallback(PR#2-B SQL 未適用時)
  if (error && /is_hidden/i.test(error.message)) {
    let fbQuery = supabase
      .from("line_custom_fields")
      .select("*")
      .order("sort_order", { ascending: true });
    if (scenarioId && !accountId) {
      const resolved = await resolveAccountIdsFromScenario(scenarioId);
      if (resolved.account_ids.length === 0) {
        fbQuery = fbQuery.eq("scenario_id", scenarioId);
      } else {
        const idsList = resolved.account_ids.map((id) => `"${id}"`).join(",");
        fbQuery = fbQuery.or(
          `scenario_id.eq.${scenarioId},and(scenario_id.is.null,account_id.in.(${idsList}))`,
        );
      }
    } else if (accountId) {
      fbQuery = fbQuery.eq("account_id", accountId);
    }
    ({ data, error } = await fbQuery);
  }

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

  // 段階8-2-E-1: account_id から scenario_id を解決して INSERT に同梱(段階7-A1 負債清算)
  const { scenario_id: resolvedScenarioId } = await resolveScenarioFromAccount(body.account_id);

  const { data, error } = await supabase
    .from("line_custom_fields")
    .insert({
      account_id: body.account_id,
      scenario_id: resolvedScenarioId,
      field_key: body.field_key,
      field_label: body.field_label,
      field_type: body.field_type || "text",
      options: body.options ?? null,
      sort_order: body.sort_order ?? 0,
      is_hidden: body.is_hidden === true,
      default_value: body.default_value ?? null,
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
  if (body.is_hidden !== undefined) updates.is_hidden = body.is_hidden === true;
  if (body.default_value !== undefined) updates.default_value = body.default_value;

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

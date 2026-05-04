import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";
import { resolveAccountIdsFromScenario, resolveScenarioFromAccount } from "@/lib/scenario-resolve";

// 段階6c2: scenario_id クエリ追加(配下 account_ids 解決 → IN 句集約)。

// 一覧取得
export async function GET(request: NextRequest) {
  const accountId = request.nextUrl.searchParams.get("account_id");
  const scenarioId = request.nextUrl.searchParams.get("scenario_id");
  if (!accountId && !scenarioId) {
    return Response.json({ error: "account_id or scenario_id required" }, { status: 400 });
  }

  // 段階7-A2: 案 Y(過渡期ハイブリッド)直 hit 化
  let query = supabase
    .from("line_registration_forms")
    .select("*")
    .order("created_at", { ascending: false });
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

  let { data, error } = await query;

  // 7-A1 未適用環境 fallback
  if (error && scenarioId && !accountId && /scenario_id/i.test(error.message)) {
    const resolved = await resolveAccountIdsFromScenario(scenarioId);
    if (resolved.account_ids.length === 0) return Response.json([]);
    ({ data, error } = await supabase
      .from("line_registration_forms")
      .select("*")
      .in("account_id", resolved.account_ids)
      .order("created_at", { ascending: false }));
  }

  if (error) return Response.json({ error: error.message }, { status: 500 });

  const ids = (data ?? []).map((f) => f.id as string);
  const fieldsMap: Record<string, unknown[]> = {};
  const submissionCounts: Record<string, number> = {};

  if (ids.length > 0) {
    const { data: fields } = await supabase
      .from("line_registration_form_fields")
      .select("*")
      .in("form_id", ids)
      .order("field_order", { ascending: true });
    for (const f of fields ?? []) {
      const fid = f.form_id as string;
      if (!fieldsMap[fid]) fieldsMap[fid] = [];
      fieldsMap[fid].push(f);
    }

    const { data: subs } = await supabase
      .from("line_registration_submissions")
      .select("form_id")
      .in("form_id", ids);
    for (const s of subs ?? []) {
      const fid = s.form_id as string;
      submissionCounts[fid] = (submissionCounts[fid] || 0) + 1;
    }
  }

  const result = (data ?? []).map((f) => ({
    ...f,
    fields: fieldsMap[f.id as string] ?? [],
    submission_count: submissionCounts[f.id as string] ?? 0,
  }));

  return Response.json(result);
}

// 作成
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { account_id, name, description, thank_you_message, post_action_type, post_action_config, fields } = body;

  if (!account_id || !name) return Response.json({ error: "account_id and name required" }, { status: 400 });

  // 段階8-2-E-1: account_id から scenario_id を解決して INSERT に同梱(段階7-A1 負債清算)
  const { scenario_id: resolvedScenarioId } = await resolveScenarioFromAccount(account_id);

  const { data: form, error } = await supabase
    .from("line_registration_forms")
    .insert({
      account_id,
      scenario_id: resolvedScenarioId,
      name,
      description: description ?? null,
      thank_you_message: thank_you_message ?? "登録ありがとうございます！",
      post_action_type: post_action_type ?? null,
      post_action_config: post_action_config ?? {},
    })
    .select("id")
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });

  if (Array.isArray(fields) && fields.length > 0) {
    const rows = fields.map((f: Record<string, unknown>, idx: number) => ({
      form_id: form.id,
      field_order: idx + 1,
      field_label: f.field_label ?? "",
      field_type: f.field_type ?? "text",
      options: f.options ?? [],
      is_required: f.is_required !== false,
      placeholder: f.placeholder ?? null,
      save_to_field_id: f.save_to_field_id ?? null,
    }));
    await supabase.from("line_registration_form_fields").insert(rows);
  }

  return Response.json({ ok: true, id: form.id });
}

// 削除
export async function DELETE(request: NextRequest) {
  const body = await request.json();
  const { id } = body;
  if (!id) return Response.json({ error: "id required" }, { status: 400 });

  await supabase.from("line_registration_submissions").delete().eq("form_id", id);
  await supabase.from("line_registration_form_fields").delete().eq("form_id", id);
  const { error } = await supabase.from("line_registration_forms").delete().eq("id", id);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ ok: true });
}

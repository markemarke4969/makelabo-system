import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";
import { resolveAccountIdsFromScenario } from "@/lib/scenario-resolve";

// 段階6c2: scenario_id クエリ追加(配下 account_ids 解決 → IN 句集約)。

// 一覧取得
export async function GET(request: NextRequest) {
  const accountId = request.nextUrl.searchParams.get("account_id");
  const scenarioId = request.nextUrl.searchParams.get("scenario_id");
  if (!accountId && !scenarioId) {
    return Response.json({ error: "account_id or scenario_id required" }, { status: 400 });
  }

  let scenarioAccountIds: string[] | null = null;
  if (scenarioId && !accountId) {
    const resolved = await resolveAccountIdsFromScenario(scenarioId);
    if (resolved.account_ids.length === 0) return Response.json([]);
    scenarioAccountIds = resolved.account_ids;
  }

  let query = supabase
    .from("line_registration_forms")
    .select("*")
    .order("created_at", { ascending: false });
  if (scenarioAccountIds) query = query.in("account_id", scenarioAccountIds);
  else if (accountId) query = query.eq("account_id", accountId);

  const { data, error } = await query;

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

  const { data: form, error } = await supabase
    .from("line_registration_forms")
    .insert({
      account_id,
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

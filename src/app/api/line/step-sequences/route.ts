import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";

/**
 * 段階5 Step 11:account_id → scenario_id 解決ヘルパー。
 * line_accounts から scenario_id を引く。アカウント不在 / scenario_id 列なし / scenario_id NULL の場合は null を返す。
 * 列なしエラー(Step 02 未適用)は呼び出し側で account_id fallback に切り替えるためのシグナルとして利用。
 */
async function resolveScenarioFromAccount(
  accountId: string,
): Promise<{ scenario_id: string | null; columnMissing: boolean }> {
  const r = await supabase
    .from("line_accounts")
    .select("scenario_id")
    .eq("id", accountId)
    .maybeSingle();
  if (r.error) {
    if (/scenario_id/i.test(r.error.message)) {
      return { scenario_id: null, columnMissing: true };
    }
    // 他のエラーは呼び出し側で握りつぶし、account_id fallback へ
    return { scenario_id: null, columnMissing: false };
  }
  return {
    scenario_id: ((r.data?.scenario_id as string | null) ?? null),
    columnMissing: false,
  };
}

export async function GET(request: NextRequest) {
  const accountId = request.nextUrl.searchParams.get("account_id");
  const kind = request.nextUrl.searchParams.get("kind");

  // 段階5 Step 11:account_id クエリは後方互換維持。内部で scenario_id 主軸に切り替える。
  // primary path:account_id → scenario_id 解決 → scenario_id でフィルタ
  // fallback path:scenario_id 列なし(Step 02 未適用)or scenario_id 解決不可 → account_id でフィルタ
  let scenarioId: string | null = null;
  if (accountId) {
    const resolved = await resolveScenarioFromAccount(accountId);
    scenarioId = resolved.scenario_id;
  }

  let query = supabase
    .from("line_step_sequences")
    .select("*, messages:line_step_messages(*)")
    .order("created_at", { ascending: false });

  if (scenarioId) {
    query = query.eq("scenario_id", scenarioId);
  } else if (accountId) {
    // scenario_id 解決できず account_id があれば従来パスへ
    query = query.eq("account_id", accountId);
  }
  if (kind) query = query.eq("kind", kind);

  let { data, error } = await query;

  // Step 02 未適用環境 fallback:scenario_id 列なしエラー → account_id で再取得
  if (error && /scenario_id/i.test(error.message) && accountId) {
    let fbQuery = supabase
      .from("line_step_sequences")
      .select("*, messages:line_step_messages(*)")
      .eq("account_id", accountId)
      .order("created_at", { ascending: false });
    if (kind) fbQuery = fbQuery.eq("kind", kind);
    const fb = await fbQuery;
    data = fb.data;
    error = fb.error;
  }

  // Step 11 適用後 fallback:account_id 列なしエラー(scenario_id 解決失敗時のみ到達)
  // → 該当データなし扱いで空配列を返す
  if (error && /account_id/i.test(error.message)) {
    return Response.json([]);
  }

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  // Sort nested messages by step_order
  const sorted = (data ?? []).map((seq: any) => ({
    ...seq,
    messages: (seq.messages ?? []).sort(
      (a: any, b: any) => a.step_order - b.step_order
    ),
  }));

  return Response.json(sorted);
}

export async function POST(request: NextRequest) {
  const body = await request.json();

  if (!body.account_id || !body.name) {
    return Response.json({ error: "account_id and name are required" }, { status: 400 });
  }

  // 段階5 Step 11:scenario_id を解決して INSERT 時に同梱(両列環境でも片列環境でも動作)。
  const resolved = await resolveScenarioFromAccount(body.account_id);
  const scenarioId = resolved.scenario_id;

  const insertRow: Record<string, unknown> = {
    account_id: body.account_id,
    name: body.name,
  };
  if (scenarioId) insertRow.scenario_id = scenarioId;
  if (body.kind !== undefined) insertRow.kind = body.kind;
  if (body.scheduled_at !== undefined) insertRow.scheduled_at = body.scheduled_at;
  if (body.target_condition !== undefined) insertRow.target_condition = body.target_condition;

  let { data, error } = await supabase
    .from("line_step_sequences")
    .insert(insertRow)
    .select("id")
    .single();

  // Step 11 適用後 fallback:account_id 列削除エラー → account_id を抜いて再 INSERT
  if (error && /account_id/i.test(error.message)) {
    const { account_id: _a, ...rest } = insertRow as Record<string, unknown>;
    void _a;
    const fb = await supabase
      .from("line_step_sequences")
      .insert(rest)
      .select("id")
      .single();
    data = fb.data;
    error = fb.error;
  }

  // Step 02 未適用環境 fallback:scenario_id 列削除エラー → scenario_id を抜いて再 INSERT
  if (error && /scenario_id/i.test(error.message)) {
    const { scenario_id: _s, ...rest } = insertRow as Record<string, unknown>;
    void _s;
    const fb = await supabase
      .from("line_step_sequences")
      .insert(rest)
      .select("id")
      .single();
    data = fb.data;
    error = fb.error;
  }

  // kind/scheduled_at カラム未作成環境への fallback(account_id + scenario_id は維持)
  if (error && /(kind|scheduled_at|target_condition)/.test(error.message)) {
    const baseRow: Record<string, unknown> = {
      account_id: body.account_id,
      name: body.name,
    };
    if (scenarioId) baseRow.scenario_id = scenarioId;
    const fb = await supabase
      .from("line_step_sequences")
      .insert(baseRow)
      .select("id")
      .single();
    data = fb.data;
    error = fb.error;
  }

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ ok: true, id: data!.id });
}

export async function PUT(request: NextRequest) {
  const body = await request.json();

  if (!body.id) {
    return Response.json({ error: "id is required" }, { status: 400 });
  }

  const updates: Record<string, any> = {
    updated_at: new Date().toISOString(),
  };
  if (body.name !== undefined) updates.name = body.name;
  if (body.status !== undefined) updates.status = body.status;
  if (body.kind !== undefined) updates.kind = body.kind;
  if (body.scheduled_at !== undefined) updates.scheduled_at = body.scheduled_at;
  if (body.sent_at !== undefined) updates.sent_at = body.sent_at;
  if (body.target_condition !== undefined) updates.target_condition = body.target_condition;

  let { error } = await supabase
    .from("line_step_sequences")
    .update(updates)
    .eq("id", body.id);

  // カラム未作成環境への fallback
  if (error && /(kind|scheduled_at|sent_at|target_condition)/.test(error.message)) {
    const {
      kind: _k,
      scheduled_at: _s,
      sent_at: _sa,
      target_condition: _tc,
      ...rest
    } = updates;
    void _k; void _s; void _sa; void _tc;
    ({ error } = await supabase
      .from("line_step_sequences")
      .update(rest)
      .eq("id", body.id));
  }

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const body = await request.json();

  if (!body.id) {
    return Response.json({ error: "id is required" }, { status: 400 });
  }

  const { error } = await supabase
    .from("line_step_sequences")
    .delete()
    .eq("id", body.id);

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ ok: true });
}

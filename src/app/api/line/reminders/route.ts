import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";
import { resolveAccountIdsFromScenario } from "@/lib/scenario-resolve";

// 段階6b2: scenario_id クエリ追加(scenario 配下統合表示)。
// line_reminders には scenario_id 列なし(段階7 で schema 移行検討)→ scenario→account_ids 解決の
// IN 句で集約。account_id クエリは後方互換維持。
// パターン出典: src/app/api/line/messages/route.ts(段階6a)

export async function GET(request: NextRequest) {
  const accountId = request.nextUrl.searchParams.get("account_id");
  const scenarioId = request.nextUrl.searchParams.get("scenario_id");
  if (!accountId && !scenarioId) {
    return Response.json({ error: "account_id or scenario_id is required" }, { status: 400 });
  }

  // 段階7-A2: 案 Y(過渡期ハイブリッド)直 hit 化
  let query = supabase
    .from("line_reminders")
    .select("*, line_reminder_messages(*)")
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
      .from("line_reminders")
      .select("*, line_reminder_messages(*)")
      .in("account_id", resolved.account_ids)
      .order("created_at", { ascending: false }));
  }

  if (error) return Response.json({ error: error.message }, { status: 500 });

  const reminders = (data ?? []).map((r: Record<string, unknown>) => ({
    ...r,
    messages: ((r.line_reminder_messages as Record<string, unknown>[]) ?? []).sort(
      (a: Record<string, unknown>, b: Record<string, unknown>) =>
        ((a.msg_order as number) ?? 0) - ((b.msg_order as number) ?? 0),
    ),
  }));

  return Response.json(reminders);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  if (!body.account_id || !body.name) {
    return Response.json({ error: "account_id and name are required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("line_reminders")
    .insert({
      account_id: body.account_id,
      name: body.name,
      base_date_field: body.base_date_field || "custom",
      status: "active",
      target_condition: body.target_condition ?? null,
    })
    .select("id")
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });

  if (body.messages && Array.isArray(body.messages) && body.messages.length > 0) {
    const msgs = body.messages.map((m: Record<string, unknown>, i: number) => ({
      reminder_id: data!.id,
      msg_order: i + 1,
      offset_days: m.offset_days ?? 0,
      offset_time: m.offset_time || "09:00",
      msg_type: m.msg_type || "text",
      payload: m.payload ?? {},
      body: m.body || null,
    }));
    const { error: msgError } = await supabase.from("line_reminder_messages").insert(msgs);
    if (msgError) return Response.json({ error: msgError.message }, { status: 500 });
  }

  return Response.json({ ok: true, id: data!.id });
}

export async function PUT(request: NextRequest) {
  const body = await request.json();
  if (!body.id) return Response.json({ error: "id is required" }, { status: 400 });

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.name !== undefined) updates.name = body.name;
  if (body.status !== undefined) updates.status = body.status;
  if (body.base_date_field !== undefined) updates.base_date_field = body.base_date_field;

  const { error } = await supabase
    .from("line_reminders")
    .update(updates)
    .eq("id", body.id);

  if (error) return Response.json({ error: error.message }, { status: 500 });

  // メッセージの更新（全削除→再挿入）
  if (body.messages && Array.isArray(body.messages)) {
    await supabase.from("line_reminder_messages").delete().eq("reminder_id", body.id);
    if (body.messages.length > 0) {
      const msgs = body.messages.map((m: Record<string, unknown>, i: number) => ({
        reminder_id: body.id,
        msg_order: i + 1,
        offset_days: m.offset_days ?? 0,
        offset_time: m.offset_time || "09:00",
        msg_type: m.msg_type || "text",
        payload: m.payload ?? {},
        body: m.body || null,
      }));
      await supabase.from("line_reminder_messages").insert(msgs);
    }
  }

  return Response.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const body = await request.json();
  if (!body.id) return Response.json({ error: "id is required" }, { status: 400 });

  const { error } = await supabase.from("line_reminders").delete().eq("id", body.id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}

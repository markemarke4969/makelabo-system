import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";
import { resolveAccountIdsFromScenario } from "@/lib/scenario-resolve";

// 段階6c2: scenario_id クエリ追加(配下 account_ids 解決 → IN 句集約)。

export async function GET(request: NextRequest) {
  const accountId = request.nextUrl.searchParams.get("account_id");
  const scenarioId = request.nextUrl.searchParams.get("scenario_id");
  if (!accountId && !scenarioId) {
    return Response.json({ error: "account_id or scenario_id is required" }, { status: 400 });
  }

  // 段階7-A2: 案 Y(過渡期ハイブリッド)直 hit 化
  let query = supabase
    .from("line_templates")
    .select("*, line_template_messages(*)")
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

  let { data, error } = await query;

  // 7-A1 未適用環境 fallback
  if (error && scenarioId && !accountId && /scenario_id/i.test(error.message)) {
    const resolved = await resolveAccountIdsFromScenario(scenarioId);
    if (resolved.account_ids.length === 0) return Response.json([]);
    ({ data, error } = await supabase
      .from("line_templates")
      .select("*, line_template_messages(*)")
      .in("account_id", resolved.account_ids)
      .order("sort_order", { ascending: true }));
  }

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  // メッセージをmsg_order順にソート
  const templates = (data ?? []).map((t: Record<string, unknown>) => ({
    ...t,
    messages: ((t.line_template_messages as Record<string, unknown>[]) ?? []).sort(
      (a: Record<string, unknown>, b: Record<string, unknown>) =>
        ((a.msg_order as number) ?? 0) - ((b.msg_order as number) ?? 0),
    ),
  }));

  return Response.json(templates);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  if (!body.account_id || !body.name) {
    return Response.json({ error: "account_id and name are required" }, { status: 400 });
  }

  // 段階5(案B):line_accounts.group_name 廃止に伴い、line_templates 側の group_name 参照も削除
  // line_templates.group_name 列自体は別タスクで判断(列が残っていても害はない)
  const tplInsert: Record<string, unknown> = {
    account_id: body.account_id,
    name: body.name,
  };

  let { data, error } = await supabase
    .from("line_templates")
    .insert(tplInsert)
    .select("id")
    .single();

  // group_name NOT NULL 制約環境(旧スキーマ)への fallback:
  // 旧 group_name 列が NOT NULL の場合、明示的に null を渡しても insert エラーになる可能性がある
  // その場合は body.group_name または空文字を fallback で渡す
  if (error && /group_name/i.test(error.message)) {
    ({ data, error } = await supabase
      .from("line_templates")
      .insert({ ...tplInsert, group_name: body.group_name ?? "" })
      .select("id")
      .single());
  }

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  // メッセージも一緒に作成
  if (body.messages && Array.isArray(body.messages) && body.messages.length > 0) {
    const msgs = body.messages.map((m: Record<string, unknown>, i: number) => ({
      template_id: data!.id,
      msg_order: i + 1,
      msg_type: m.msg_type || "text",
      payload: m.payload ?? {},
      body: m.body || null,
    }));
    const { error: msgError } = await supabase.from("line_template_messages").insert(msgs);
    if (msgError) {
      return Response.json({ error: msgError.message }, { status: 500 });
    }
  }

  return Response.json({ ok: true, id: data!.id });
}

export async function PUT(request: NextRequest) {
  const body = await request.json();
  if (!body.id) {
    return Response.json({ error: "id is required" }, { status: 400 });
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.name !== undefined) updates.name = body.name;
  if (body.sort_order !== undefined) updates.sort_order = body.sort_order;
  // 段階5(案B):group_name 参照は削除(line_accounts.group_name 廃止と整合)
  // 旧クライアントが body.group_name を送っても無視する後方互換動作

  const { error } = await supabase
    .from("line_templates")
    .update(updates)
    .eq("id", body.id);

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  // メッセージの置き換え（全削除→再挿入）
  if (body.messages && Array.isArray(body.messages)) {
    await supabase.from("line_template_messages").delete().eq("template_id", body.id);
    if (body.messages.length > 0) {
      const msgs = body.messages.map((m: Record<string, unknown>, i: number) => ({
        template_id: body.id,
        msg_order: i + 1,
        msg_type: m.msg_type || "text",
        payload: m.payload ?? {},
        body: m.body || null,
      }));
      const { error: msgError } = await supabase.from("line_template_messages").insert(msgs);
      if (msgError) {
        return Response.json({ error: msgError.message }, { status: 500 });
      }
    }
  }

  return Response.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const body = await request.json();
  if (!body.id) {
    return Response.json({ error: "id is required" }, { status: 400 });
  }

  const { error } = await supabase.from("line_templates").delete().eq("id", body.id);
  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ ok: true });
}

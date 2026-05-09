import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";

// ============================================================
// LINE アカウント管理 API(段階5 案B 対応・後方互換維持)
// ============================================================
// 段階5 で line_accounts.group_name 列は廃止予定(Step 12)、
// 代わりに line_accounts.scenario_id 列でアカウントの所属シナリオを管理する。
//
// 本ファイルは以下の状態すべてに対応:
//   - 状態1(Step 02 未適用):scenario_id 列無し、group_name 列あり → 従来動作
//   - 状態2(Step 02〜04 適用 + Step 12 未適用):両方の列が共存 → 両方扱う
//   - 状態3(Step 12 適用後):scenario_id 列のみ、group_name 列削除済 → scenario_id のみ
//
// POST 時のバリデーション:
//   - scenario_id 指定 → line_scenarios で存在確認(テーブル不在ならスキップ)
//   - group_name 指定 → line_account_groups で存在確認(テーブル不在ならスキップ)
//   - 両方未指定 → 400(従来通り「グループ未所属のアカウントは追加不可」)
//
// 草案出典: C:\Users\lmsml\.claude\plans\07-calm-pudding.md §11(低優先度・accounts)
// ============================================================

interface ColumnAvailability {
  groupName: boolean;
  scenarioId: boolean;
  greeting: boolean;
  newsletter: boolean;
  orderIndex: boolean;
}

export async function GET(request: NextRequest) {
  const projectId = request.nextUrl.searchParams.get("project_id");

  const buildQuery = (opts: ColumnAvailability) => {
    const base = "id, channel_id, account_name, basic_id, is_active, project_id, role";
    const cols = [
      base,
      opts.groupName ? "group_name" : null,
      opts.scenarioId ? "scenario_id" : null,
      opts.orderIndex ? "order_index" : null,
      opts.greeting ? "greeting_message" : null,
      opts.newsletter ? "newsletter_from_email, newsletter_from_name" : null,
    ]
      .filter(Boolean)
      .join(", ");
    let q = supabase.from("line_accounts").select(cols).order("created_at", { ascending: false });
    if (projectId) q = q.eq("project_id", projectId);
    return q;
  };

  // 全カラム取得を試行、足りない列があれば段階的に削っていく
  const tryQuery = async (cols: ColumnAvailability) => {
    const { data, error } = await buildQuery(cols);
    return { data, error };
  };

  let cols: ColumnAvailability = {
    groupName: true,
    scenarioId: true,
    greeting: true,
    newsletter: true,
    orderIndex: true,
  };
  let { data, error } = await tryQuery(cols);

  // scenario_id 列未作成への fallback(Step 02 未適用)
  if (error && /scenario_id/i.test(error.message)) {
    cols = { ...cols, scenarioId: false };
    ({ data, error } = await tryQuery(cols));
  }
  // group_name 列削除後への fallback(Step 12 適用後)
  if (error && /group_name/i.test(error.message)) {
    cols = { ...cols, groupName: false };
    ({ data, error } = await tryQuery(cols));
  }
  // order_index 列未作成への fallback
  if (error && /order_index/.test(error.message)) {
    cols = { ...cols, orderIndex: false };
    ({ data, error } = await tryQuery(cols));
  }
  // newsletter_from_* 列未作成への fallback
  if (error && /newsletter_from_/.test(error.message)) {
    cols = { ...cols, newsletter: false };
    ({ data, error } = await tryQuery(cols));
  }
  // greeting_message 列未作成への fallback
  if (error && /greeting_message/.test(error.message)) {
    cols = { ...cols, greeting: false };
    ({ data, error } = await tryQuery(cols));
  }

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json(data);
}

/**
 * scenario_id 指定時、line_scenarios で存在確認。テーブル不在(Step 01 未適用)ならスキップ。
 */
async function validateScenarioId(scenarioId: string, projectId: string | null): Promise<{
  ok: boolean;
  reason?: string;
  legacyFallback: boolean;
}> {
  let q = supabase.from("line_scenarios").select("id").eq("id", scenarioId);
  if (projectId) q = q.eq("project_id", projectId);
  const r = await q.maybeSingle();
  if (r.error) {
    if (/line_scenarios/i.test(r.error.message) || r.error.code === "PGRST205") {
      return { ok: false, legacyFallback: true };
    }
    return { ok: false, legacyFallback: false, reason: r.error.message };
  }
  if (!r.data) {
    return { ok: false, legacyFallback: false, reason: `scenario not found: ${scenarioId}` };
  }
  return { ok: true, legacyFallback: false };
}

/**
 * group_name 指定時、line_account_groups で存在確認。テーブル不在(Step 12 適用後)ならスキップ。
 */
async function validateGroupName(groupName: string, projectId: string | null): Promise<{
  ok: boolean;
  reason?: string;
  legacyFallback: boolean;
}> {
  let q = supabase.from("line_account_groups").select("group_name").eq("group_name", groupName);
  if (projectId) q = q.eq("project_id", projectId);
  const r = await q.maybeSingle();
  if (r.error) {
    if (/line_account_groups/i.test(r.error.message) || r.error.code === "PGRST205") {
      return { ok: false, legacyFallback: true };
    }
    return { ok: false, legacyFallback: false, reason: r.error.message };
  }
  if (!r.data) {
    return {
      ok: false,
      legacyFallback: false,
      reason: `指定されたグループ「${groupName}」が存在しません`,
    };
  }
  return { ok: true, legacyFallback: false };
}

export async function POST(request: NextRequest) {
  const body = await request.json();

  const groupName = typeof body.group_name === "string" ? body.group_name.trim() : "";
  const scenarioId = typeof body.scenario_id === "string" ? body.scenario_id.trim() : "";

  if (!groupName && !scenarioId) {
    return Response.json(
      {
        error:
          "シナリオまたはグループを選択してください(段階5 では scenario_id 推奨)",
      },
      { status: 400 },
    );
  }

  // scenario_id が指定されていれば優先で検証
  if (scenarioId) {
    const v = await validateScenarioId(scenarioId, body.project_id ?? null);
    if (!v.ok && !v.legacyFallback) {
      return Response.json({ error: v.reason ?? "scenario validation failed" }, { status: 400 });
    }
    // legacyFallback の場合は line_scenarios 不在 → group_name バリデーションに移る
  }

  // scenario_id が指定されていない、または line_scenarios 不在の場合は group_name 検証
  if (groupName && !scenarioId) {
    const v = await validateGroupName(groupName, body.project_id ?? null);
    if (!v.ok && !v.legacyFallback) {
      return Response.json({ error: v.reason ?? "group validation failed" }, { status: 400 });
    }
    // legacyFallback の場合(line_account_groups 不在 = Step 12 適用後)はスキップして続行
  }

  const insertBody: Record<string, unknown> = {
    account_name: body.account_name || null,
    channel_id: body.channel_id,
    basic_id: body.basic_id || null,
    channel_secret: body.channel_secret,
    channel_access_token: body.channel_access_token,
    project_id: body.project_id || null,
    role: body.role || "main",
    greeting_message: body.greeting_message || null,
    newsletter_from_email: body.newsletter_from_email || null,
    newsletter_from_name: body.newsletter_from_name || null,
  };
  if (groupName) insertBody.group_name = groupName;
  if (scenarioId) insertBody.scenario_id = scenarioId;
  if (typeof body.order_index === "number" && Number.isFinite(body.order_index)) {
    insertBody.order_index = body.order_index;
  }

  const tryInsert = async (b: Record<string, unknown>) =>
    supabase.from("line_accounts").insert(b).select("id").single();

  let { data, error } = await tryInsert(insertBody);

  // scenario_id 列未作成への fallback(Step 02 未適用)
  if (error && /scenario_id/i.test(error.message)) {
    const { scenario_id: _s, ...rest } = insertBody as Record<string, unknown>;
    void _s;
    ({ data, error } = await tryInsert(rest));
  }

  // group_name 列削除後への fallback(Step 12 適用後)
  if (error && /group_name/i.test(error.message)) {
    const { group_name: _g, ...rest } = insertBody as Record<string, unknown>;
    void _g;
    ({ data, error } = await tryInsert(rest));
  }

  // order_index カラム未作成への fallback
  if (error && /order_index/.test(error.message)) {
    const { order_index: _o, ...rest } = insertBody as Record<string, unknown>;
    void _o;
    ({ data, error } = await tryInsert(rest));
  }

  // newsletter_from_* カラム未作成への fallback
  if (error && /newsletter_from_/.test(error.message)) {
    const { newsletter_from_email: _a, newsletter_from_name: _b, ...rest } =
      insertBody as Record<string, unknown>;
    void _a;
    void _b;
    ({ data, error } = await tryInsert(rest));
  }

  if (error) {
    // 段階8-2-H: PostgreSQL UNIQUE 違反は 409 Conflict で可視化(silent fail 防止)。
    // line_accounts_scenario_channel_unique / line_accounts_scenario_basic_unique で弾かれたケース。
    // PostgrestError.code === '23505' が UNIQUE violation の SQLSTATE。
    if ((error as { code?: string }).code === "23505") {
      return Response.json(
        {
          error: "duplicate",
          detail: "同一シナリオ内に既に同じ channel_id または basic_id のアカウントが存在します",
          constraint: error.message,
        },
        { status: 409 },
      );
    }
    return Response.json({ error: error.message }, { status: 500 });
  }

  // role=standby の場合のみ line_account_pool にも登録
  if (data?.id && insertBody.role === "standby" && insertBody.project_id) {
    const { error: poolErr } = await supabase
      .from("line_account_pool")
      .insert({
        project_id: insertBody.project_id,
        account_id: data.id,
        status: "ready",
      });
    if (poolErr) {
      console.error("[accounts] pool登録失敗:", poolErr.message);
    }
  }

  return Response.json({ ok: true, id: data?.id });
}

export async function PUT(request: NextRequest) {
  const body = await request.json();

  if (!body.id) {
    return Response.json({ error: "id is required" }, { status: 400 });
  }

  // 提供されたフィールドのみ更新（空文字で既存値を消さない）
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.account_name !== undefined) updates.account_name = body.account_name || null;
  if (body.channel_id !== undefined && body.channel_id !== "") updates.channel_id = body.channel_id;
  if (body.basic_id !== undefined) updates.basic_id = body.basic_id || null;
  // secret/token は空文字の場合「変更しない」扱い（GET で返していないので編集時は空になる）
  if (body.channel_secret !== undefined && body.channel_secret !== "") updates.channel_secret = body.channel_secret;
  if (body.channel_access_token !== undefined && body.channel_access_token !== "") updates.channel_access_token = body.channel_access_token;
  if (body.group_name !== undefined) updates.group_name = body.group_name || null;
  if (body.scenario_id !== undefined) updates.scenario_id = body.scenario_id || null;
  if (body.project_id !== undefined) updates.project_id = body.project_id || null;
  if (body.is_active !== undefined) updates.is_active = body.is_active;
  if (body.role !== undefined) updates.role = body.role || null;
  if (body.order_index !== undefined && Number.isFinite(Number(body.order_index))) {
    updates.order_index = Number(body.order_index);
  }
  if (body.greeting_message !== undefined) updates.greeting_message = body.greeting_message || null;
  if (body.newsletter_from_email !== undefined) updates.newsletter_from_email = body.newsletter_from_email || null;
  if (body.newsletter_from_name !== undefined) updates.newsletter_from_name = body.newsletter_from_name || null;

  const tryUpdate = async (u: Record<string, unknown>) =>
    supabase.from("line_accounts").update(u).eq("id", body.id);

  let { error } = await tryUpdate(updates);

  // scenario_id 列未作成への fallback(Step 02 未適用)
  if (error && /scenario_id/i.test(error.message)) {
    const { scenario_id: _s, ...rest } = updates as Record<string, unknown>;
    void _s;
    ({ error } = await tryUpdate(rest));
  }

  // group_name 列削除後への fallback(Step 12 適用後)
  if (error && /group_name/i.test(error.message)) {
    const { group_name: _g, ...rest } = updates as Record<string, unknown>;
    void _g;
    ({ error } = await tryUpdate(rest));
  }

  // order_index カラム未作成時の fallback
  if (error && /order_index/.test(error.message)) {
    const { order_index: _o, ...rest } = updates as Record<string, unknown>;
    void _o;
    ({ error } = await tryUpdate(rest));
  }

  // newsletter_from_* カラム未作成時の fallback
  if (error && /newsletter_from_/.test(error.message)) {
    const { newsletter_from_email: _a, newsletter_from_name: _b, ...rest } =
      updates as Record<string, unknown>;
    void _a;
    void _b;
    ({ error } = await tryUpdate(rest));
  }

  // greeting_message カラム未作成時の fallback
  if (error && /greeting_message/.test(error.message)) {
    const { greeting_message: _omit, ...rest } = updates as Record<string, unknown>;
    void _omit;
    ({ error } = await tryUpdate(rest));
  }

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const body = await request.json();
  const { id, detach } = body;

  if (!id) {
    return Response.json({ error: "id is required" }, { status: 400 });
  }

  // detach=true の場合は案件から外すだけ（project_id を null に）、行は残す
  if (detach) {
    const { error } = await supabase
      .from("line_accounts")
      .update({ project_id: null, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ ok: true, detached: true });
  }

  // 完全削除: followers と messages もカスケード削除
  await supabase.from("line_messages").delete().eq("line_account_id", id);
  await supabase.from("line_followers").delete().eq("line_account_id", id);

  const { error } = await supabase.from("line_accounts").delete().eq("id", id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}

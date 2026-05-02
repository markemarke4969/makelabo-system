import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";
import { buildLineMessage, pushLineMessages } from "@/lib/line";
import { evalCondition, DeliveryCondition, FollowerLite } from "@/lib/delivery-conditions";
import { buildReplacerContext, defaultContext } from "@/lib/line-replacer";
import { resolveAccountIdsFromScenario } from "@/lib/scenario-resolve";

export const maxDuration = 300;

// 段階6b2: scenario_id クエリ追加(scenario 配下統合表示)。
// line_reengagement_broadcasts には scenario_id 列なし(段階7 で schema 移行検討)→ IN 句集約。
// reengagement_messages は既に broadcast_id IN 句で結合(L29 周辺)→ scenario 統合でも自然動作。

// 掘り起こし配信一覧
export async function GET(request: NextRequest) {
  const accountId = request.nextUrl.searchParams.get("account_id");
  const scenarioId = request.nextUrl.searchParams.get("scenario_id");
  if (!accountId && !scenarioId) {
    return Response.json({ error: "account_id or scenario_id required" }, { status: 400 });
  }

  // 段階7-A2: 案 Y(過渡期ハイブリッド)直 hit 化
  let query = supabase
    .from("line_reengagement_broadcasts")
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
      .from("line_reengagement_broadcasts")
      .select("*")
      .in("account_id", resolved.account_ids)
      .order("created_at", { ascending: false }));
  }

  if (error) return Response.json({ error: error.message }, { status: 500 });

  // メッセージも結合
  const ids = (data ?? []).map((b) => b.id as string);
  const messagesMap: Record<string, unknown[]> = {};
  if (ids.length > 0) {
    const { data: msgs } = await supabase
      .from("line_reengagement_messages")
      .select("*")
      .in("broadcast_id", ids)
      .order("msg_order", { ascending: true });
    for (const m of msgs ?? []) {
      const bid = m.broadcast_id as string;
      if (!messagesMap[bid]) messagesMap[bid] = [];
      messagesMap[bid].push(m);
    }
  }

  const result = (data ?? []).map((b) => ({
    ...b,
    messages: messagesMap[b.id as string] ?? [],
  }));

  return Response.json(result);
}

// 掘り起こし配信の作成・保存
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { account_id, name, target_condition, messages } = body;

  if (!account_id || !name) {
    return Response.json({ error: "account_id and name required" }, { status: 400 });
  }

  const { data: broadcast, error } = await supabase
    .from("line_reengagement_broadcasts")
    .insert({
      account_id,
      name,
      target_condition: target_condition ?? null,
      status: "draft",
    })
    .select("id")
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });

  // メッセージ保存
  if (Array.isArray(messages) && messages.length > 0) {
    const msgRows = messages.map((m: { msg_type?: string; payload?: unknown; body?: string }, idx: number) => ({
      broadcast_id: broadcast.id,
      msg_order: idx + 1,
      msg_type: m.msg_type ?? "text",
      payload: m.payload ?? {},
      body: m.body ?? null,
    }));
    await supabase.from("line_reengagement_messages").insert(msgRows);
  }

  return Response.json({ ok: true, id: broadcast.id });
}

// 掘り起こし配信の送信実行
export async function PUT(request: NextRequest) {
  const body = await request.json();
  const { id, action } = body;

  if (!id) return Response.json({ error: "id required" }, { status: 400 });

  if (action === "send") {
    // 配信を取得
    const { data: broadcast } = await supabase
      .from("line_reengagement_broadcasts")
      .select("*")
      .eq("id", id)
      .single();

    if (!broadcast) return Response.json({ error: "not found" }, { status: 404 });
    if (broadcast.status === "sent") return Response.json({ error: "already sent" }, { status: 400 });

    // メッセージ取得
    const { data: msgs } = await supabase
      .from("line_reengagement_messages")
      .select("*")
      .eq("broadcast_id", id)
      .order("msg_order", { ascending: true });

    if (!msgs || msgs.length === 0) return Response.json({ error: "no messages" }, { status: 400 });

    // アカウント情報取得
    const { data: account } = await supabase
      .from("line_accounts")
      .select("id, channel_access_token")
      .eq("id", broadcast.account_id)
      .single();

    if (!account?.channel_access_token) return Response.json({ error: "no access token" }, { status: 400 });

    // フォロワー取得
    const { data: allFollowers } = await supabase
      .from("line_followers")
      .select("id, line_user_id, display_name, followed_at, inflow_route_id, status")
      .eq("line_account_id", broadcast.account_id)
      .eq("status", "following");

    // ラベル取得
    const followerIds = (allFollowers ?? []).map((f) => f.id as string);
    const labelMap: Record<string, string[]> = {};
    if (followerIds.length > 0) {
      const { data: flLabels } = await supabase
        .from("line_follower_labels")
        .select("follower_id, label_id")
        .in("follower_id", followerIds);
      for (const fl of flLabels ?? []) {
        const fid = fl.follower_id as string;
        if (!labelMap[fid]) labelMap[fid] = [];
        labelMap[fid].push(fl.label_id as string);
      }
    }

    // 条件で絞り込み
    const condition = broadcast.target_condition as DeliveryCondition | null;
    const targetFollowers = (allFollowers ?? []).filter((f) => {
      if (!condition || condition.mode === "all") return true;
      const lite: FollowerLite = {
        id: f.id as string,
        line_user_id: f.line_user_id as string,
        display_name: f.display_name as string | null,
        followed_at: f.followed_at as string,
        inflow_route_id: f.inflow_route_id as string | null,
        label_ids: labelMap[f.id as string] ?? [],
      };
      return evalCondition(condition, lite);
    });

    // 送信実行
    let sentCount = 0;
    for (const follower of targetFollowers) {
      const displayName = (follower.display_name as string) ?? "ゲスト";
      const ctx = { ...defaultContext, displayName };

      for (const msg of msgs) {
        const payload = (msg.payload as Record<string, unknown> | null) ?? { msgType: "text", body: msg.body };
        const lineMsg = buildLineMessage(payload, displayName);
        if (!lineMsg) continue;

        try {
          await pushLineMessages(account.channel_access_token as string, follower.line_user_id as string, [lineMsg]);
        } catch { /* */ }
      }
      sentCount++;
    }

    // ステータス更新
    await supabase
      .from("line_reengagement_broadcasts")
      .update({
        status: "sent",
        sent_at: new Date().toISOString(),
        sent_count: sentCount,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    return Response.json({ ok: true, sent_count: sentCount });
  }

  return Response.json({ error: "invalid action" }, { status: 400 });
}

// 削除
export async function DELETE(request: NextRequest) {
  const body = await request.json();
  const { id } = body;
  if (!id) return Response.json({ error: "id required" }, { status: 400 });

  await supabase.from("line_reengagement_messages").delete().eq("broadcast_id", id);
  const { error } = await supabase.from("line_reengagement_broadcasts").delete().eq("id", id);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ ok: true });
}

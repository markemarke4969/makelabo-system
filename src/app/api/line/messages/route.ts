import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";
import { resolveAccountIdsFromScenario } from "@/lib/scenario-resolve";

// ============================================================
// LINE メッセージ API(段階6a:scenario_id クエリ追加)
// ============================================================
// scenario_id クエリ:
//   - line_messages には scenario_id 列なし(段階5 設計外)
//   - 内部で scenario_id → line_accounts.id[] 解決 → IN 句で集約取得
//   - account_id クエリは後方互換維持(scenario_id と排他)
// ============================================================

export async function GET(request: NextRequest) {
  const userId = request.nextUrl.searchParams.get("user_id");
  const accountId = request.nextUrl.searchParams.get("account_id");
  const scenarioId = request.nextUrl.searchParams.get("scenario_id");

  // scenario_id 指定時:配下 account_id を解決して IN 句に切替
  let scenarioAccountIds: string[] | null = null;
  if (scenarioId && !accountId) {
    const resolved = await resolveAccountIdsFromScenario(scenarioId);
    if (resolved.account_ids.length === 0) {
      // 配下アカウント 0 件(または scenario_id 列なし)→ 空配列
      return Response.json([]);
    }
    scenarioAccountIds = resolved.account_ids;
  }

  let query = supabase
    .from("line_messages")
    .select("*")
    .order("sent_at", { ascending: true })
    .limit(500);

  if (userId) {
    query = query.eq("line_user_id", userId);
  }
  if (scenarioAccountIds) {
    query = query.in("line_account_id", scenarioAccountIds);
  } else if (accountId) {
    query = query.eq("line_account_id", accountId);
  }

  const { data, error } = await query;

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json(data);
}

// 既読にする（指定ユーザーの受信メッセージを既読化）
export async function PATCH(request: NextRequest) {
  const body = await request.json();
  const { line_user_id, account_id } = body;

  if (!line_user_id) {
    return Response.json({ error: "line_user_id is required" }, { status: 400 });
  }

  let query = supabase
    .from("line_messages")
    .update({ is_read: true })
    .eq("line_user_id", line_user_id)
    .eq("direction", "incoming")
    .eq("is_read", false);

  if (account_id) {
    query = query.eq("line_account_id", account_id);
  }

  const { error } = await query;

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ ok: true });
}

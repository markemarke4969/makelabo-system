import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";

/**
 * GET /api/line/project-unread
 * 案件ごとの未読メッセージ件数と未読ユニーク人数を返す
 *
 * Query params:
 * - closer_id: クローザーの場合、自分の担当分のみカウント
 */
export async function GET(request: NextRequest) {
  const closerId = request.nextUrl.searchParams.get("closer_id");

  // 全アカウントとproject_id の紐付けを取得
  const { data: accounts } = await supabase
    .from("line_accounts")
    .select("id, project_id")
    .not("project_id", "is", null);

  if (!accounts || accounts.length === 0) {
    return Response.json({});
  }

  const accountIds = accounts.map((a) => a.id as string);

  // 未読メッセージを取得
  let msgQuery = supabase
    .from("line_messages")
    .select("line_user_id, line_account_id")
    .eq("direction", "incoming")
    .eq("is_read", false)
    .in("line_account_id", accountIds);

  const { data: unreadMsgs } = await msgQuery;

  // クローザーの場合、担当分のみフィルタ
  let filteredMsgs = unreadMsgs ?? [];
  if (closerId) {
    // 担当フォロワーのline_user_idを取得
    const { data: closerFollowers } = await supabase
      .from("line_followers")
      .select("line_user_id")
      .eq("closer_id", closerId);

    if (closerFollowers) {
      const closerUserIds = new Set(closerFollowers.map((f) => f.line_user_id as string));
      filteredMsgs = filteredMsgs.filter((m) => closerUserIds.has(m.line_user_id as string));
    } else {
      filteredMsgs = [];
    }
  }

  // account_id → project_id のマッピング
  const accountToProject: Record<string, string> = {};
  for (const a of accounts) {
    accountToProject[a.id as string] = a.project_id as string;
  }

  // project_id ごとにカウント
  const result: Record<string, { unread_count: number; unread_users: number }> = {};
  const projectUserSets: Record<string, Set<string>> = {};

  for (const msg of filteredMsgs) {
    const projectId = accountToProject[msg.line_account_id as string];
    if (!projectId) continue;

    if (!result[projectId]) {
      result[projectId] = { unread_count: 0, unread_users: 0 };
      projectUserSets[projectId] = new Set();
    }

    result[projectId].unread_count++;
    projectUserSets[projectId].add(msg.line_user_id as string);
  }

  // ユニーク人数をセット
  for (const [pid, userSet] of Object.entries(projectUserSets)) {
    result[pid].unread_users = userSet.size;
  }

  return Response.json(result);
}

import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";
import crypto from "crypto";

interface AccountRow {
  id: string;
  channel_id: string | null;
  account_name: string | null;
  basic_id: string | null;
  role: string | null;
  project_id: string | null;
  channel_secret: string | null;
  channel_access_token: string | null;
}

/**
 * LINE ハーネスの診断エンドポイント
 * - project_id 指定で該当案件のアカウントと受信履歴を集約表示
 * - channel_secret は長さとハッシュプレフィックスのみ返す（値そのものは返さない）
 */
export async function GET(request: NextRequest) {
  const projectId = request.nextUrl.searchParams.get("project_id");
  const accountName = request.nextUrl.searchParams.get("account_name");

  // account_name パラメータは line_projects.name (案件名) と
  // line_accounts.account_name (チャンネル個別名) の両方で検索する
  let matchedProjects: Array<{ id: string; name: string }> = [];
  if (accountName) {
    const { data: projs, error: projErr } = await supabase
      .from("line_projects")
      .select("id, name")
      .ilike("name", `%${accountName}%`);
    if (projErr) {
      return Response.json({ error: `line_projects query failed: ${projErr.message}` }, { status: 500 });
    }
    matchedProjects = (projs ?? []) as Array<{ id: string; name: string }>;
  }

  // アカウント取得
  let accQuery = supabase
    .from("line_accounts")
    .select("id, channel_id, account_name, basic_id, role, project_id, channel_secret, channel_access_token");
  if (projectId) accQuery = accQuery.eq("project_id", projectId);
  if (accountName) {
    const projectIds = matchedProjects.map((p) => p.id);
    if (projectIds.length > 0) {
      // line_projects 名一致 OR line_accounts.account_name 一致
      accQuery = accQuery.or(
        `account_name.ilike.%${accountName}%,project_id.in.(${projectIds.join(",")})`,
      );
    } else {
      // プロジェクト名で見つからなければ account_name のみで検索
      accQuery = accQuery.ilike("account_name", `%${accountName}%`);
    }
  }
  const { data: accs, error: accErr } = await accQuery;
  if (accErr) {
    return Response.json({ error: accErr.message }, { status: 500 });
  }

  const accountRows = (accs ?? []) as AccountRow[];
  const accountIds = accountRows.map((a) => a.id);

  // メッセージ件数（24時間以内と累計）を集計
  const since24h = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const messagesByAccount: Record<string, { total: number; last24h: number; latest: string | null; event_types: string[] }> = {};

  if (accountIds.length > 0) {
    const { data: msgs } = await supabase
      .from("line_messages")
      .select("line_account_id, message_type, sent_at")
      .in("line_account_id", accountIds)
      .order("sent_at", { ascending: false })
      .limit(1000);

    for (const m of msgs ?? []) {
      const aid = m.line_account_id;
      if (!messagesByAccount[aid]) {
        messagesByAccount[aid] = { total: 0, last24h: 0, latest: null, event_types: [] };
      }
      messagesByAccount[aid].total += 1;
      if (m.sent_at >= since24h) messagesByAccount[aid].last24h += 1;
      if (!messagesByAccount[aid].latest) messagesByAccount[aid].latest = m.sent_at;
      if (!messagesByAccount[aid].event_types.includes(m.message_type)) {
        messagesByAccount[aid].event_types.push(m.message_type);
      }
    }
  }

  // フォロワー件数
  const followerCounts: Record<string, number> = {};
  if (accountIds.length > 0) {
    const { data: fs } = await supabase
      .from("line_followers")
      .select("line_account_id")
      .in("line_account_id", accountIds);
    for (const f of fs ?? []) {
      followerCounts[f.line_account_id] = (followerCounts[f.line_account_id] ?? 0) + 1;
    }
  }

  // アカウント情報を整形（secret は値を返さず指紋化）
  const accounts = accountRows.map((a) => {
    const secretFingerprint = a.channel_secret
      ? crypto.createHash("sha256").update(a.channel_secret).digest("hex").slice(0, 12)
      : null;
    const msg = messagesByAccount[a.id] ?? { total: 0, last24h: 0, latest: null, event_types: [] };
    return {
      id: a.id,
      channel_id: a.channel_id,
      account_name: a.account_name,
      basic_id: a.basic_id,
      role: a.role,
      project_id: a.project_id,
      has_secret: !!a.channel_secret,
      secret_length: a.channel_secret?.length ?? 0,
      secret_fingerprint: secretFingerprint,
      has_token: !!a.channel_access_token,
      token_length: a.channel_access_token?.length ?? 0,
      messages_total: msg.total,
      messages_last24h: msg.last24h,
      latest_message_at: msg.latest,
      recent_event_types: msg.event_types,
      follower_count: followerCounts[a.id] ?? 0,
    };
  });

  // webhook 受信ログ（line_webhook_logs テーブル。存在しなければ空配列）
  let webhookLogs: unknown[] = [];
  let unmatchedLogs: unknown[] = [];
  let unmatchedCount24h = 0;
  let webhookLogsError: string | null = null;
  {
    const q = await supabase
      .from("line_webhook_logs")
      .select("*")
      .order("received_at", { ascending: false })
      .limit(50);
    if (q.error) {
      webhookLogsError = q.error.message;
    } else {
      webhookLogs = q.data ?? [];
      const all = (q.data ?? []) as Array<{
        matched_account_id: string | null;
        verify_result: string;
        received_at: string;
      }>;
      unmatchedLogs = all
        .filter((l) => !l.matched_account_id || l.verify_result === "no_account_matched")
        .slice(0, 20);
      unmatchedCount24h = all.filter(
        (l) => l.received_at >= since24h && (!l.matched_account_id || l.verify_result === "no_account_matched"),
      ).length;
    }
  }

  // 診断用: 全 line_projects と全 line_accounts 件数（ID不一致の検出に使う）
  const { count: totalAccountsCount } = await supabase
    .from("line_accounts")
    .select("id", { count: "exact", head: true });
  const { data: allProjects } = await supabase
    .from("line_projects")
    .select("id, name")
    .order("name", { ascending: true });

  return Response.json({
    project_id: projectId,
    account_name_filter: accountName,
    matched_projects: matchedProjects,
    account_count: accounts.length,
    accounts,
    webhook_logs: webhookLogs,
    unmatched_webhook_logs: unmatchedLogs,
    unmatched_count_last24h: unmatchedCount24h,
    webhook_logs_error: webhookLogsError,
    total_accounts_in_db: totalAccountsCount ?? 0,
    all_projects: allProjects ?? [],
    hint:
      "account_count=0 の場合は matched_projects と all_projects を確認してください。matched_projects が空なら案件名が登録されていません。matched_projects にあるのに account_count=0 なら、line_accounts 側の project_id が未設定です。",
  });
}

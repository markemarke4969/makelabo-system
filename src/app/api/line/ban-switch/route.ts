import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";
import { createClient as createServerSupabase } from "@/lib/supabase-server";

// ============================================================
// 認可チェック（ハイブリッド・パターンZ）
// ============================================================
// 段階3 B2 対応: ban-switch は破壊的操作のため、以下のいずれかを満たす場合のみ許可。
//   A. Authorization: Bearer $CRON_SECRET     (内部 cron / health-check 用)
//   B. ?secret=$CRON_SECRET                    (内部 cron 用)
//   C. Supabase セッション cookie + user_metadata.is_admin === true (管理画面 UI 用)
//   D. CRON_SECRET 未設定 = 開発環境扱いで全許可
//
// 既存呼出元との対応:
//   - /api/line/health-check → A (Bearer ヘッダ転送)
//   - /line/pool UI (admin) → C (cookie + is_admin)
//
// 参考実装: /api/cron/line-sync-main-to-backup の isAuthorized()
async function isAuthorized(request: NextRequest): Promise<boolean> {
  const secret = process.env.CRON_SECRET;

  // A/B: CRON_SECRET 認証
  if (secret) {
    const auth = request.headers.get("authorization") ?? "";
    if (auth === `Bearer ${secret}`) return true;
    const query = request.nextUrl.searchParams.get("secret");
    if (query === secret) return true;
  } else {
    // D: 開発環境等で未設定なら通す
    return true;
  }

  // C: ログイン済み管理者
  try {
    const server = await createServerSupabase();
    const { data: { user } } = await server.auth.getUser();
    if (user) {
      const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
      if (meta.is_admin === true) return true;
    }
  } catch {
    // Cookie 取得失敗・セッションなし等はそのまま拒否
  }

  return false;
}

// ============================================================
// 通知ヘルパー（Chatwork [toall]）
// ============================================================
async function notifyChatwork(message: string) {
  const token = process.env.CHATWORK_API_TOKEN;
  const roomId = process.env.CHATWORK_ROOM_ID_PERSONAL;
  if (!token || !roomId) return { ok: false, reason: "CHATWORK credentials not set" };

  const bodyText = `[toall]\n${message}`;

  try {
    const form = new URLSearchParams();
    form.set("body", bodyText);
    form.set("self_unread", "1");
    const res = await fetch(
      `https://api.chatwork.com/v2/rooms/${roomId}/messages`,
      {
        method: "POST",
        headers: {
          "X-ChatWorkToken": token,
        },
        body: form,
      }
    );
    return { ok: res.ok, status: res.status };
  } catch (e) {
    return { ok: false, reason: String(e) };
  }
}

async function sendNotifications(message: string) {
  const chatwork = await notifyChatwork(message);
  return { chatwork };
}

// ============================================================
// BAN切り替えメインロジック
// ============================================================
export async function POST(request: NextRequest) {
  if (!(await isAuthorized(request))) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { account_id, project_id, reason } = body;

  if (!account_id) {
    return Response.json({ error: "account_id is required" }, { status: 400 });
  }

  // 1. BANされたアカウントの情報を取得
  const { data: bannedAccount, error: fetchErr } = await supabase
    .from("line_accounts")
    .select("*")
    .eq("id", account_id)
    .single();

  if (fetchErr || !bannedAccount) {
    return Response.json({ error: "Account not found" }, { status: 404 });
  }

  const targetProjectId = project_id || bannedAccount.project_id;

  // 2. BANされたアカウントをマーク
  await supabase
    .from("line_accounts")
    .update({ role: "banned", banned_at: new Date().toISOString(), is_active: false })
    .eq("id", account_id);

  // プールのステータスも更新
  await supabase
    .from("line_account_pool")
    .update({ status: "banned" })
    .eq("account_id", account_id);

  // 3. 予備プールからreadyアカウントを優先度順で取得
  let poolQuery = supabase
    .from("line_account_pool")
    .select("*, line_accounts(*)")
    .eq("status", "ready")
    .order("created_at", { ascending: true })
    .limit(1);

  if (targetProjectId) {
    poolQuery = poolQuery.eq("project_id", targetProjectId);
  }

  const { data: readyPool } = await poolQuery;

  let newAccount = null;
  let switchSuccess = false;

  if (readyPool && readyPool.length > 0) {
    const poolEntry = readyPool[0];
    newAccount = poolEntry.line_accounts;

    // 4. 予備アカウントをactiveに昇格
    await supabase
      .from("line_account_pool")
      .update({ status: "active", activated_at: new Date().toISOString() })
      .eq("id", poolEntry.id);

    await supabase
      .from("line_accounts")
      .update({ role: "main", is_active: true })
      .eq("id", poolEntry.account_id);

    switchSuccess = true;
  }

  // 5. BAN履歴を記録
  await supabase.from("line_ban_history").insert({
    project_id: targetProjectId,
    banned_account_id: account_id,
    new_account_id: newAccount?.id || null,
    note: reason || "Manual BAN switch triggered",
  });

  // 6. 残り予備数を取得
  let remainingQuery = supabase
    .from("line_account_pool")
    .select("id", { count: "exact", head: true })
    .eq("status", "ready");

  if (targetProjectId) {
    remainingQuery = remainingQuery.eq("project_id", targetProjectId);
  }

  const { count: remainingCount } = await remainingQuery;
  const remaining = remainingCount ?? 0;

  // 7. 通知メッセージ作成 & 送信
  const bannedName = bannedAccount.account_name || bannedAccount.channel_id;
  const newName = newAccount?.account_name || "なし（予備切れ）";
  const newBasicId = newAccount?.basic_id ? `@${newAccount.basic_id}` : "未設定";

  let notifyMessage = `\n【BAN検知】\n`;
  notifyMessage += `BANアカウント: ${bannedName}\n`;

  if (switchSuccess) {
    notifyMessage += `切替先: ${newName}（${newBasicId}）\n`;
    notifyMessage += `→ 自動切り替え完了\n`;
  } else {
    notifyMessage += `⚠ 予備アカウントがありません！手動対応が必要です\n`;
  }

  notifyMessage += `残り予備: ${remaining}個\n`;

  if (reason) {
    notifyMessage += `理由: ${reason}\n`;
  }

  const notifyResults = await sendNotifications(notifyMessage);

  // 8. 予備残数アラート（5個以下）
  let alertSent = false;
  if (remaining <= 5) {
    const alertMessage = `\n【予備残数アラート】\n予備残数が${remaining}個です。補充してください。\n現在の残数: ${remaining}個`;
    await sendNotifications(alertMessage);
    alertSent = true;
  }

  return Response.json({
    ok: true,
    switched: switchSuccess,
    banned_account: bannedName,
    new_account: switchSuccess ? newName : null,
    new_basic_id: switchSuccess ? newBasicId : null,
    remaining_standby: remaining,
    alert_sent: alertSent,
    notifications: notifyResults,
  });
}

// ============================================================
// プール状態取得（GET）
// ============================================================
export async function GET(request: NextRequest) {
  if (!(await isAuthorized(request))) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const projectId = request.nextUrl.searchParams.get("project_id");

  // メインアカウント
  let mainQuery = supabase
    .from("line_accounts")
    .select("*")
    .eq("role", "main")
    .eq("is_active", true);
  if (projectId) mainQuery = mainQuery.eq("project_id", projectId);
  const { data: mainAccounts } = await mainQuery;

  // 予備プール
  let poolQuery = supabase
    .from("line_account_pool")
    .select("*, line_accounts(*)")
    .order("created_at", { ascending: true });
  if (projectId) poolQuery = poolQuery.eq("project_id", projectId);
  const { data: pool } = await poolQuery;

  // BAN履歴
  let historyQuery = supabase
    .from("line_ban_history")
    .select("*, banned:banned_account_id(account_name, basic_id), replacement:new_account_id(account_name, basic_id)")
    .order("detected_at", { ascending: false })
    .limit(20);
  if (projectId) historyQuery = historyQuery.eq("project_id", projectId);
  const { data: history } = await historyQuery;

  // 残り予備数
  let countQuery = supabase
    .from("line_account_pool")
    .select("id", { count: "exact", head: true })
    .eq("status", "ready");
  if (projectId) countQuery = countQuery.eq("project_id", projectId);
  const { count } = await countQuery;

  return Response.json({
    main_accounts: mainAccounts ?? [],
    pool: pool ?? [],
    ban_history: history ?? [],
    remaining_standby: count ?? 0,
  });
}

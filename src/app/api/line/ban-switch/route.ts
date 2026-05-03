import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";
import { createClient as createServerSupabase } from "@/lib/supabase-server";
import { resolveAccountIdsFromScenario } from "@/lib/scenario-resolve";

// 段階7-B3:自動 deploy フック追加で内部 fetch を行うため、Vercel 関数の実行時間を拡張。
// 旧:Vercel デフォルト 10 秒 / 新:60 秒(deploy/route.ts と同等)
export const maxDuration = 60;

interface AutoDeployResult {
  attempted: boolean;
  success: boolean;
  skipped_reason?: "no_rep_menu" | "scenario_mismatch" | "no_scenario" | "switch_failed";
  error?: string;
  line_rich_menu_id?: string;
  retry_hint?: string;
}

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
  const bannedScenarioId: string | null =
    (bannedAccount.scenario_id as string | null | undefined) ?? null;

  // 段階7-B3:scenario 境界保護(pre-existing バグ修正)
  // 旧:pool 選択は project_id でしかフィルタしていなかった → 同 project 内の他 scenario の
  // standby が昇格候補に混入するバグ(本番 project 4f065915 = 3 scenario 共有で発生し得る)。
  // 新:bannedAccount.scenario_id 配下の standby account_ids でも絞る。
  // 後方互換:scenario_id NULL の account(段階5 未移行)or scenario_id 列なし環境(7-A1 未適用)
  //         → scenario フィルタ skip(従来挙動)。
  let scenarioName: string | null = null;
  let scopedAccountIds: string[] | null = null;
  if (bannedScenarioId) {
    const resolved = await resolveAccountIdsFromScenario(bannedScenarioId, {
      roles: ["standby"],
    });
    if (!resolved.columnMissing) {
      scopedAccountIds = resolved.account_ids;
    }
    const sn = await supabase
      .from("line_scenarios")
      .select("name")
      .eq("id", bannedScenarioId)
      .maybeSingle();
    scenarioName = (sn.data?.name as string | null | undefined) ?? null;
  }

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
  // 段階7-B3:scopedAccountIds が空配列の場合(scenario 配下 standby ゼロ)はクエリを skip
  // して候補ゼロ確定。null の場合(後方互換)は従来通り project_id only で検索。
  let readyPool: Array<{ id: string; account_id: string; line_accounts: { id: string; account_name: string | null; basic_id: string | null; channel_id: string | null; scenario_id: string | null; project_id: string | null } | null }> = [];
  if (scopedAccountIds !== null && scopedAccountIds.length === 0) {
    // scenario 配下 standby なし、昇格候補ゼロ確定
  } else {
    let poolQuery = supabase
      .from("line_account_pool")
      .select("*, line_accounts(*)")
      .eq("status", "ready")
      .order("created_at", { ascending: true })
      .limit(1);

    if (targetProjectId) {
      poolQuery = poolQuery.eq("project_id", targetProjectId);
    }
    if (scopedAccountIds !== null) {
      poolQuery = poolQuery.in("account_id", scopedAccountIds);
    }

    const r = await poolQuery;
    readyPool = (r.data ?? []) as typeof readyPool;
  }

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

  // 5.5. 段階7-B3:scenario 代表メニューの自動再 deploy(新 main 昇格直後)
  // - 昇格成功 + bannedScenarioId 有 + newAccount.scenario_id == bannedScenarioId 一致時のみ実行
  // - 代表 menu 不在 / scenario mismatch / 未昇格 → skip(ban-switch 全体は成功扱い、judgment 3)
  // - deploy 失敗時も ban-switch 全体は成功扱い、retry 動線(dashboard 手動 retry)で復旧可能
  // - 段階6 c-1b 追補(deploy/route.ts L242 setDefault 強制実行)を流用、本ファイルでは触らない
  const autoDeploy: AutoDeployResult = { attempted: false, success: false };
  if (!switchSuccess) {
    autoDeploy.skipped_reason = "switch_failed";
  } else if (!bannedScenarioId) {
    autoDeploy.skipped_reason = "no_scenario";
  } else {
    // assert:newAccount.scenario_id === bannedScenarioId(commit 3 の pool フィルタで通常は一致、
    // 後方互換 path で mismatch が起きうるため防衛的に確認)
    const newScenarioId = (newAccount as { scenario_id?: string | null } | null)?.scenario_id ?? null;
    if (newScenarioId !== bannedScenarioId) {
      console.warn(
        `[ban-switch] scenario mismatch detected, skip auto-deploy (banned=${bannedScenarioId}, new=${newScenarioId})`,
      );
      autoDeploy.skipped_reason = "scenario_mismatch";
    } else {
      // 代表 menu(scenario_id eq + line_account_id IS NULL)を取得
      const repMenu = await supabase
        .from("line_rich_menus")
        .select("id")
        .eq("scenario_id", bannedScenarioId)
        .is("line_account_id", null)
        .maybeSingle();

      if (repMenu.error || !repMenu.data) {
        autoDeploy.skipped_reason = "no_rep_menu";
      } else {
        autoDeploy.attempted = true;
        const newAccountId = (newAccount as { id: string }).id;
        const origin = request.nextUrl.origin;
        const deployHeaders: Record<string, string> = {
          "Content-Type": "application/json",
        };
        const cronSecret = process.env.CRON_SECRET;
        if (cronSecret) deployHeaders.Authorization = `Bearer ${cronSecret}`;

        // 50 秒 timeout(maxDuration 60 秒の内側、内部 fetch オーバーヘッド + LINE API 数本)
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 50_000);
        try {
          const dRes = await fetch(`${origin}/api/line/rich-menus/deploy`, {
            method: "POST",
            headers: deployHeaders,
            body: JSON.stringify({
              id: (repMenu.data as { id: string }).id,
              retry_account_ids: [newAccountId],
            }),
            signal: ctrl.signal,
          });
          const dData = await dRes.json().catch(() => ({} as Record<string, unknown>));
          if (dRes.ok && dData.ok === true) {
            autoDeploy.success = true;
            // deploy_status.details から該当 account の richmenu id を取り出す
            const ds = dData.deploy_status as
              | { details?: Array<{ account_id: string; line_rich_menu_id?: string }> }
              | undefined;
            const detail = ds?.details?.find((d) => d.account_id === newAccountId);
            if (detail?.line_rich_menu_id) {
              autoDeploy.line_rich_menu_id = detail.line_rich_menu_id;
            }
          } else {
            const ds = dData.deploy_status as
              | { details?: Array<{ account_id: string; status: string; stage?: number; error?: string }> }
              | undefined;
            const detail = ds?.details?.find((d) => d.account_id === newAccountId);
            const errMsg = detail
              ? `stage ${detail.stage ?? "?"}: ${detail.error ?? "unknown"}`
              : (dData.error as string | undefined) ?? `HTTP ${dRes.status}`;
            autoDeploy.error = errMsg;
            autoDeploy.retry_hint = "dashboard リッチメニュー画面のデプロイ状況パネルから手動 retry 可能";
            console.warn(`[ban-switch] auto-deploy failed: ${errMsg}`);
          }
        } catch (e) {
          const isAbort = (e as Error).name === "AbortError";
          autoDeploy.error = isAbort ? "deploy timeout (50s)" : `deploy 例外: ${(e as Error).message}`;
          autoDeploy.retry_hint = "dashboard リッチメニュー画面のデプロイ状況パネルから手動 retry 可能";
          console.warn(`[ban-switch] auto-deploy exception: ${autoDeploy.error}`);
        } finally {
          clearTimeout(timer);
        }
      }
    }
  }

  // 6. 残り予備数を取得
  // 段階7-B3:scopedAccountIds が指定されている場合は scenario 配下に限定してカウント
  // (project 全体の残数ではなく、当該 scenario の残数で予備切れアラート判定)
  let remaining = 0;
  if (scopedAccountIds !== null && scopedAccountIds.length === 0) {
    remaining = 0;
  } else {
    let remainingQuery = supabase
      .from("line_account_pool")
      .select("id", { count: "exact", head: true })
      .eq("status", "ready");

    if (targetProjectId) {
      remainingQuery = remainingQuery.eq("project_id", targetProjectId);
    }
    if (scopedAccountIds !== null) {
      remainingQuery = remainingQuery.in("account_id", scopedAccountIds);
    }

    const { count: remainingCount } = await remainingQuery;
    remaining = remainingCount ?? 0;
  }

  // 7. 通知メッセージ作成 & 送信
  const bannedName = bannedAccount.account_name || bannedAccount.channel_id;
  const newName = newAccount?.account_name || "なし（予備切れ）";
  const newBasicId = newAccount?.basic_id ? `@${newAccount.basic_id}` : "未設定";
  const scenarioLabel = scenarioName ? `（シナリオ: ${scenarioName}）` : "";

  let notifyMessage = `\n【BAN検知】\n`;
  notifyMessage += `BANアカウント: ${bannedName}${scenarioLabel}\n`;

  if (switchSuccess) {
    notifyMessage += `切替先: ${newName}（${newBasicId}）\n`;
    notifyMessage += `→ 自動切り替え完了\n`;
  } else if (scopedAccountIds !== null && scopedAccountIds.length === 0) {
    notifyMessage += `⚠ シナリオ「${scenarioName ?? "?"}」配下に standby がありません！手動対応が必要です\n`;
  } else {
    notifyMessage += `⚠ 予備アカウントがありません！手動対応が必要です\n`;
  }

  notifyMessage += `残り予備${scenarioLabel}: ${remaining}個\n`;

  // 段階7-B3:auto_deploy 結果を通知に追記(成功/失敗/skip いずれも明示)
  if (autoDeploy.attempted && autoDeploy.success) {
    notifyMessage += `✅ リッチメニュー自動配信完了\n`;
  } else if (autoDeploy.attempted && !autoDeploy.success) {
    notifyMessage += `⚠️ リッチメニュー自動配信失敗(${autoDeploy.error ?? "原因不明"})、dashboard で手動 retry 推奨\n`;
  } else if (autoDeploy.skipped_reason === "no_rep_menu") {
    notifyMessage += `ℹ️ リッチメニュー自動配信スキップ(代表メニュー未設定)\n`;
  } else if (autoDeploy.skipped_reason === "scenario_mismatch") {
    notifyMessage += `⚠️ リッチメニュー自動配信スキップ(scenario mismatch、要調査)\n`;
  }

  if (reason) {
    notifyMessage += `理由: ${reason}\n`;
  }

  const notifyResults = await sendNotifications(notifyMessage);

  // 8. 予備残数アラート（5個以下）
  let alertSent = false;
  if (remaining <= 5) {
    const alertMessage = `\n【予備残数アラート】${scenarioLabel}\n予備残数が${remaining}個です。補充してください。\n現在の残数: ${remaining}個`;
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
    scenario_id_used: bannedScenarioId,
    scenario_name_used: scenarioName,
    auto_deploy: autoDeploy,
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

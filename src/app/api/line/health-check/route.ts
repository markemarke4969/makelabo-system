import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";

// Cron認証チェック（Vercel Cron / 外部サービス両対応）
function verifyCron(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // 未設定時はスキップ（開発用）
  // Vercel Cron: Authorizationヘッダー
  const authHeader = request.headers.get("authorization");
  if (authHeader === `Bearer ${secret}`) return true;
  // 外部サービス: クエリパラメータ
  const querySecret = request.nextUrl.searchParams.get("secret");
  if (querySecret === secret) return true;
  return false;
}

// LINE APIヘルスチェック（Bot情報取得で生存確認）
async function checkAccountHealth(accessToken: string): Promise<{ ok: boolean; status: number }> {
  try {
    const res = await fetch("https://api.line.me/v2/bot/info", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    return { ok: res.ok, status: res.status };
  } catch {
    return { ok: false, status: 0 };
  }
}

export async function GET(request: NextRequest) {
  // Cron認証
  if (!verifyCron(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // アクティブなアカウントを全件取得（channel_access_tokenが必要）
  const { data: accounts, error } = await supabase
    .from("line_accounts")
    .select("id, account_name, channel_id, basic_id, channel_access_token, role, project_id, is_active")
    .in("role", ["main", "standby"])
    .eq("is_active", true);

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  if (!accounts || accounts.length === 0) {
    return Response.json({ ok: true, message: "No active accounts to check", checked: 0 });
  }

  const results: {
    account_id: string;
    account_name: string | null;
    status: number;
    healthy: boolean;
    action: string;
  }[] = [];

  for (const acc of accounts) {
    if (!acc.channel_access_token) {
      results.push({
        account_id: acc.id,
        account_name: acc.account_name,
        status: -1,
        healthy: false,
        action: "skipped (no token)",
      });
      continue;
    }

    const health = await checkAccountHealth(acc.channel_access_token);

    if (health.status === 401 || health.status === 403) {
      // BAN検知 → 自動切り替え実行
      const origin = request.nextUrl.origin;
      try {
        // 段階3 B2 対応: ban-switch に認可チェックが入ったため、
        // CRON_SECRET を Authorization ヘッダで転送する。
        // 未設定環境(開発)では ban-switch 側の D ルート(全許可)で通る。
        const switchHeaders: Record<string, string> = {
          "Content-Type": "application/json",
        };
        const cronSecret = process.env.CRON_SECRET;
        if (cronSecret) {
          switchHeaders.Authorization = `Bearer ${cronSecret}`;
        }
        const switchRes = await fetch(`${origin}/api/line/ban-switch`, {
          method: "POST",
          headers: switchHeaders,
          body: JSON.stringify({
            account_id: acc.id,
            project_id: acc.project_id,
            reason: `ヘルスチェックでBAN検知 (HTTP ${health.status})`,
          }),
        });
        const switchData = await switchRes.json();

        results.push({
          account_id: acc.id,
          account_name: acc.account_name,
          status: health.status,
          healthy: false,
          action: switchData.switched
            ? `BAN切替完了 → ${switchData.new_account}`
            : "BAN検知・予備なし",
        });
      } catch (e) {
        results.push({
          account_id: acc.id,
          account_name: acc.account_name,
          status: health.status,
          healthy: false,
          action: `BAN切替失敗: ${String(e)}`,
        });
      }
    } else {
      results.push({
        account_id: acc.id,
        account_name: acc.account_name,
        status: health.status,
        healthy: health.ok,
        action: health.ok ? "healthy" : `unhealthy (${health.status})`,
      });
    }
  }

  const bannedCount = results.filter((r) => r.status === 401 || r.status === 403).length;
  const healthyCount = results.filter((r) => r.healthy).length;

  return Response.json({
    ok: true,
    checked_at: new Date().toISOString(),
    total: accounts.length,
    healthy: healthyCount,
    banned: bannedCount,
    results,
  });
}

// 管理画面からの手動テスト用（BAN 切替は行わず、結果だけ返す）
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const accountId: string | undefined = body.account_id;

  if (!accountId) {
    return Response.json({ error: "account_id is required" }, { status: 400 });
  }

  const { data: acc, error } = await supabase
    .from("line_accounts")
    .select("id, account_name, channel_access_token")
    .eq("id", accountId)
    .maybeSingle();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!acc) return Response.json({ error: "アカウントが見つかりません" }, { status: 404 });
  if (!acc.channel_access_token) {
    return Response.json(
      { ok: false, status: -1, detail: "チャネルアクセストークンが未設定です" },
      { status: 200 },
    );
  }

  // LINE /v2/bot/info で生存確認
  const res = await fetch("https://api.line.me/v2/bot/info", {
    headers: { Authorization: `Bearer ${acc.channel_access_token}` },
  });
  const text = await res.text();

  if (res.ok) {
    let info: { displayName?: string; userId?: string; basicId?: string } = {};
    try { info = JSON.parse(text); } catch { /* ignore */ }
    return Response.json({
      ok: true,
      status: res.status,
      displayName: info.displayName,
      basicId: info.basicId,
      userId: info.userId,
    });
  }

  return Response.json({
    ok: false,
    status: res.status,
    detail: text.slice(0, 300),
    hint:
      res.status === 401
        ? "トークンが無効です。LINE Developers で長期トークンを再発行し、アカウント管理で更新してください。"
        : res.status === 403
          ? "アクセス拒否。チャネル種別またはスコープを確認してください。"
          : undefined,
  });
}

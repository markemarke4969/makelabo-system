import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// 中継URL: /line/r/{project_code}/{inflow_code}
//   project_code = line_projects.code
//   inflow_code  = line_inflow_routes.code
//
// フロー:
//   1. project_code から project を特定
//   2. その project に紐付く流入経路(inflow_code)を取得
//   3. クリックを line_inflow_clicks に記録
//   4. その project の「現在のメインアカウント」を選出
//      優先順位: role='main' かつ is_active かつ banned_at IS NULL
//      → なければ role='main' かつ is_active=true
//      → それも無ければ is_active=true の任意
//   5. そのアカウントの basic_id で友だち追加URLへ302リダイレクト
//
// 目的: BAN で予備LINEに切り替わっても、同じ中継URLで自動的に現行メインへ誘導する。
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ project_code: string; inflow_code: string }> },
) {
  const { project_code, inflow_code } = await params;

  // 1. project 特定
  const { data: project, error: projErr } = await supabase
    .from("line_projects")
    .select("id, name, code")
    .eq("code", project_code)
    .maybeSingle();

  if (projErr || !project) {
    return new Response(`案件が見つかりません (code=${project_code})`, { status: 404 });
  }

  // 2. 流入経路 特定
  const { data: route, error: routeErr } = await supabase
    .from("line_inflow_routes")
    .select("id, code, is_active")
    .eq("project_id", project.id)
    .eq("code", inflow_code)
    .maybeSingle();

  if (routeErr || !route) {
    return new Response(`流入経路が見つかりません (code=${inflow_code})`, { status: 404 });
  }

  // 3. クリックログ記録（失敗してもリダイレクトは実行）
  const userAgent = request.headers.get("user-agent");
  const ipAddress =
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    request.headers.get("x-real-ip") ??
    null;
  const { error: insertErr } = await supabase.from("line_inflow_clicks").insert({
    inflow_route_id: route.id,
    user_agent: userAgent,
    ip_address: ipAddress,
  });
  if (insertErr) {
    console.error("[inflow click insert] error:", insertErr.message);
  }

  // 4. 現在のメインアカウントを選出
  const { data: accounts, error: accErr } = await supabase
    .from("line_accounts")
    .select("id, basic_id, role, is_active, banned_at, created_at")
    .eq("project_id", project.id)
    .eq("is_active", true)
    .order("created_at", { ascending: true });

  if (accErr || !accounts || accounts.length === 0) {
    return new Response("このアクティブなLINEアカウントが見つかりません", { status: 404 });
  }

  // 優先順位: main & not banned > main > any active
  const mainNotBanned = accounts.find((a) => a.role === "main" && !a.banned_at);
  const mainAny = accounts.find((a) => a.role === "main");
  const fallback = accounts[0];
  const target = mainNotBanned ?? mainAny ?? fallback;

  if (!target?.basic_id) {
    return new Response("LINE Basic IDが未設定です", { status: 500 });
  }

  // 5. LINE 友だち追加URLへリダイレクト
  const destination = `https://line.me/R/ti/p/@${target.basic_id}`;
  return Response.redirect(destination, 302);
}

import { NextRequest } from "next/server";
import { supabase, supabaseAdmin } from "@/lib/supabase";

// ============================================================
// 既存の未紐付けフォロワーを line_inflow_clicks と紐付けるバックフィル
// ----------
// POST /api/line/inflow-backfill?project_id=...&window_min=60
//   project_id:   対象案件（必須）
//   window_min:   クリック → フォローの許容時間窓（分、デフォルト60）
//
// ロジック:
//   1. project の全 follower（inflow_route_id IS NULL）を新しい順に取得
//   2. project の未消費クリック（follower_id IS NULL）を新しい順に取得
//   3. 各 follower の followed_at に対して、その前 window_min 分以内で
//      未消費なクリックを1件だけマッチさせる
//   4. マッチしたら follower.inflow_route_id と click.follower_id を相互に埋める
// ============================================================
export async function POST(request: NextRequest) {
  const projectId = request.nextUrl.searchParams.get("project_id");
  const windowMin = Number(request.nextUrl.searchParams.get("window_min") ?? "60");
  if (!projectId) {
    return Response.json({ error: "project_id is required" }, { status: 400 });
  }

  // project の inflow_routes 一覧
  const { data: routes, error: routesErr } = await supabase
    .from("line_inflow_routes")
    .select("id")
    .eq("project_id", projectId);
  if (routesErr) return Response.json({ error: routesErr.message }, { status: 500 });
  const routeIds = (routes ?? []).map((r) => r.id as string);
  if (routeIds.length === 0) {
    return Response.json({ ok: true, linked: 0, reason: "no routes in project" });
  }

  // project の accounts 一覧（follower の絞り込み用）
  const { data: accounts, error: accErr } = await supabase
    .from("line_accounts")
    .select("id")
    .eq("project_id", projectId);
  if (accErr) return Response.json({ error: accErr.message }, { status: 500 });
  const accountIds = (accounts ?? []).map((a) => a.id as string);
  if (accountIds.length === 0) {
    return Response.json({ ok: true, linked: 0, reason: "no accounts in project" });
  }

  // 未紐付け follower 取得
  const { data: followers, error: fErr } = await supabase
    .from("line_followers")
    .select("id, followed_at, inflow_route_id, line_account_id, line_user_id, display_name")
    .in("line_account_id", accountIds)
    .is("inflow_route_id", null)
    .order("followed_at", { ascending: true });
  if (fErr) return Response.json({ error: fErr.message }, { status: 500 });

  // 未消費 click 取得（RLS回避のため service role を使用）
  const { data: clicks, error: cErr } = await supabaseAdmin
    .from("line_inflow_clicks")
    .select("id, inflow_route_id, clicked_at, follower_id")
    .in("inflow_route_id", routeIds)
    .is("follower_id", null)
    .order("clicked_at", { ascending: true });
  if (cErr) return Response.json({ error: cErr.message }, { status: 500 });

  const remainingClicks = [...(clicks ?? [])];
  const linked: Array<{
    follower_id: string;
    line_user_id: string;
    display_name: string | null;
    click_id: string;
    inflow_route_id: string;
    gap_sec: number;
  }> = [];

  for (const f of followers ?? []) {
    const followedAtMs = new Date(f.followed_at as string).getTime();
    const windowStart = followedAtMs - windowMin * 60 * 1000;
    // 直前の未消費クリックを探す
    let bestIdx = -1;
    let bestClickMs = -Infinity;
    for (let i = 0; i < remainingClicks.length; i++) {
      const c = remainingClicks[i];
      const clickMs = new Date(c.clicked_at as string).getTime();
      if (clickMs > followedAtMs) continue; // follower より後のクリックは不可
      if (clickMs < windowStart) continue; // 窓外
      if (clickMs > bestClickMs) {
        bestClickMs = clickMs;
        bestIdx = i;
      }
    }
    if (bestIdx < 0) continue;

    const click = remainingClicks[bestIdx];
    // 紐付け更新（RLS回避のため service role を使用）
    const up1 = await supabaseAdmin
      .from("line_followers")
      .update({ inflow_route_id: click.inflow_route_id })
      .eq("id", f.id);
    const up2 = await supabaseAdmin
      .from("line_inflow_clicks")
      .update({ follower_id: f.id })
      .eq("id", click.id);
    if (up1.error || up2.error) {
      console.error("[inflow-backfill] update error:", up1.error?.message, up2.error?.message);
      continue;
    }
    linked.push({
      follower_id: f.id as string,
      line_user_id: f.line_user_id as string,
      display_name: (f.display_name as string | null) ?? null,
      click_id: click.id as string,
      inflow_route_id: click.inflow_route_id as string,
      gap_sec: Math.floor((followedAtMs - bestClickMs) / 1000),
    });
    // この click は消費済み → 以降のマッチ対象から外す
    remainingClicks.splice(bestIdx, 1);
  }

  return Response.json({
    ok: true,
    project_id: projectId,
    window_min: windowMin,
    scanned_followers: followers?.length ?? 0,
    scanned_clicks: clicks?.length ?? 0,
    linked_count: linked.length,
    linked,
  });
}

import { NextRequest } from "next/server";
import { supabase, supabaseAdmin } from "@/lib/supabase";
import { resolveAccountIdsFromScenario } from "@/lib/scenario-resolve";

export const dynamic = "force-dynamic";

// 段階7-D1: UUID 形式 validation(7-C1 §7-3 placeholder 問題対処、判断 D1-7)
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// GET /api/line/inflow-stats?account_id=...&days=30
//   または ?project_id=... / ?scenario_id=...
// Response:
// {
//   routes: [{ id, name, code, is_active, total_clicks }],
//   daily: [{ date: "2026-04-01", total: 12, by_route: { [route_id]: 3 } }]
// }
//
// 段階7-C1: scenario_id クエリ受付追加(commit 1 inflow-routes と同パターン)
//   - routeQuery 部分のみ修正、後段の click/registered/daily 集計は route_id ベースで自動連動
//   - 過渡期 OR 句:scenario_id 直 hit + scenario_id NULL かつ配下 account_id IN
//   - 孤児ルート(scenario_id NULL かつ account_id NULL)は非表示(判断 A=(b) 過渡期許容)
export async function GET(request: NextRequest) {
  const projectId = request.nextUrl.searchParams.get("project_id");
  const accountId = request.nextUrl.searchParams.get("account_id"); // 後方互換
  const scenarioId = request.nextUrl.searchParams.get("scenario_id");
  const daysParam = request.nextUrl.searchParams.get("days");
  const days = Math.max(1, Math.min(365, Number(daysParam ?? "30") || 30));

  // クエリ何も指定がない場合は 400(commit 1 と整合)
  if (!projectId && !accountId && !scenarioId) {
    return Response.json(
      { error: "project_id, account_id, or scenario_id is required" },
      { status: 400 },
    );
  }

  // 段階7-D1: UUID 形式 validation(7-C1 §7-3 placeholder 問題対処、判断 D1-7)
  // 中括弧 placeholder("{...}") 等の invalid 値を Supabase クエリに渡す前に弾く
  if (projectId && !UUID_REGEX.test(projectId)) {
    return Response.json({ error: "Invalid project_id format" }, { status: 400 });
  }
  if (accountId && !UUID_REGEX.test(accountId)) {
    return Response.json({ error: "Invalid account_id format" }, { status: 400 });
  }
  if (scenarioId && !UUID_REGEX.test(scenarioId)) {
    return Response.json({ error: "Invalid scenario_id format" }, { status: 400 });
  }

  // 1. 流入経路一覧を取得(scope 解決 = scenario_id / account_id / project_id のいずれか)
  let routeQuery = supabase
    .from("line_inflow_routes")
    .select("id, account_id, project_id, name, code, is_active, created_at")
    .order("created_at", { ascending: false });
  if (accountId) {
    // accountId 優先(scenarioId 同時指定でも accountId 単独として扱う、判断 D)
    routeQuery = routeQuery.eq("account_id", accountId);
  } else if (scenarioId) {
    const resolved = await resolveAccountIdsFromScenario(scenarioId);
    if (resolved.account_ids.length === 0) {
      routeQuery = routeQuery.eq("scenario_id", scenarioId);
    } else {
      const idsList = resolved.account_ids.map((id) => `"${id}"`).join(",");
      routeQuery = routeQuery.or(
        `scenario_id.eq.${scenarioId},and(scenario_id.is.null,account_id.in.(${idsList}))`,
      );
    }
  } else if (projectId) {
    routeQuery = routeQuery.eq("project_id", projectId);
  }

  let { data: routes, error: routesErr } = await routeQuery;

  // 段階5-step02 未適用環境 fallback(本番では発火しない想定):scenario_id 列なしエラー → IN 句集約に切替
  if (routesErr && scenarioId && !accountId && /scenario_id/i.test(routesErr.message)) {
    const resolved = await resolveAccountIdsFromScenario(scenarioId);
    if (resolved.account_ids.length === 0) {
      return Response.json({ routes: [], daily: [] });
    }
    const fb = await supabase
      .from("line_inflow_routes")
      .select("id, account_id, project_id, name, code, is_active, created_at")
      .in("account_id", resolved.account_ids)
      .order("created_at", { ascending: false });
    routes = fb.data;
    routesErr = fb.error;
  }

  if (routesErr) {
    return Response.json({ error: routesErr.message }, { status: 500 });
  }
  const routeList = routes ?? [];
  const routeIds = routeList.map((r) => r.id);

  if (routeIds.length === 0) {
    return Response.json({ routes: [], daily: [] });
  }

  // 2. 期間内のクリックログを取得
  const sinceDate = new Date();
  sinceDate.setUTCHours(0, 0, 0, 0);
  sinceDate.setUTCDate(sinceDate.getUTCDate() - (days - 1));
  const sinceIso = sinceDate.toISOString();

  const { data: clicks, error: clicksErr } = await supabaseAdmin
    .from("line_inflow_clicks")
    .select("inflow_route_id, clicked_at")
    .in("inflow_route_id", routeIds)
    .gte("clicked_at", sinceIso)
    .order("clicked_at", { ascending: true });

  if (clicksErr) {
    // line_inflow_clicks 未作成環境では空配列で返す
    return Response.json({
      routes: routeList.map((r) => ({ ...r, total_clicks: 0 })),
      daily: [],
      warn: clicksErr.message,
    });
  }

  // 3. 経路別合計（期間内）
  const totalsByRoute = new Map<string, number>();
  for (const c of clicks ?? []) {
    totalsByRoute.set(c.inflow_route_id, (totalsByRoute.get(c.inflow_route_id) ?? 0) + 1);
  }

  // 4. 日別集計（全期間分の空バケットを先に用意してゼロ埋め）
  const dailyMap = new Map<string, { total: number; by_route: Record<string, number> }>();
  for (let i = 0; i < days; i++) {
    const d = new Date(sinceDate);
    d.setUTCDate(sinceDate.getUTCDate() + i);
    const key = d.toISOString().slice(0, 10);
    dailyMap.set(key, { total: 0, by_route: {} });
  }
  for (const c of clicks ?? []) {
    const key = new Date(c.clicked_at).toISOString().slice(0, 10);
    const bucket = dailyMap.get(key);
    if (!bucket) continue;
    bucket.total += 1;
    bucket.by_route[c.inflow_route_id] = (bucket.by_route[c.inflow_route_id] ?? 0) + 1;
  }

  const daily = Array.from(dailyMap.entries()).map(([date, v]) => ({
    date,
    total: v.total,
    by_route: v.by_route,
  }));

  // 5. 期間内の友だち登録数（流入経路別）
  const registeredByRoute = new Map<string, number>();
  const registeredDailyMap = new Map<string, { total: number; by_route: Record<string, number> }>();
  for (let i = 0; i < days; i++) {
    const d = new Date(sinceDate);
    d.setUTCDate(sinceDate.getUTCDate() + i);
    const key = d.toISOString().slice(0, 10);
    registeredDailyMap.set(key, { total: 0, by_route: {} });
  }
  {
    const { data: regFollowers } = await supabase
      .from("line_followers")
      .select("inflow_route_id, followed_at")
      .in("inflow_route_id", routeIds)
      .gte("followed_at", sinceIso);
    for (const f of regFollowers ?? []) {
      const rid = f.inflow_route_id as string;
      registeredByRoute.set(rid, (registeredByRoute.get(rid) ?? 0) + 1);
      const followedAt = f.followed_at as string | null;
      if (!followedAt) continue;
      const key = followedAt.slice(0, 10);
      const bucket = registeredDailyMap.get(key);
      if (!bucket) continue;
      bucket.total += 1;
      bucket.by_route[rid] = (bucket.by_route[rid] ?? 0) + 1;
    }
  }

  const registeredDaily = Array.from(registeredDailyMap.entries()).map(([date, v]) => ({
    date,
    total: v.total,
    by_route: v.by_route,
  }));

  return Response.json({
    routes: routeList.map((r) => ({
      ...r,
      total_clicks: totalsByRoute.get(r.id) ?? 0,
      total_registered: registeredByRoute.get(r.id) ?? 0,
    })),
    daily,
    registered_daily: registeredDaily,
    days,
  });
}

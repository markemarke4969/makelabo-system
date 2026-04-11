import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// GET /api/line/inflow-stats?account_id=...&days=30
// Response:
// {
//   routes: [{ id, name, code, is_active, total_clicks }],
//   daily: [{ date: "2026-04-01", total: 12, by_route: { [route_id]: 3 } }]
// }
export async function GET(request: NextRequest) {
  const projectId = request.nextUrl.searchParams.get("project_id");
  const accountId = request.nextUrl.searchParams.get("account_id"); // 後方互換
  const daysParam = request.nextUrl.searchParams.get("days");
  const days = Math.max(1, Math.min(365, Number(daysParam ?? "30") || 30));

  // 1. 流入経路一覧を取得
  let routeQuery = supabase
    .from("line_inflow_routes")
    .select("id, account_id, project_id, name, code, is_active, created_at")
    .order("created_at", { ascending: false });
  if (projectId) routeQuery = routeQuery.eq("project_id", projectId);
  else if (accountId) routeQuery = routeQuery.eq("account_id", accountId);

  const { data: routes, error: routesErr } = await routeQuery;
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

  const { data: clicks, error: clicksErr } = await supabase
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

  return Response.json({
    routes: routeList.map((r) => ({
      ...r,
      total_clicks: totalsByRoute.get(r.id) ?? 0,
    })),
    daily,
    days,
  });
}

import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";

/**
 * 登録経路グループ管理 API。
 * account_id or project_id スコープでグループを CRUD。
 */

export async function GET(request: NextRequest) {
  const projectId = request.nextUrl.searchParams.get("project_id");
  const accountId = request.nextUrl.searchParams.get("account_id");

  let q = supabase.from("line_inflow_groups").select("*").order("sort_order", { ascending: true });
  if (projectId) q = q.eq("project_id", projectId);
  else if (accountId) q = q.eq("account_id", accountId);

  const { data, error } = await q;
  if (error) {
    // テーブル未作成なら空配列（マイグレーション前の挙動維持）
    if ((error as { code?: string }).code === "42P01") return Response.json([]);
    return Response.json({ error: error.message }, { status: 500 });
  }

  // グループごとの経路数・集計を付与
  const groups = (data ?? []) as Array<{ id: string; project_id: string | null; account_id: string | null }>;
  if (groups.length === 0) return Response.json([]);

  const groupIds = groups.map((g) => g.id);
  const { data: routes } = await supabase
    .from("line_inflow_routes")
    .select("id, group_id")
    .in("group_id", groupIds);

  const routeCount = new Map<string, number>();
  const routeIdsByGroup = new Map<string, string[]>();
  for (const r of (routes ?? []) as Array<{ id: string; group_id: string | null }>) {
    if (!r.group_id) continue;
    routeCount.set(r.group_id, (routeCount.get(r.group_id) ?? 0) + 1);
    if (!routeIdsByGroup.has(r.group_id)) routeIdsByGroup.set(r.group_id, []);
    routeIdsByGroup.get(r.group_id)!.push(r.id);
  }

  // フォロワー数集計
  const followerCount = new Map<string, number>();
  const allRouteIds = (routes ?? []).map((r) => r.id as string);
  if (allRouteIds.length > 0) {
    const { data: followers } = await supabase
      .from("line_followers")
      .select("inflow_route_id")
      .in("inflow_route_id", allRouteIds);
    const routeToGroup = new Map<string, string>();
    for (const r of (routes ?? []) as Array<{ id: string; group_id: string | null }>) {
      if (r.group_id) routeToGroup.set(r.id, r.group_id);
    }
    for (const f of (followers ?? []) as Array<{ inflow_route_id: string | null }>) {
      if (!f.inflow_route_id) continue;
      const g = routeToGroup.get(f.inflow_route_id);
      if (!g) continue;
      followerCount.set(g, (followerCount.get(g) ?? 0) + 1);
    }
  }

  const formatted = groups.map((g) => ({
    ...g,
    route_count: routeCount.get(g.id) ?? 0,
    follower_count: followerCount.get(g.id) ?? 0,
  }));

  return Response.json(formatted);
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const { account_id, project_id, name, color, sort_order } = body ?? {};
  if (!name) return Response.json({ error: "name is required" }, { status: 400 });
  if (!account_id && !project_id) {
    return Response.json({ error: "account_id or project_id is required" }, { status: 400 });
  }
  const { data, error } = await supabase
    .from("line_inflow_groups")
    .insert({
      account_id: account_id ?? null,
      project_id: project_id ?? null,
      name,
      color: color ?? "#3B82F6",
      sort_order: sort_order ?? 0,
    })
    .select("id")
    .single();
  if (error) {
    const code = (error as { code?: string }).code;
    if (code === "23505") {
      return Response.json({ error: `グループ名「${name}」は既に存在します` }, { status: 400 });
    }
    if (code === "42P01") {
      return Response.json(
        { error: "line_inflow_groups テーブルが未作成です（supabase-schema-line-inflow-groups.sql を実行してください）" },
        { status: 500 },
      );
    }
    return Response.json({ error: error.message }, { status: 500 });
  }
  return Response.json({ ok: true, id: data!.id });
}

export async function PUT(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  if (!body.id) return Response.json({ error: "id is required" }, { status: 400 });
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.name !== undefined) updates.name = body.name;
  if (body.color !== undefined) updates.color = body.color;
  if (body.sort_order !== undefined) updates.sort_order = body.sort_order;

  const { error } = await supabase.from("line_inflow_groups").update(updates).eq("id", body.id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  if (!body.id) return Response.json({ error: "id is required" }, { status: 400 });
  const { error } = await supabase.from("line_inflow_groups").delete().eq("id", body.id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}

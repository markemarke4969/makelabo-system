import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  const projectId = request.nextUrl.searchParams.get("project_id");
  const accountId = request.nextUrl.searchParams.get("account_id"); // 後方互換

  // 集計付き取得。line_inflow_clicks が未作成の環境では fallback。
  const withClicks = async () => {
    let q = supabase
      .from("line_inflow_routes")
      .select("*, click_count:line_inflow_clicks(count)")
      .order("created_at", { ascending: false });
    if (projectId) q = q.eq("project_id", projectId);
    else if (accountId) q = q.eq("account_id", accountId);
    return q;
  };

  const withoutClicks = async () => {
    let q = supabase
      .from("line_inflow_routes")
      .select("*")
      .order("created_at", { ascending: false });
    if (projectId) q = q.eq("project_id", projectId);
    else if (accountId) q = q.eq("account_id", accountId);
    return q;
  };

  let { data, error } = await withClicks();
  if (error) {
    ({ data, error } = await withoutClicks());
  }

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  const routes = data ?? [];
  const routeIds = routes.map((r: any) => r.id as string);

  // 実フォロワー数を line_followers.inflow_route_id から集計
  // 列が未追加の環境では 0 扱いで fallback
  const followerCountMap = new Map<string, number>();
  if (routeIds.length > 0) {
    const { data: followers, error: fErr } = await supabase
      .from("line_followers")
      .select("inflow_route_id")
      .in("inflow_route_id", routeIds);
    if (!fErr && followers) {
      for (const f of followers as { inflow_route_id: string | null }[]) {
        if (!f.inflow_route_id) continue;
        followerCountMap.set(
          f.inflow_route_id,
          (followerCountMap.get(f.inflow_route_id) ?? 0) + 1,
        );
      }
    }
  }

  const formatted = routes.map((route: any) => {
    const clickCount = Array.isArray(route.click_count)
      ? route.click_count[0]?.count ?? 0
      : route.click_count ?? 0;
    return {
      ...route,
      click_count: clickCount,
      follower_count: followerCountMap.get(route.id) ?? 0,
    };
  });

  return Response.json(formatted);
}

export async function POST(request: NextRequest) {
  const body = await request.json();

  if (!body.name || !body.code) {
    return Response.json({ error: "name と code は必須です" }, { status: 400 });
  }
  if (!body.project_id && !body.account_id) {
    return Response.json({ error: "project_id または account_id が必須です" }, { status: 400 });
  }

  // project_id が指定されていれば project の存在確認
  let projectId: string | null = body.project_id ?? null;
  let accountId: string | null = body.account_id ?? null;

  if (projectId) {
    const { data: proj } = await supabase
      .from("line_projects")
      .select("id")
      .eq("id", projectId)
      .maybeSingle();
    if (!proj) {
      return Response.json(
        { error: `指定された案件が見つかりません (project_id: ${projectId})` },
        { status: 400 },
      );
    }
  }

  // account_id 指定時は存在確認 + project_id 自動補完
  if (accountId) {
    const { data: acc } = await supabase
      .from("line_accounts")
      .select("id, project_id")
      .eq("id", accountId)
      .maybeSingle();
    if (!acc) {
      return Response.json(
        { error: `指定されたLINEアカウントが見つかりません (account_id: ${accountId})` },
        { status: 400 },
      );
    }
    if (!projectId && acc.project_id) projectId = acc.project_id;
  }

  const insertBody: Record<string, unknown> = {
    project_id: projectId,
    account_id: accountId, // 後方互換のため null 許容
    name: body.name,
    code: body.code,
    url: body.url || null,
    description: body.description || null,
  };

  const { data, error } = await supabase
    .from("line_inflow_routes")
    .insert(insertBody)
    .select("id")
    .single();

  if (error) {
    console.error("[inflow-routes POST] error:", error);
    const pgCode = (error as { code?: string }).code;
    if (pgCode === "23505") {
      return Response.json(
        { error: `経路コード「${body.code}」は既に使われています。別のコードを指定してください。` },
        { status: 400 },
      );
    }
    if (pgCode === "23503") {
      return Response.json(
        { error: `関連データが見つかりません（FK違反: ${error.message}）` },
        { status: 400 },
      );
    }
    if (pgCode === "23502") {
      return Response.json(
        {
          error:
            "DB スキーマが古いままです。account_id を nullable 化する SQL (supabase-schema-line-inflow-account-nullable.sql) を Supabase で実行してください。",
          detail: error.message,
        },
        { status: 500 },
      );
    }
    if (pgCode === "42P01") {
      return Response.json(
        { error: "line_inflow_routes テーブルが存在しません。" },
        { status: 500 },
      );
    }
    return Response.json({ error: error.message, code: pgCode }, { status: 500 });
  }

  return Response.json({ ok: true, id: data.id });
}

export async function PUT(request: NextRequest) {
  const body = await request.json();

  if (!body.id) {
    return Response.json({ error: "id is required" }, { status: 400 });
  }

  const updates: Record<string, any> = {
    updated_at: new Date().toISOString(),
  };
  if (body.name !== undefined) updates.name = body.name;
  if (body.code !== undefined) updates.code = body.code;
  if (body.url !== undefined) updates.url = body.url;
  if (body.description !== undefined) updates.description = body.description;
  if (body.is_active !== undefined) updates.is_active = body.is_active;

  const { error } = await supabase
    .from("line_inflow_routes")
    .update(updates)
    .eq("id", body.id);

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const body = await request.json();

  if (!body.id) {
    return Response.json({ error: "id is required" }, { status: 400 });
  }

  const { error } = await supabase
    .from("line_inflow_routes")
    .delete()
    .eq("id", body.id);

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ ok: true });
}

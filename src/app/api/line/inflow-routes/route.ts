import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  const accountId = request.nextUrl.searchParams.get("account_id");

  // まず集計付きで取得を試す。line_inflow_logs テーブルが未作成でも落ちないように fallback。
  const withLogs = async () => {
    let q = supabase
      .from("line_inflow_routes")
      .select("*, follower_count:line_inflow_logs(count)")
      .order("created_at", { ascending: false });
    if (accountId) q = q.eq("account_id", accountId);
    return q;
  };

  const withoutLogs = async () => {
    let q = supabase
      .from("line_inflow_routes")
      .select("*")
      .order("created_at", { ascending: false });
    if (accountId) q = q.eq("account_id", accountId);
    return q;
  };

  let { data, error } = await withLogs();
  if (error) {
    ({ data, error } = await withoutLogs());
  }

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  const formatted = (data ?? []).map((route: any) => ({
    ...route,
    follower_count: Array.isArray(route.follower_count)
      ? route.follower_count[0]?.count ?? 0
      : route.follower_count ?? 0,
  }));

  return Response.json(formatted);
}

export async function POST(request: NextRequest) {
  const body = await request.json();

  if (!body.account_id || !body.name || !body.code) {
    return Response.json({ error: "account_id, name, and code are required" }, { status: 400 });
  }

  // account_id の存在確認（FK エラーの事前検出）
  const { data: acc } = await supabase
    .from("line_accounts")
    .select("id")
    .eq("id", body.account_id)
    .maybeSingle();
  if (!acc) {
    return Response.json(
      { error: `指定されたLINEアカウントが見つかりません (account_id: ${body.account_id})` },
      { status: 400 },
    );
  }

  const insertBody = {
    account_id: body.account_id,
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
    // PostgreSQL エラーコード判別
    const code = (error as { code?: string }).code;
    if (code === "23505") {
      return Response.json(
        { error: `経路コード「${body.code}」は既に使われています。別のコードを指定してください。` },
        { status: 400 },
      );
    }
    if (code === "23503") {
      return Response.json(
        { error: `関連データが見つかりません（FK違反: ${error.message}）` },
        { status: 400 },
      );
    }
    if (code === "42P01") {
      return Response.json(
        { error: "line_inflow_routes テーブルが存在しません。Supabaseでテーブルを作成してください。" },
        { status: 500 },
      );
    }
    if (code === "42501" || /permission|rls|policy/i.test(error.message)) {
      return Response.json(
        { error: `権限エラー（RLS）: ${error.message}` },
        { status: 500 },
      );
    }
    return Response.json({ error: error.message, code }, { status: 500 });
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

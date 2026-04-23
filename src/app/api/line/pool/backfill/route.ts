import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";

/**
 * 既存の role='standby' のアカウントで line_account_pool に
 * 登録されていないものを status='ready' で一括登録する。
 *
 * 認証: CRON_SECRET（Bearer or ?secret=）。
 *   vercel env に CRON_SECRET が設定されていれば一致必須。未設定なら誰でも叩ける（開発用）。
 */
function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  const auth = request.headers.get("authorization") ?? "";
  if (auth === `Bearer ${secret}`) return true;
  const query = request.nextUrl.searchParams.get("secret");
  return query === secret;
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  // role=standby の全アカウント
  const { data: standbyAccounts, error: accErr } = await supabase
    .from("line_accounts")
    .select("id, project_id, account_name, is_active")
    .eq("role", "standby");

  if (accErr) {
    return Response.json({ error: accErr.message }, { status: 500 });
  }

  // 既にプールに入っている account_id セット
  const { data: poolRows } = await supabase
    .from("line_account_pool")
    .select("account_id");
  const pooled = new Set((poolRows ?? []).map((r) => r.account_id as string));

  const toInsert = (standbyAccounts ?? [])
    .filter((a) => !pooled.has(a.id as string) && !!a.project_id)
    .map((a) => ({
      project_id: a.project_id as string,
      account_id: a.id as string,
      status: "ready" as const,
    }));

  if (toInsert.length === 0) {
    return Response.json({
      ok: true,
      message: "すでに全ての standby がプール登録済みです",
      inserted: 0,
      skipped: (standbyAccounts ?? []).length,
    });
  }

  const { error: insertErr } = await supabase
    .from("line_account_pool")
    .insert(toInsert);
  if (insertErr) {
    return Response.json({ error: insertErr.message }, { status: 500 });
  }

  return Response.json({
    ok: true,
    inserted: toInsert.length,
    total_standby: (standbyAccounts ?? []).length,
    inserted_accounts: toInsert.map((r) => r.account_id),
  });
}

// GET でプール未登録の standby を一覧表示（確認用）
export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const { data: standbyAccounts } = await supabase
    .from("line_accounts")
    .select("id, project_id, account_name, is_active, role")
    .eq("role", "standby");

  const { data: poolRows } = await supabase
    .from("line_account_pool")
    .select("account_id, status");
  const pooled = new Map((poolRows ?? []).map((r) => [r.account_id as string, r.status as string]));

  const report = (standbyAccounts ?? []).map((a) => ({
    id: a.id,
    account_name: a.account_name,
    project_id: a.project_id,
    is_active: a.is_active,
    pool_status: pooled.get(a.id as string) ?? "NOT_IN_POOL",
  }));

  return Response.json({
    ok: true,
    standby_count: report.length,
    missing_from_pool: report.filter((r) => r.pool_status === "NOT_IN_POOL").length,
    accounts: report,
  });
}

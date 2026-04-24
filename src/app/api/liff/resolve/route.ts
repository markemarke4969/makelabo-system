import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";

// ============================================================
// 現メイン判定 API
// ============================================================
// GET /api/liff/resolve?project=mari
//   → { success: true, addUrl: "https://line.me/R/ti/p/@xxxxxx", mainAccountId: "..." }
//
// 目的:
//   LIFF 中継ページから呼ばれ、指定案件の現在アクティブな
//   メインアカウント (role='main' AND is_active=true) を特定し、
//   友だち追加URL を返す。
// ============================================================

interface AccountRow {
  id: string;
  basic_id: string | null;
  account_name: string | null;
}

export async function GET(request: NextRequest) {
  const projectCode = request.nextUrl.searchParams.get("project")?.trim();
  if (!projectCode) {
    return Response.json({ success: false, error: "project code is required" }, { status: 400 });
  }

  // project コード → project_id
  const { data: project, error: projErr } = await supabase
    .from("line_projects")
    .select("id, name, code")
    .eq("code", projectCode)
    .maybeSingle();
  if (projErr) {
    return Response.json({ success: false, error: `project lookup failed: ${projErr.message}` }, { status: 500 });
  }
  if (!project) {
    return Response.json({ success: false, error: `project not found: ${projectCode}` }, { status: 404 });
  }

  // 現メイン特定
  const { data: mainAcc, error: accErr } = await supabase
    .from("line_accounts")
    .select("id, basic_id, account_name")
    .eq("project_id", project.id)
    .eq("role", "main")
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();
  if (accErr) {
    return Response.json({ success: false, error: `account lookup failed: ${accErr.message}` }, { status: 500 });
  }

  const main = mainAcc as AccountRow | null;
  if (!main) {
    return Response.json(
      { success: false, error: "現在利用可能なアカウントがありません" },
      { status: 404 },
    );
  }
  if (!main.basic_id) {
    return Response.json(
      { success: false, error: "メインアカウントに basic_id が設定されていません" },
      { status: 500 },
    );
  }

  const addUrl = `https://line.me/R/ti/p/@${main.basic_id}`;
  return Response.json({
    success: true,
    addUrl,
    mainAccountId: main.id,
    projectCode: project.code,
  });
}

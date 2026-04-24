import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";

// ============================================================
// 分散登録 進捗判定 API
// ============================================================
// GET /api/liff/distribute-progress?project=<code>&user_id=<LINE UserID>
//
// 該当案件の分散対象アカウント (main + distribute) のうち、
// 指定 LINE UserID が既に friend 登録済み (line_followers.status='following')
// のアカウント ID を返す。クライアントはこのリストを使って「次の未登録
// アカウント」を判定する。
//
// レスポンス:
//   {
//     success: true,
//     registeredAccountIds: ["<uuid>", ...],
//     totalTargets: 5
//   }
// ============================================================

export async function GET(request: NextRequest) {
  const projectCode = request.nextUrl.searchParams.get("project")?.trim();
  const userId = request.nextUrl.searchParams.get("user_id")?.trim();

  if (!projectCode) {
    return Response.json({ success: false, error: "project code is required" }, { status: 400 });
  }
  if (!userId) {
    return Response.json({ success: false, error: "user_id is required" }, { status: 400 });
  }

  const { data: project, error: projErr } = await supabase
    .from("line_projects")
    .select("id, name, code")
    .eq("code", projectCode)
    .maybeSingle();
  if (projErr) {
    return Response.json({ success: false, error: projErr.message }, { status: 500 });
  }
  if (!project) {
    return Response.json({ success: false, error: `project not found: ${projectCode}` }, { status: 404 });
  }

  // 分散対象アカウント ID
  const { data: accs, error: accErr } = await supabase
    .from("line_accounts")
    .select("id, role")
    .eq("project_id", project.id)
    .eq("is_active", true);
  if (accErr) {
    return Response.json({ success: false, error: accErr.message }, { status: 500 });
  }

  const targetIds = (accs ?? [])
    .filter((a) => a.role === "main" || a.role === "distribute")
    .map((a) => a.id as string);

  if (targetIds.length === 0) {
    return Response.json({
      success: true,
      registeredAccountIds: [],
      totalTargets: 0,
    });
  }

  // 既に登録済みの follower 行を検索
  const { data: follows, error: fErr } = await supabase
    .from("line_followers")
    .select("line_account_id, status")
    .eq("line_user_id", userId)
    .in("line_account_id", targetIds);
  if (fErr) {
    return Response.json({ success: false, error: fErr.message }, { status: 500 });
  }

  const registeredAccountIds = Array.from(
    new Set(
      (follows ?? [])
        .filter((f) => f.status === "following")
        .map((f) => f.line_account_id as string),
    ),
  );

  return Response.json({
    success: true,
    registeredAccountIds,
    totalTargets: targetIds.length,
  });
}

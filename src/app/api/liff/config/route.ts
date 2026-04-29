import { NextRequest } from "next/server";
import { getLiffIdForProject } from "@/lib/line";

// ============================================================
// LIFF 設定取得 API(案B 実装、2026-04-30)
// ============================================================
// GET /api/liff/config?project=<code>
//
// 指定された案件コードの LIFF ID を返す。
// 案件単位で LIFF ID を切り替える設計のため、LIFF init 前にこの API を叩いて
// 該当案件の LIFF ID を取得する運用。
//
// レスポンス:
//   { liffId: "2009889729-u55Bs7p0" }     成功(DB 値 or env fallback)
//   { liffId: null, error: "not_found" }  DB 未設定 + env fallback も無い
//
// 詳細:設計書07 §6 の見直し / 2026-04-28 段階3残務整理.md
// ============================================================

export async function GET(request: NextRequest) {
  const projectCode = request.nextUrl.searchParams.get("project")?.trim();
  if (!projectCode) {
    return Response.json(
      { liffId: null, error: "project_required", message: "project クエリパラメータが必須です" },
      { status: 400 },
    );
  }

  const liffId = await getLiffIdForProject(projectCode);
  if (!liffId) {
    return Response.json(
      { liffId: null, error: "not_found", message: `LIFF ID が見つかりません (project=${projectCode})` },
      { status: 200 }, // fallback で動かす想定のため 404 ではなく 200 + null
    );
  }

  return Response.json({ liffId });
}

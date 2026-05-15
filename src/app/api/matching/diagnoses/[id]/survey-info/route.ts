import { NextRequest } from "next/server";

// ============================================================
// 電話番号取得ラッパ(PR#3-A)
// ============================================================
// GET /api/matching/diagnoses/[id]/survey-info
//
// クローザーダッシュボード(matching/dashboard)からの呼出専用。
// 詳細パネル展開時に lazy fetch される。本ラッパは
// `Authorization: Bearer ${MATCHING_LINE_SURVEY_LOOKUP_TOKEN}` を
// Server 側でセットして line `/api/line/survey-lookup` に転送する。
// Client 側に Bearer token を露出させないためのプロキシ。
//
// レスポンスは line 側 survey-lookup の Body をそのまま返す:
//   - { status: "found",            phone, answered_at }
//   - { status: "not_responded" }
//   - { status: "not_found_survey" }
//   - { status: "no_follower" }
//   - 上記以外は 500 にラップ
//
// モジュール境界:
//   matching → line への呼出は HTTP + Bearer のみ。
//   token を Client に露出させないため Server 経由でプロキシする。
// ============================================================

export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function resolveSiteUrl(request: NextRequest): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return explicit.replace(/\/$/, "");
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  // ローカル dev 用フォールバック(同一プロセス内なので request.nextUrl.origin で OK)
  return request.nextUrl.origin.replace(/\/$/, "");
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;

  if (!UUID_RE.test(id)) {
    return Response.json(
      { status: "error", message: "diagnosis_id が不正です" },
      { status: 400 },
    );
  }

  const token = process.env.MATCHING_LINE_SURVEY_LOOKUP_TOKEN;
  if (!token) {
    return Response.json(
      {
        status: "error",
        message: "MATCHING_LINE_SURVEY_LOOKUP_TOKEN が未設定です",
      },
      { status: 500 },
    );
  }

  const siteUrl = resolveSiteUrl(request);
  if (!siteUrl) {
    return Response.json(
      { status: "error", message: "base URL が解決できません" },
      { status: 500 },
    );
  }

  const url = `${siteUrl}/api/line/survey-lookup?ref=${encodeURIComponent(id)}`;

  let resp: Response;
  try {
    resp = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    });
  } catch (e) {
    return Response.json(
      {
        status: "error",
        message: `line API 呼出失敗: ${e instanceof Error ? e.message : String(e)}`,
      },
      { status: 500 },
    );
  }

  const text = await resp.text();
  if (!resp.ok) {
    return Response.json(
      {
        status: "error",
        message: `line API エラー(${resp.status}): ${text.slice(0, 200)}`,
      },
      { status: 500 },
    );
  }

  return new Response(text, {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// 中継URL: /line/click/{token}
//
// 段階5 §16-9 配信メッセージ URL クリック計測の中継エンドポイント。
// 方式 A(別テーブル方式)。
//
// フロー:
//   1. token のバリデーション(長さ 16 以上、URL-safe Base64 文字)
//   2. line_message_click_tokens から元情報を SELECT(.maybeSingle)
//   3. expires_at が過去なら計測のみスキップ(リダイレクトは続行)
//   4. line_message_clicks に INSERT
//      - clicked_at は DB DEFAULT NOW() 任せ
//      - UNIQUE 違反(2回目以降クリック)はログ出さず受け流す(1 token = 1 行)
//      - その他のエラーは console.error のみ、リダイレクトは続行
//   5. original_url のスキーム検証(http/https のみ)
//   6. 元 URL へ 302 リダイレクト
//
// フォールバック原則: 計測機能の不調が配信機能を止めない。
// 既存パターン参照: src/app/line/r/[project_code]/[inflow_code]/route.ts
//                   (「INSERT 失敗してもリダイレクト続行」)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  // 1. バリデーション
  if (!token || token.length < 16 || !/^[A-Za-z0-9_-]+$/.test(token)) {
    return new Response("Invalid token", { status: 400 });
  }

  // 2. token から元情報を解決
  const { data: row, error: tkErr } = await supabase
    .from("line_message_click_tokens")
    .select(
      "broadcast_sequence_id, step_message_id, step_enrollment_id, scenario_id, project_id, follower_id, line_user_id, url_index, original_url, expires_at",
    )
    .eq("token", token)
    .maybeSingle();

  if (tkErr) {
    console.error("[line/click] token select error:", tkErr.message);
    return new Response("Internal error", { status: 500 });
  }
  if (!row) {
    return new Response("Click token not found", { status: 404 });
  }

  // 3. expires_at の判定(期限切れでもリダイレクトは続行、計測のみスキップ)
  const expired =
    row.expires_at !== null &&
    row.expires_at !== undefined &&
    new Date(row.expires_at as string).getTime() < Date.now();

  // 4. クリック記録(失敗してもリダイレクトは続行)
  if (!expired) {
    const userAgent = request.headers.get("user-agent");
    const ipAddress =
      request.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
      request.headers.get("x-real-ip") ??
      null;

    const { error: insErr } = await supabase
      .from("line_message_clicks")
      .insert({
        broadcast_sequence_id: row.broadcast_sequence_id,
        step_message_id: row.step_message_id,
        step_enrollment_id: row.step_enrollment_id,
        scenario_id: row.scenario_id,
        project_id: row.project_id,
        url_index: row.url_index,
        original_url: row.original_url,
        click_token: token,
        user_agent: userAgent,
        ip_address: ipAddress,
        follower_id: row.follower_id,
        line_user_id: row.line_user_id,
        // clicked_at / created_at は DB DEFAULT NOW() 任せ
      });
    if (insErr) {
      // UNIQUE 違反(2回目以降クリック)= 想定内なのでログ出さず受け流す
      // それ以外はログのみ(リダイレクトは続行)
      if (
        !/duplicate key|already exists|violates unique/i.test(insErr.message)
      ) {
        console.error("[line/click] click insert error:", insErr.message);
      }
    }
  }

  // 5. original_url のスキーム検証
  const originalUrl = row.original_url as string | null;
  if (!originalUrl || !/^https?:\/\//i.test(originalUrl)) {
    return new Response("Invalid original URL", { status: 500 });
  }

  // 6. 302 リダイレクト
  return Response.redirect(originalUrl, 302);
}

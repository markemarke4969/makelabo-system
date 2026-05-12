import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

// ============================================================
// 流入経路 lookup API(PR-Harness)
// ============================================================
// GET /api/line/inflow-lookup?ref=<external_ref>
//
// 中継URL ?ref=<外部参照> として保存された line_inflow_clicks.external_ref から
// 「click 行はあるか / follow 引当済か / 引当済なら follower 情報」を返す
// 汎用 lookup エンドポイント。
//
// 用途:
//   - 副業診断アプリ(matching)PR#2-B が follow webhook 直後に呼び、
//     diagnosis_id ↔ line_user_id の紐付け状態を取得 → カスタムフィールド書き戻し
//   - 将来別案件(LP 等)からも同様に呼べる汎用設計
//
// 認証:
//   `Authorization: Bearer ${LINE_INFLOW_LOOKUP_TOKEN}` 完全一致比較
//   構想第17章 + PR-Harness 設計プラン §2-D に基づく
//
// レスポンスは 200 / 400 / 401 / 500 のみ(not_found は 200 + status='not_found' 返却):
//   - 200: { status, ref, click?, follower?, external_ref? }
//   - 400: { error: "ref is required" }
//   - 401: { error: "unauthorized" }
//   - 500: { error: <message> }
//
// 全 200 採用理由(プラン §2-C):
//   - 404 は CDN / 監視で異常系扱いされがち、`not_found` は仕様上の正常状態
//   - 呼出側のポーリング処理が `if (json.status === 'bound') ...` で完結
//   - 構想 §16-4 も body に status を返す設計
//
// 複数 click 行ヒット時の優先順(プラン §2-C 確定):
//   1. bound 行が 1 件以上 → bound 行のうち最新 clicked_at
//   2. すべて pending → 最新 clicked_at
//   3. いずれも無い → not_found
//
// モジュール境界:
//   本 API は line テリトリー完結。matching の DB は触らない。
// ============================================================

export const dynamic = "force-dynamic";

type LookupStatus = "not_found" | "pending" | "bound";

interface ClickRow {
  id: string;
  clicked_at: string;
  inflow_route_id: string;
  follower_id: string | null;
  external_ref: string | null;
}

interface FollowerRow {
  id: string;
  line_user_id: string | null;
  line_account_id: string | null;
  inflow_route_id: string | null;
}

function unauthorized(): Response {
  return Response.json({ error: "unauthorized" }, { status: 401 });
}

function badRequest(message: string): Response {
  return Response.json({ error: message }, { status: 400 });
}

function serverError(message: string): Response {
  return Response.json({ error: message }, { status: 500 });
}

function ok<T extends object>(body: T): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

export async function GET(request: NextRequest): Promise<Response> {
  // 1. Bearer 認証
  const expected = process.env.LINE_INFLOW_LOOKUP_TOKEN;
  if (!expected) {
    return serverError("LINE_INFLOW_LOOKUP_TOKEN が未設定です");
  }

  const authHeader = request.headers.get("authorization") ?? "";
  const presented = authHeader.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length).trim()
    : "";

  if (!presented || presented !== expected) {
    return unauthorized();
  }

  // 2. ref バリデーション
  const ref = request.nextUrl.searchParams.get("ref")?.trim();
  if (!ref) {
    return badRequest("ref is required");
  }

  // 3. external_ref で click 行を取得(複数あれば clicked_at 降順)
  const { data: clicks, error: clickErr } = await supabaseAdmin
    .from("line_inflow_clicks")
    .select("id, clicked_at, inflow_route_id, follower_id, external_ref")
    .eq("external_ref", ref)
    .order("clicked_at", { ascending: false });

  if (clickErr) {
    return serverError(`click lookup failed: ${clickErr.message}`);
  }

  if (!clicks || clicks.length === 0) {
    return ok({ status: "not_found" as LookupStatus, ref });
  }

  // 4. 優先順: bound > 最新 pending
  const typed = clicks as ClickRow[];
  const bound = typed.find((c) => c.follower_id !== null);
  const target: ClickRow = bound ?? typed[0];

  const clickInfo = {
    id: target.id,
    clicked_at: target.clicked_at,
    inflow_route_id: target.inflow_route_id,
  };

  // 5. follower_id が無ければ pending 返却
  if (!target.follower_id) {
    return ok({
      status: "pending" as LookupStatus,
      ref,
      click: clickInfo,
    });
  }

  // 6. bound: follower 行を取得
  const { data: follower, error: followerErr } = await supabaseAdmin
    .from("line_followers")
    .select("id, line_user_id, line_account_id, inflow_route_id")
    .eq("id", target.follower_id)
    .maybeSingle();

  if (followerErr) {
    return serverError(`follower lookup failed: ${followerErr.message}`);
  }

  if (!follower) {
    // 異常系: click.follower_id があるが follower が消えている
    // (ON DELETE SET NULL なので通常起こらない)→ pending フォールバック
    return ok({
      status: "pending" as LookupStatus,
      ref,
      click: clickInfo,
    });
  }

  const followerRow = follower as FollowerRow;

  return ok({
    status: "bound" as LookupStatus,
    ref,
    click: clickInfo,
    follower: {
      id: followerRow.id,
      line_user_id: followerRow.line_user_id,
      line_account_id: followerRow.line_account_id,
      inflow_route_id: followerRow.inflow_route_id,
    },
    external_ref: ref,
  });
}

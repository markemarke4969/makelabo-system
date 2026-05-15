import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { enrichFollowerWithMatchingSections } from "@/lib/matching-enrichment";
import { sendDelayZeroBatch } from "@/lib/step-batch-send";

// ============================================================
// PR#2-D: aifukugyo シナリオの LINE 再配信 API
// ============================================================
// POST /api/line/aifukugyo-redeliver
//   - matching cron(/api/cron/matching-line-redeliver)から叩かれ、
//     pending → ready 復帰した診断の AI レポートを LINE に再配信する。
//
// 認証:
//   Authorization: Bearer ${LINE_INFLOW_LOOKUP_TOKEN} 完全一致比較
//   (matching 側からは MATCHING_LINE_INFLOW_LOOKUP_TOKEN 同値で投入済、
//    PR-Harness で導入された LINE 側公開 Bearer の再利用)
//
// リクエスト:
//   { "ref": "<diagnosis_id>" }
//
// レスポンス(全て 200 もしくは 401/400/500):
//   - 200 { status: "redelivered", sent: N }       → 再配信成功
//   - 200 { status: "skipped", reason: "..." }     → 配信不要(下記理由)
//   - 400 { error: "ref is required" }
//   - 401 { error: "unauthorized" }
//   - 500 { error: "..." }
//
// skipped 理由(reason 値):
//   - follower_not_found       : ref に対応する follower が存在しない(未引当 or LINE 未登録)
//   - already_delivered        : 直近 1 hour 以内に同 follower 宛 matching_* 配信記録あり
//   - matching_not_ready       : matching API が pending/failed 返却
//   - no_messages_to_send      : delay=0 step_messages が見つからない or branch 評価全 null
//
// 冪等性:
//   - matching_diagnoses.report_delivered_at が canonical な「配信済」状態(matching 側で gating)
//   - 本 API はそれを補強する line 側防御として「直近 1 hour 以内の重複配信を検知」
//
// モジュール境界:
//   本 API は line テリトリー完結。matching 側の DB は触らず、matching GET API
//   経由(enrichFollowerWithMatchingSections 内)で AI セクションを取得。
// ============================================================

export const dynamic = "force-dynamic";

function unauthorized(): Response {
  return Response.json({ error: "unauthorized" }, { status: 401 });
}

function badRequest(message: string): Response {
  return Response.json({ error: message }, { status: 400 });
}

function serverError(message: string): Response {
  return Response.json({ error: message }, { status: 500 });
}

export async function POST(request: NextRequest): Promise<Response> {
  // 1. Bearer 認証(LINE_INFLOW_LOOKUP_TOKEN を流用)
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

  // 2. リクエスト body
  const body = await request.json().catch(() => null);
  const ref = typeof body?.ref === "string" ? body.ref.trim() : "";
  if (!ref) return badRequest("ref is required");

  // 3. ref → bound click → follower 引当(inflow-lookup 同等のロジック)
  const { data: clicks, error: clickErr } = await supabaseAdmin
    .from("line_inflow_clicks")
    .select("id, follower_id, inflow_route_id")
    .eq("external_ref", ref)
    .order("clicked_at", { ascending: false });

  if (clickErr) {
    return serverError(`click lookup failed: ${clickErr.message}`);
  }

  const bound = (clicks ?? []).find((c) => c.follower_id !== null);
  if (!bound) {
    return Response.json({ status: "skipped", reason: "follower_not_found" });
  }

  const { data: follower, error: followerErr } = await supabaseAdmin
    .from("line_followers")
    .select("id, line_user_id, line_account_id")
    .eq("id", bound.follower_id!)
    .maybeSingle();
  if (followerErr) {
    return serverError(`follower lookup failed: ${followerErr.message}`);
  }
  if (!follower || !follower.line_user_id || !follower.line_account_id) {
    return Response.json({ status: "skipped", reason: "follower_not_found" });
  }

  // 4. 冪等性チェック:直近 1 hour 以内に ready 配信(=「お待たせしました!」プレフィックス)
  //    があれば skipped。本 API は常に ready 本文を再配信するため、ready がすでに
  //    届いている場合のみ skip すれば冪等性は十分。
  //    pending teaser(「現在 AI が」)は ready 化後の正規再配信を妨げない目的で
  //    マッチ対象から除外する(cron 再送バグ修正 PR で tighten)。
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { data: recent } = await supabaseAdmin
    .from("line_messages")
    .select("id")
    .eq("line_user_id", follower.line_user_id)
    .eq("direction", "outgoing")
    .gte("sent_at", since)
    .ilike("message_text", "%お待たせしました!%")
    .limit(1);
  if (recent && recent.length > 0) {
    return Response.json({ status: "skipped", reason: "already_delivered" });
  }

  // 5. matching enrichment(ready なら custom_values upsert、pending/failed は throw or 空)
  try {
    await enrichFollowerWithMatchingSections({
      followerId: follower.id,
      accountId: follower.line_account_id,
      externalRef: ref,
    });
  } catch (e) {
    console.error("[aifukugyo-redeliver] enrichment failed:", e);
    return Response.json({
      status: "skipped",
      reason: "matching_not_ready",
    });
  }

  // 6. account の channel_access_token + scenario_id を取得
  const { data: account, error: accErr } = await supabaseAdmin
    .from("line_accounts")
    .select("id, channel_access_token, scenario_id")
    .eq("id", follower.line_account_id)
    .maybeSingle();
  if (accErr) return serverError(`account lookup failed: ${accErr.message}`);
  if (!account || !account.channel_access_token) {
    return serverError("account token missing");
  }

  // 7. sequence_ids を解決(scenario_id 優先、無ければ account_id)
  let sequenceIds: string[] = [];
  if (account.scenario_id) {
    let r = await supabaseAdmin
      .from("line_step_sequences")
      .select("id")
      .eq("scenario_id", account.scenario_id)
      .eq("status", "active")
      .eq("kind", "step");
    if (r.error && /kind/i.test(r.error.message)) {
      r = await supabaseAdmin
        .from("line_step_sequences")
        .select("id")
        .eq("scenario_id", account.scenario_id)
        .eq("status", "active");
    }
    if (!r.error) {
      sequenceIds = (r.data ?? []).map((s: { id: string }) => s.id);
    }
  }
  if (sequenceIds.length === 0) {
    // account_id fallback(scenario_id 列なし環境 or scenario_id 未紐付け)
    let r = await supabaseAdmin
      .from("line_step_sequences")
      .select("id")
      .eq("account_id", account.id)
      .eq("status", "active")
      .eq("kind", "step");
    if (r.error && /kind/i.test(r.error.message)) {
      r = await supabaseAdmin
        .from("line_step_sequences")
        .select("id")
        .eq("account_id", account.id)
        .eq("status", "active");
    }
    if (!r.error) {
      sequenceIds = (r.data ?? []).map((s: { id: string }) => s.id);
    }
  }
  if (sequenceIds.length === 0) {
    return Response.json({ status: "skipped", reason: "no_messages_to_send" });
  }

  // 8. delay=0 メッセージをまとめ送信
  const result = await sendDelayZeroBatch({
    followerId: follower.id,
    accountId: account.id,
    lineUserId: follower.line_user_id,
    channelAccessToken: account.channel_access_token,
    sequenceIds,
  });

  if (!result.sentCount || result.sentCount === 0) {
    return Response.json({ status: "skipped", reason: "no_messages_to_send" });
  }

  return Response.json({ status: "redelivered", sent: result.sentCount });
}

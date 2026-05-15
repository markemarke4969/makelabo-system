import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

// ============================================================
// 配信完了マーキング API(cron 再送バグ修正)
// ============================================================
// POST /api/matching/diagnoses/[id]/mark-delivered
//
// 役割:
//   webhook(line 側)が初回 follow 時に sendDelayZeroBatch で 3 通配信した
//   直後に Bearer 付きで呼ばれ、matching_diagnoses.report_delivered_at を
//   now() でセットする。これにより毎時 cron(matching-line-redeliver)が
//   `report_delivered_at IS NULL` の WHERE 句で対象から外し、二重配信を防ぐ。
//
// 認証:
//   `Authorization: Bearer ${MATCHING_PUBLIC_LOOKUP_TOKEN}` 完全一致比較
//   (PR#2-A で投入済の line ↔ matching 共通 Bearer。新規 env 不要)
//
// 冪等性:
//   - `UPDATE ... WHERE id=:id AND report_delivered_at IS NULL`
//   - 既にセット済なら no-op で `{ ok: true, alreadySet: true }`
//
// レスポンス:
//   - 200 { ok: true, alreadySet: false, deliveredAt: "..." } : 今回セット
//   - 200 { ok: true, alreadySet: true }                      : 既にセット済
//   - 400 { error: "diagnosis_id が不正です" }
//   - 401 { error: "unauthorized" }
//   - 404 { error: "not_found" }
//   - 500 { error: <message> }
//
// モジュール境界(構想第17章):
//   line 側はこの API を Bearer 経由でのみ呼ぶ。matching_diagnoses への
//   直接 UPDATE は禁止。
// ============================================================

export const dynamic = "force-dynamic";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const expected = process.env.MATCHING_PUBLIC_LOOKUP_TOKEN;
  if (!expected) {
    return Response.json(
      { error: "MATCHING_PUBLIC_LOOKUP_TOKEN が未設定です" },
      { status: 500 },
    );
  }

  const authHeader = request.headers.get("authorization") ?? "";
  const presented = authHeader.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length).trim()
    : "";
  if (!presented || presented !== expected) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return Response.json(
      { error: "diagnosis_id が不正です" },
      { status: 400 },
    );
  }

  // 既存状態を取得(404 と alreadySet 判定のため)
  const { data: existing, error: selErr } = await supabaseAdmin
    .from("matching_diagnoses")
    .select("id, report_delivered_at")
    .eq("id", id)
    .maybeSingle();

  if (selErr) {
    return Response.json({ error: selErr.message }, { status: 500 });
  }
  if (!existing) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }
  if (existing.report_delivered_at) {
    return Response.json({ ok: true, alreadySet: true });
  }

  const now = new Date().toISOString();
  // WHERE ... IS NULL で 2 重 UPDATE を防ぐ(競合時は片方のみ書き込まれる)
  const { error: updErr } = await supabaseAdmin
    .from("matching_diagnoses")
    .update({ report_delivered_at: now, updated_at: now })
    .eq("id", id)
    .is("report_delivered_at", null);

  if (updErr) {
    return Response.json({ error: updErr.message }, { status: 500 });
  }

  return Response.json({ ok: true, alreadySet: false, deliveredAt: now });
}

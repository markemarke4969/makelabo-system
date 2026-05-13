import { supabaseAdmin } from "@/lib/supabase";

// ============================================================
// PR#2-D: 副業診断(matching)→ LINE ハーネス連携 enrichment ヘルパ
// ============================================================
// PR#2-B で webhook/route.ts 内に実装した enrichFollowerWithMatchingSections を
// src/lib/ に切り出して、webhook と PR#2-D の aifukugyo-redeliver API の両方
// から呼べるようにする。
//
// 処理:
// - GET /api/matching/diagnoses/[id]/ai-sections を Bearer 認証で呼出
// - ready 時のみ matching_* 6 個の field_id → value を upsert
//   (matching_cta_url は line_custom_fields.default_value で fallback、明示 upsert しない)
// - pending/failed のときは matching_strength を upsert しない
//   → seed の branch 評価 `op:'exists'` で false → defaultMessage(pending 本文)
// - タイムアウト 5s / 1 リトライ(指数バックオフ 500ms)
// - 失敗は throw → 呼出側で silent log + 続行(挨拶送信 + step 配信は実施、
//   PR#2-D の cron で救済)
//
// モジュール境界(構想第17章):
//   matching → line の呼出は HTTP API + Bearer 認証のみ(本関数は line 側から
//   matching 側 GET API を叩く)。
// ============================================================

export interface EnrichArgs {
  followerId: string;
  accountId: string;
  externalRef: string;
}

export async function enrichFollowerWithMatchingSections(
  args: EnrichArgs,
): Promise<void> {
  const token = process.env.LINE_MATCHING_LOOKUP_TOKEN;
  if (!token) {
    throw new Error("LINE_MATCHING_LOOKUP_TOKEN が未設定");
  }
  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ??
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : "");
  if (!siteUrl) {
    throw new Error("base URL が解決できません(NEXT_PUBLIC_SITE_URL / VERCEL_URL 未設定)");
  }
  const url = `${siteUrl.replace(/\/$/, "")}/api/matching/diagnoses/${encodeURIComponent(args.externalRef)}/ai-sections`;

  async function fetchOnce(): Promise<Response> {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 5000);
    try {
      return await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
        signal: ctrl.signal,
        cache: "no-store",
      });
    } finally {
      clearTimeout(t);
    }
  }

  let res: Response;
  try {
    res = await fetchOnce();
  } catch {
    // 1 回リトライ(指数バックオフ 500ms)
    await new Promise((r) => setTimeout(r, 500));
    res = await fetchOnce();
  }
  if (!res.ok) {
    throw new Error(`matching API ${res.status}`);
  }
  const json = (await res.json()) as {
    status: "ready" | "pending" | "failed";
    generatedAt?: string | null;
    sections?: { strength?: string; animal?: string; risk?: string } | null;
    typeId?: string;
    typeName?: string | null;
    animal?: string | null;
  };

  // 7 個の field_key → field_id を一括取得(matching_cta_url は default_value 利用、
  // 値は upsert しないが id 解決自体は不要なので 6 個でも 7 個でも結果は同じ)
  const { data: fields } = await supabaseAdmin
    .from("line_custom_fields")
    .select("id, field_key")
    .eq("account_id", args.accountId)
    .in("field_key", [
      "matching_diagnosis_id",
      "matching_type_name",
      "matching_animal",
      "matching_strength",
      "matching_animal_text",
      "matching_risk",
      "matching_cta_url",
    ]);
  if (!fields || fields.length === 0) {
    // seed 未投入 or aifukugyo 以外の account → enrichment 無効(silent skip)
    return;
  }
  const map: Record<string, string> = {};
  for (const f of fields as Array<{ id: string; field_key: string }>) {
    map[f.field_key] = f.id;
  }

  const upserts: Array<{ follower_id: string; field_id: string; value: string }> = [];
  function push(key: string, value: string | null | undefined): void {
    if (!value) return;
    const fid = map[key];
    if (!fid) return;
    upserts.push({ follower_id: args.followerId, field_id: fid, value });
  }

  push("matching_diagnosis_id", args.externalRef);
  if (json.status === "ready" && json.sections) {
    push("matching_type_name", json.typeName ?? "");
    push("matching_animal", json.animal ?? "");
    push("matching_strength", json.sections.strength ?? "");
    push("matching_animal_text", json.sections.animal ?? "");
    push("matching_risk", json.sections.risk ?? "");
  }
  // matching_cta_url は seed の default_value で fallback(明示 upsert しない)

  if (upserts.length === 0) return;
  const { error: upErr } = await supabaseAdmin
    .from("line_follower_custom_values")
    .upsert(upserts, { onConflict: "follower_id,field_id" });
  if (upErr) {
    throw new Error(`custom_values upsert failed: ${upErr.message}`);
  }
}

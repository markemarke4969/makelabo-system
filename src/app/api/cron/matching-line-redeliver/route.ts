import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { notifyChatwork } from "@/lib/chatwork";

// ============================================================
// PR#2-D: matching → LINE 再配信 cron(pending → ready 復帰時の救済)
// ============================================================
// 1 時間毎に発火し、ai_generation_status='ready' かつ report_delivered_at IS NULL
// の matching_diagnoses を検出 → POST /api/line/aifukugyo-redeliver(Bearer)で
// LINE 側に再配信トリガを送る。200 + redelivered で report_delivered_at を更新。
//
// 通知発火制御:
//   - line_redeliver_count < 5 で絞り込み(5 回到達で対象外)
//   - 1 回あたり最大 50 件処理(LINE Push API は安価なので AI cron の 20 件より広め)
//   - 失敗時のみカウンタ +1(skipped は無害、カウントしない)
//   - 5 回到達した行は Chatwork に [toall] 通知
//
// 認証:
//   - Authorization: Bearer ${CRON_SECRET} または ?secret=${CRON_SECRET}
//   - CRON_SECRET 未設定時は開発環境 fallback
//
// 冪等性:
//   - report_delivered_at が NULL → NOT NULL の遷移で gating
//   - line 側 redeliver API も「直近 1 hour 以内に同 follower への matching_* 配信
//     記録があれば skipped」の二重防御
// ============================================================

export const maxDuration = 300;

function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  const auth = request.headers.get("authorization") ?? "";
  if (auth === `Bearer ${secret}`) return true;
  if (request.nextUrl.searchParams.get("secret") === secret) return true;
  return false;
}

const MAX_REDELIVER = 5;
const BATCH_LIMIT = 50;

function resolveSiteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return explicit.replace(/\/$/, "");
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  return "";
}

export async function GET(request: NextRequest): Promise<Response> {
  if (!isAuthorized(request)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const lineToken = process.env.MATCHING_LINE_INFLOW_LOOKUP_TOKEN;
  if (!lineToken) {
    return Response.json(
      { error: "MATCHING_LINE_INFLOW_LOOKUP_TOKEN が未設定です" },
      { status: 500 },
    );
  }

  const siteUrl = resolveSiteUrl();
  if (!siteUrl) {
    return Response.json(
      { error: "base URL が解決できません(NEXT_PUBLIC_SITE_URL / VERCEL_URL 未設定)" },
      { status: 500 },
    );
  }
  const redeliverUrl = `${siteUrl}/api/line/aifukugyo-redeliver`;

  const { data: rows, error } = await supabaseAdmin
    .from("matching_diagnoses")
    .select("id, line_redeliver_count")
    .eq("ai_generation_status", "ready")
    .is("report_delivered_at", null)
    .lt("line_redeliver_count", MAX_REDELIVER)
    .limit(BATCH_LIMIT);

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  let processed = 0;
  let redelivered = 0;
  let skipped = 0;
  let failed = 0;
  let exhausted = 0;

  for (const row of rows ?? []) {
    processed++;

    let httpOk = false;
    let resJson: { status?: string; reason?: string; sent?: number } = {};
    try {
      const res = await fetch(redeliverUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${lineToken}`,
        },
        body: JSON.stringify({ ref: row.id }),
        cache: "no-store",
      });
      httpOk = res.ok;
      resJson = await res.json().catch(() => ({}));
    } catch (e) {
      console.warn(
        `[cron/matching-line-redeliver] fetch error: ${row.id}: ${e}`,
      );
    }

    if (httpOk && resJson.status === "redelivered") {
      redelivered++;
      await supabaseAdmin
        .from("matching_diagnoses")
        .update({ report_delivered_at: new Date().toISOString() })
        .eq("id", row.id);
      console.log(
        `[cron/matching-line-redeliver] redelivered: ${row.id} (sent=${resJson.sent ?? "?"})`,
      );
    } else if (httpOk && resJson.status === "skipped") {
      skipped++;
      console.log(
        `[cron/matching-line-redeliver] skipped: ${row.id} reason=${resJson.reason}`,
      );
      // skipped は無害なのでカウントしない(永遠ループ OK、ユーザーが LINE 登録するまで)
    } else {
      // HTTP 失敗 or 想定外レスポンス → カウントを +1
      failed++;
      const prevCount = (row.line_redeliver_count as number | null) ?? 0;
      const newCount = prevCount + 1;
      await supabaseAdmin
        .from("matching_diagnoses")
        .update({ line_redeliver_count: newCount })
        .eq("id", row.id);
      console.warn(
        `[cron/matching-line-redeliver] failed: ${row.id} (count=${newCount})`,
      );
      if (newCount >= MAX_REDELIVER) {
        exhausted++;
        await notifyChatwork(
          `🚨 [PR#2-D] LINE 再配信 ${MAX_REDELIVER} 回連続失敗\n\n` +
            `diagnosis_id: ${row.id}\n\n` +
            `Supabase で matching_diagnoses.line_redeliver_count を 0 にリセットすれば再試行再開可能。\n` +
            `LINE 側 API(/api/line/aifukugyo-redeliver)のログも要確認。`,
        );
      }
    }
  }

  return Response.json({
    ok: true,
    processed,
    redelivered,
    skipped,
    failed,
    exhausted,
  });
}

export async function POST(request: NextRequest): Promise<Response> {
  return GET(request);
}

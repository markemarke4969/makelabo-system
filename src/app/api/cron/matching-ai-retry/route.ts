import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { regenerateAiSectionsForDiagnosis } from "@/lib/matching-ai-regenerate";
import { notifyChatwork } from "@/lib/chatwork";

// ============================================================
// PR#2-D: matching AI 生成 cron 再試行
// ============================================================
// 1 時間毎に発火し、ai_generation_status='failed' の matching_diagnoses を
// Claude API で再生成する。
//
// コスト暴走防止:
//   - ai_retry_count < 5 で絞り込み(5 回到達で対象外)
//   - 1 回あたり最大 20 件処理(限界 cost: 20 件 × 数十円 = 1000 円程度/h)
//   - 5 回到達した行は Chatwork に [toall] 通知
//
// 認証:
//   - Authorization: Bearer ${CRON_SECRET} または ?secret=${CRON_SECRET}
//   - CRON_SECRET 未設定時は開発環境 fallback で素通り
//
// 冪等性:
//   - 試行前にカウンタ +1(楽観的、二重実行に強い)
//   - 成功時 status='ready' に遷移、ai_retry_count は履歴として残す
//   - 失敗時 status='failed' のまま、次回 cron で再試行
// ============================================================

export const maxDuration = 300;

function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // dev fallback
  const auth = request.headers.get("authorization") ?? "";
  if (auth === `Bearer ${secret}`) return true;
  if (request.nextUrl.searchParams.get("secret") === secret) return true;
  return false;
}

const MAX_RETRY = 5;
const BATCH_LIMIT = 20;

export async function GET(request: NextRequest): Promise<Response> {
  if (!isAuthorized(request)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const { data: rows, error } = await supabaseAdmin
    .from("matching_diagnoses")
    .select("id, ai_retry_count")
    .eq("ai_generation_status", "failed")
    .lt("ai_retry_count", MAX_RETRY)
    .limit(BATCH_LIMIT);

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  let processed = 0;
  let succeeded = 0;
  let failed = 0;
  let exhausted = 0;

  for (const row of rows ?? []) {
    processed++;
    const prevCount = (row.ai_retry_count as number | null) ?? 0;
    const newCount = prevCount + 1;

    // 試行前にカウンタ +1(楽観的)
    await supabaseAdmin
      .from("matching_diagnoses")
      .update({ ai_retry_count: newCount })
      .eq("id", row.id);

    const result = await regenerateAiSectionsForDiagnosis(row.id as string);
    if (result.ok) {
      succeeded++;
      console.log(
        `[cron/matching-ai-retry] regen success: ${row.id} (retry=${newCount})`,
      );
    } else {
      failed++;
      console.warn(
        `[cron/matching-ai-retry] regen failed: ${row.id} (retry=${newCount}, reason=${result.reason})`,
      );
      if (newCount >= MAX_RETRY) {
        exhausted++;
        await notifyChatwork(
          `🚨 [PR#2-D] AI 生成 ${MAX_RETRY} 回連続失敗\n\n` +
            `diagnosis_id: ${row.id}\n` +
            `理由: ${result.reason}\n\n` +
            `Supabase で matching_diagnoses.ai_retry_count を 0 にリセットすれば再試行再開可能。\n` +
            `または手動で ai_strength_section / ai_animal_section / ai_risk_section を埋めて` +
            `ai_generation_status='ready' に UPDATE してください。`,
        );
      }
    }
  }

  return Response.json({ ok: true, processed, succeeded, failed, exhausted });
}

export async function POST(request: NextRequest): Promise<Response> {
  return GET(request);
}

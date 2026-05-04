import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";

export const maxDuration = 300;

/**
 * 段階8-2-E-3-2: 掘り起こし配信の予約送信 cron。
 *
 * 概要:
 *   - line_reengagement_broadcasts WHERE status='scheduled' AND scheduled_at <= NOW() で対象を取得
 *   - 各 id について /api/line/reengagement に PUT action=send で内部 fetch
 *     既存の即時送信ロジック(reengagement/route.ts L127-)を完全流用、共通ヘルパー化不要
 *   - 送信成功 → API 側で status='sent' / sent_at / sent_count を更新(WHERE status='scheduled' から除外される)
 *   - 送信失敗 → status='scheduled' のまま(次回 tick で再試行)
 *
 * 呼出元:
 *   /api/cron/line-tick の GET ハンドラ内から内部 fetch で呼ばれる(line-broadcast と同パターン)。
 *   vercel.json への直接登録なし、Hobby プラン cron 数制約(2 件)を回避するため line-tick 経由。
 */
function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  const auth = request.headers.get("authorization") ?? "";
  if (auth === `Bearer ${secret}`) return true;
  const query = request.nextUrl.searchParams.get("secret");
  return query === secret;
}

function forwardAuth(request: NextRequest): Record<string, string> {
  const auth = request.headers.get("authorization");
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (auth) headers.Authorization = auth;
  return headers;
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const nowIso = new Date().toISOString();
    const { data, error } = await supabase
      .from("line_reengagement_broadcasts")
      .select("id, name")
      .eq("status", "scheduled")
      .not("scheduled_at", "is", null)
      .lte("scheduled_at", nowIso)
      .limit(20);
    if (error) {
      // scheduled_at 列なし(マイグレ未適用)→ 早期 return で no-op
      if (/scheduled_at/i.test(error.message)) {
        return Response.json({ ok: true, processed: 0, note: "scheduled_at column missing" });
      }
      return Response.json({ error: error.message }, { status: 500 });
    }

    const list = (data ?? []) as Array<{ id: string; name: string }>;
    const results: Array<{ id: string; ok: boolean; sent_count?: number; error?: string }> = [];

    for (const item of list) {
      try {
        const r = await fetch(new URL("/api/line/reengagement", request.url), {
          method: "PUT",
          headers: forwardAuth(request),
          body: JSON.stringify({ id: item.id, action: "send" }),
        });
        const respData = (await r.json().catch(() => ({}))) as { sent_count?: number; error?: string };
        if (r.ok) {
          results.push({ id: item.id, ok: true, sent_count: respData.sent_count ?? 0 });
        } else {
          results.push({ id: item.id, ok: false, error: respData.error ?? `HTTP ${r.status}` });
        }
      } catch (e) {
        results.push({ id: item.id, ok: false, error: (e as Error).message });
      }
    }

    return Response.json({ ok: true, processed: list.length, results });
  } catch (e) {
    console.error("[cron/line-reengagement-send] error:", e);
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  return GET(request);
}

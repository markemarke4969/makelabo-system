import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";

export const maxDuration = 300;

/**
 * 毎月1日0時に実行する月次レポート自動生成
 * Vercel Cron: 0 0 1 * *
 */
function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  const auth = request.headers.get("authorization") ?? "";
  if (auth === `Bearer ${secret}`) return true;
  const query = request.nextUrl.searchParams.get("secret");
  return query === secret;
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  // 先月の月を計算
  const now = new Date();
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const month = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, "0")}`;

  // 全プロジェクトを取得
  const { data: projects } = await supabase
    .from("line_projects")
    .select("id");

  const results: Array<{ project_id: string; ok: boolean; error?: string }> = [];

  for (const project of projects ?? []) {
    try {
      const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : "http://localhost:3000";

      const res = await fetch(`${baseUrl}/api/line/reports`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: project.id,
          month,
        }),
      });

      if (res.ok) {
        results.push({ project_id: project.id as string, ok: true });
      } else {
        const data = await res.json().catch(() => ({}));
        results.push({ project_id: project.id as string, ok: false, error: data.error ?? `${res.status}` });
      }
    } catch (e) {
      results.push({ project_id: project.id as string, ok: false, error: (e as Error).message });
    }
  }

  return Response.json({ ok: true, month, results });
}

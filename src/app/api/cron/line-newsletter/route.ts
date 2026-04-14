import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";
import { dispatchNewsletter } from "@/lib/newsletter";

export const maxDuration = 300;

function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  const auth = request.headers.get("authorization") ?? "";
  if (auth === `Bearer ${secret}`) return true;
  const q = request.nextUrl.searchParams.get("secret");
  return q === secret;
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from("line_newsletters")
    .select("id, name")
    .eq("status", "scheduled")
    .not("scheduled_at", "is", null)
    .lte("scheduled_at", nowIso)
    .limit(20);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  const list = (data ?? []) as Array<{ id: string; name: string }>;
  const results: Array<{ id: string; name: string; sent: number; failed: number; ok: boolean; error?: string }> = [];

  for (const nl of list) {
    const r = await dispatchNewsletter(nl.id);
    results.push({ id: nl.id, name: nl.name, sent: r.sent, failed: r.failed, ok: r.ok, error: r.error });
  }

  return Response.json({ ok: true, processed: list.length, results });
}

export async function POST(request: NextRequest) {
  return GET(request);
}

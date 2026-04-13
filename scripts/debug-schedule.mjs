import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const env = readFileSync(resolve(__dirname, "../.env.local"), "utf8");
const get = (k) => env.match(new RegExp(`^${k}=(.+)$`, "m"))?.[1]?.trim();

const url = get("NEXT_PUBLIC_SUPABASE_URL");
const key = get("SUPABASE_SERVICE_ROLE_KEY") || get("NEXT_PUBLIC_SUPABASE_ANON_KEY");
const sb = createClient(url, key);

console.log("=== 1. kind='schedule' のシーケンス全件 ===");
const { data: sched, error: err1 } = await sb
  .from("line_step_sequences")
  .select("id, name, kind, scheduled_at, sent_at, status, account_id, created_at")
  .eq("kind", "schedule")
  .order("created_at", { ascending: false });
console.log("error:", err1);
console.log("count:", sched?.length ?? 0);
console.log(sched);

console.log("\n=== 2. 直近作成のシーケンス（kind無視） ===");
const { data: recent, error: err2 } = await sb
  .from("line_step_sequences")
  .select("id, name, kind, scheduled_at, sent_at, status, created_at")
  .order("created_at", { ascending: false })
  .limit(10);
console.log("error:", err2);
console.log(recent);

console.log("\n=== 3. Cron 抽出クエリをそのまま再現 ===");
const nowIso = new Date().toISOString();
console.log("now:", nowIso);
const { data: due, error: err3 } = await sb
  .from("line_step_sequences")
  .select("id, name, kind, scheduled_at, sent_at, status")
  .eq("kind", "schedule")
  .eq("status", "active")
  .is("sent_at", null)
  .not("scheduled_at", "is", null)
  .lte("scheduled_at", nowIso);
console.log("error:", err3);
console.log("due count:", due?.length ?? 0);
console.log(due);

console.log("\n=== 4. kind カラム存在確認（全シーケンスの kind 分布） ===");
const { data: all } = await sb
  .from("line_step_sequences")
  .select("id, name, kind")
  .limit(50);
const kindCounts = {};
for (const s of all ?? []) {
  const k = s.kind ?? "NULL";
  kindCounts[k] = (kindCounts[k] ?? 0) + 1;
}
console.log("kind 分布:", kindCounts);
console.log("総件数:", all?.length ?? 0);

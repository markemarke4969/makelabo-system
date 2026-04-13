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

const BASIC_ID = "058phahn";

console.log("=== 1. line_accounts lookup by basic_id ===");
const { data: accs, error: accErr } = await sb
  .from("line_accounts")
  .select("id, account_name, basic_id, project_id, is_active, created_at")
  .eq("basic_id", BASIC_ID);
console.log("error:", accErr);
console.log("accounts found:", accs?.length ?? 0);
console.log(accs);

if (accs && accs[0]) {
  const accountId = accs[0].id;
  console.log("\n=== 2. line_inflow_routes for this account ===");
  const { data: routes, error: routeErr } = await sb
    .from("line_inflow_routes")
    .select("*")
    .eq("account_id", accountId)
    .order("created_at", { ascending: false });
  console.log("error:", routeErr);
  console.log("routes found:", routes?.length ?? 0);
  console.log(routes);

  console.log("\n=== 3. Embed join test (click_count) ===");
  const { data: joined, error: joinErr } = await sb
    .from("line_inflow_routes")
    .select("*, click_count:line_inflow_clicks(count)")
    .eq("account_id", accountId);
  console.log("error:", joinErr);
  console.log("joined:", joined);
}

console.log("\n=== 4. All inflow routes (no filter, last 20) ===");
const { data: all } = await sb
  .from("line_inflow_routes")
  .select("id, account_id, name, code, created_at")
  .order("created_at", { ascending: false })
  .limit(20);
console.log(all);

console.log("\n=== 5. All line_accounts with basic_id LIKE '058%' ===");
const { data: likeAccs } = await sb
  .from("line_accounts")
  .select("id, account_name, basic_id")
  .ilike("basic_id", "%058%");
console.log(likeAccs);

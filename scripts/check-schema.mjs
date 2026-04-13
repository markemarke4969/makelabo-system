import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const env = readFileSync(resolve(__dirname, "../.env.local"), "utf8");
const get = (k) => env.match(new RegExp(`^${k}=(.+)$`, "m"))?.[1]?.trim();

const sb = createClient(get("NEXT_PUBLIC_SUPABASE_URL"), get("SUPABASE_SERVICE_ROLE_KEY"));

console.log("=== line_projects: code column? ===");
const p = await sb.from("line_projects").select("id, name, code").limit(20);
console.log("error:", p.error);
console.log(p.data);

console.log("\n=== line_inflow_routes: project_id column? ===");
const r = await sb.from("line_inflow_routes").select("id, account_id, project_id, name, code").limit(20);
console.log("error:", r.error);
console.log(r.data);

console.log("\n=== line_accounts main by project ===");
const a = await sb
  .from("line_accounts")
  .select("id, account_name, basic_id, project_id, role, is_active, banned_at")
  .limit(20);
console.log("error:", a.error);
console.log(a.data);

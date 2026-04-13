import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const env = readFileSync(resolve(__dirname, "../.env.local"), "utf8");
const get = (k) => env.match(new RegExp(`^${k}=(.+)$`, "m"))?.[1]?.trim();

const url = get("NEXT_PUBLIC_SUPABASE_URL");
const anon = get("NEXT_PUBLIC_SUPABASE_ANON_KEY");
const sb = createClient(url, anon);

const ACC_ID = "b3823d14-f581-483d-a178-31299052fbe3";

console.log("=== anon: line_inflow_routes without join ===");
const a = await sb
  .from("line_inflow_routes")
  .select("*")
  .eq("account_id", ACC_ID);
console.log("error:", a.error);
console.log("rows:", a.data?.length ?? 0, a.data);

console.log("\n=== anon: with click_count embed ===");
const b = await sb
  .from("line_inflow_routes")
  .select("*, click_count:line_inflow_clicks(count)")
  .eq("account_id", ACC_ID);
console.log("error:", b.error);
console.log("rows:", b.data?.length ?? 0);
console.log(JSON.stringify(b.data, null, 2));

console.log("\n=== anon: line_inflow_clicks select ===");
const c = await sb.from("line_inflow_clicks").select("*").limit(5);
console.log("error:", c.error);
console.log("rows:", c.data?.length ?? 0);

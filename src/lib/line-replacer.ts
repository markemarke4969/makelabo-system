import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * 置き換え文字（差し込み変数）のコンテキスト。
 * LINE / メルマガ本文中の {display_name} や {field:email} 等をこの情報で埋める。
 */
export interface ReplacerContext {
  display_name: string;
  label_names: string[];
  inflow_route_name: string | null;
  followed_at: string | null;
  custom_fields: Record<string, string>;
}

/** UI に提示する利用可能な変数の一覧 */
export const AVAILABLE_VARIABLES: Array<{ key: string; description: string }> = [
  { key: "{display_name}", description: "フォロワーの表示名" },
  { key: "{label_names}", description: "付与されているラベル（カンマ区切り）" },
  { key: "{inflow_route_name}", description: "流入経路名" },
  { key: "{followed_at}", description: "友だち追加日（YYYY-MM-DD）" },
  { key: "{days_since_follow}", description: "友だち追加からの経過日数" },
  { key: "{today}", description: "今日の日付（YYYY-MM-DD）" },
  { key: "{field:キー}", description: "カスタムフィールド値（例: {field:email}）" },
];

/** 既定のコンテキスト（フォロワー情報が取れない場合用） */
export function defaultContext(displayName = "ゲスト"): ReplacerContext {
  return {
    display_name: displayName,
    label_names: [],
    inflow_route_name: null,
    followed_at: null,
    custom_fields: {},
  };
}

function formatDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function daysSince(iso: string | null): string {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const diff = Math.floor((Date.now() - t) / (1000 * 60 * 60 * 24));
  return String(Math.max(0, diff));
}

/**
 * テキスト中の置換トークンを context に従って置換する。
 * 見つからないキーはそのまま残さず空文字に置き換える（誤送信防止）。
 */
export function replaceVariables(text: string, context: ReplacerContext): string {
  if (!text) return text;
  let out = text;

  out = out.replace(/\{display_name\}/g, context.display_name || "");
  out = out.replace(/\{label_names\}/g, context.label_names.join(", "));
  out = out.replace(/\{inflow_route_name\}/g, context.inflow_route_name ?? "");
  out = out.replace(/\{followed_at\}/g, formatDate(context.followed_at));
  out = out.replace(/\{days_since_follow\}/g, daysSince(context.followed_at));
  out = out.replace(/\{today\}/g, formatDate(new Date().toISOString()));

  // カスタムフィールド {field:キー}
  out = out.replace(/\{field:([a-zA-Z0-9_\-]+)\}/g, (_m, key: string) => {
    return context.custom_fields[key] ?? "";
  });

  return out;
}

/**
 * フォロワー情報から置換コンテキストを構築する。
 *
 * @param supabase - Supabase クライアント
 * @param follower - フォロワーを特定する情報（id か line_user_id のどちらか）
 */
export async function buildReplacerContext(
  supabase: SupabaseClient,
  follower: { id?: string; line_user_id?: string; account_id?: string },
): Promise<ReplacerContext> {
  const ctx = defaultContext();

  // 1. フォロワー本体
  let q = supabase
    .from("line_followers")
    .select("id, display_name, followed_at, inflow_route_id, line_account_id")
    .limit(1);
  if (follower.id) q = q.eq("id", follower.id);
  else if (follower.line_user_id) q = q.eq("line_user_id", follower.line_user_id);
  else return ctx;

  const { data: followerRow } = await q.maybeSingle();
  if (!followerRow) return ctx;

  const followerId = followerRow.id as string;
  ctx.display_name = (followerRow.display_name as string) || "ゲスト";
  ctx.followed_at = (followerRow.followed_at as string) || null;

  // 2. 流入経路名
  if (followerRow.inflow_route_id) {
    const { data: route } = await supabase
      .from("line_inflow_routes")
      .select("name")
      .eq("id", followerRow.inflow_route_id)
      .maybeSingle();
    if (route?.name) ctx.inflow_route_name = route.name as string;
  }

  // 3. ラベル
  const { data: labels } = await supabase
    .from("line_follower_labels")
    .select("line_labels(name)")
    .eq("follower_id", followerId);
  if (labels) {
    const names: string[] = [];
    for (const row of labels as Array<{ line_labels: { name: string } | { name: string }[] | null }>) {
      const l = row.line_labels;
      if (!l) continue;
      if (Array.isArray(l)) {
        for (const x of l) if (x?.name) names.push(x.name);
      } else if (l.name) {
        names.push(l.name);
      }
    }
    ctx.label_names = names;
  }

  // 4. カスタムフィールド値
  //
  // PR#2-B: follower 個別値が無い field は line_custom_fields.default_value で fallback
  // (構想 §4-1-B 方式)。順序:
  //   (i)  account に紐づく全 line_custom_fields の default_value を読む → ctx に埋める
  //   (ii) line_follower_custom_values で個別値を上書き
  // → 個別値があればそれ、無ければ default_value、両方無ければ replaceVariables の `?? ""` で空文字

  // (i) account の全 field の default_value を取得
  if (followerRow.line_account_id) {
    const { data: defs, error: defErr } = await supabase
      .from("line_custom_fields")
      .select("field_key, default_value")
      .eq("account_id", followerRow.line_account_id);
    // default_value 列なし環境(PR#2-B SQL 未適用)は silent skip
    if (!defErr && defs) {
      for (const row of defs as Array<{
        field_key: string;
        default_value: string | null;
      }>) {
        if (row.field_key && row.default_value != null && row.default_value !== "") {
          ctx.custom_fields[row.field_key] = row.default_value;
        }
      }
    }
  }

  // (ii) follower 個別値で上書き
  const { data: values } = await supabase
    .from("line_follower_custom_values")
    .select("value, line_custom_fields(field_key)")
    .eq("follower_id", followerId);
  if (values) {
    for (const row of values as Array<{
      value: string | null;
      line_custom_fields: { field_key: string } | { field_key: string }[] | null;
    }>) {
      const f = row.line_custom_fields;
      const key = Array.isArray(f) ? f[0]?.field_key : f?.field_key;
      if (key && row.value != null) ctx.custom_fields[key] = row.value;
    }
  }

  return ctx;
}

/**
 * 条件分岐メッセージで使う条件評価。
 * condition: { label_ids?: string[], inflow_route_ids?: string[], custom_field?: { key, value } }
 * ひとつでも指定されたものがあればその全てを満たすかを判定（AND）。
 * すべて未指定（default）なら true を返す。
 */
export interface BranchCondition {
  label_ids?: string[];
  inflow_route_ids?: string[];
  custom_field?: { key: string; op?: "eq" | "contains" | "exists"; value?: string };
}

export interface BranchEvalContext {
  label_ids: string[];
  inflow_route_id: string | null;
  custom_fields: Record<string, string>;
}

export function evaluateBranchCondition(
  condition: BranchCondition | null | undefined,
  ctx: BranchEvalContext,
): boolean {
  if (!condition || Object.keys(condition).length === 0) return true;

  if (condition.label_ids && condition.label_ids.length > 0) {
    const hit = condition.label_ids.some((id) => ctx.label_ids.includes(id));
    if (!hit) return false;
  }
  if (condition.inflow_route_ids && condition.inflow_route_ids.length > 0) {
    if (!ctx.inflow_route_id) return false;
    if (!condition.inflow_route_ids.includes(ctx.inflow_route_id)) return false;
  }
  if (condition.custom_field?.key) {
    const val = ctx.custom_fields[condition.custom_field.key];
    const op = condition.custom_field.op ?? "eq";
    if (op === "exists") {
      if (!val) return false;
    } else if (op === "contains") {
      if (!val || !val.includes(condition.custom_field.value ?? "")) return false;
    } else {
      if (val !== (condition.custom_field.value ?? "")) return false;
    }
  }
  return true;
}

/**
 * follower_id と紐づくラベルID / カスタム値を条件評価用に取得。
 * ReplacerContext とは別データ（名前ではなくIDが必要）。
 */
export async function buildBranchEvalContext(
  supabase: SupabaseClient,
  follower: { id?: string; line_user_id?: string },
): Promise<BranchEvalContext> {
  let q = supabase
    .from("line_followers")
    .select("id, inflow_route_id")
    .limit(1);
  if (follower.id) q = q.eq("id", follower.id);
  else if (follower.line_user_id) q = q.eq("line_user_id", follower.line_user_id);
  else return { label_ids: [], inflow_route_id: null, custom_fields: {} };

  const { data: row } = await q.maybeSingle();
  if (!row) return { label_ids: [], inflow_route_id: null, custom_fields: {} };

  const followerId = row.id as string;

  const [labelsRes, valuesRes] = await Promise.all([
    supabase.from("line_follower_labels").select("label_id").eq("follower_id", followerId),
    supabase
      .from("line_follower_custom_values")
      .select("value, line_custom_fields(field_key)")
      .eq("follower_id", followerId),
  ]);

  const label_ids = (labelsRes.data ?? []).map((r) => r.label_id as string);
  const custom_fields: Record<string, string> = {};
  for (const v of (valuesRes.data ?? []) as Array<{
    value: string | null;
    line_custom_fields: { field_key: string } | { field_key: string }[] | null;
  }>) {
    const f = v.line_custom_fields;
    const key = Array.isArray(f) ? f[0]?.field_key : f?.field_key;
    if (key && v.value != null) custom_fields[key] = v.value;
  }
  return {
    label_ids,
    inflow_route_id: (row.inflow_route_id as string) ?? null,
    custom_fields,
  };
}

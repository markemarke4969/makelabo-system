import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";
import {
  DeliveryCondition,
  FollowerLite,
  evalCondition,
  listUnsupportedFields,
  FIELD_LABELS,
} from "@/lib/delivery-conditions";

interface Body {
  account_id: string;
  condition: DeliveryCondition;
  // クライアント側ラベル状態を受け取る（ラベルはまだ DB 永続化されていないため）
  labels?: Array<{ id: string; assigned_users: string[] }>;
}

export async function POST(request: NextRequest) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }

  if (!body.account_id || !body.condition) {
    return Response.json({ error: "account_id and condition are required" }, { status: 400 });
  }

  // 1. 対象アカウントの「配信可能」な友だちを取得
  //    (status='following' のみ。inflow_route_id が無い環境は fallback)
  let followers: Array<{
    id: string;
    line_user_id: string;
    display_name: string | null;
    followed_at: string;
    inflow_route_id?: string | null;
  }> | null = null;
  let error: { message: string } | null = null;

  {
    const r = await supabase
      .from("line_followers")
      .select("id, line_user_id, display_name, followed_at, inflow_route_id")
      .eq("line_account_id", body.account_id)
      .eq("status", "following");
    followers = r.data as typeof followers;
    error = r.error;
  }

  if (error && /inflow_route_id/.test(error.message)) {
    const fb = await supabase
      .from("line_followers")
      .select("id, line_user_id, display_name, followed_at")
      .eq("line_account_id", body.account_id)
      .eq("status", "following");
    followers = (fb.data ?? []).map((r: any) => ({ ...r, inflow_route_id: null }));
    error = fb.error;
  }

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  const rows = (followers ?? []) as Array<{
    id: string;
    line_user_id: string;
    display_name: string | null;
    followed_at: string;
    inflow_route_id?: string | null;
  }>;

  // 2. line_user_id → label_ids の変換表を作る
  const labelMap = new Map<string, string[]>();
  if (body.labels) {
    for (const l of body.labels) {
      for (const uid of l.assigned_users) {
        const arr = labelMap.get(uid) ?? [];
        arr.push(l.id);
        labelMap.set(uid, arr);
      }
    }
  }

  // 3. 条件評価
  const lites: FollowerLite[] = rows.map((r) => ({
    id: r.id,
    line_user_id: r.line_user_id,
    display_name: r.display_name,
    followed_at: r.followed_at,
    inflow_route_id: r.inflow_route_id ?? null,
    label_ids: labelMap.get(r.line_user_id) ?? [],
  }));

  const matched = lites.filter((f) => evalCondition(body.condition, f));

  // 4. 未対応フィールドの警告
  const unsupported = listUnsupportedFields(body.condition).map((f) => FIELD_LABELS[f]);

  return Response.json({
    total: lites.length,
    matched: matched.length,
    sample: matched.slice(0, 20).map((f) => ({
      id: f.id,
      line_user_id: f.line_user_id,
      display_name: f.display_name,
    })),
    unsupported_fields: unsupported,
  });
}

import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";

export const maxDuration = 300;

/**
 * POST /api/line/lpro-sync
 *
 * GAS からスプシの Lpro データを受け取り、LINE ユーザーID をキーに UPSERT する。
 * - 広告コード → カスタムフィールド（独自置き換え文字）に保存
 * - ラベル → 自動付与
 * - 友達追加日時 → followed_at を更新
 * - カスタムアクション → カスタムフィールドに保存
 *
 * 認証: Authorization: Bearer {CRON_SECRET}
 *
 * Body: {
 *   account_id: string,
 *   rows: Array<{
 *     line_user_id: string,
 *     ad_code?: string,
 *     labels?: string[],
 *     followed_at?: string,
 *     custom_action?: string,
 *     custom_fields?: Record<string, string>,
 *   }>
 * }
 */
export async function POST(request: NextRequest) {
  // 認証チェック
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization") ?? "";
    if (auth !== `Bearer ${secret}`) {
      return Response.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  const startTime = Date.now();

  let body: {
    account_id: string;
    rows: Array<{
      line_user_id: string;
      ad_code?: string;
      labels?: string[];
      followed_at?: string;
      custom_action?: string;
      custom_fields?: Record<string, string>;
    }>;
  };

  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.account_id || !Array.isArray(body.rows)) {
    return Response.json({ error: "account_id and rows are required" }, { status: 400 });
  }

  const { account_id, rows } = body;
  let updatedCount = 0;
  let createdCount = 0;
  let skippedCount = 0;
  let errorCount = 0;
  const errors: Array<{ line_user_id: string; error: string }> = [];

  // カスタムフィールド定義を事前に取得（ad_code, custom_action 用）
  const { data: cfDefs } = await supabase
    .from("line_custom_fields")
    .select("id, field_key")
    .eq("account_id", account_id);
  const cfKeyToId: Record<string, string> = {};
  for (const cf of cfDefs ?? []) {
    cfKeyToId[cf.field_key as string] = cf.id as string;
  }

  // ad_code フィールドが無ければ自動作成
  if (!cfKeyToId["ad_code"]) {
    const { data: newCf } = await supabase
      .from("line_custom_fields")
      .insert({ account_id, field_key: "ad_code", field_label: "広告コード", field_type: "text", sort_order: 100 })
      .select("id")
      .single();
    if (newCf) cfKeyToId["ad_code"] = newCf.id as string;
  }

  // custom_action フィールドが無ければ自動作成
  if (!cfKeyToId["custom_action"]) {
    const { data: newCf } = await supabase
      .from("line_custom_fields")
      .insert({ account_id, field_key: "custom_action", field_label: "カスタムアクション", field_type: "text", sort_order: 101 })
      .select("id")
      .single();
    if (newCf) cfKeyToId["custom_action"] = newCf.id as string;
  }

  // ラベル定義を事前に取得
  const { data: labelDefs } = await supabase
    .from("line_labels")
    .select("id, name")
    .eq("account_id", account_id);
  const labelNameToId: Record<string, string> = {};
  for (const l of labelDefs ?? []) {
    labelNameToId[l.name as string] = l.id as string;
  }

  for (const row of rows) {
    if (!row.line_user_id) {
      skippedCount++;
      continue;
    }

    try {
      // フォロワーを検索
      const { data: follower } = await supabase
        .from("line_followers")
        .select("id")
        .eq("line_account_id", account_id)
        .eq("line_user_id", row.line_user_id)
        .maybeSingle();

      if (!follower) {
        // フォロワーが存在しない → スキップ（LINEフォロー前のデータ）
        skippedCount++;
        continue;
      }

      const followerId = follower.id as string;
      let isNew = false;

      // followed_at の更新
      if (row.followed_at) {
        const { data: existing } = await supabase
          .from("line_followers")
          .select("followed_at")
          .eq("id", followerId)
          .single();
        // 既存のfollowed_atが無いか、Lproの日付が古い場合のみ更新
        if (existing && (!existing.followed_at || new Date(row.followed_at) < new Date(existing.followed_at as string))) {
          await supabase
            .from("line_followers")
            .update({ followed_at: row.followed_at, updated_at: new Date().toISOString() })
            .eq("id", followerId);
          isNew = true;
        }
      }

      // 広告コード → カスタムフィールドに保存
      if (row.ad_code && cfKeyToId["ad_code"]) {
        await supabase.from("line_follower_custom_values").upsert(
          { follower_id: followerId, field_id: cfKeyToId["ad_code"], value: row.ad_code, updated_at: new Date().toISOString() },
          { onConflict: "follower_id,field_id" },
        );
        isNew = true;
      }

      // カスタムアクション → カスタムフィールドに保存
      if (row.custom_action && cfKeyToId["custom_action"]) {
        await supabase.from("line_follower_custom_values").upsert(
          { follower_id: followerId, field_id: cfKeyToId["custom_action"], value: row.custom_action, updated_at: new Date().toISOString() },
          { onConflict: "follower_id,field_id" },
        );
        isNew = true;
      }

      // その他のカスタムフィールド
      if (row.custom_fields) {
        for (const [key, value] of Object.entries(row.custom_fields)) {
          if (cfKeyToId[key] && value) {
            await supabase.from("line_follower_custom_values").upsert(
              { follower_id: followerId, field_id: cfKeyToId[key], value, updated_at: new Date().toISOString() },
              { onConflict: "follower_id,field_id" },
            );
            isNew = true;
          }
        }
      }

      // ラベル自動付与
      if (row.labels && row.labels.length > 0) {
        for (const labelName of row.labels) {
          let labelId = labelNameToId[labelName];
          // ラベルが無ければ自動作成
          if (!labelId) {
            const { data: newLabel } = await supabase
              .from("line_labels")
              .insert({ account_id, name: labelName, color: "#3B82F6" })
              .select("id")
              .single();
            if (newLabel) {
              labelId = newLabel.id as string;
              labelNameToId[labelName] = labelId;
            }
          }
          if (labelId) {
            await supabase.from("line_follower_labels").upsert(
              { label_id: labelId, follower_id: followerId },
              { onConflict: "label_id,follower_id" },
            );
            isNew = true;
          }
        }
      }

      if (isNew) {
        updatedCount++;
      } else {
        createdCount++;
      }
    } catch (e) {
      errorCount++;
      errors.push({ line_user_id: row.line_user_id, error: (e as Error).message });
    }
  }

  const durationMs = Date.now() - startTime;

  // 同期ログ保存
  await supabase.from("line_lpro_sync_logs").insert({
    total_rows: rows.length,
    updated_count: updatedCount,
    created_count: createdCount,
    skipped_count: skippedCount,
    error_count: errorCount,
    errors: errors.length > 0 ? errors : [],
    duration_ms: durationMs,
  });

  return Response.json({
    ok: true,
    total: rows.length,
    updated: updatedCount,
    created: createdCount,
    skipped: skippedCount,
    errors: errorCount,
    duration_ms: durationMs,
  });
}

// 同期ログ一覧取得
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization") ?? "";
    const query = request.nextUrl.searchParams.get("secret");
    if (auth !== `Bearer ${secret}` && query !== secret) {
      return Response.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  const { data, error } = await supabase
    .from("line_lpro_sync_logs")
    .select("*")
    .order("synced_at", { ascending: false })
    .limit(50);

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json(data);
}

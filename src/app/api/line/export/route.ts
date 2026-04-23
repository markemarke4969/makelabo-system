import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  const type = request.nextUrl.searchParams.get("type") ?? "followers";
  const accountId = request.nextUrl.searchParams.get("account_id");

  if (type === "followers") {
    // フォロワー基本データ取得
    let followerQuery = supabase
      .from("line_followers")
      .select("*")
      .order("followed_at", { ascending: false });

    if (accountId) {
      followerQuery = followerQuery.eq("line_account_id", accountId);
    }

    const { data: followers, error } = await followerQuery;
    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }
    const followerList = followers ?? [];
    if (followerList.length === 0) {
      return new Response("\uFEFF表示名,LINE User ID,ステータス,友だち追加日時\n", {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="line_followers_${new Date().toISOString().slice(0, 10)}.csv"`,
        },
      });
    }

    const followerIds = followerList.map((f) => f.id as string);

    // ラベル取得（フォロワーごと）
    const { data: followerLabelsData } = await supabase
      .from("line_follower_labels")
      .select("follower_id, label_id")
      .in("follower_id", followerIds);

    // ラベル名を取得
    const labelIds = [...new Set((followerLabelsData ?? []).map((fl) => fl.label_id as string))];
    let labelNameMap: Record<string, string> = {};
    if (labelIds.length > 0) {
      const { data: labelsData } = await supabase
        .from("line_labels")
        .select("id, name")
        .in("id", labelIds);
      labelNameMap = (labelsData ?? []).reduce<Record<string, string>>((acc, l) => {
        acc[l.id as string] = l.name as string;
        return acc;
      }, {});
    }

    // フォロワーごとのラベル名リスト
    const followerLabels: Record<string, string[]> = {};
    for (const fl of followerLabelsData ?? []) {
      const fid = fl.follower_id as string;
      if (!followerLabels[fid]) followerLabels[fid] = [];
      const name = labelNameMap[fl.label_id as string];
      if (name) followerLabels[fid].push(name);
    }

    // カスタムフィールド定義取得
    let customFields: Array<{ id: string; field_key: string; field_label: string }> = [];
    if (accountId) {
      const { data: cfData } = await supabase
        .from("line_custom_fields")
        .select("id, field_key, field_label")
        .eq("account_id", accountId)
        .order("sort_order", { ascending: true });
      customFields = (cfData ?? []) as typeof customFields;
    }

    // カスタムフィールド値取得
    let customValues: Record<string, Record<string, string>> = {};
    if (customFields.length > 0) {
      const cfIds = customFields.map((cf) => cf.id);
      const { data: cvData } = await supabase
        .from("line_follower_custom_values")
        .select("follower_id, field_id, value")
        .in("follower_id", followerIds)
        .in("field_id", cfIds);

      const fieldIdToKey: Record<string, string> = {};
      for (const cf of customFields) fieldIdToKey[cf.id] = cf.field_key;

      for (const cv of cvData ?? []) {
        const fid = cv.follower_id as string;
        const key = fieldIdToKey[cv.field_id as string];
        if (!key) continue;
        if (!customValues[fid]) customValues[fid] = {};
        customValues[fid][key] = (cv.value as string) ?? "";
      }
    }

    // 流入経路取得
    const inflowIds = [...new Set(followerList.map((f) => f.inflow_route_id as string | null).filter(Boolean))] as string[];
    let inflowNameMap: Record<string, string> = {};
    if (inflowIds.length > 0) {
      const { data: inflowData } = await supabase
        .from("line_inflow_routes")
        .select("id, name, code")
        .in("id", inflowIds);
      inflowNameMap = (inflowData ?? []).reduce<Record<string, string>>((acc, r) => {
        acc[r.id as string] = `${r.name ?? ""}(${r.code ?? ""})`;
        return acc;
      }, {});
    }

    // CSV構築
    const baseHeaders = ["表示名", "LINE User ID", "ステータス", "友だち追加日時", "ラベル", "流入経路"];
    const cfHeaders = customFields.map((cf) => cf.field_label);
    const headers = [...baseHeaders, ...cfHeaders];

    const rows = followerList.map((f) => {
      const fid = f.id as string;
      const labelStr = (followerLabels[fid] ?? []).join(" / ");
      const inflowStr = f.inflow_route_id ? (inflowNameMap[f.inflow_route_id as string] ?? "") : "";
      const cfValues = customFields.map((cf) => (customValues[fid] ?? {})[cf.field_key] ?? "");

      // display_name = オリジナルの名前（スタッフ変更前）
      return [
        f.display_name ?? "",
        f.line_user_id,
        f.status,
        f.followed_at,
        labelStr,
        inflowStr,
        ...cfValues,
      ];
    });

    const csv = [headers, ...rows]
      .map((r) => r.map((c: string) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const bom = "\uFEFF";

    return new Response(bom + csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="line_followers_${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  }

  if (type === "messages") {
    const userId = request.nextUrl.searchParams.get("user_id");
    let query = supabase
      .from("line_messages")
      .select("*")
      .order("sent_at", { ascending: false });

    if (userId) {
      query = query.eq("line_user_id", userId);
    }
    if (accountId) {
      query = query.eq("line_account_id", accountId);
    }

    const { data, error } = await query;

    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    const headers = ["ID", "LINE User ID", "方向", "種別", "テキスト", "送信日時"];
    const rows = (data ?? []).map((r) => [
      r.id,
      r.line_user_id,
      r.direction === "incoming" ? "受信" : "送信",
      r.message_type,
      r.message_text ?? "",
      r.sent_at,
    ]);

    const csv = [headers, ...rows].map((r) => r.map((c: string) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const bom = "\uFEFF";

    return new Response(bom + csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="line_messages_${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  }

  return Response.json({ error: "Invalid type" }, { status: 400 });
}

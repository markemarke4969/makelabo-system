import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";
import { resolveAccountIdsFromScenario } from "@/lib/scenario-resolve";

export const maxDuration = 300;

// レポート一覧取得
// 段階7-C2: GET SELECT 句に scenario_id 追加(8 keys 化、後方互換維持)
//   - クライアント側で scenario_id によるフィルタ可能
//   - GET 自体は project_id 全件返す(判断 C2-1、API シグネチャ不変、フィルタは dashboard 側)
export async function GET(request: NextRequest) {
  const projectId = request.nextUrl.searchParams.get("project_id");
  if (!projectId) return Response.json({ error: "project_id required" }, { status: 400 });

  const { data, error } = await supabase
    .from("line_monthly_reports")
    .select("id, project_id, scenario_id, report_month, report_data, status, sent_at, created_at")
    .eq("project_id", projectId)
    .order("report_month", { ascending: false })
    .limit(24);

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data ?? []);
}

// レポート生成
// 段階7-C2: scenario_id 受付追加(任意、判断 4)
//   - scenario_id あり:scenario 配下の account_ids(roles=main+distribute)で集計
//   - scenario_id なし:project 全 account で集計(後方互換)
//   - 保存先 row は (project_id, scenario_id, report_month) で一意化(部分 UNIQUE 2 整合)
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { project_id, month, scenario_id } = body;
  const scenarioId: string | null = (typeof scenario_id === "string" && scenario_id.length > 0) ? scenario_id : null;

  if (!project_id) return Response.json({ error: "project_id required" }, { status: 400 });

  // 対象月の計算（指定なしなら先月）
  const now = new Date();
  const targetMonth = month ?? `${now.getFullYear()}-${String(now.getMonth() === 0 ? 12 : now.getMonth()).padStart(2, "0")}`;
  const [year, mon] = targetMonth.split("-").map(Number);
  const monthStart = new Date(year, mon - 1, 1).toISOString();
  const monthEnd = new Date(year, mon, 1).toISOString();

  // 案件に紐づくアカウントを取得
  // 段階7-C2: scenario_id 指定時は scenario 配下 account(main+distribute)に絞る
  //   - resolveAccountIdsFromScenario(scenarioId, { roles: ["main", "distribute"] }) を使用(7-C1 と同パターン)
  //   - 集計フェーズ(line_messages / line_followers / line_follower_labels)は account_ids IN 句なので連動して絞られる
  let accountIds: string[];
  if (scenarioId) {
    const resolved = await resolveAccountIdsFromScenario(scenarioId, {
      roles: ["main", "distribute"],
    });
    accountIds = resolved.account_ids;
  } else {
    const { data: accounts } = await supabase
      .from("line_accounts")
      .select("id, account_name")
      .eq("project_id", project_id);
    accountIds = (accounts ?? []).map((a) => a.id as string);
  }

  if (accountIds.length === 0) {
    return Response.json({ error: "no accounts" }, { status: 400 });
  }

  // 1. 配信数集計
  let stepCount = 0;
  let scheduleCount = 0;
  {
    const { data: msgs } = await supabase
      .from("line_messages")
      .select("id, line_account_id")
      .eq("direction", "outgoing")
      .in("line_account_id", accountIds)
      .gte("sent_at", monthStart)
      .lt("sent_at", monthEnd);
    stepCount = (msgs ?? []).length;
  }

  // 2. 友達追加数（流入経路別）
  const { data: newFollowers } = await supabase
    .from("line_followers")
    .select("id, inflow_route_id, line_account_id, followed_at")
    .in("line_account_id", accountIds)
    .gte("followed_at", monthStart)
    .lt("followed_at", monthEnd);

  const inflowCounts: Record<string, number> = {};
  for (const f of newFollowers ?? []) {
    const key = (f.inflow_route_id as string) ?? "direct";
    inflowCounts[key] = (inflowCounts[key] || 0) + 1;
  }

  // 流入経路名を取得
  const inflowIds = Object.keys(inflowCounts).filter((k) => k !== "direct");
  let inflowNames: Record<string, string> = {};
  if (inflowIds.length > 0) {
    const { data: routes } = await supabase
      .from("line_inflow_routes")
      .select("id, name")
      .in("id", inflowIds);
    for (const r of routes ?? []) inflowNames[r.id as string] = r.name as string;
  }

  const inflowRanking = Object.entries(inflowCounts)
    .map(([id, count]) => ({ name: id === "direct" ? "直接追加" : (inflowNames[id] ?? id.slice(0, 8)), count }))
    .sort((a, b) => b.count - a.count);

  // 日別 × 流入経路別の集計（YYYY-MM-DD ごと）
  const dailyMap: Record<string, Record<string, number>> = {};
  for (const f of newFollowers ?? []) {
    const followedAt = f.followed_at as string | null | undefined;
    if (!followedAt) continue;
    const date = new Date(followedAt);
    if (Number.isNaN(date.getTime())) continue;
    // ローカルタイムではなくUTCの日付として扱う（集計の一貫性のため）
    const dateKey = followedAt.slice(0, 10);
    const routeId = (f.inflow_route_id as string) ?? "direct";
    const routeName = routeId === "direct" ? "直接追加" : (inflowNames[routeId] ?? routeId.slice(0, 8));
    if (!dailyMap[dateKey]) dailyMap[dateKey] = {};
    dailyMap[dateKey][routeName] = (dailyMap[dateKey][routeName] ?? 0) + 1;
  }
  const dailyInflow = Object.entries(dailyMap)
    .map(([date, routes]) => {
      const routeList = Object.entries(routes)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count);
      const total = routeList.reduce((s, r) => s + r.count, 0);
      return { date, total, routes: routeList };
    })
    .sort((a, b) => (a.date < b.date ? 1 : -1));

  // 3. クローザーごとの担当件数・成約数・失注数
  const { data: allFollowers } = await supabase
    .from("line_followers")
    .select("id, closer_id, line_user_id, line_account_id")
    .in("line_account_id", accountIds);

  // ラベルを取得して商談ステータスを確認
  const followerIds = (allFollowers ?? []).map((f) => f.id as string);
  let followerLabelsMap: Record<string, string[]> = {};
  if (followerIds.length > 0) {
    const { data: flLabels } = await supabase
      .from("line_follower_labels")
      .select("follower_id, label_id")
      .in("follower_id", followerIds);
    for (const fl of flLabels ?? []) {
      const fid = fl.follower_id as string;
      if (!followerLabelsMap[fid]) followerLabelsMap[fid] = [];
      followerLabelsMap[fid].push(fl.label_id as string);
    }
  }

  // ラベル名を取得
  const allLabelIds = [...new Set(Object.values(followerLabelsMap).flat())];
  let labelNames: Record<string, string> = {};
  if (allLabelIds.length > 0) {
    const { data: labels } = await supabase
      .from("line_labels")
      .select("id, name")
      .in("id", allLabelIds);
    for (const l of labels ?? []) labelNames[l.id as string] = l.name as string;
  }

  // クローザー集計
  const closerStats: Record<string, { total: number; seiyaku: number; shicchu: number }> = {};
  for (const f of allFollowers ?? []) {
    const cid = (f.closer_id as string) ?? "unassigned";
    if (!closerStats[cid]) closerStats[cid] = { total: 0, seiyaku: 0, shicchu: 0 };
    closerStats[cid].total++;
    const fLabels = (followerLabelsMap[f.id as string] ?? []).map((lid) => labelNames[lid] ?? "");
    if (fLabels.some((n) => n === "商談:成約")) closerStats[cid].seiyaku++;
    if (fLabels.some((n) => n === "商談:失注")) closerStats[cid].shicchu++;
  }

  // 4. ラベル別フォロワー数
  const labelFollowerCounts: Record<string, number> = {};
  for (const fLabels of Object.values(followerLabelsMap)) {
    for (const lid of fLabels) {
      labelFollowerCounts[lid] = (labelFollowerCounts[lid] || 0) + 1;
    }
  }
  const labelStats = Object.entries(labelFollowerCounts)
    .map(([lid, count]) => ({ name: labelNames[lid] ?? lid.slice(0, 8), count }))
    .sort((a, b) => b.count - a.count);

  const reportData = {
    month: targetMonth,
    delivery: { step: stepCount, schedule: scheduleCount, total: stepCount + scheduleCount },
    new_followers: { total: (newFollowers ?? []).length, by_inflow: inflowRanking, daily: dailyInflow },
    closer_stats: closerStats,
    label_stats: labelStats,
  };

  // CSV生成
  const csvLines: string[] = [];
  csvLines.push(`月次レポート: ${targetMonth}`);
  csvLines.push("");
  csvLines.push("=== 配信数 ===");
  csvLines.push(`配信総数,${reportData.delivery.total}`);
  csvLines.push("");
  csvLines.push("=== 友達追加数 ===");
  csvLines.push(`合計,${reportData.new_followers.total}`);
  csvLines.push("流入経路,件数");
  for (const r of inflowRanking) csvLines.push(`${r.name},${r.count}`);
  csvLines.push("");
  csvLines.push("=== 日別 × 流入経路 ===");
  csvLines.push("日付,合計,内訳");
  for (const d of dailyInflow) {
    const breakdown = d.routes.map((r) => `${r.name}(${r.count})`).join(" / ");
    csvLines.push(`${d.date},${d.total},"${breakdown}"`);
  }
  csvLines.push("");
  csvLines.push("=== クローザー別 ===");
  csvLines.push("クローザーID,担当数,成約数,失注数");
  for (const [cid, s] of Object.entries(closerStats)) csvLines.push(`${cid},${s.total},${s.seiyaku},${s.shicchu}`);
  csvLines.push("");
  csvLines.push("=== ラベル別フォロワー数 ===");
  csvLines.push("ラベル名,人数");
  for (const l of labelStats) csvLines.push(`${l.name},${l.count}`);

  const csvContent = csvLines.join("\n");

  // 段階7-Zh hotfix + 7-C2: 部分 UNIQUE INDEX 互換性確保(scenario_id NULL / NOT NULL 両対応)
  // 段階7-Z で旧 UNIQUE (project_id, report_month) が部分 UNIQUE 2 本立てに置換されたため、
  // supabase-js の onConflict では部分 UNIQUE INDEX を推論できない(PostgREST の既知制約)。
  // 暫定対処として SELECT → UPDATE or INSERT パターン採用(7-Zh hotfix で確立)。
  // 段階7-C2 で scenario_id NULL / NOT NULL の両分岐に対応:
  //   - scenario_id NULL  → WHERE project_id + report_month + scenario_id IS NULL(部分 UNIQUE 1 整合)
  //   - scenario_id NOT NULL → WHERE project_id + scenario_id + report_month(部分 UNIQUE 2 整合)
  // race condition は月次 cron 月1回 + dashboard 手動押下で並列ほぼ発生せず受容。
  let existingQuery = supabase
    .from("line_monthly_reports")
    .select("id")
    .eq("project_id", project_id)
    .eq("report_month", targetMonth);
  if (scenarioId) {
    existingQuery = existingQuery.eq("scenario_id", scenarioId);
  } else {
    existingQuery = existingQuery.is("scenario_id", null);
  }
  const { data: existing, error: selectError } = await existingQuery.maybeSingle();

  if (selectError) {
    return Response.json({ error: selectError.message }, { status: 500 });
  }

  if (existing) {
    const { error: updateError } = await supabase
      .from("line_monthly_reports")
      .update({ report_data: reportData, csv_content: csvContent, status: "generated" })
      .eq("id", existing.id);
    if (updateError) {
      return Response.json({ error: updateError.message }, { status: 500 });
    }
  } else {
    const { error: insertError } = await supabase
      .from("line_monthly_reports")
      .insert({
        project_id,
        scenario_id: scenarioId,
        report_month: targetMonth,
        report_data: reportData,
        csv_content: csvContent,
        status: "generated",
      });
    if (insertError) {
      return Response.json({ error: insertError.message }, { status: 500 });
    }
  }

  return Response.json({ ok: true, report: reportData });
}

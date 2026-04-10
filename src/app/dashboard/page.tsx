import { supabase } from "@/lib/supabase";
import Link from "next/link";
import {
  DashboardShell, MonthSelector, TotalBar, TotalBar5, TotalItem,
  MiniKpiS, SmallKpi, RateKpi, ProgressBar, ColorKpiCard,
  ProjectCardWrap, AlertBadge,
  PROJECT_COLORS, DEPT_COLORS,
  fc, yen, pct,
} from "./components/ui";
import MarketingCalendar from "./components/MarketingCalendar";
import WebinarDetail from "./components/WebinarDetail";
import DeliveryDetail from "./components/DeliveryDetail";
import CsDetail from "./components/CsDetail";
// KillerWordPanel removed - now integrated into DeliveryDetail
import PendingCards from "./components/PendingCards";
import DepositCards from "./components/DepositCards";
import WbsTabNew from "./components/WbsTab";

export const dynamic = "force-dynamic";

// ============================================================
// Shared types & helpers
// ============================================================
type P = { id: string; name: string; holder_name: string; category: string };
type R = Record<string, unknown>;
function v(obj: R | null | undefined, key: string, def = 0): number {
  return (obj?.[key] as number) ?? def;
}
function s(obj: R | null | undefined, key: string, def = ""): string {
  return (obj?.[key] as string) ?? def;
}
function ymStr(y: number, m: number) {
  return `${y}-${String(m).padStart(2, "0")}`;
}

async function getProjects(): Promise<P[]> {
  const { data } = await supabase.from("projects").select("*").eq("status", "active").order("name");
  return (data as P[]) ?? [];
}

async function q(table: string, pid: string, ym: string) {
  const { data } = await supabase.from(table).select("*").eq("project_id", pid).eq("year_month", ym);
  return data ?? [];
}

// ============================================================
// Data fetchers
// ============================================================
async function fetchOverview(ps: P[], ym: string) {
  const out = [];
  for (const p of ps) {
    const [ad] = await q("monthly_ad_project_summary", p.id, ym);
    const sales = await q("monthly_sales_summary", p.id, ym);
    const expenses = await q("monthly_expenses", p.id, ym);
    const [pk] = await q("monthly_pokesaro_inflow", p.id, ym);
    const a = (ad ?? {}) as R;
    const fr = (sales.find((ss: R) => ss.product_type === "front") ?? {}) as R;
    const expTotal = (expenses as R[]).reduce((sum: number, r: R) => sum + v(r, "amount"), 0);
    const pokesaro = v((pk ?? {}) as R, "inflow_total");
    out.push({ p, a, fr, expTotal, pokesaro });
  }
  return out;
}

async function fetchAd(ps: P[], ym: string) {
  const out = [];
  for (const p of ps) {
    const [d] = await q("monthly_ad_project_summary", p.id, ym);
    out.push({ p, d: (d ?? {}) as R });
  }
  return out;
}

async function fetchSales(ps: P[], ym: string, projectName: string) {
  const pid = ps.find(p => p.name === projectName)?.id ?? ps[0]?.id;
  if (!pid) return { closer: [] as R[], fr: {} as R, up: {} as R, fa: {} as R, project: ps[0], feScenario: { count: 0, amount: 0 } };
  const closer = (await q("monthly_closer_performance", pid, ym)) as R[];
  const sales = await q("monthly_sales_summary", pid, ym);
  const fr = (sales.find((ss: R) => ss.product_type === "front") ?? {}) as R;
  const up = (sales.find((ss: R) => ss.product_type === "upsell") ?? {}) as R;
  const fa: R = {};
  // FEシナリオ純粋売上（配信から5日以内）
  const { data: feData } = await supabase
    .from("fe_scenario_conversions").select("amount")
    .eq("project_id", pid)
    .lte("days_from_delivery", 5);
  const feRows = (feData ?? []) as R[];
  const feCount = feRows.length;
  const feAmount = feRows.reduce((sum: number, r: R) => sum + v(r, "amount"), 0);
  return { closer, fr, up, fa, project: ps.find(p => p.name === projectName) ?? ps[0], feScenario: { count: feCount, amount: feAmount } };
}

async function fetchVideo(ps: P[], ym: string) {
  return fetchAd(ps, ym);
}

async function fetchInstagram(ps: P[], ym: string) {
  return fetchAd(ps, ym);
}

async function fetchCs(ps: P[], ym: string) {
  const out = [];
  for (const p of ps) {
    const [d] = await q("monthly_cs_detail", p.id, ym);
    out.push({ p, d: (d ?? {}) as R });
  }
  return out;
}

async function fetchLegal(ps: P[], ym: string) {
  const cards = [];
  const allCases: R[] = [];
  for (const p of ps) {
    const [summary] = await q("monthly_legal_summary", p.id, ym);
    const { data: cases } = await supabase
      .from("refund_cases").select("*").eq("project_id", p.id)
      .order("created_at", { ascending: false }).limit(5);
    cards.push({ p, d: (summary ?? {}) as R });
    if (cases) allCases.push(...(cases as R[]));
  }
  return { cards, cases: allCases.slice(0, 10) };
}

async function fetchExpense(ps: P[], ym: string) {
  const out = [];
  for (const p of ps) {
    const { data } = await supabase.from("monthly_expenses").select("*").eq("project_id", p.id).eq("year_month", ym);
    const rows = (data ?? []) as R[];
    const total = rows.reduce((sum: number, r: R) => sum + v(r, "amount"), 0);
    const byDept: Record<string, number> = {};
    for (const r of rows) {
      const dept = (r.department as string) ?? "その他";
      byDept[dept] = (byDept[dept] ?? 0) + v(r, "amount");
    }
    const sales = await q("monthly_sales_summary", p.id, ym);
    const rev = v((sales.find((ss: R) => ss.product_type === "front") ?? {}) as R, "total_revenue");
    out.push({ p, total, byDept, count: rows.length, rate: rev > 0 ? (total / rev) * 100 : 0, rows });
  }
  return out;
}

async function fetchMarketing(ps: P[]) {
  const schedules = [];
  for (const p of ps) {
    const { data } = await supabase
      .from("delivery_schedule").select("*").eq("project_id", p.id)
      .order("date", { ascending: false }).limit(20);
    schedules.push({ p, rows: (data ?? []) as R[] });
  }
  return schedules;
}

async function fetchWebinar(ps: P[]) {
  const out = [];
  for (const p of ps) {
    const { data } = await supabase.from("webinars").select("*").eq("project_id", p.id).order("date", { ascending: false }).limit(20);
    out.push({ p, items: (data ?? []) as R[] });
  }
  return out;
}

async function fetchDelivery(ps: P[]) {
  const out = [];
  for (const p of ps) {
    const { data } = await supabase.from("delivery_contents").select("*").eq("project_id", p.id).order("date", { ascending: false }).limit(30);
    const { data: kw } = await supabase.from("killer_words").select("*").eq("project_id", p.id).order("effectiveness_score", { ascending: false }).limit(20);
    out.push({ p, items: (data ?? []) as R[], killerWords: (kw ?? []) as R[] });
  }
  const allItems = out.flatMap(o => o.items);
  return { perProject: out, allItems };
}

async function fetchCsDetail(ps: P[]) {
  const out = [];
  for (const p of ps) {
    const { data: logs } = await supabase.from("cs_response_logs").select("*").eq("project_id", p.id).order("created_at", { ascending: false }).limit(50);
    const { data: templates } = await supabase.from("cs_templates").select("*").eq("project_id", p.id).order("usage_count", { ascending: false });
    const { data: thresholds } = await supabase.from("cs_thresholds").select("*").eq("project_id", p.id);
    out.push({ p, logs: (logs ?? []) as R[], templates: (templates ?? []) as R[], thresholds: (thresholds ?? []) as R[] });
  }
  return out;
}

async function fetchPendingFollowups(pid: string) {
  const { data } = await supabase.from("pending_followups").select("*, appointments(customer_name, interview_date)")
    .eq("project_id", pid).order("created_at", { ascending: false }).limit(30);
  const now = new Date();
  return (data ?? []).map((r: R) => {
    const nextDate = s(r, "next_action_date");
    const contactDate = s(r, "contact_date");
    const daysElapsed = contactDate ? Math.max(0, Math.floor((now.getTime() - new Date(contactDate).getTime()) / 86400000)) : 0;
    const isOverdue = nextDate ? new Date(nextDate) < now : false;
    const appt = (r.appointments ?? {}) as R;
    return {
      id: s(r, "id"), customer_name: s(appt, "customer_name") || "-",
      closer_name: "-", interview_date: s(appt, "interview_date"),
      next_action_date: nextDate, contact_date: contactDate,
      contact_method: s(r, "contact_method"), result: s(r, "result"),
      memo: s(r, "memo"), days_elapsed: daysElapsed, is_overdue: isOverdue,
    };
  });
}

async function fetchDepositTracking(pid: string) {
  const { data } = await supabase.from("deposit_tracking").select("*")
    .eq("project_id", pid).order("created_at", { ascending: false }).limit(30);
  const now = new Date();
  return (data ?? []).map((r: R) => {
    const nextPay = s(r, "next_payment_date");
    const isOverdue = nextPay ? new Date(nextPay) < now && s(r, "status") !== "completed" : false;
    const unpaidDays = nextPay && isOverdue ? Math.floor((now.getTime() - new Date(nextPay).getTime()) / 86400000) : 0;
    return {
      id: s(r, "id"), customer_name: s(r, "customer_name") || "-",
      closer_name: "-", deal_amount: v(r, "deal_amount"),
      deal_date: s(r, "deal_date"), next_payment_date: nextPay,
      unpaid_days: unpaidDays, last_deposit_date: s(r, "last_deposit_date"),
      status: s(r, "status"), deposited_amount: v(r, "deposited_amount"),
      remaining_amount: v(r, "remaining_amount"), is_overdue: isOverdue,
    };
  });
}

async function fetchKillerWords(ps: P[]) {
  const { data } = await supabase.from("killer_words").select("*, projects(name)").order("effectiveness_score", { ascending: false }).limit(50);
  return (data ?? []).map((r: R) => ({ ...r, project_name: (r.projects as R)?.name as string ?? "" })) as R[];
}

async function fetchWbs(ps: P[], projectName: string) {
  if (!projectName) {
    // Top page: fetch all tasks for all projects
    const allTasks: R[] = [];
    for (const p of ps) {
      const { data } = await supabase
        .from("project_tasks").select("*").eq("project_id", p.id)
        .order("due_date", { ascending: true });
      if (data) allTasks.push(...(data as R[]).map(r => ({ ...r, _project_name: p.name })));
    }
    allTasks.sort((a, b) => {
      const da = (a.due_date as string) ?? "9999-12-31";
      const db = (b.due_date as string) ?? "9999-12-31";
      return da.localeCompare(db);
    });
    return allTasks;
  }
  const pid = ps.find(p => p.name === projectName)?.id ?? ps[0]?.id;
  if (!pid) return [];
  const { data } = await supabase
    .from("project_tasks").select("*").eq("project_id", pid)
    .order("due_date", { ascending: true });
  return (data ?? []) as R[];
}

async function fetchJv(ps: P[], projectName: string) {
  const pid = ps.find(p => p.name === projectName)?.id ?? ps[0]?.id;
  if (!pid) return [];
  const { data } = await supabase
    .from("jv_projects").select("*").eq("project_id", pid)
    .order("due_date", { ascending: false });
  return (data ?? []) as R[];
}

// ============================================================
// TAB 1: 全体 (default)
// ============================================================
function OverviewTab({ data, m }: { data: Awaited<ReturnType<typeof fetchOverview>>; m: number }) {
  const tRevenue = data.reduce((sum, d) => sum + v(d.a, "all_revenue"), 0);
  const tDeposit = data.reduce((sum, d) => sum + v(d.a, "deposit_amount"), 0);
  const tAdSpend = data.reduce((sum, d) => sum + v(d.a, "ad_spend"), 0);
  const tFrontRoas = tAdSpend > 0 ? (data.reduce((sum, d) => sum + v(d.a, "front_revenue"), 0) / tAdSpend) * 100 : 0;
  const tSeiyaku = data.reduce((sum, d) => sum + v(d.a, "close_count"), 0);
  const tHenkin = data.reduce((sum, d) => sum + v(d.fr, "cooling_off_count"), 0);
  const henkinRate = tSeiyaku > 0 ? Math.round(tHenkin / tSeiyaku * 100 * 10) / 10 : 0;
  const tExpense = data.reduce((sum, d) => sum + d.expTotal, 0);
  const rieki = tDeposit - tExpense;
  const riekiRate = tDeposit > 0 ? Math.round(rieki / tDeposit * 100) : 0;

  return (
    <div className="space-y-6">
      {/* 全案件合計KPI */}
      <div className="relative rounded-2xl overflow-hidden border border-[#4f8ff7]/30 bg-gradient-to-br from-[#1a1f3a] to-[#0f1117] p-5">
        <h3 className="text-xs font-bold text-[#4f8ff7] uppercase tracking-widest mb-4">全案件合計 — {m}月</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center">
            <p className="text-xs text-[#6b7194] mb-1">売上合計</p>
            <p className="text-2xl font-bold text-[#4f8ff7]">{yen(tRevenue)}</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-[#6b7194] mb-1">着金合計</p>
            <p className="text-2xl font-bold text-[#34d399]">{yen(tDeposit)}</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-[#6b7194] mb-1">フロントROAS</p>
            <p className="text-2xl font-bold text-[#fbbf24]">{tFrontRoas > 0 ? pct(tFrontRoas) : "-"}</p>
            <p className="text-xs text-[#6b7194]">全案件合計</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-[#6b7194] mb-1">返金率</p>
            <p className={`text-2xl font-bold ${henkinRate > 3 ? "text-red-400" : "text-emerald-400"}`}>
              {henkinRate}%
            </p>
            <p className="text-xs text-[#6b7194]">返金 {tHenkin}件</p>
          </div>
        </div>

        {/* 追加KPI行 */}
        <div className="grid grid-cols-3 gap-4 mt-4 pt-4 border-t border-[#2a2f45]">
          <div className="text-center">
            <p className="text-xs text-[#6b7194] mb-1">利益率</p>
            <p className={`text-xl font-bold ${riekiRate >= 70 ? "text-emerald-400" : riekiRate >= 50 ? "text-yellow-400" : "text-red-400"}`}>
              {riekiRate}%
            </p>
          </div>
          <div className="text-center">
            <p className="text-xs text-[#6b7194] mb-1">成約数合計</p>
            <p className="text-xl font-bold text-white">{tSeiyaku}件</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-[#6b7194] mb-1">経費合計</p>
            <p className="text-xl font-bold text-white">{yen(tExpense)}</p>
          </div>
        </div>
      </div>

      {/* 案件別カード */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {data.map(({ p, a, fr, expTotal, pokesaro }) => {
          const appt = v(a, "appointment_count");
          const interv = v(a, "interview_count");
          const interviewRate = appt > 0 ? (interv / appt) * 100 : 0;
          const closeCount = v(a, "close_count");
          const closeRate = interv > 0 ? (closeCount / interv) * 100 : 0;
          const deposit = v(a, "deposit_amount");
          const pRiekiRate = deposit > 0 ? Math.round((deposit - expTotal) / deposit * 100) : 0;

          return (
            <ProjectCardWrap key={p.id} name={p.name}>
              {/* 成約金額, 着金額 */}
              <div className="grid grid-cols-2 gap-2 mb-3">
                <MiniKpiS label="成約金額" value={yen(v(a, "all_revenue"))}
                  borderColor="#3b82f6aa" textColor="#93c5fd" bgFrom="#3b82f633" />
                <MiniKpiS label="着金額" value={yen(deposit)}
                  borderColor="#10b981aa" textColor="#6ee7b7" bgFrom="#10b98133" />
              </div>

              {/* オプト数, アポ数, 実施数 */}
              <div className="grid grid-cols-3 gap-2 mb-3">
                <SmallKpi label="オプト数" value={fc(v(a, "opt_in_count"))} />
                <SmallKpi label="アポ数" value={fc(appt)} />
                <SmallKpi label="実施数" value={fc(interv)} />
              </div>

              {/* 面談実施率 */}
              <ProgressBar label="面談実施率" value={pct(interviewRate)} rate={interviewRate} />

              {/* 成約数, 成約率 */}
              <div className="grid grid-cols-2 gap-2 mt-3 mb-3">
                <SmallKpi label="成約数" value={`${closeCount}件`} />
                <SmallKpi label="成約率" value={pct(closeRate)} />
              </div>

              {/* 保留, 返金, ブラック件数 */}
              <div className="grid grid-cols-3 gap-2 mb-3">
                <SmallKpi label="保留" value={fc(v(fr, "pending_count"))} />
                <SmallKpi label="返金" value={fc(v(fr, "cooling_off_count"))} />
                <SmallKpi label="ブラック" value={fc(v(fr, "black_count"))} />
              </div>

              {/* 利益率, 経費, ポケサロ */}
              <div className="grid grid-cols-3 gap-2 pt-3 border-t border-[#2a2f45]/50">
                <div className="bg-[#1e2235]/80 rounded-xl p-2.5 border border-[#2a2f45]/50 text-center">
                  <p className="text-xs text-[#9aa0b8] mb-1 font-medium">利益率</p>
                  <p className={`text-base font-bold ${pRiekiRate >= 70 ? "text-emerald-400" : pRiekiRate >= 50 ? "text-yellow-400" : "text-red-400"}`}>
                    {pRiekiRate}%
                  </p>
                </div>
                <SmallKpi label="経費" value={yen(expTotal)} />
                <SmallKpi label="ポケサロ" value={`${pokesaro}件`} />
              </div>
            </ProjectCardWrap>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================
// TAB 2: 営業
// ============================================================
function SalesTab({
  data, projects, activeProject, m, subTab, y,
  pendingItems, depositItems,
}: {
  data: Awaited<ReturnType<typeof fetchSales>>;
  projects: P[];
  activeProject: string;
  m: number;
  subTab: string;
  y: number;
  pendingItems: Awaited<ReturnType<typeof fetchPendingFollowups>>;
  depositItems: Awaited<ReturnType<typeof fetchDepositTracking>>;
}) {
  const { closer, fr, up } = data;

  const tCloseAmount = closer.reduce((sum: number, r: R) => sum + v(r, "close_amount"), 0);
  const tDepositAmount = closer.reduce((sum: number, r: R) => sum + v(r, "deposit_amount"), 0);
  const tUnpaid = closer.reduce((sum: number, r: R) => sum + v(r, "unpaid_amount"), 0);
  const tCloseCount = closer.reduce((sum: number, r: R) => sum + v(r, "close_count"), 0);

  const frRevenue = v(fr, "total_revenue");
  const upRevenue = v(up, "total_revenue");
  const frDeposit = v(fr, "total_deposit");
  const upDeposit = v(up, "total_deposit");
  const frUnit = v(fr, "avg_unit_price");
  const upUnit = v(up, "avg_unit_price");
  const totalUnit = tCloseCount > 0 ? (frRevenue + upRevenue) / tCloseCount : 0;
  const pendingCount = v(fr, "pending_count") + v(up, "pending_count");

  return (
    <div className="space-y-5">
      {/* Project selector */}
      <div className="flex gap-2 flex-wrap">
        {projects.map((p) => {
          const color = PROJECT_COLORS[p.name] ?? "#4f8ff7";
          const isActive = p.name === activeProject;
          return (
            <Link
              key={p.id}
              href={`/dashboard?tab=sales&project=${encodeURIComponent(p.name)}&y=${y}&m=${m}`}
              className="px-4 py-2 rounded-xl text-sm font-medium transition-colors border-2"
              style={{
                borderColor: isActive ? color : "#2a2f45",
                background: isActive ? color + "22" : "transparent",
                color: isActive ? color : "#6b7194",
              }}
            >
              {p.name}
            </Link>
          );
        })}
      </div>

      {/* Year annual totals */}
      <TotalBar title={`${activeProject} 営業サマリー`} month={m}>
        <TotalItem label="成約金額合計" value={yen(tCloseAmount)} color="text-white" />
        <TotalItem label="着金額合計" value={yen(tDepositAmount)} color="text-emerald-400" />
        <TotalItem label="未着金合計" value={yen(tUnpaid)} color="text-red-400" />
        <TotalItem label="成約数合計" value={fc(tCloseCount)} color="text-purple-400" />
      </TotalBar>

      {/* Color KPI cards 4x3 */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <ColorKpiCard title="フロント売上" value={yen(frRevenue)} from="from-orange-500/10" border="border-orange-500/20" text="text-orange-400" />
        <ColorKpiCard title="アップ売上" value={yen(upRevenue)} from="from-yellow-500/10" border="border-yellow-500/20" text="text-yellow-400" />
        <ColorKpiCard title="F+A売上" value={yen(frRevenue + upRevenue)} subtitle={`成約 ${fc(tCloseCount)}件`} from="from-purple-500/10" border="border-purple-500/20" text="text-purple-400" />
        <ColorKpiCard title="成約数" value={fc(tCloseCount)} from="from-emerald-500/10" border="border-emerald-500/20" text="text-emerald-400" />
        <ColorKpiCard title="フロント着金" value={yen(frDeposit)} from="from-blue-500/10" border="border-blue-500/20" text="text-blue-400" />
        <ColorKpiCard title="アップ着金" value={yen(upDeposit)} from="from-cyan-500/10" border="border-cyan-500/20" text="text-cyan-400" />
        <ColorKpiCard title="F+A着金" value={yen(frDeposit + upDeposit)} from="from-purple-500/10" border="border-purple-500/20" text="text-purple-400" />
        <ColorKpiCard title="デポ件数" value={`${fc(v(fr, "deposit_count") + v(up, "deposit_count"))}件`} from="from-amber-500/10" border="border-amber-500/20" text="text-amber-400" />
        <ColorKpiCard title="保留件数" value={fc(pendingCount)} from="from-red-500/10" border="border-red-500/20" text="text-red-400" />
        <ColorKpiCard title="フロント単価" value={yen(frUnit)} from="from-orange-500/10" border="border-orange-500/20" text="text-orange-400" />
        <ColorKpiCard title="アップ単価" value={yen(upUnit)} from="from-yellow-500/10" border="border-yellow-500/20" text="text-yellow-400" />
        <ColorKpiCard title="全体単価" value={yen(totalUnit)} from="from-purple-500/10" border="border-purple-500/20" text="text-purple-400" />
      </div>

      {/* 面談商品販売件数 */}
      <div className="bg-[#1e2235] rounded-2xl border border-[#2a2f45] p-5">
        <h3 className="text-sm font-medium text-[#9aa0b8] mb-4">面談商品 販売件数</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* フロントのみ */}
          <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4">
            <p className="text-xs font-semibold text-blue-400 mb-3">フロントのみ（商品別）</p>
            <div className="space-y-2">
              {[{ label: "松", count: 0 }, { label: "竹", count: 0 }, { label: "梅", count: 0 }].map(item => (
                <div key={item.label} className="flex items-center justify-between">
                  <span className="text-xs text-[#9aa0b8]">{item.label}</span>
                  <span className="text-sm font-bold text-white">{item.count}件</span>
                </div>
              ))}
              <div className="pt-2 border-t border-blue-500/20 flex justify-between">
                <span className="text-xs text-[#6b7194]">合計</span>
                <span className="text-sm font-bold text-blue-400">0件</span>
              </div>
            </div>
          </div>

          {/* アップのみ */}
          <div className="bg-purple-500/10 border border-purple-500/20 rounded-xl p-4">
            <p className="text-xs font-semibold text-purple-400 mb-3">アップのみ（商品別）</p>
            <div className="space-y-2">
              {[{ label: "商品A", count: 0 }, { label: "商品B", count: 0 }, { label: "商品C", count: 0 }].map(item => (
                <div key={item.label} className="flex items-center justify-between">
                  <span className="text-xs text-[#9aa0b8]">{item.label}</span>
                  <span className="text-sm font-bold text-white">{item.count}件</span>
                </div>
              ))}
              <div className="pt-2 border-t border-purple-500/20 flex justify-between">
                <span className="text-xs text-[#6b7194]">合計</span>
                <span className="text-sm font-bold text-purple-400">0件</span>
              </div>
            </div>
          </div>

          {/* フロントアップセット */}
          <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-4">
            <p className="text-xs font-semibold text-green-400 mb-3">F+Aセット（組み合わせ別）</p>
            <div className="space-y-2">
              {[{ label: "松竹", count: 0 }, { label: "竹竹", count: 0 }, { label: "梅竹", count: 0 }, { label: "松梅", count: 0 }, { label: "梅梅", count: 0 }].map(item => (
                <div key={item.label} className="flex items-center justify-between">
                  <span className="text-xs text-[#9aa0b8]">{item.label}</span>
                  <span className="text-sm font-bold text-white">{item.count}件</span>
                </div>
              ))}
              <div className="pt-2 border-t border-green-500/20 flex justify-between">
                <span className="text-xs text-[#6b7194]">合計</span>
                <span className="text-sm font-bold text-green-400">0件</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 保留追跡・着金追跡ボタン */}
      <div className="flex gap-2">
        {[
          { label: "保留追跡", key: "pending" },
          { label: "着金追跡", key: "deposit" },
        ].map((t) => (
          <Link key={t.key}
            href={`/dashboard?tab=sales&project=${encodeURIComponent(activeProject)}&y=${y}&m=${m}&sub=${t.key}`}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
              subTab === t.key ? "bg-[#4f8ff7] text-white" : "bg-[#1e2235] border border-[#2a2f45] text-[#9aa0b8] hover:border-[#4f8ff7]"
            }`}>{t.label}</Link>
        ))}
      </div>

      {/* 保留追跡 */}
      {subTab === "pending" && (
        <div>
          <h3 className="text-sm font-bold text-white mb-3">保留追跡</h3>
          <PendingCards items={pendingItems} />
        </div>
      )}

      {/* 着金追跡 */}
      {subTab === "deposit" && (
        <div>
          <h3 className="text-sm font-bold text-white mb-3">着金追跡</h3>
          <DepositCards items={depositItems} />
        </div>
      )}

      {/* クローザー実績（常時表示） */}
      <div>
        <h3 className="text-sm font-bold text-white mb-3">クローザー別実績</h3>
          <div className="space-y-4">
            {(closer.length === 0 ? [{ closer_name: "（サンプル）西垣", interview_count: 0, close_count: 0, close_amount: 0, deposit_amount: 0, front_interview_count: 0, front_close_count: 0, front_avg_unit_price: 0, front_close_amount: 0, front_pending_count: 0, front_cooling_off_count: 0, upsell_interview_count: 0, upsell_close_count: 0, upsell_avg_unit_price: 0, upsell_close_amount: 0, upsell_pending_count: 0, upsell_cooling_off_count: 0 }] as R[] : closer).map((r: R, i: number) => {
              const name = (r.closer_name as string) ?? "不明";
              const interviews = v(r, "interview_count");
              const closes = v(r, "close_count");
              const amount = v(r, "close_amount");
              const deposit = v(r, "deposit_amount");
              const frontInterviews = v(r, "front_interview_count");
              const frontCloses = v(r, "front_close_count");
              const frontRate = frontInterviews > 0 ? (frontCloses / frontInterviews) * 100 : 0;
              const frontUnitV = v(r, "front_avg_unit_price");
              const frontAmount = v(r, "front_close_amount");
              const frontPending = v(r, "front_pending_count");
              const frontRefund = v(r, "front_cooling_off_count");
              const upInterviews = v(r, "upsell_interview_count");
              const upCloses = v(r, "upsell_close_count");
              const upRate = upInterviews > 0 ? (upCloses / upInterviews) * 100 : 0;
              const upUnitPrice = v(r, "upsell_avg_unit_price");
              const upAmount = v(r, "upsell_close_amount");
              const upPending = v(r, "upsell_pending_count");
              const upRefund = v(r, "upsell_cooling_off_count");
              const faCloses = frontCloses + upCloses;
              const faAmount = frontAmount + upAmount;
              const faRate = (frontInterviews + upInterviews) > 0 ? (faCloses / (frontInterviews + upInterviews)) * 100 : 0;

              return (
                <div key={i} className="bg-[#1e2235] rounded-xl border border-[#2a2f45] p-4">
                  <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                    <h4 className="text-sm font-bold text-white">{name}</h4>
                    <div className="flex gap-3 text-xs text-[#9aa0b8] flex-wrap">
                      <span>面談 <strong className="text-white">{fc(interviews)}</strong></span>
                      <span>成約 <strong className="text-emerald-400">{fc(closes)}</strong></span>
                      <span>成約額 <strong className="text-yellow-400">{yen(amount)}</strong></span>
                      <span>着金 <strong className="text-blue-400">{yen(deposit)}</strong></span>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-3">
                      <p className="text-xs font-semibold text-blue-400 mb-2">フロント</p>
                      <div className="space-y-1.5 text-xs">
                        <div className="flex justify-between"><span className="text-[#9aa0b8]">実施数</span><span className="text-white font-medium">{fc(frontInterviews)}</span></div>
                        <div className="flex justify-between"><span className="text-[#9aa0b8]">成約</span><span className="text-white font-medium">{fc(frontCloses)}</span></div>
                        <div className="flex justify-between"><span className="text-[#9aa0b8]">成約率</span><span className="text-white font-medium">{pct(frontRate)}</span></div>
                        <div className="flex justify-between"><span className="text-[#9aa0b8]">単価</span><span className="text-white font-medium">{yen(frontUnitV)}</span></div>
                        <div className="flex justify-between"><span className="text-[#9aa0b8]">成約額</span><span className="text-yellow-400 font-medium">{yen(frontAmount)}</span></div>
                        <div className="flex justify-between"><span className="text-[#9aa0b8]">保留/返金</span><span className="text-white font-medium">{fc(frontPending)} / {fc(frontRefund)}</span></div>
                      </div>
                    </div>
                    <div className="bg-purple-500/10 border border-purple-500/20 rounded-xl p-3">
                      <p className="text-xs font-semibold text-purple-400 mb-2">アップ</p>
                      <div className="space-y-1.5 text-xs">
                        <div className="flex justify-between"><span className="text-[#9aa0b8]">実施数</span><span className="text-white font-medium">{fc(upInterviews)}</span></div>
                        <div className="flex justify-between"><span className="text-[#9aa0b8]">成約</span><span className="text-white font-medium">{fc(upCloses)}</span></div>
                        <div className="flex justify-between"><span className="text-[#9aa0b8]">成約率</span><span className="text-white font-medium">{pct(upRate)}</span></div>
                        <div className="flex justify-between"><span className="text-[#9aa0b8]">単価</span><span className="text-white font-medium">{yen(upUnitPrice)}</span></div>
                        <div className="flex justify-between"><span className="text-[#9aa0b8]">成約額</span><span className="text-yellow-400 font-medium">{yen(upAmount)}</span></div>
                        <div className="flex justify-between"><span className="text-[#9aa0b8]">保留/返金</span><span className="text-white font-medium">{fc(upPending)} / {fc(upRefund)}</span></div>
                      </div>
                    </div>
                    <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-3">
                      <p className="text-xs font-semibold text-green-400 mb-2">F+A</p>
                      <div className="space-y-1.5 text-xs">
                        <div className="flex justify-between"><span className="text-[#9aa0b8]">成約</span><span className="text-white font-medium">{fc(faCloses)}</span></div>
                        <div className="flex justify-between"><span className="text-[#9aa0b8]">成約率</span><span className="text-white font-medium">{pct(faRate)}</span></div>
                        <div className="flex justify-between"><span className="text-[#9aa0b8]">成約額</span><span className="text-yellow-400 font-medium">{yen(faAmount)}</span></div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
            {closer.length === 0 && <p className="text-[10px] text-[#6b7194] mt-2">*サンプルデータです</p>}
          </div>
      </div>
    </div>
  );
}

// ============================================================
// TAB 3: 広告
// ============================================================
function AdTab({ cards, m }: { cards: Awaited<ReturnType<typeof fetchAd>>; m: number }) {
  const tRoas = cards.length > 0
    ? cards.reduce((sum, c) => sum + v(c.d, "front_roas"), 0) / cards.length : 0;
  const tSpend = cards.reduce((sum, c) => sum + v(c.d, "ad_spend"), 0);
  const tAll = cards.reduce((sum, c) => sum + v(c.d, "all_revenue"), 0);
  const tOpt = cards.reduce((sum, c) => sum + v(c.d, "opt_in_count"), 0);
  const tAppt = cards.reduce((sum, c) => sum + v(c.d, "appointment_count"), 0);
  const optAppt = tOpt > 0 ? (tAppt / tOpt) * 100 : 0;

  return (
    <div className="space-y-5">
      <TotalBar5 title="広告サマリー" month={m}>
        <TotalItem label="フロントROAS" value={pct(tRoas)} color="text-emerald-400" />
        <TotalItem label="広告費合計" value={yen(tSpend)} color="text-red-400" />
        <TotalItem label="ALL売上合計" value={yen(tAll)} color="text-white" />
        <TotalItem label="オプト数" value={fc(tOpt)} color="text-purple-400" />
        <TotalItem label="オプト→アポ率" value={pct(optAppt)} color="text-yellow-400" />
      </TotalBar5>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {cards.map(({ p, d }) => {
          const optCount = v(d, "opt_in_count");
          const apptCount = v(d, "appointment_count");
          const interviewCount = v(d, "interview_count");
          const optApptRate = optCount > 0 ? (apptCount / optCount) * 100 : 0;
          const interviewRate = apptCount > 0 ? (interviewCount / apptCount) * 100 : 0;
          const allSales = v(d, "all_revenue");

          return (
            <ProjectCardWrap key={p.id} name={p.name}>
              {/* 2x2: ROAS + 広告費 */}
              <div className="grid grid-cols-2 gap-2 mb-3">
                <MiniKpiS label="フロントROAS" value={pct(v(d, "front_roas"))}
                  borderColor="#3b82f6aa" textColor="#93c5fd" bgFrom="#3b82f633" />
                <MiniKpiS label="広告費" value={yen(v(d, "ad_spend"))}
                  borderColor="#ef4444aa" textColor="#fca5a5" bgFrom="#ef444433" />
              </div>

              {/* 3x1: フロント売上 + アップ売上 + F+A売上 */}
              <div className="grid grid-cols-3 gap-2 mb-3">
                <MiniKpiS label="フロント売上" value={yen(v(d, "front_revenue"))}
                  borderColor="#f97316aa" textColor="#fdba74" bgFrom="#f9731633" />
                <MiniKpiS label="アップ売上" value={yen(v(d, "upsell_revenue"))}
                  borderColor="#eab308aa" textColor="#fde047" bgFrom="#eab30833" />
                <MiniKpiS label="F+A売上" value={yen(allSales)}
                  borderColor="#a855f7aa" textColor="#c4b5fd" bgFrom="#a855f733" />
              </div>

              {/* 3-col: オプト, アポ数, 実施数 */}
              <div className="grid grid-cols-3 gap-2 mb-3">
                <SmallKpi label="オプト" value={fc(optCount)} />
                <SmallKpi label="アポ数" value={fc(apptCount)} />
                <SmallKpi label="実施数" value={fc(interviewCount)} />
              </div>

              {/* 2-col: rates */}
              <div className="grid grid-cols-2 gap-2">
                <RateKpi label="オプト→アポ率" value={pct(optApptRate)} rate={optApptRate} />
                <RateKpi label="面談実施率" value={pct(interviewRate)} rate={interviewRate} />
              </div>
            </ProjectCardWrap>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================
// TAB 4: 動画
// ============================================================
function VideoTab({ cards, m }: { cards: Awaited<ReturnType<typeof fetchVideo>>; m: number }) {
  const tOpt = cards.reduce((sum, c) => sum + v(c.d, "opt_in_count"), 0);
  const tAppt = cards.reduce((sum, c) => sum + v(c.d, "appointment_count"), 0);
  const tFront = cards.reduce((sum, c) => sum + v(c.d, "front_close_count"), 0);
  const tUp = cards.reduce((sum, c) => sum + v(c.d, "upsell_close_count"), 0);

  return (
    <div className="space-y-5">
      <TotalBar title="動画 全案件合計" month={m}>
        <TotalItem label="オプト数" value={fc(tOpt)} color="text-white" />
        <TotalItem label="アポ数" value={fc(tAppt)} color="text-purple-400" />
        <TotalItem label="フロント成約合計" value={fc(tFront)} color="text-emerald-400" />
        <TotalItem label="アップ成約合計" value={fc(tUp)} color="text-yellow-400" />
      </TotalBar>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {cards.map(({ p, d }) => {
          const appt = v(d, "appointment_count");
          const interv = v(d, "interview_count");
          const interviewRate = appt > 0 ? (interv / appt) * 100 : 0;
          const closeRate = interv > 0 ? (v(d, "close_count") / interv) * 100 : 0;

          return (
            <ProjectCardWrap key={p.id} name={p.name}>
              {/* 2x2: オプト + アポ */}
              <div className="grid grid-cols-2 gap-2 mb-3">
                <MiniKpiS label="オプト数" value={fc(v(d, "opt_in_count"))}
                  borderColor="#3b82f6aa" textColor="#93c5fd" bgFrom="#3b82f633" />
                <MiniKpiS label="面談アポ数" value={fc(v(d, "appointment_count"))}
                  borderColor="#06b6d4aa" textColor="#67e8f9" bgFrom="#06b6d433" />
              </div>

              {/* 2x2: 実施 + 成約率 */}
              <div className="grid grid-cols-2 gap-2 mb-3">
                <MiniKpiS label="面談実施数" value={fc(v(d, "interview_count"))}
                  borderColor="#a855f7aa" textColor="#c4b5fd" bgFrom="#a855f733" />
                <MiniKpiS label="成約率" value={pct(closeRate)}
                  borderColor="#10b981aa" textColor="#6ee7b7" bgFrom="#10b98133" />
              </div>

              {/* 3x1: フロント成約 + アップ成約 + F+A売上 */}
              <div className="grid grid-cols-3 gap-2 mb-3">
                <MiniKpiS label="フロント成約" value={fc(v(d, "front_close_count"))}
                  sub={`着金: ${yen(v(d, "front_deposit_amount"))}`}
                  borderColor="#f97316aa" textColor="#fdba74" bgFrom="#f9731633" />
                <MiniKpiS label="アップ成約" value={fc(v(d, "upsell_close_count"))}
                  sub={`着金: ${yen(v(d, "upsell_deposit_amount"))}`}
                  borderColor="#eab308aa" textColor="#fde047" bgFrom="#eab30833" />
                <MiniKpiS label="F+A売上" value={yen(v(d, "all_revenue"))}
                  borderColor="#a855f7aa" textColor="#c4b5fd" bgFrom="#a855f733" />
              </div>

              {/* Progress bar */}
              <ProgressBar label="面談実施率" value={pct(interviewRate)} rate={interviewRate} />
            </ProjectCardWrap>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================
// TAB 5: インスタ
// ============================================================
function InstagramTab({ cards, m }: { cards: Awaited<ReturnType<typeof fetchInstagram>>; m: number }) {
  const tOpt = cards.reduce((sum, c) => sum + v(c.d, "opt_in_count"), 0);
  const tAppt = cards.reduce((sum, c) => sum + v(c.d, "appointment_count"), 0);
  const tFront = cards.reduce((sum, c) => sum + v(c.d, "front_close_count"), 0);
  const tUp = cards.reduce((sum, c) => sum + v(c.d, "upsell_close_count"), 0);

  return (
    <div className="space-y-5">
      <TotalBar title="Instagram 全案件合計" month={m}>
        <TotalItem label="オプト数" value={fc(tOpt)} color="text-white" />
        <TotalItem label="アポ数" value={fc(tAppt)} color="text-purple-400" />
        <TotalItem label="フロント成約合計" value={fc(tFront)} color="text-emerald-400" />
        <TotalItem label="アップ成約合計" value={fc(tUp)} color="text-yellow-400" />
      </TotalBar>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {cards.map(({ p, d }) => {
          const appt = v(d, "appointment_count");
          const interv = v(d, "interview_count");
          const interviewRate = appt > 0 ? (interv / appt) * 100 : 0;
          const closeRate = interv > 0 ? (v(d, "close_count") / interv) * 100 : 0;

          return (
            <ProjectCardWrap key={p.id} name={p.name}>
              <div className="grid grid-cols-2 gap-2 mb-3">
                <MiniKpiS label="オプト数" value={fc(v(d, "opt_in_count"))}
                  borderColor="#3b82f6aa" textColor="#93c5fd" bgFrom="#3b82f633" />
                <MiniKpiS label="面談アポ数" value={fc(v(d, "appointment_count"))}
                  borderColor="#06b6d4aa" textColor="#67e8f9" bgFrom="#06b6d433" />
              </div>

              <div className="grid grid-cols-2 gap-2 mb-3">
                <MiniKpiS label="面談実施数" value={fc(v(d, "interview_count"))}
                  borderColor="#a855f7aa" textColor="#c4b5fd" bgFrom="#a855f733" />
                <MiniKpiS label="成約率" value={pct(closeRate)}
                  borderColor="#10b981aa" textColor="#6ee7b7" bgFrom="#10b98133" />
              </div>

              <div className="grid grid-cols-3 gap-2 mb-3">
                <MiniKpiS label="フロント成約" value={fc(v(d, "front_close_count"))}
                  sub={`着金: ${yen(v(d, "front_deposit_amount"))}`}
                  borderColor="#f97316aa" textColor="#fdba74" bgFrom="#f9731633" />
                <MiniKpiS label="アップ成約" value={fc(v(d, "upsell_close_count"))}
                  sub={`着金: ${yen(v(d, "upsell_deposit_amount"))}`}
                  borderColor="#eab308aa" textColor="#fde047" bgFrom="#eab30833" />
                <MiniKpiS label="F+A売上" value={yen(v(d, "all_revenue"))}
                  borderColor="#a855f7aa" textColor="#c4b5fd" bgFrom="#a855f733" />
              </div>

              <ProgressBar label="面談実施率" value={pct(interviewRate)} rate={interviewRate} />
            </ProjectCardWrap>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================
// TAB 6: CS
// ============================================================
function CsTab({ cards, m, csDetail }: { cards: Awaited<ReturnType<typeof fetchCs>>; m: number; csDetail: Awaited<ReturnType<typeof fetchCsDetail>> }) {
  const tDig = cards.reduce((sum, c) => sum + v(c.d, "dig_up_count"), 0);
  const tReply = cards.reduce((sum, c) => sum + v(c.d, "reply_count"), 0);
  const rr = tDig > 0 ? (tReply / tDig) * 100 : 0;
  const tDep = cards.reduce((sum, c) => sum + v(c.d, "deposit_amount"), 0);

  return (
    <div className="space-y-5">
      <TotalBar title="CS サマリー" month={m}>
        <TotalItem label="掘り起こし数" value={fc(tDig)} color="text-white" />
        <TotalItem label="返信数" value={fc(tReply)} color="text-purple-400" />
        <TotalItem label="返信率" value={pct(rr)} color={rr > 30 ? "text-emerald-400" : rr > 15 ? "text-yellow-400" : "text-red-400"} />
        <TotalItem label="着金合計" value={yen(tDep)} color="text-emerald-400" />
      </TotalBar>

      {/* 案件別KPIカード */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {cards.map(({ p, d }) => {
          const digCount = v(d, "dig_up_count");
          const replyCount = v(d, "reply_count");
          const replyRate = digCount > 0 ? (replyCount / digCount) * 100 : 0;

          return (
            <ProjectCardWrap key={p.id} name={p.name}>
              <div className="grid grid-cols-2 gap-2 mb-3">
                <MiniKpiS label="掘り起こし数" value={fc(digCount)}
                  borderColor="#3b82f6aa" textColor="#93c5fd" bgFrom="#3b82f633" />
                <MiniKpiS label="返信数" value={fc(replyCount)}
                  borderColor="#06b6d4aa" textColor="#67e8f9" bgFrom="#06b6d433" />
              </div>

              <div className="grid grid-cols-2 gap-2 mb-3">
                <MiniKpiS label="着金件数" value={fc(v(d, "deposit_count"))}
                  borderColor="#10b981aa" textColor="#6ee7b7" bgFrom="#10b98133" />
                <MiniKpiS label="着金金額" value={yen(v(d, "deposit_amount"))}
                  borderColor="#eab308aa" textColor="#fde047" bgFrom="#eab30833" />
              </div>

              <ProgressBar label="返信率" value={pct(replyRate)} rate={replyRate} />
            </ProjectCardWrap>
          );
        })}
      </div>

      {/* 案件別 対応履歴・テンプレート・基準値 */}
      <h2 className="text-sm font-bold text-white">CS対応詳細（案件別）</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {csDetail.map(({ p, logs, templates, thresholds }) => {
          const color = PROJECT_COLORS[p.name] ?? "#4f8ff7";
          return (
            <CsDetail key={p.id} projectName={p.name} projectColor={color}
              logs={logs.map((r: R) => ({
                id: s(r, "id"), customer_name: s(r, "customer_name"),
                response_type: s(r, "response_type"), content: s(r, "content"),
                is_alert: (r.is_alert as boolean) ?? false, alert_reason: s(r, "alert_reason"),
                created_at: s(r, "created_at"),
              }))}
              templates={templates.map((r: R) => ({
                id: s(r, "id"), title: s(r, "title"), body: s(r, "body"),
                category: s(r, "category"), usage_count: v(r, "usage_count"),
              }))}
              thresholds={thresholds.map((r: R) => ({
                metric_name: s(r, "metric_name"), threshold_value: v(r, "threshold_value"),
                direction: s(r, "direction"),
              }))}
            />
          );
        })}
      </div>
    </div>
  );
}

// ============================================================
// TAB 7: 経費
// ============================================================
function ExpenseTab({ cards, m }: { cards: Awaited<ReturnType<typeof fetchExpense>>; m: number }) {
  const totalExp = cards.reduce((sum, c) => sum + c.total, 0);
  const deptTotals: Record<string, number> = {};
  const deptKeys = ["広告", "インスタSNS", "マーケ", "CS", "動画", "その他"];
  for (const c of cards) {
    for (const [k, val] of Object.entries(c.byDept)) {
      deptTotals[k] = (deptTotals[k] ?? 0) + val;
    }
  }

  return (
    <div className="space-y-5">
      {/* Total bar */}
      <div className="bg-gradient-to-br from-[#1a1f3a] to-[#0f1117] rounded-2xl border border-[#4f8ff7]/30 p-5">
        <h3 className="text-xs font-bold text-[#4f8ff7] uppercase tracking-widest mb-4">経費サマリー — {m}月</h3>
        <div className="grid grid-cols-1 gap-4">
          <TotalItem label="経費合計" value={yen(totalExp)} color="text-red-400" />
        </div>
      </div>

      {/* Department breakdown row */}
      <div className="bg-gradient-to-br from-[#1a1f3a] to-[#0f1117] rounded-2xl border border-[#4f8ff7]/30 p-5">
        <div className="grid grid-cols-3 md:grid-cols-6 gap-4">
          {deptKeys.map((dept) => {
            const deptColor = DEPT_COLORS[dept] ?? "#9aa0b8";
            return (
              <div key={dept} className="text-center">
                <div className="flex items-center justify-center gap-1.5 mb-1">
                  <span className="w-2 h-2 rounded-full" style={{ background: deptColor }} />
                  <p className="text-xs text-[#6b7194]">{dept}</p>
                </div>
                <p className="text-lg font-bold text-white">{yen(deptTotals[dept] ?? 0)}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Project cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {cards.map((c) => (
          <ProjectCardWrap key={c.p.id} name={c.p.name}>
            {/* 経費合計 (red gradient card) */}
            <div className="mb-3">
              <MiniKpiS label="経費合計" value={yen(c.total)}
                borderColor="#ef4444aa" textColor="#fca5a5" bgFrom="#ef444433" />
            </div>

            {/* Department breakdown list */}
            <div className="space-y-1.5 mb-3">
              {deptKeys.map((dept) => {
                const deptColor = DEPT_COLORS[dept] ?? "#9aa0b8";
                const amount = c.byDept[dept] ?? 0;
                return (
                  <div key={dept} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full" style={{ background: deptColor }} />
                      <span className="text-[#9aa0b8]">{dept}</span>
                    </div>
                    <span className="text-white font-medium">{yen(amount)}</span>
                  </div>
                );
              })}
            </div>

            {/* 経費率 badge */}
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xs text-[#9aa0b8]">経費率</span>
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                c.rate > 50 ? "bg-red-500/20 text-red-400" :
                c.rate > 30 ? "bg-yellow-500/20 text-yellow-400" :
                "bg-emerald-500/20 text-emerald-400"
              }`}>
                {pct(c.rate)}
              </span>
            </div>

            {/* 明細を見る */}
            {c.rows.length > 0 && (
              <details className="mt-2">
                <summary className="text-[10px] text-[#4f8ff7] cursor-pointer hover:text-blue-400 transition">
                  明細を見る ({c.count}件)
                </summary>
                <div className="mt-2 space-y-1">
                  {c.rows.map((r: R, i: number) => (
                    <div key={i} className="flex justify-between text-[10px]">
                      <span className="text-[#6b7194]">{s(r, "department") || "その他"}</span>
                      <span className="text-[#9aa0b8]">{yen(v(r, "amount"))}</span>
                    </div>
                  ))}
                </div>
              </details>
            )}
          </ProjectCardWrap>
        ))}
      </div>
    </div>
  );
}

// ============================================================
// TAB 8: 法務
// ============================================================
function LegalTab({ data, m }: { data: Awaited<ReturnType<typeof fetchLegal>>; m: number }) {
  const tCases = data.cards.reduce((s, c) => s + v(c.d, "total_cases"), 0);
  const tResolved = data.cards.reduce((s, c) => s + v(c.d, "resolved_cases"), 0);
  const tSettlement = data.cards.reduce((s, c) => s + v(c.d, "total_settlement"), 0);
  const tBlocked = data.cards.reduce((s, c) => s + v(c.d, "blocked_count"), 0);
  const tBlockedAmt = data.cards.reduce((s, c) => s + v(c.d, "total_blocked_amount"), 0);

  return (
    <div className="space-y-5">
      {/* 全案件合計バー */}
      <TotalBar title="⚖️ 法務 全案件合計" month={m} cols={5}>
        <TotalItem label="対応件数" value={fc(tCases)} color="text-blue-300" />
        <TotalItem label="返金件数" value={fc(tResolved)} color="text-red-300" />
        <TotalItem label="返金金額" value={yen(tSettlement)} color="text-red-300" />
        <TotalItem label="返金阻止件数" value={fc(tBlocked)} color="text-emerald-400" />
        <TotalItem label="阻止金額" value={yen(tBlockedAmt)} color="text-emerald-400" />
      </TotalBar>

      {/* 案件別カード */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {data.cards.map(({ p, d }) => (
          <ProjectCardWrap key={p.id} name={p.name}>
            <div className="grid grid-cols-2 gap-2 mb-3">
              <MiniKpiS label="対応件数" value={fc(v(d, "total_cases"))}
                borderColor="#3b82f6aa" textColor="#93c5fd" bgFrom="#3b82f633" />
              <MiniKpiS label="返金件数" value={fc(v(d, "resolved_cases"))}
                borderColor="#ef4444aa" textColor="#fca5a5" bgFrom="#ef444433" />
            </div>
            <div className="grid grid-cols-2 gap-2 mb-3">
              <MiniKpiS label="返金金額" value={yen(v(d, "total_settlement"))}
                borderColor="#ef4444aa" textColor="#fca5a5" bgFrom="#ef444433" />
              <MiniKpiS label="阻止件数" value={fc(v(d, "blocked_count"))}
                borderColor="#10b981aa" textColor="#6ee7b7" bgFrom="#10b98133" />
            </div>
            <MiniKpiS label="阻止金額" value={yen(v(d, "total_blocked_amount"))}
              borderColor="#10b981aa" textColor="#6ee7b7" bgFrom="#10b98133" />
          </ProjectCardWrap>
        ))}
      </div>

      {/* 直近の対応案件一覧 */}
      <div className="bg-[#1e2235] rounded-xl border border-[#2a2f45] overflow-hidden">
        <div className="px-4 py-2.5 border-b border-[#2a2f45]">
          <h3 className="text-xs font-semibold text-white">直近の対応案件</h3>
        </div>
        {data.cases.length === 0 ? (
          <div className="px-4 py-8 text-center text-[#6b7194] text-xs">データなし</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-[#13162a]">
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-[#6b7194]">No</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-[#6b7194]">顧客名</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-[#6b7194]">種別</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-[#6b7194]">状態</th>
                  <th className="text-right px-4 py-2.5 text-xs font-semibold text-[#6b7194]">請求額</th>
                  <th className="text-right px-4 py-2.5 text-xs font-semibold text-[#6b7194]">和解額</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#2a2f45]/50">
                {data.cases.map((r: R, i: number) => (
                  <tr key={i} className="hover:bg-white/[0.02]">
                    <td className="px-4 py-2.5 text-xs text-[#9aa0b8]">{v(r, "refund_no") || "-"}</td>
                    <td className="px-4 py-2.5 text-xs font-medium text-white">{s(r, "customer_name") || "-"}</td>
                    <td className="px-4 py-2.5 text-xs text-[#9aa0b8]">
                      {s(r, "case_type") === "consumer_center" ? "消費者C" : "弁護士"}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-[#9aa0b8]">{s(r, "status") || "-"}</td>
                    <td className="text-right px-4 py-2.5 text-xs text-[#9aa0b8]">{yen(v(r, "requested_amount"))}</td>
                    <td className="text-right px-4 py-2.5 text-xs text-[#9aa0b8]">{yen(v(r, "settlement_amount"))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// TAB 9: マーケ
// ============================================================
function MarketingTab({ data, y, m }: { data: Awaited<ReturnType<typeof fetchMarketing>>; y: number; m: number }) {
  const allSchedules: { date: string; item: string; project: string; color: string }[] = [];
  data.forEach(({ p, rows }) => {
    rows.forEach((r: R) => {
      const d = s(r, "date");
      if (d) allSchedules.push({ date: d, item: s(r, "delivery_item"), project: p.name, color: PROJECT_COLORS[p.name] ?? "#4f8ff7" });
    });
  });

  return (
    <div className="space-y-5">
      {/* カレンダー（上部に配置、チェックボックス付き） */}
      <MarketingCalendar
        year={y}
        month={m}
        schedules={allSchedules}
        projectNames={data.map(({ p }) => p.name)}
      />

      {/* 配信スケジュール一覧 */}
      <h2 className="text-sm font-bold text-white">配信スケジュール一覧</h2>
      {data.map(({ p, rows }) => (
        <ProjectCardWrap key={p.id} name={p.name}>
          {rows.length === 0 ? (
            <div className="py-6 text-center text-[#6b7194] text-xs">スケジュール未登録</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-[#13162a]">
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-[#6b7194]">日付</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-[#6b7194]">時間</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-[#6b7194]">配信項目</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-[#6b7194]">対象</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-[#6b7194]">完了</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#2a2f45]/50">
                  {rows.map((r: R, i: number) => (
                    <tr key={i} className="hover:bg-white/[0.02]">
                      <td className="px-4 py-2.5 text-xs text-[#9aa0b8]">{s(r, "date") || "-"}</td>
                      <td className="px-4 py-2.5 text-xs text-[#9aa0b8]">{s(r, "delivery_time") || "-"}</td>
                      <td className="px-4 py-2.5 text-xs font-medium text-white">{s(r, "delivery_item") || "-"}</td>
                      <td className="px-4 py-2.5 text-xs text-[#9aa0b8]">{s(r, "target_segment") || "-"}</td>
                      <td className="px-4 py-2.5 text-xs">{(r.is_completed as boolean) ? "✅" : "⬜"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </ProjectCardWrap>
      ))}
    </div>
  );
}

// ============================================================
// TAB 10: ウェビナー
// ============================================================
function WebinarTab({ data, activeProject }: { data: Awaited<ReturnType<typeof fetchWebinar>>; activeProject: string }) {
  const selected = activeProject ? data.find(d => d.p.name === activeProject) : null;

  // Top page: summary cards
  if (!selected) {
    return (
      <div className="space-y-5">
        <h2 className="text-base font-bold text-white">ウェビナー実績</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {data.map(({ p, items }) => {
            const color = PROJECT_COLORS[p.name] ?? "#4f8ff7";
            const latest = items[0];
            const totalRevenue = items.reduce((sum: number, r: R) => sum + v(r, "revenue"), 0);
            const totalClose = items.reduce((sum: number, r: R) => sum + v(r, "close_count"), 0);
            return (
              <Link key={p.id} href={`/dashboard?tab=webinar&project=${encodeURIComponent(p.name)}`}
                className="rounded-2xl border-2 bg-[#13162a] p-5 hover:bg-[#181d35] transition" style={{ borderColor: color }}>
                <div className="flex items-center gap-2 mb-4">
                  <span className="w-3 h-3 rounded-full" style={{ background: color }} />
                  <p className="text-lg font-bold text-white">{p.name}</p>
                </div>
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div className="rounded-xl p-3 bg-gradient-to-br from-blue-500/20 to-transparent border border-blue-500/20 text-center">
                    <p className="text-xs text-blue-300/80 mb-1 font-medium">ウェビナー数</p>
                    <p className="text-2xl font-bold text-blue-300">{items.length}</p>
                  </div>
                  <div className="rounded-xl p-3 bg-gradient-to-br from-emerald-500/20 to-transparent border border-emerald-500/20 text-center">
                    <p className="text-xs text-emerald-300/80 mb-1 font-medium">成約合計</p>
                    <p className="text-2xl font-bold text-emerald-300">{totalClose}件</p>
                  </div>
                </div>
                <div className="rounded-xl p-3 bg-gradient-to-br from-yellow-500/20 to-transparent border border-yellow-500/20 text-center mb-3">
                  <p className="text-xs text-yellow-300/80 mb-1 font-medium">着金合計</p>
                  <p className="text-xl font-bold" style={{ color }}>{yen(totalRevenue)}</p>
                </div>
                {latest && (
                  <p className="text-sm text-[#9aa0b8]">直近: {s(latest as R, "title") || "-"}</p>
                )}
              </Link>
            );
          })}
        </div>
      </div>
    );
  }

  // Detail page: specific project
  const color = PROJECT_COLORS[selected.p.name] ?? "#4f8ff7";
  const toItem = (r: R) => ({
    id: s(r, "id"), date: s(r, "date"), title: s(r, "title"),
    delivery_platform: s(r, "delivery_platform") || "UTAGE",
    target_category: s(r, "target_category") || "all",
    registrant_count: v(r, "registrant_count"), live_viewer_count: v(r, "live_viewer_count"),
    kw_sender_count: v(r, "kw_sender_count"), appointment_count: v(r, "appointment_count"),
    close_count: v(r, "close_count"), close_unit_price: v(r, "close_unit_price"),
    revenue: v(r, "revenue"), deposit_amount: v(r, "deposit_amount"),
    script_url: s(r, "script_url"), transcript_url: s(r, "transcript_url"),
  });

  return (
    <div className="space-y-5">
      <Link href="/dashboard?tab=webinar" className="text-xs text-[#4f8ff7] hover:underline">← ウェビナー一覧に戻る</Link>
      <WebinarDetail projectName={selected.p.name} projectColor={color}
        items={selected.items.map(toItem)}
      />
    </div>
  );
}

// ============================================================
// TAB 11: 配信文面
// ============================================================
function DeliveryTab({ data, activeProject }: { data: Awaited<ReturnType<typeof fetchDelivery>>; activeProject: string }) {
  const { perProject } = data;
  const selected = activeProject ? perProject.find(d => d.p.name === activeProject) : null;

  // Detail page with DeliveryDetail (includes killer words)
  if (selected) {
    const color = PROJECT_COLORS[selected.p.name] ?? "#4f8ff7";
    const items = selected.items;
    const kw = selected.killerWords;
    const projectSorted = [...items].filter((r) => v(r, "click_rate") > 0).sort((a, b) => v(b, "click_rate") - v(a, "click_rate"));
    const pTop5 = projectSorted.slice(0, 5).map(r => ({ title: s(r, "title") || "(無題)", click_rate: v(r, "click_rate") }));
    const pWorst5 = (projectSorted.length > 5 ? projectSorted.slice(-5).reverse() : []).map(r => ({ title: s(r, "title") || "(無題)", click_rate: v(r, "click_rate") }));

    return (
      <div className="space-y-5">
        <Link href="/dashboard?tab=delivery" className="text-xs text-[#4f8ff7] hover:underline">← 配信文面一覧に戻る</Link>
        <div className="flex items-center gap-2 mb-2">
          <span className="w-3 h-3 rounded-full" style={{ background: color }} />
          <h2 className="text-lg font-bold text-white">{selected.p.name} 配信実績</h2>
        </div>
        <DeliveryDetail
          projectName={selected.p.name} projectColor={color}
          items={items.map((r: R) => ({
            id: s(r, "id"), date: s(r, "date"), title: s(r, "title"),
            channel: s(r, "channel"), delivery_platform: s(r, "delivery_platform") || "UTAGE",
            genre: s(r, "genre"), target_segment: s(r, "target_segment"),
            send_count: v(r, "send_count"), open_rate: v(r, "open_rate"),
            click_rate: v(r, "click_rate"), body: s(r, "body"),
          }))}
          killerWords={kw.map((r: R) => ({
            id: s(r, "id"), word: s(r, "word"), context: s(r, "context"),
            genre: s(r, "genre") || s(r, "department"), effectiveness_score: v(r, "effectiveness_score"),
          }))}
          top5={pTop5} worst5={pWorst5}
        />
      </div>
    );
  }

  // Top page: summary cards only
  return (
    <div className="space-y-5">
      <h2 className="text-base font-bold text-white">配信文面</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {perProject.map(({ p, items }) => {
          const color = PROJECT_COLORS[p.name] ?? "#4f8ff7";
          const avgClick = items.length > 0 ? items.reduce((sum: number, r: R) => sum + v(r, "click_rate"), 0) / items.length : 0;
          return (
            <Link key={p.id} href={`/dashboard?tab=delivery&project=${encodeURIComponent(p.name)}`}
              className="rounded-2xl border-2 bg-[#13162a] p-5 hover:bg-[#181d35] transition" style={{ borderColor: color }}>
              <div className="flex items-center gap-2 mb-4">
                <span className="w-3 h-3 rounded-full" style={{ background: color }} />
                <p className="text-lg font-bold text-white">{p.name}</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl p-3 bg-gradient-to-br from-blue-500/20 to-transparent border border-blue-500/20 text-center">
                  <p className="text-xs text-blue-300/80 mb-1 font-medium">配信数</p>
                  <p className="text-2xl font-bold text-blue-300">{items.length}</p>
                </div>
                <div className={`rounded-xl p-3 bg-gradient-to-br ${avgClick >= 5 ? "from-emerald-500/20 border-emerald-500/20" : avgClick >= 2 ? "from-yellow-500/20 border-yellow-500/20" : "from-red-500/20 border-red-500/20"} to-transparent border text-center`}>
                  <p className="text-xs text-[#9aa0b8] mb-1 font-medium">平均クリック率</p>
                  <p className={`text-2xl font-bold ${avgClick >= 5 ? "text-emerald-300" : avgClick >= 2 ? "text-yellow-300" : "text-red-300"}`}>{pct(avgClick)}</p>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================
// TAB: キラーワード共有
// ============================================================
// ============================================================
// TAB 12: WBS
// ============================================================
function WbsTab({ data, projects, activeProject, y, m }: {
  data: R[]; projects: P[]; activeProject: string; y: number; m: number;
}) {
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);

  // Count overdue and near-due for summary
  const overdueCount = data.filter(r => {
    const d = s(r, "due_date");
    return d && d < todayStr && !(r.is_completed as boolean);
  }).length;
  const nearDueCount = data.filter(r => {
    const d = s(r, "due_date");
    if (!d || (r.is_completed as boolean)) return false;
    const diff = Math.ceil((new Date(d).getTime() - now.getTime()) / 86400000);
    return diff >= 0 && diff <= 7;
  }).length;

  // Top page (no project selected): show all projects' tasks sorted by due_date
  const isTopPage = !activeProject;

  // Group tasks by phase for detail view
  const phases: { phase: string; tasks: R[] }[] = [];
  if (!isTopPage) {
    let currentPhase = "";
    for (const r of data) {
      const ph = s(r, "phase") || "未分類";
      if (ph !== currentPhase) {
        currentPhase = ph;
        phases.push({ phase: ph, tasks: [] });
      }
      phases[phases.length - 1].tasks.push(r);
    }
  }

  function renderTaskRow(r: R, i: number, showProject: boolean) {
    const dueDate = s(r, "due_date");
    const due = dueDate ? new Date(dueDate) : null;
    const daysLeft = due ? Math.ceil((due.getTime() - now.getTime()) / 86400000) : null;
    const isCompleted = (r.is_completed as boolean);
    const isOverdue = daysLeft !== null && daysLeft < 0 && !isCompleted;
    const isNearDue = daysLeft !== null && daysLeft >= 0 && daysLeft <= 7 && !isCompleted;
    const projName = s(r, "_project_name");
    const projColor = projName ? (PROJECT_COLORS[projName] ?? "#4f8ff7") : "#4f8ff7";

    return (
      <tr key={i} className={`hover:bg-white/[0.02] ${isOverdue ? "bg-red-500/5" : isNearDue ? "bg-yellow-500/5" : ""}`}>
        {showProject && (
          <td className="px-4 py-2.5 text-xs">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full" style={{ background: projColor }} />
              <span className="text-[#9aa0b8]">{projName || "-"}</span>
            </span>
          </td>
        )}
        <td className="px-4 py-2.5 text-xs text-[#9aa0b8]">{s(r, "phase") || "-"}</td>
        <td className="px-4 py-2.5 text-xs font-medium text-white">
          {s(r, "task_name") || "-"}
          {isOverdue && <span className="ml-2 px-1.5 py-0.5 rounded-full bg-red-500/20 text-red-400 text-[10px] font-bold">期限超過</span>}
          {isNearDue && <span className="ml-2 px-1.5 py-0.5 rounded-full bg-yellow-500/20 text-yellow-400 text-[10px] font-bold">期限間近</span>}
        </td>
        <td className={`px-4 py-2.5 text-xs ${isOverdue ? "text-red-400 font-medium" : isNearDue ? "text-yellow-400" : "text-[#9aa0b8]"}`}>
          {dueDate || "-"}
        </td>
        <td className="px-4 py-2.5 text-xs text-[#9aa0b8]">{s(r, "department") || "-"}</td>
        <td className="px-4 py-2.5 text-xs">
          {isCompleted ? "\u2705" : "\u2B1C"}
        </td>
        <td className={`text-right px-4 py-2.5 text-xs font-medium ${
          isOverdue ? "text-red-400" : isNearDue ? "text-yellow-400" : "text-[#9aa0b8]"
        }`}>
          {daysLeft !== null ? `${daysLeft}日` : "-"}
        </td>
        <td className="text-right px-4 py-2.5 text-xs text-[#9aa0b8]">
          {v(r, "work_days") > 0 ? `${v(r, "work_days")}日` : "-"}
        </td>
      </tr>
    );
  }

  return (
    <div className="space-y-5">
      {/* Project filter links */}
      <div className="flex gap-2 flex-wrap">
        <Link
          href={`/dashboard?tab=wbs&y=${y}&m=${m}`}
          className="px-4 py-2 rounded-xl text-sm font-medium transition-colors border-2"
          style={{
            borderColor: isTopPage ? "#4f8ff7" : "#2a2f45",
            background: isTopPage ? "#4f8ff722" : "transparent",
            color: isTopPage ? "#4f8ff7" : "#6b7194",
          }}
        >
          全案件
        </Link>
        {projects.map((p) => {
          const color = PROJECT_COLORS[p.name] ?? "#4f8ff7";
          const isActive = p.name === activeProject;
          return (
            <Link
              key={p.id}
              href={`/dashboard?tab=wbs&project=${encodeURIComponent(p.name)}&y=${y}&m=${m}`}
              className="px-4 py-2 rounded-xl text-sm font-medium transition-colors border-2"
              style={{
                borderColor: isActive ? color : "#2a2f45",
                background: isActive ? color + "22" : "transparent",
                color: isActive ? color : "#6b7194",
              }}
            >
              {p.name}
            </Link>
          );
        })}
      </div>

      {/* Alert summary */}
      {(overdueCount > 0 || nearDueCount > 0) && (
        <div className="flex gap-3 flex-wrap">
          {overdueCount > 0 && (
            <span className="px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-xs font-medium">
              期限超過: {overdueCount}件
            </span>
          )}
          {nearDueCount > 0 && (
            <span className="px-3 py-1.5 rounded-lg bg-yellow-500/10 border border-yellow-500/30 text-yellow-400 text-xs font-medium">
              7日以内: {nearDueCount}件
            </span>
          )}
        </div>
      )}

      {data.length === 0 ? (() => {
        const SAMPLE_WBS: R[] = [
          { phase: "立ち上げ準備", task_name: "(サンプル)チャット作成・関係者アサイン", due_date: "2026-04-10", department: "責任者", is_completed: false, reverse_days: 90, work_days: 1, _project_name: activeProject || "ハピネス" },
          { phase: "ローンチ台本作成", task_name: "(サンプル)シナリオ作成(1話〜FE)", due_date: "2026-04-16", department: "プロモーター", is_completed: false, reverse_days: 85, work_days: 20, _project_name: activeProject || "ハピネス" },
          { phase: "撮影前", task_name: "(サンプル)撮影日の最終チェック・会場予約", due_date: "2026-04-20", department: "責任者", is_completed: false, reverse_days: 80, work_days: 3, _project_name: activeProject || "ハピネス" },
        ];
        return (
          <div className="space-y-3">
            <div className="bg-[#1e2235] rounded-xl border border-[#2a2f45] overflow-x-auto">
              <table className="w-full">
                <thead><tr className="bg-[#13162a]">
                  {isTopPage && <th className="text-left px-4 py-2.5 text-xs font-semibold text-[#6b7194]">案件</th>}
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-[#6b7194]">フェーズ</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-[#6b7194]">タスク名</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-[#6b7194]">納品日</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-[#6b7194]">担当</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-[#6b7194]">完了</th>
                  <th className="text-right px-4 py-2.5 text-xs font-semibold text-[#6b7194]">残日数</th>
                  <th className="text-right px-4 py-2.5 text-xs font-semibold text-[#6b7194]">工数</th>
                </tr></thead>
                <tbody className="divide-y divide-[#2a2f45]/50">
                  {SAMPLE_WBS.map((r, i) => renderTaskRow(r, i, isTopPage))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-[#6b7194]">*サンプルデータです</p>
          </div>
        );
      })() : isTopPage ? (
        /* Top page: all tasks in flat list */
        <div className="bg-[#1e2235] rounded-xl border border-[#2a2f45] overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-[#13162a]">
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-[#6b7194]">案件</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-[#6b7194]">フェーズ</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-[#6b7194]">タスク名</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-[#6b7194]">期日</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-[#6b7194]">担当</th>
                <th className="text-left px-4 py-2.5 text-xs font-semibold text-[#6b7194]">完了</th>
                <th className="text-right px-4 py-2.5 text-xs font-semibold text-[#6b7194]">残日数</th>
                <th className="text-right px-4 py-2.5 text-xs font-semibold text-[#6b7194]">作業日数</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#2a2f45]/50">
              {data.map((r, i) => renderTaskRow(r, i, true))}
            </tbody>
          </table>
        </div>
      ) : (
        /* Detail page: grouped by phase */
        <div className="space-y-4">
          {phases.map((ph, pi) => (
            <div key={pi} className="bg-[#1e2235] rounded-xl border border-[#2a2f45] overflow-hidden">
              <div className="px-4 py-2.5 border-b border-[#2a2f45] bg-[#13162a]">
                <h3 className="text-xs font-semibold text-white">{ph.phase}</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-[#0f1117]/50">
                      <th className="text-left px-4 py-2 text-[10px] font-semibold text-[#6b7194]">フェーズ</th>
                      <th className="text-left px-4 py-2 text-[10px] font-semibold text-[#6b7194]">タスク名</th>
                      <th className="text-left px-4 py-2 text-[10px] font-semibold text-[#6b7194]">期日</th>
                      <th className="text-left px-4 py-2 text-[10px] font-semibold text-[#6b7194]">担当</th>
                      <th className="text-left px-4 py-2 text-[10px] font-semibold text-[#6b7194]">完了</th>
                      <th className="text-right px-4 py-2 text-[10px] font-semibold text-[#6b7194]">残日数</th>
                      <th className="text-right px-4 py-2 text-[10px] font-semibold text-[#6b7194]">作業日数</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#2a2f45]/50">
                    {ph.tasks.map((r, i) => renderTaskRow(r, i, false))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================
// TAB 13: JV企画
// ============================================================
function JvTab({
  data, projects, activeProject, m, subTab, y,
}: {
  data: Awaited<ReturnType<typeof fetchSales>>;
  projects: P[];
  activeProject: string;
  m: number;
  subTab: string;
  y: number;
}) {
  const { closer, fr, up } = data;

  const tCloseAmount = closer.reduce((sum: number, r: R) => sum + v(r, "close_amount"), 0);
  const tDepositAmount = closer.reduce((sum: number, r: R) => sum + v(r, "deposit_amount"), 0);
  const tUnpaid = closer.reduce((sum: number, r: R) => sum + v(r, "unpaid_amount"), 0);
  const tCloseCount = closer.reduce((sum: number, r: R) => sum + v(r, "close_count"), 0);

  const frRevenue = v(fr, "total_revenue");
  const upRevenue = v(up, "total_revenue");
  const frDeposit = v(fr, "total_deposit");
  const upDeposit = v(up, "total_deposit");
  const frUnit = v(fr, "avg_unit_price");
  const upUnit = v(up, "avg_unit_price");
  const faRevenue = frRevenue + upRevenue;
  const totalUnit = tCloseCount > 0 ? faRevenue / tCloseCount : 0;
  const pendingCount = v(fr, "pending_count") + v(up, "pending_count");

  return (
    <div className="space-y-5">
      {/* Project selector */}
      <div className="flex gap-2 flex-wrap">
        {projects.map((p) => {
          const color = PROJECT_COLORS[p.name] ?? "#4f8ff7";
          const isActive = p.name === activeProject;
          return (
            <Link key={p.id}
              href={`/dashboard?tab=jv&project=${encodeURIComponent(p.name)}&y=${y}&m=${m}`}
              className="px-4 py-2 rounded-xl text-sm font-medium transition-colors border-2"
              style={{ borderColor: isActive ? color : "#2a2f45", background: isActive ? color + "22" : "transparent", color: isActive ? color : "#6b7194" }}>
              {p.name}
            </Link>
          );
        })}
      </div>

      {/* 年間累計バー */}
      <TotalBar title={`${activeProject} JV企画サマリー`} month={m}>
        <TotalItem label="成約金額" value={yen(tCloseAmount)} color="text-white" />
        <TotalItem label="着金金額" value={yen(tDepositAmount)} color="text-emerald-400" />
        <TotalItem label="未着金" value={yen(tUnpaid)} color="text-red-400" />
        <TotalItem label="成約数" value={fc(tCloseCount)} color="text-purple-400" />
      </TotalBar>

      {/* Color KPI cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <ColorKpiCard title="フロント売上" value={yen(frRevenue)} from="from-orange-500/10" border="border-orange-500/20" text="text-orange-400" />
        <ColorKpiCard title="アップ売上" value={yen(upRevenue)} from="from-yellow-500/10" border="border-yellow-500/20" text="text-yellow-400" />
        <ColorKpiCard title="F+A売上" value={yen(faRevenue)} from="from-purple-500/10" border="border-purple-500/20" text="text-purple-400" />

        <ColorKpiCard title="フロント着金" value={yen(frDeposit)} from="from-blue-500/10" border="border-blue-500/20" text="text-blue-400" />
        <ColorKpiCard title="アップ着金" value={yen(upDeposit)} from="from-cyan-500/10" border="border-cyan-500/20" text="text-cyan-400" />
        <ColorKpiCard title="保留件数" value={fc(pendingCount)} from="from-red-500/10" border="border-red-500/20" text="text-red-400" />

        <ColorKpiCard title="フロント単価" value={yen(frUnit)} from="from-orange-500/10" border="border-orange-500/20" text="text-orange-400" />
        <ColorKpiCard title="アップ単価" value={yen(upUnit)} from="from-yellow-500/10" border="border-yellow-500/20" text="text-yellow-400" />
        <ColorKpiCard title="全体単価" value={yen(totalUnit)} from="from-purple-500/10" border="border-purple-500/20" text="text-purple-400" />
      </div>

      {/* Sub-tabs */}
      <div className="flex gap-2">
        {[
          { label: "クローザー実績", key: "" },
          { label: "保留追跡", key: "pending" },
          { label: "着金追跡", key: "deposit" },
        ].map((t) => (
          <Link key={t.key}
            href={`/dashboard?tab=jv&project=${encodeURIComponent(activeProject)}&y=${y}&m=${m}${t.key ? "&sub=" + t.key : ""}`}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              subTab === t.key ? "bg-[#4f8ff7] text-white" : "bg-[#1e2235] border border-[#2a2f45] text-[#9aa0b8] hover:border-[#4f8ff7]"
            }`}>{t.label}</Link>
        ))}
      </div>

      {/* Closer table */}
      <div className="bg-[#1e2235] rounded-xl border border-[#2a2f45] overflow-hidden">
        <div className="px-4 py-2.5 border-b border-[#2a2f45]">
          <h3 className="text-xs font-semibold text-white">クローザー別実績</h3>
        </div>
        {closer.length === 0 ? (
          <div className="px-4 py-8 text-center text-[#6b7194] text-xs">データなし</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-[#13162a]">
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-[#6b7194]">名前</th>
                  <th className="text-right px-4 py-2.5 text-xs font-semibold text-[#6b7194]">面談</th>
                  <th className="text-right px-4 py-2.5 text-xs font-semibold text-[#6b7194]">成約</th>
                  <th className="text-right px-4 py-2.5 text-xs font-semibold text-[#6b7194]">成約率</th>
                  <th className="text-right px-4 py-2.5 text-xs font-semibold text-[#6b7194]">成約金額</th>
                  <th className="text-right px-4 py-2.5 text-xs font-semibold text-[#6b7194]">着金</th>
                  <th className="text-right px-4 py-2.5 text-xs font-semibold text-[#6b7194]">保留</th>
                  <th className="text-right px-4 py-2.5 text-xs font-semibold text-[#6b7194]">未着金</th>
                  <th className="text-right px-4 py-2.5 text-xs font-semibold text-[#6b7194]">単価</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#2a2f45]/50">
                {closer.map((r: R, i: number) => (
                  <tr key={i} className="hover:bg-white/[0.02]">
                    <td className="px-4 py-2.5 text-xs font-medium text-white">{s(r, "closer_name") || "-"}</td>
                    <td className="text-right px-4 py-2.5 text-xs text-[#9aa0b8]">{fc(v(r, "interview_count"))}</td>
                    <td className="text-right px-4 py-2.5 text-xs text-emerald-400">{fc(v(r, "close_count"))}</td>
                    <td className="text-right px-4 py-2.5 text-xs text-[#9aa0b8]">{pct(v(r, "close_rate"))}</td>
                    <td className="text-right px-4 py-2.5 text-xs text-[#4f8ff7]">{yen(v(r, "close_amount"))}</td>
                    <td className="text-right px-4 py-2.5 text-xs text-[#9aa0b8]">{yen(v(r, "deposit_amount"))}</td>
                    <td className="text-right px-4 py-2.5 text-xs text-yellow-400">{fc(v(r, "pending_count"))}</td>
                    <td className="text-right px-4 py-2.5 text-xs text-red-400">{yen(v(r, "unpaid_amount"))}</td>
                    <td className="text-right px-4 py-2.5 text-xs text-[#9aa0b8]">{yen(v(r, "avg_unit_price"))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// Alert generation helper
// ============================================================
function generateAlerts(data: Awaited<ReturnType<typeof fetchOverview>>): React.ReactNode {
  const alerts: React.ReactNode[] = [];

  const tAdSpend = data.reduce((sum, d) => sum + v(d.a, "ad_spend"), 0);
  const tFrontRevenue = data.reduce((sum, d) => sum + v(d.a, "front_revenue"), 0);
  const tFrontRoas = tAdSpend > 0 ? (tFrontRevenue / tAdSpend) * 100 : 0;
  const tSeiyaku = data.reduce((sum, d) => sum + v(d.a, "close_count"), 0);
  const tHenkin = data.reduce((sum, d) => sum + v(d.fr, "cooling_off_count"), 0);
  const henkinRate = tSeiyaku > 0 ? (tHenkin / tSeiyaku) * 100 : 0;

  if (tFrontRoas > 0 && tFrontRoas < 200) {
    alerts.push(<AlertBadge key="roas" type="danger" text={`ROAS ${pct(tFrontRoas)} (200%未満)`} />);
  }
  if (henkinRate > 3) {
    alerts.push(<AlertBadge key="henkin" type="warning" text={`返金率 ${pct(henkinRate)} (3%超過)`} />);
  }

  for (const { p, a } of data) {
    const adSpend = v(a, "ad_spend");
    const frontRev = v(a, "front_revenue");
    const pRoas = adSpend > 0 ? (frontRev / adSpend) * 100 : 0;
    if (pRoas > 0 && pRoas < 200) {
      alerts.push(<AlertBadge key={`roas-${p.id}`} type="danger" text={`${p.name} ROAS ${pct(pRoas)}`} />);
    }
  }

  if (tFrontRoas >= 200) {
    alerts.push(<AlertBadge key="roas-ok" type="success" text={`ROAS ${pct(tFrontRoas)} 良好`} />);
  }

  if (alerts.length === 0) {
    return <AlertBadge type="info" text="データ入力待ち" />;
  }
  return <>{alerts}</>;
}

// ============================================================
// Main Page
// ============================================================
export default async function DashboardPage(props: {
  searchParams: Promise<{ tab?: string; y?: string; m?: string; sub?: string; project?: string }>;
}) {
  const sp = await props.searchParams;
  const activeTab = sp.tab ?? "";
  const now = new Date();
  const y = sp.y ? parseInt(sp.y) : now.getFullYear();
  const m = sp.m ? parseInt(sp.m) : now.getMonth() + 1;
  const yearMonth = ymStr(y, m);
  const subTab = sp.sub ?? "";
  const rawProject = sp.project ?? "";
  // 営業/JVはproject必須なのでデフォルト"ハピネス"、ウェビナー/配信文面/WBSは空=トップページ
  const needsDefault = ["sales", "jv"].includes(sp.tab ?? "");
  const activeProject = rawProject || (needsDefault ? "ハピネス" : "");

  const projects = await getProjects();
  let content: React.ReactNode = null;
  let alerts: React.ReactNode = undefined;

  switch (activeTab) {
    case "":
    case undefined: {
      const d = await fetchOverview(projects, yearMonth);
      alerts = generateAlerts(d);
      content = <OverviewTab data={d} m={m} />;
      break;
    }
    case "sales": {
      const pid = projects.find(p => p.name === activeProject)?.id ?? projects[0]?.id ?? "";
      const [d, pendingItems, depositItems] = await Promise.all([
        fetchSales(projects, yearMonth, activeProject),
        fetchPendingFollowups(pid),
        fetchDepositTracking(pid),
      ]);
      content = <SalesTab data={d} projects={projects} activeProject={activeProject} m={m} subTab={subTab} y={y} pendingItems={pendingItems} depositItems={depositItems} />;
      break;
    }
    case "ad": {
      const d = await fetchAd(projects, yearMonth);
      content = <AdTab cards={d} m={m} />;
      break;
    }
    case "video": {
      const d = await fetchVideo(projects, yearMonth);
      content = <VideoTab cards={d} m={m} />;
      break;
    }
    case "instagram": {
      const d = await fetchInstagram(projects, yearMonth);
      content = <InstagramTab cards={d} m={m} />;
      break;
    }
    case "cs": {
      const [d, csD] = await Promise.all([fetchCs(projects, yearMonth), fetchCsDetail(projects)]);
      content = <CsTab cards={d} m={m} csDetail={csD} />;
      break;
    }
    case "expense": {
      const d = await fetchExpense(projects, yearMonth);
      content = <ExpenseTab cards={d} m={m} />;
      break;
    }
    case "legal": {
      const d = await fetchLegal(projects, yearMonth);
      content = <LegalTab data={d} m={m} />;
      break;
    }
    case "marketing": {
      const d = await fetchMarketing(projects);
      content = <MarketingTab data={d} y={y} m={m} />;
      break;
    }
    case "webinar": {
      const d = await fetchWebinar(projects);
      content = <WebinarTab data={d} activeProject={activeProject} />;
      break;
    }
    case "delivery": {
      const d = await fetchDelivery(projects);
      content = <DeliveryTab data={d} activeProject={activeProject} />;
      break;
    }
    case "wbs": {
      content = <WbsTabNew />;
      break;
    }
    case "jv": {
      const d = await fetchSales(projects, yearMonth, activeProject);
      content = <JvTab data={d} projects={projects} activeProject={activeProject} y={y} m={m} subTab={subTab} />;
      break;
    }
    default:
      content = <div className="text-center text-[#6b7194] py-12 text-xs">不明なタブ</div>;
  }

  const base = activeTab ? `/dashboard?tab=${activeTab}` : "/dashboard?tab=";

  return (
    <DashboardShell activeTab={activeTab} alerts={alerts}>
      {activeTab !== "wbs" && (
        <div className="mb-5">
          <MonthSelector y={y} m={m} base={base} />
        </div>
      )}
      {content}
    </DashboardShell>
  );
}

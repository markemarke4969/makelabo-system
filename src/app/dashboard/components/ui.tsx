import Link from "next/link";

// ============================================================
// 既存ダッシュボード完全準拠カラー定数
// ============================================================
export const PROJECT_COLORS: Record<string, string> = {
  "ハピネス": "#4f8ff7",
  "WBC": "#34d399",
  "競馬": "#fbbf24",
  "レインボー": "#a78bfa",
};
export const DEPT_COLORS: Record<string, string> = {
  "広告": "#4f8ff7", "インスタSNS": "#a78bfa", "マーケ": "#34d399",
  "CS": "#fbbf24", "動画": "#f87171", "その他": "#9aa0b8",
};

// ============================================================
// フォーマッター
// ============================================================
export function fc(n: number) { return Math.round(n || 0).toLocaleString(); }
export function yen(n: number) { return `¥${fc(n)}`; }
export function pct(n: number) { return `${(n || 0).toFixed(1)}%`; }

// ============================================================
// AlertBadge (既存page.tsx完全準拠)
// ============================================================
export function AlertBadge({ type, text }: { type: "success" | "warning" | "danger" | "info"; text: string }) {
  const colors = {
    success: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    warning: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
    danger: "bg-red-500/10 text-red-400 border-red-500/20",
    info: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  };
  const icons = { success: "✓", warning: "⚠", danger: "✕", info: "ℹ" };
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border whitespace-nowrap ${colors[type]}`}>
      {icons[type]} {text}
    </span>
  );
}

// ============================================================
// MonthSelector (既存完全準拠)
// ============================================================
export function MonthSelector({ y, m, base }: { y: number; m: number; base: string }) {
  const sep = base.includes("?") ? "&" : "?";
  return (
    <div className="flex items-center gap-3 flex-wrap">
      <select defaultValue={y} className="bg-[#1e2235] border border-[#2a2f45] text-white rounded-lg px-3 py-2 text-sm">
        {[2024, 2025, 2026].map((yr) => <option key={yr} value={yr}>{yr}年</option>)}
      </select>
      <div className="flex gap-2 flex-wrap">
        {[1,2,3,4,5,6,7,8,9,10,11,12].map((mo) => (
          <Link key={mo} href={`${base}${sep}y=${y}&m=${mo}`}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              mo === m ? "bg-[#4f8ff7] text-white"
              : "bg-[#1e2235] border border-[#2a2f45] text-[#9aa0b8] hover:border-[#4f8ff7]"
            }`}>{mo}月</Link>
        ))}
      </div>
    </div>
  );
}

// ============================================================
// TotalBar (既存完全準拠)
// ============================================================
export function TotalBar({ title, month, cols, children }: { title: string; month: number; cols?: number; children: React.ReactNode }) {
  return (
    <div className="bg-gradient-to-br from-[#1a1f3a] to-[#0f1117] rounded-2xl border border-[#4f8ff7]/30 p-5">
      <h3 className="text-xs font-bold text-[#4f8ff7] uppercase tracking-widest mb-4">{title} — {month}月</h3>
      <div className={`grid grid-cols-2 md:grid-cols-${cols ?? 4} gap-4`}>{children}</div>
    </div>
  );
}

export function TotalBar5({ title, month, children }: { title: string; month: number; children: React.ReactNode }) {
  return (
    <div className="bg-gradient-to-br from-[#1a1f3a] to-[#0f1117] rounded-2xl border border-[#4f8ff7]/30 p-5">
      <h3 className="text-xs font-bold text-[#4f8ff7] uppercase tracking-widest mb-4">{title} — {month}月</h3>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">{children}</div>
    </div>
  );
}

export function TotalItem({ label, value, color, sub }: { label: string; value: string; color?: string; sub?: string }) {
  return (
    <div className="text-center">
      <p className="text-xs text-[#6b7194] mb-1">{label}</p>
      <p className={`text-2xl font-bold ${color || "text-white"}`}>{value}</p>
      {sub && <p className="text-xs text-[#6b7194]">{sub}</p>}
    </div>
  );
}

// ============================================================
// MiniKpiS - 案件カード内グラデーションKPI (style版)
// ============================================================
export function MiniKpiS({ label, value, sub, borderColor, textColor, bgFrom }: {
  label: string; value: string; sub?: string; borderColor: string; textColor: string; bgFrom: string;
}) {
  return (
    <div className="rounded-xl p-3 border" style={{ borderColor, background: `linear-gradient(135deg, ${bgFrom}, transparent)` }}>
      <p className="text-xs mb-1 font-medium" style={{ color: textColor, opacity: 0.8 }}>{label}</p>
      <p className="text-xl font-bold" style={{ color: textColor }}>{value}</p>
      {sub && <p className="text-xs text-[#6b7194] mt-0.5">{sub}</p>}
    </div>
  );
}

// ============================================================
// SmallKpi - 3列グリッド用
// ============================================================
export function SmallKpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-[#1e2235]/80 rounded-xl p-2.5 border border-[#2a2f45]/50 text-center">
      <p className="text-xs text-[#9aa0b8] mb-1 font-medium">{label}</p>
      <p className="text-base font-bold text-white">{value}</p>
    </div>
  );
}

// ============================================================
// RateKpi - 条件付き色
// ============================================================
export function RateKpi({ label, value, rate }: { label: string; value: string; rate: number }) {
  const c = rate >= 10 ? "text-emerald-400" : rate >= 5 ? "text-yellow-400" : "text-red-400";
  return (
    <div className="bg-[#1e2235]/80 rounded-xl p-3 border border-[#2a2f45]/50">
      <p className="text-xs text-[#9aa0b8] mb-1 font-medium">{label}</p>
      <p className={`text-lg font-bold ${c}`}>{value}</p>
    </div>
  );
}

// ============================================================
// ProgressBar
// ============================================================
export function ProgressBar({ label, value, rate }: { label: string; value: string; rate: number }) {
  return (
    <div className="mt-3">
      <div className="flex justify-between text-xs text-[#6b7194] mb-1">
        <span className="font-medium">{label}</span>
        <span className="text-purple-300 font-bold">{value}</span>
      </div>
      <div className="w-full bg-[#0f1117] rounded-full h-1.5">
        <div className="h-1.5 rounded-full bg-gradient-to-r from-purple-500 to-blue-500" style={{ width: `${Math.min(rate, 100)}%` }} />
      </div>
    </div>
  );
}

// ============================================================
// ColorKpiCard (営業タブ)
// ============================================================
export function ColorKpiCard({ title, value, subtitle, from, border, text }: {
  title: string; value: string; subtitle?: string; from: string; border: string; text: string;
}) {
  return (
    <div className={`rounded-xl border p-4 bg-gradient-to-br ${from} to-transparent ${border}`}>
      <p className="text-sm text-[#9aa0b8] mb-1.5 font-semibold">{title}</p>
      <p className={`text-2xl font-bold ${text}`}>{value}</p>
      {subtitle && <p className="text-xs text-[#9aa0b8] mt-1.5">{subtitle}</p>}
    </div>
  );
}

// ============================================================
// ProjectCardWrap (既存完全準拠: border-2 + project color)
// ============================================================
export function ProjectCardWrap({ name, children }: { name: string; children: React.ReactNode }) {
  const color = PROJECT_COLORS[name] ?? "#4f8ff7";
  return (
    <div className="rounded-2xl border-2 bg-[#13162a] p-5" style={{ borderColor: color }}>
      <div className="flex items-center gap-2 mb-4">
        <span className="w-3 h-3 rounded-full" style={{ background: color }} />
        <p className="text-lg font-bold text-white">{name}</p>
      </div>
      {children}
    </div>
  );
}

// ============================================================
// DashboardShell (既存page.tsx完全準拠)
// ============================================================
const TABS = [
  { label: "全体", icon: "📊", key: "", href: "/dashboard" },
  { label: "営業", icon: "💼", key: "sales", href: "/dashboard?tab=sales" },
  { label: "広告", icon: "📢", key: "ad", href: "/dashboard?tab=ad" },
  { label: "動画", icon: "🎬", key: "video", href: "/dashboard?tab=video" },
  { label: "インスタ", icon: "📸", key: "instagram", href: "/dashboard?tab=instagram" },
  { label: "CS", icon: "🎧", key: "cs", href: "/dashboard?tab=cs" },
  { label: "経費", icon: "💰", key: "expense", href: "/dashboard?tab=expense" },
  { label: "法務", icon: "⚖️", key: "legal", href: "/dashboard?tab=legal" },
  { label: "マーケ", icon: "📣", key: "marketing", href: "/dashboard?tab=marketing" },
  { label: "ウェビナー", icon: "🎤", key: "webinar", href: "/dashboard?tab=webinar" },
  { label: "配信文面", icon: "✉️", key: "delivery", href: "/dashboard?tab=delivery" },
  { label: "WBS", icon: "📋", key: "wbs", href: "/dashboard?tab=wbs" },
  { label: "JV企画", icon: "🤝", key: "jv", href: "/dashboard?tab=jv" },
];

const INPUT_LINKS = [
  { label: "面談記録", href: "/input/appointments" },
  { label: "広告KPI", href: "/input/daily-ad-kpi" },
  { label: "営業月次", href: "/input/monthly-sales" },
  { label: "クローザー実績", href: "/input/closer-performance" },
  { label: "CS実績", href: "/input/cs-performance" },
  { label: "返金・CO", href: "/input/refund-cases" },
  { label: "配信スケジュール", href: "/input/delivery-schedule" },
  { label: "配信文面", href: "/input/delivery-contents" },
  { label: "ウェビナー", href: "/input/webinars" },
  { label: "月次目標", href: "/input/monthly-targets" },
  { label: "着金追跡", href: "/input/deposit-tracking" },
  { label: "保留フォロー", href: "/input/pending-followups" },
  { label: "動画実績", href: "/input/video-performance" },
  { label: "WBSタスク", href: "/input/wbs" },
  { label: "JV企画", href: "/input/jv-projects" },
];

export function DashboardShell({ activeTab, alerts, children }: { activeTab: string; alerts?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#0f1117]">
      {/* ヘッダー (既存完全準拠) */}
      <header className="sticky top-0 z-50 bg-[#0f1117]/80 backdrop-blur-xl border-b border-[#2a2f45]">
        <div className="max-w-[1600px] mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold tracking-tight">
                <span className="text-[#4f8ff7]">MAKELABO</span>{" "}
                <span className="text-[#9aa0b8] font-normal">KPI Dashboard</span>
              </h1>
              <p className="text-xs text-[#6b7194] mt-0.5">全案件・全部署 統合ダッシュボード</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-xs text-[#6b7194] bg-[#1e2235] px-3 py-1.5 rounded-lg border border-[#2a2f45]">
                {new Date().toLocaleDateString("ja-JP", { year: "numeric", month: "long", day: "numeric" })}
              </div>
              <Link href="/input/appointments" className="bg-[#4f8ff7] text-white px-3.5 py-1.5 rounded-lg text-xs font-medium hover:bg-[#3d7de5] transition">
                + データ入力
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* タブナビ (既存完全準拠) */}
      <nav className="sticky top-[73px] z-40 bg-[#0f1117]/80 backdrop-blur-xl border-b border-[#2a2f45]">
        <div className="max-w-[1600px] mx-auto px-6">
          <div className="flex gap-1 overflow-x-auto py-2 scrollbar-hide">
            {TABS.map((t) => (
              <Link key={t.key} href={t.href}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${
                  activeTab === t.key
                    ? "bg-[#4f8ff7]/10 text-[#4f8ff7] border border-[#4f8ff7]/30"
                    : "text-[#6b7194] hover:text-[#9aa0b8] hover:bg-[#1e2235] border border-transparent"
                }`}>
                <span className="text-base">{t.icon}</span>
                {t.label}
              </Link>
            ))}
          </div>
        </div>
      </nav>

      {/* アラートバー */}
      {alerts && (
        <div className="max-w-[1600px] mx-auto px-6 mt-4">
          <div className="flex gap-3 overflow-x-auto pb-2">{alerts}</div>
        </div>
      )}

      <div className="max-w-[1600px] mx-auto px-6 py-6 flex gap-5">
        <main className="flex-1 min-w-0">{children}</main>
        <aside className="w-44 flex-shrink-0 hidden xl:block">
          <div className="bg-[#1e2235] rounded-xl border border-[#2a2f45] p-3 sticky top-[140px]">
            <h2 className="text-[9px] font-semibold text-[#6b7194] uppercase tracking-wider mb-2">入力メニュー</h2>
            <ul className="space-y-px">
              {INPUT_LINKS.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="block px-2 py-1 text-[11px] text-[#6b7194] hover:text-[#4f8ff7] hover:bg-[#252a40] rounded transition">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}

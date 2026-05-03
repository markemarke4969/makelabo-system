"use client";

import { useCallback, useEffect, useMemo, useRef, useState, Suspense } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";

// 段階7-D1: UUID 形式 validation(invalid project クエリ対処、判断 D1-5/D1-7)
// dashboard.tsx と同パターン(共通化は本 PR scope 外、申し送り検討項目)
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface Project {
  id: string;
  name: string;
  code: string | null;
  color?: string;
}

interface RouteStat {
  id: string;
  project_id: string | null;
  name: string;
  code: string;
  is_active: boolean;
  total_clicks: number;
  total_registered: number;
}

interface DailyStat {
  date: string;
  total: number;
  by_route: Record<string, number>;
}

const RANGE_OPTIONS = [
  { value: 7, label: "7日間" },
  { value: 14, label: "14日間" },
  { value: 30, label: "30日間" },
  { value: 90, label: "90日間" },
];

// 段階7-D1: useSearchParams 利用のため Suspense 境界が必要(Next.js 公式仕様)
// 末尾の InflowStatsPage(default export)が Suspense wrap、本体は InflowStatsPageInner に rename。
function InflowStatsPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const [project, setProject] = useState<Project | null>(null);
  const [days, setDays] = useState(30);
  const [routes, setRoutes] = useState<RouteStat[]>([]);
  const [daily, setDaily] = useState<DailyStat[]>([]);
  const [registeredDaily, setRegisteredDaily] = useState<DailyStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const restoreCompletedRef = useRef(false);

  // sessionStorage から案件を取得
  // 段階7-D1 commit 3:URL 優先(判断 D1-3 / D1-7、dashboard と同パターン)
  // - URL `?project=<UUID>`(または既存形式 `?project_id=<UUID>` も後方互換で受付)
  // - invalid UUID(中括弧 placeholder 等)→ projects 画面リダイレクト(7-C1 §7-3 真因解消)
  // - URL の project が sessionStorage の project.id と不一致 → projects リダイレクト
  // - URL クエリなし → 既存 sessionStorage 復元(後方互換、D1-6)
  useEffect(() => {
    if (restoreCompletedRef.current) return;
    const stored = sessionStorage.getItem("line_project");
    const urlProject = searchParams.get("project") ?? searchParams.get("project_id");

    if (!stored) {
      router.push("/line/projects");
      return;
    }
    let parsed: Project | null = null;
    try {
      parsed = JSON.parse(stored);
    } catch {
      router.push("/line/projects");
      return;
    }
    if (urlProject !== null) {
      // URL に project クエリあり、UUID 形式 + sessionStorage 一致を validation
      if (!UUID_REGEX.test(urlProject) || urlProject !== parsed?.id) {
        router.push("/line/projects");
        return;
      }
    }
    if (parsed) {
      setProject(parsed);
      restoreCompletedRef.current = true;
    } else {
      router.push("/line/projects");
    }
  }, [router, searchParams]);

  // 段階7-D1 commit 3: state → URL 同期(将来 inflow-stats 内で project 切替を持つ場合に備える足場)
  // - project?.id 変更 → router.replace で URL クエリ反映
  // - ping-pong 防止:現 URL と target が一致なら router.replace 呼ばない
  // - restoreCompletedRef ガード(初回復元前は触らない)
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!restoreCompletedRef.current) return;
    const params = new URLSearchParams(searchParams.toString());
    let changed = false;
    const currentUrlProject = params.get("project") ?? params.get("project_id");
    const targetProject = project?.id ?? null;
    if (targetProject === null && currentUrlProject !== null) {
      params.delete("project");
      params.delete("project_id");
      changed = true;
    } else if (targetProject !== null && currentUrlProject !== targetProject) {
      // 新仕様 `project` キーで書き戻し、旧 `project_id` は削除して統一
      params.delete("project_id");
      params.set("project", targetProject);
      changed = true;
    }
    if (changed) {
      const queryString = params.toString();
      router.replace(queryString ? `${pathname}?${queryString}` : pathname);
    }
  }, [project?.id, pathname, router, searchParams]);

  // 段階7-D1 commit 3: URL 変更検知 → state 同期(ブラウザ戻る/進む対応)
  // - ping-pong 防止:URL の project === 現 project?.id なら return
  // - 現状 inflow-stats は project 切替 UI を持たないが、将来や URL 直接操作で URL が変わった時に sessionStorage 検証して整合
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!restoreCompletedRef.current) return;
    const urlProject = searchParams.get("project") ?? searchParams.get("project_id");
    if (urlProject === (project?.id ?? null)) return;
    if (urlProject === null) {
      // URL から project クエリが消えた(state は維持、URL 同期は state→URL useEffect が次回再書き)
      return;
    }
    // URL に新たな project クエリが現れた(別 project の URL を直接開いた等)
    if (!UUID_REGEX.test(urlProject)) {
      router.push("/line/projects");
      return;
    }
    const stored = sessionStorage.getItem("line_project");
    if (!stored) {
      router.push("/line/projects");
      return;
    }
    try {
      const parsed: Project = JSON.parse(stored);
      if (parsed.id !== urlProject) {
        // sessionStorage と不一致 → projects リダイレクト(別 project URL の直接開きへの整合)
        router.push("/line/projects");
        return;
      }
      setProject(parsed);
    } catch {
      router.push("/line/projects");
    }
  }, [searchParams, project?.id, router]);

  const fetchStats = useCallback(async () => {
    if (!project?.id) return;
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({
        project_id: project.id,
        days: String(days),
      });
      const res = await fetch(`/api/line/inflow-stats?${qs}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "取得失敗");
      setRoutes(data.routes ?? []);
      setDaily(data.daily ?? []);
      setRegisteredDaily(data.registered_daily ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "エラー");
      setRoutes([]);
      setDaily([]);
      setRegisteredDaily([]);
    }
    setLoading(false);
  }, [project?.id, days]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const totalClicks = useMemo(
    () => routes.reduce((sum, r) => sum + r.total_clicks, 0),
    [routes],
  );
  const totalRegistered = useMemo(
    () => routes.reduce((sum, r) => sum + r.total_registered, 0),
    [routes],
  );
  const activeRouteCount = useMemo(
    () => routes.filter((r) => r.is_active).length,
    [routes],
  );
  const dailyMax = useMemo(
    () => daily.reduce((m, d) => Math.max(m, d.total), 0),
    [daily],
  );
  const registeredMax = useMemo(
    () => registeredDaily.reduce((m, d) => Math.max(m, d.total), 0),
    [registeredDaily],
  );
  const dailyAvg = useMemo(
    () => (daily.length > 0 ? totalClicks / daily.length : 0),
    [daily, totalClicks],
  );
  const conversionRate = useMemo(
    () => (totalClicks > 0 ? (totalRegistered / totalClicks) * 100 : 0),
    [totalRegistered, totalClicks],
  );

  const buildRelayUrl = (route: RouteStat) => {
    if (!project?.code) return "（案件コード未設定）";
    if (typeof window === "undefined") return "";
    return `${window.location.origin}/line/r/${project.code}/${route.code}`;
  };

  return (
    <div className="min-h-screen bg-[#1e2744]">
      {/* ヘッダー */}
      <header className="border-b border-white/10 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-[#06C755] flex items-center justify-center">
            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
            </svg>
          </div>
          <div>
            <h1 className="text-lg font-bold text-white">流入経路レポート</h1>
            <p className="text-xs text-white/40">
              {project?.name ? `${project.name} / ` : ""}中継URL経由のクリック数を集計
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => router.push("/line/dashboard")}
            className="px-3 py-1.5 text-xs text-white/60 hover:text-white hover:bg-white/10 rounded-md transition"
          >
            ダッシュボードへ
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8 space-y-6">
        {/* フィルタ */}
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="text-[11px] text-white/50 block mb-1">集計期間</label>
            <div className="flex gap-1 bg-white/5 border border-white/10 rounded-lg p-1">
              {RANGE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setDays(opt.value)}
                  className={`px-3 py-1.5 text-xs rounded-md transition ${
                    days === opt.value
                      ? "bg-blue-600 text-white"
                      : "text-white/60 hover:text-white"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          <button
            onClick={fetchStats}
            disabled={loading}
            className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white text-xs rounded-lg transition disabled:opacity-50"
          >
            {loading ? "更新中..." : "更新"}
          </button>
        </div>

        {error && (
          <div className="px-4 py-3 rounded-lg bg-red-500/20 border border-red-500/30 text-red-300 text-sm">
            {error}
          </div>
        )}

        {/* サマリーカード */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <StatCard label="合計クリック" value={totalClicks.toLocaleString()} unit="回" />
          <StatCard label="登録人数" value={totalRegistered.toLocaleString()} unit="人" />
          <StatCard label="登録率" value={conversionRate.toFixed(1)} unit="%" />
          <StatCard label="アクティブ経路" value={String(activeRouteCount)} unit={`/ ${routes.length}`} />
          <StatCard label="集計期間" value={String(days)} unit="日間" />
        </div>

        {/* 日別推移バーチャート（クリック） */}
        <section className="bg-white/5 border border-white/10 rounded-xl p-5">
          <h2 className="text-white text-sm font-bold mb-4">日別クリック推移</h2>
          {daily.length === 0 ? (
            <div className="text-white/40 text-sm text-center py-8">データがありません</div>
          ) : (
            <div className="flex items-end gap-0.5 h-40 overflow-x-auto pb-2">
              {daily.map((d) => {
                const h = dailyMax > 0 ? (d.total / dailyMax) * 100 : 0;
                const label = d.date.slice(5);
                return (
                  <div
                    key={d.date}
                    className="flex-1 min-w-[16px] flex flex-col items-center justify-end group relative"
                    title={`${d.date}: ${d.total}回`}
                  >
                    <div
                      className="w-full bg-blue-500/70 hover:bg-blue-400 rounded-t transition"
                      style={{ height: `${h}%`, minHeight: d.total > 0 ? "2px" : "0" }}
                    />
                    <div className="text-[9px] text-white/40 mt-1 rotate-45 origin-left whitespace-nowrap">
                      {label}
                    </div>
                    {d.total > 0 && (
                      <div className="absolute -top-6 opacity-0 group-hover:opacity-100 transition bg-black/80 text-white text-[10px] px-1.5 py-0.5 rounded whitespace-nowrap pointer-events-none">
                        {d.total}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* 日別推移バーチャート（登録人数） */}
        <section className="bg-white/5 border border-white/10 rounded-xl p-5">
          <h2 className="text-white text-sm font-bold mb-4">日別 登録人数（流入経路経由）</h2>
          {registeredDaily.length === 0 || registeredMax === 0 ? (
            <div className="text-white/40 text-sm text-center py-8">登録データがありません</div>
          ) : (
            <div className="flex items-end gap-0.5 h-40 overflow-x-auto pb-2">
              {registeredDaily.map((d) => {
                const h = registeredMax > 0 ? (d.total / registeredMax) * 100 : 0;
                const label = d.date.slice(5);
                return (
                  <div
                    key={d.date}
                    className="flex-1 min-w-[16px] flex flex-col items-center justify-end group relative"
                    title={`${d.date}: ${d.total}人`}
                  >
                    <div
                      className="w-full bg-green-500/70 hover:bg-green-400 rounded-t transition"
                      style={{ height: `${h}%`, minHeight: d.total > 0 ? "2px" : "0" }}
                    />
                    <div className="text-[9px] text-white/40 mt-1 rotate-45 origin-left whitespace-nowrap">
                      {label}
                    </div>
                    {d.total > 0 && (
                      <div className="absolute -top-6 opacity-0 group-hover:opacity-100 transition bg-black/80 text-white text-[10px] px-1.5 py-0.5 rounded whitespace-nowrap pointer-events-none">
                        {d.total}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* 経路別テーブル */}
        <section className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
            <h2 className="text-white text-sm font-bold">流入経路別クリック数</h2>
            <span className="text-xs text-white/40">{routes.length} 経路</span>
          </div>
          {routes.length === 0 ? (
            <div className="py-12 text-center text-white/40 text-sm">
              流入経路が登録されていません
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-white/50 text-xs border-b border-white/10">
                    <th className="px-5 py-3 font-medium">経路名</th>
                    <th className="px-5 py-3 font-medium">コード</th>
                    <th className="px-5 py-3 font-medium text-right">クリック数</th>
                    <th className="px-5 py-3 font-medium text-right">登録人数</th>
                    <th className="px-5 py-3 font-medium text-right">登録率</th>
                    <th className="px-5 py-3 font-medium text-right">構成比</th>
                    <th className="px-5 py-3 font-medium">状態</th>
                    <th className="px-5 py-3 font-medium">中継URL</th>
                  </tr>
                </thead>
                <tbody>
                  {[...routes]
                    .sort((a, b) => b.total_clicks - a.total_clicks)
                    .map((route) => {
                      const pct =
                        totalClicks > 0 ? (route.total_clicks / totalClicks) * 100 : 0;
                      const convRate = route.total_clicks > 0
                        ? (route.total_registered / route.total_clicks) * 100
                        : 0;
                      const relayUrl = buildRelayUrl(route);
                      return (
                        <tr key={route.id} className="border-b border-white/5 hover:bg-white/5">
                          <td className="px-5 py-3 text-white">{route.name}</td>
                          <td className="px-5 py-3 font-mono text-white/50 text-xs">{route.code}</td>
                          <td className="px-5 py-3 text-right">
                            <span className="text-blue-300 font-bold text-base">
                              {route.total_clicks.toLocaleString()}
                            </span>
                          </td>
                          <td className="px-5 py-3 text-right">
                            <span className="text-green-300 font-bold text-base">
                              {route.total_registered.toLocaleString()}
                            </span>
                          </td>
                          <td className="px-5 py-3 text-right text-white/70 text-xs">
                            {convRate.toFixed(1)}%
                          </td>
                          <td className="px-5 py-3 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <div className="w-16 bg-white/5 rounded-full h-1.5 overflow-hidden">
                                <div
                                  className="bg-blue-400 h-full"
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                              <span className="text-white/60 text-xs w-10 text-right">
                                {pct.toFixed(1)}%
                              </span>
                            </div>
                          </td>
                          <td className="px-5 py-3">
                            <span
                              className={`px-2 py-0.5 text-[10px] rounded-full font-medium ${
                                route.is_active
                                  ? "bg-green-500/20 text-green-300"
                                  : "bg-white/10 text-white/40"
                              }`}
                            >
                              {route.is_active ? "有効" : "無効"}
                            </span>
                          </td>
                          <td className="px-5 py-3">
                            <div className="flex items-center gap-1.5">
                              <input
                                readOnly
                                value={relayUrl}
                                className="flex-1 bg-white/5 border border-white/10 rounded-md px-2 py-1 text-[10px] font-mono text-blue-300 min-w-0 max-w-[240px]"
                              />
                              <button
                                onClick={() => navigator.clipboard.writeText(relayUrl)}
                                className="px-2 py-1 bg-white/10 hover:bg-white/20 text-white/70 text-[10px] rounded-md transition flex-shrink-0"
                              >
                                コピー
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <p className="text-[11px] text-white/30 text-center">
          ※ クリック数は中継URL(<code>/line/r/&#123;案件コード&#125;/&#123;流入コード&#125;</code>)経由のアクセス数。<br />
          登録人数は友だち追加時に inflow_route_id が紐付いた数（クリックから60分以内の友だち追加が自動紐付けされます）。
        </p>
      </main>
    </div>
  );
}

function StatCard({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div className="bg-white/5 border border-white/10 rounded-xl p-4">
      <div className="text-[11px] text-white/50 mb-1">{label}</div>
      <div className="flex items-baseline gap-1">
        <span className="text-2xl font-bold text-white">{value}</span>
        <span className="text-xs text-white/40">{unit}</span>
      </div>
    </div>
  );
}

// 段階7-D1: Suspense wrap export(D1-10 案 b、dashboard と同パターン)
export default function InflowStatsPage() {
  return (
    <Suspense fallback={null}>
      <InflowStatsPageInner />
    </Suspense>
  );
}

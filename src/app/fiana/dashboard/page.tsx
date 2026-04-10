"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";
import { isDemoMode, getDemoProfile, disableDemoMode } from "@/lib/fiana-demo";
import { EA_SYSTEMS, LINE_URL, TRIAL_DAYS, formatJPY, formatJPYPlain } from "@/lib/fiana-config";
import {
  generateAllTrades,
  getCurrentMarketSession,
  isMarketOpen,
  daysBetween,
  formatDate,
  type VirtualTrade,
} from "@/lib/fiana-trade-engine";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Area,
  AreaChart,
  CartesianGrid,
} from "recharts";

// ========================================
// 型定義
// ========================================
interface UserProfile {
  user_id: string;
  diagnosis_type: string;
  diagnosis_label: string;
  virtual_deposit: number;
  lot_size: number;
  trial_start_date: string;
}

// チャート共通設定
const CHART_COLORS = {
  grid: "rgba(255,255,255,0.06)",
  axis: "#64748b",
  line1: "#6366f1",
  line2: "#f59e0b",
  area: "#6366f1",
  green: "#22c55e",
};

const TOOLTIP_STYLE = {
  contentStyle: {
    background: "#1a1a2e",
    border: "1px solid rgba(100,100,255,0.2)",
    borderRadius: "0.75rem",
    color: "#e2e8f0",
    fontSize: "0.75rem",
  },
};

// ========================================
// メインダッシュボード
// ========================================
export default function FianaDashboard() {
  const router = useRouter();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"portfolio" | "trades" | "inflation">("portfolio");
  const [activeSystem, setActiveSystem] = useState("happiness-plus");
  const [now, setNow] = useState(new Date());

  // インフレ体感用
  const [monthlyExpense, setMonthlyExpense] = useState("");
  const [inflationResult, setInflationResult] = useState<{
    yearlyDiff: number;
    ifInvested: number;
  } | null>(null);

  // 時刻更新（1分ごと）
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  // プロフィール読込
  useEffect(() => {
    const load = async () => {
      if (isDemoMode()) {
        const demo = getDemoProfile();
        if (!demo?.virtual_deposit) {
          router.replace("/fiana/setup");
          return;
        }
        setProfile(demo as UserProfile);
        setLoading(false);
        return;
      }

      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        router.replace("/fiana/register");
        return;
      }

      const { data } = await supabase
        .from("fiana_profiles")
        .select("*")
        .eq("user_id", session.user.id)
        .single();

      if (!data?.virtual_deposit) {
        router.replace("/fiana/setup");
        return;
      }

      setProfile(data as UserProfile);
      setLoading(false);
    };
    load();
  }, [router]);

  const today = useMemo(() => now.toISOString().split("T")[0], [now]);

  const trialInfo = useMemo(() => {
    if (!profile) return null;
    const elapsed = daysBetween(profile.trial_start_date, today);
    const remaining = Math.max(0, TRIAL_DAYS - elapsed);
    const isExpired = remaining <= 0;
    return { elapsed, remaining, isExpired };
  }, [profile, today]);

  const systemData = useMemo(() => {
    if (!profile) return null;

    const endDate = trialInfo?.isExpired
      ? (() => {
          const d = new Date(profile.trial_start_date);
          d.setDate(d.getDate() + TRIAL_DAYS);
          return d.toISOString().split("T")[0];
        })()
      : today;

    return EA_SYSTEMS.filter((s) => s.fullAccess).map((sys) => {
      const { trades, snapshots } = generateAllTrades(
        profile.user_id,
        sys.id,
        sys.name,
        profile.lot_size,
        profile.virtual_deposit,
        profile.trial_start_date,
        endDate
      );
      return { system: sys, trades, snapshots };
    });
  }, [profile, today, trialInfo]);

  const currentSystemData = useMemo(() => {
    if (!systemData) return null;
    return systemData.find((s) => s.system.id === activeSystem) || systemData[0];
  }, [systemData, activeSystem]);

  const marketSession = getCurrentMarketSession(now.getHours());
  const marketOpen = isMarketOpen(now.getHours(), now.getDay());

  const handleLogout = useCallback(async () => {
    if (isDemoMode()) {
      disableDemoMode();
      router.push("/fiana/register");
      return;
    }
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/fiana/register");
  }, [router]);

  const calcInflation = useCallback(() => {
    const expense = parseInt(monthlyExpense, 10);
    if (!expense || expense <= 0) return;
    const inflationRate = 0.03;
    const yearlyDiff = Math.round(expense * 12 * inflationRate);
    const monthlyReturn = 0.02;
    let invested = 0;
    for (let m = 0; m < 36; m++) {
      invested += yearlyDiff / 12;
      invested *= 1 + monthlyReturn;
    }
    setInflationResult({
      yearlyDiff,
      ifInvested: Math.round(invested),
    });
  }, [monthlyExpense]);

  // ========================================
  // ローディング
  // ========================================
  if (loading || !profile || !systemData || !currentSystemData || !trialInfo) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="fiana-heading text-2xl font-bold fiana-text-glow mb-4">FIANA</h1>
          <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-400 text-lg">ダッシュボード読み込み中...</p>
        </div>
      </div>
    );
  }

  // ========================================
  // 30日ロック画面
  // ========================================
  if (trialInfo.isExpired) {
    const lastSnapshot =
      currentSystemData.snapshots[currentSystemData.snapshots.length - 1];
    const totalProfit = lastSnapshot ? lastSnapshot.cumulativePnl : 0;

    return (
      <div className="min-h-screen px-4 py-8">
        <div className="max-w-lg mx-auto fiana-slide-up">
          <div className="fiana-card p-8 text-center">
            <div className="text-5xl mb-4">🔒</div>
            <h1 className="text-xl font-bold text-white mb-3">
              30日間の体験が終了しました
            </h1>

            <div className="rounded-xl p-6 mb-6 bg-green-500/10 border border-green-500/20">
              <p className="text-sm text-green-400 mb-1">
                あなたの仮想資産はこれだけ育ちました
              </p>
              <p className="text-3xl font-bold text-green-300">
                {formatJPY(totalProfit)}
              </p>
              <p className="text-sm text-green-500/70 mt-1">
                元本 {formatJPYPlain(profile.virtual_deposit)} →{" "}
                {formatJPYPlain(profile.virtual_deposit + totalProfit)}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-6">
              <div className="bg-white/5 rounded-xl p-3">
                <p className="text-xs text-gray-500">総取引回数</p>
                <p className="text-xl font-bold text-white">
                  {currentSystemData.trades.length}回
                </p>
              </div>
              <div className="bg-white/5 rounded-xl p-3">
                <p className="text-xs text-gray-500">運用日数</p>
                <p className="text-xl font-bold text-white">
                  {TRIAL_DAYS}日
                </p>
              </div>
            </div>

            <div className="bg-white/5 rounded-xl p-4 mb-6">
              <p className="text-sm text-gray-400 mb-2">30日間の資産推移</p>
              <div className="h-40">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={currentSystemData.snapshots}>
                    <defs>
                      <linearGradient id="lockGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={CHART_COLORS.green} stopOpacity={0.3} />
                        <stop offset="95%" stopColor={CHART_COLORS.green} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <Area
                      type="monotone"
                      dataKey="totalAsset"
                      stroke={CHART_COLORS.green}
                      fill="url(#lockGrad)"
                      strokeWidth={2}
                    />
                    <XAxis
                      dataKey="date"
                      tickFormatter={formatDate}
                      tick={{ fontSize: 10, fill: CHART_COLORS.axis }}
                      interval="preserveStartEnd"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            <p className="text-gray-400 text-base mb-6 leading-relaxed">
              続きは無料の音声相談でご確認ください。
              <br />
              専属アドバイザーがあなたに合ったプランをご提案します。
            </p>

            <a
              href={LINE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="block w-full py-4 text-white font-bold text-lg rounded-xl text-center"
              style={{ background: "linear-gradient(135deg, #06c755, #05a648)" }}
            >
              LINEで無料相談する
            </a>

            <button
              onClick={handleLogout}
              className="mt-4 text-sm text-gray-500 hover:text-gray-300 transition-colors"
            >
              ログアウト
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ========================================
  // 通常ダッシュボード
  // ========================================
  const lastSnapshot =
    currentSystemData.snapshots[currentSystemData.snapshots.length - 1];
  const prevSnapshot =
    currentSystemData.snapshots.length >= 2
      ? currentSystemData.snapshots[currentSystemData.snapshots.length - 2]
      : null;

  const totalAsset = lastSnapshot
    ? lastSnapshot.totalAsset
    : profile.virtual_deposit;
  const cumulativePnl = lastSnapshot ? lastSnapshot.cumulativePnl : 0;
  const todayPnl = lastSnapshot ? lastSnapshot.dailyPnl : 0;
  const pnlPercent =
    profile.virtual_deposit > 0
      ? ((cumulativePnl / profile.virtual_deposit) * 100).toFixed(2)
      : "0.00";
  const todayPnlPercent =
    prevSnapshot && prevSnapshot.totalAsset > 0
      ? ((todayPnl / prevSnapshot.totalAsset) * 100).toFixed(2)
      : "0.00";

  const recentTrades = [...currentSystemData.trades].reverse().slice(0, 20);

  const chartData = currentSystemData.snapshots.map((s) => ({
    date: s.date,
    asset: s.totalAsset,
  }));

  return (
    <div className="min-h-screen pb-20">
      {/* ヘッダー */}
      <div
        className="sticky top-0 z-20 px-4 py-3 border-b"
        style={{
          background: "rgba(10, 10, 15, 0.9)",
          backdropFilter: "blur(8px)",
          borderColor: "var(--fiana-border)",
        }}
      >
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h1 className="fiana-heading font-bold text-white text-lg tracking-wider">FIANA</h1>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span
                className={`w-2 h-2 rounded-full ${marketOpen ? "bg-green-400 animate-pulse" : "bg-gray-600"}`}
              />
              <span className="text-xs text-gray-400">{marketSession}</span>
            </div>
            <div className="bg-indigo-500/20 px-2.5 py-1 rounded-lg border border-indigo-500/30">
              <span className="text-xs font-medium text-indigo-300">
                残{trialInfo.remaining}日
              </span>
            </div>
            <button
              onClick={handleLogout}
              className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
            >
              ログアウト
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-4">
        {/* システム切り替え */}
        <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
          {EA_SYSTEMS.filter((s) => s.fullAccess).map((sys) => (
            <button
              key={sys.id}
              onClick={() => setActiveSystem(sys.id)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all ${
                activeSystem === sys.id
                  ? "bg-indigo-500 text-white shadow-lg shadow-indigo-500/30"
                  : "bg-white/5 text-gray-400 border border-white/10 hover:border-white/20"
              }`}
            >
              <span>{sys.icon}</span>
              <span>{sys.name}</span>
            </button>
          ))}
          {EA_SYSTEMS.filter((s) => !s.fullAccess).map((sys) => (
            <button
              key={sys.id}
              disabled
              className="flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap bg-white/5 text-gray-600 border border-white/5 cursor-not-allowed"
            >
              <span>{sys.icon}</span>
              <span>{sys.name}</span>
              <span className="text-[10px]">🔒</span>
            </button>
          ))}
        </div>

        {/* ポートフォリオサマリー */}
        <div
          className="rounded-2xl p-5 mb-4 text-white"
          style={{ background: "linear-gradient(135deg, #0f0c29, #302b63, #24243e)" }}
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-xl">
                {EA_SYSTEMS.find((s) => s.id === activeSystem)?.icon}
              </span>
              <span className="text-sm opacity-80">
                {EA_SYSTEMS.find((s) => s.id === activeSystem)?.name}
              </span>
            </div>
            <span className="text-xs opacity-60">
              最終更新: {now.getHours()}:{now.getMinutes().toString().padStart(2, "0")}
            </span>
          </div>

          <p className="text-xs opacity-60 mb-1">仮想資産総額</p>
          <p className="text-3xl font-bold mb-3 fiana-text-glow">
            {formatJPYPlain(totalAsset)}
          </p>

          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white/10 rounded-xl p-3">
              <p className="text-xs opacity-60">本日の損益</p>
              <p className={`text-lg font-bold ${todayPnl >= 0 ? "text-green-300" : "text-red-300"}`}>
                {formatJPY(todayPnl)}
              </p>
              <p className="text-xs opacity-50">
                {todayPnl >= 0 ? "+" : ""}{todayPnlPercent}%
              </p>
            </div>
            <div className="bg-white/10 rounded-xl p-3">
              <p className="text-xs opacity-60">累計損益</p>
              <p className={`text-lg font-bold ${cumulativePnl >= 0 ? "text-green-300" : "text-red-300"}`}>
                {formatJPY(cumulativePnl)}
              </p>
              <p className="text-xs opacity-50">
                {cumulativePnl >= 0 ? "+" : ""}{pnlPercent}%
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between mt-3 text-xs opacity-50">
            <span>元本: {formatJPYPlain(profile.virtual_deposit)}</span>
            <span>運用開始: {trialInfo.elapsed}日目</span>
          </div>
        </div>

        {/* タブ切り替え */}
        <div className="flex rounded-xl border border-white/10 mb-4 p-1 bg-white/5">
          {[
            { key: "portfolio" as const, label: "📈 チャート" },
            { key: "trades" as const, label: "📋 取引ログ" },
            { key: "inflation" as const, label: "💡 インフレ体感" },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex-1 py-2.5 text-sm font-medium rounded-lg transition-all ${
                activeTab === tab.key
                  ? "bg-indigo-500 text-white shadow-lg shadow-indigo-500/30"
                  : "text-gray-500"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* チャートタブ */}
        {activeTab === "portfolio" && (
          <div className="space-y-4">
            <div className="fiana-card p-4">
              <h3 className="text-sm font-bold text-gray-300 mb-3">資産推移</h3>
              <div className="h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData}>
                    <defs>
                      <linearGradient id="assetGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={CHART_COLORS.area} stopOpacity={0.3} />
                        <stop offset="95%" stopColor={CHART_COLORS.area} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={CHART_COLORS.grid} />
                    <XAxis
                      dataKey="date"
                      tickFormatter={formatDate}
                      tick={{ fontSize: 11, fill: CHART_COLORS.axis }}
                      interval="preserveStartEnd"
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: CHART_COLORS.axis }}
                      tickFormatter={(v: number) =>
                        v >= 10000 ? `${(v / 10000).toFixed(0)}万` : `${v}`
                      }
                      domain={["dataMin - 1000", "dataMax + 1000"]}
                    />
                    <Tooltip
                      {...TOOLTIP_STYLE}
                      formatter={(value) => [formatJPYPlain(Number(value)), "資産"]}
                      labelFormatter={(label) => String(label)}
                    />
                    <Area
                      type="monotone"
                      dataKey="asset"
                      stroke={CHART_COLORS.area}
                      fill="url(#assetGrad)"
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {systemData.length > 1 && (
              <div className="fiana-card p-4">
                <h3 className="text-sm font-bold text-gray-300 mb-3">システム比較</h3>
                <div className="h-44">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={CHART_COLORS.grid} />
                      <XAxis
                        dataKey="date"
                        tickFormatter={formatDate}
                        tick={{ fontSize: 11, fill: CHART_COLORS.axis }}
                        interval="preserveStartEnd"
                        allowDuplicatedCategory={false}
                      />
                      <YAxis
                        tick={{ fontSize: 11, fill: CHART_COLORS.axis }}
                        tickFormatter={(v: number) =>
                          v >= 10000 ? `${(v / 10000).toFixed(0)}万` : `${v}`
                        }
                      />
                      <Tooltip
                        {...TOOLTIP_STYLE}
                        formatter={(value, name) => [formatJPYPlain(Number(value)), String(name)]}
                      />
                      {systemData.map((sd, i) => (
                        <Line
                          key={sd.system.id}
                          data={sd.snapshots.map((s) => ({
                            date: s.date,
                            [sd.system.name]: s.totalAsset,
                          }))}
                          type="monotone"
                          dataKey={sd.system.name}
                          stroke={i === 0 ? CHART_COLORS.line1 : CHART_COLORS.line2}
                          strokeWidth={2}
                          dot={false}
                        />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex gap-4 mt-2 justify-center">
                  {systemData.map((sd, i) => (
                    <div key={sd.system.id} className="flex items-center gap-1.5 text-xs">
                      <span
                        className="w-3 h-1 rounded-full"
                        style={{ background: i === 0 ? CHART_COLORS.line1 : CHART_COLORS.line2 }}
                      />
                      <span className="text-gray-400">
                        {sd.system.icon} {sd.system.name}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="fiana-card p-4">
              <h3 className="text-sm font-bold text-gray-300 mb-3">パフォーマンス</h3>
              <div className="grid grid-cols-3 gap-3">
                <div className="text-center">
                  <p className="text-xs text-gray-500">取引回数</p>
                  <p className="text-lg font-bold text-white">{currentSystemData.trades.length}</p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-gray-500">勝率</p>
                  <p className="text-lg font-bold text-white">
                    {currentSystemData.trades.length > 0
                      ? ((currentSystemData.trades.filter((t) => t.pips > 0).length / currentSystemData.trades.length) * 100).toFixed(1)
                      : "0"}%
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-gray-500">累計損益</p>
                  <p className={`text-lg font-bold ${cumulativePnl >= 0 ? "text-green-400" : "text-red-400"}`}>
                    {formatJPY(cumulativePnl)}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 取引ログタブ */}
        {activeTab === "trades" && (
          <div className="space-y-2">
            <div className="fiana-card p-4">
              <h3 className="text-sm font-bold text-gray-300 mb-3">
                取引履歴（{EA_SYSTEMS.find((s) => s.id === activeSystem)?.name}）
              </h3>
              {recentTrades.length === 0 ? (
                <p className="text-gray-500 text-center py-8">まだ取引がありません</p>
              ) : (
                <div className="space-y-2">
                  {recentTrades.map((trade) => (
                    <TradeLogRow key={trade.id} trade={trade} />
                  ))}
                </div>
              )}
            </div>
            <p className="text-center text-xs text-gray-600 mt-2">
              ※これはシミュレーションです。実際の取引結果とは異なります。
            </p>
          </div>
        )}

        {/* インフレ体感タブ */}
        {activeTab === "inflation" && (
          <div className="space-y-4">
            <div className="fiana-card p-4">
              <h3 className="text-sm font-bold text-gray-300 mb-2">
                💡 インフレ体感シミュレーター
              </h3>
              <p className="text-xs text-gray-500 mb-4">
                月々の固定支出を入力すると、インフレによる影響と運用した場合のシミュレーションが見れます
              </p>

              <div className="flex gap-2 mb-4">
                <div className="flex-1 flex items-center gap-1">
                  <span className="text-gray-500">¥</span>
                  <input
                    type="number"
                    value={monthlyExpense}
                    onChange={(e) => setMonthlyExpense(e.target.value)}
                    placeholder="月額固定費（例: 150000）"
                    className="fiana-input w-full"
                  />
                </div>
                <button
                  onClick={calcInflation}
                  className="px-4 py-2.5 bg-indigo-500 text-white font-medium text-sm rounded-xl hover:bg-indigo-400 transition-colors"
                >
                  計算
                </button>
              </div>

              {inflationResult && (
                <div className="space-y-3">
                  <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4">
                    <p className="text-sm text-red-400 font-medium mb-1">
                      📉 インフレによる影響（年率3%想定）
                    </p>
                    <p className="text-2xl font-bold text-red-300">
                      年間 -¥{inflationResult.yearlyDiff.toLocaleString()}
                    </p>
                    <p className="text-xs text-red-500/70 mt-1">
                      去年より年間{inflationResult.yearlyDiff.toLocaleString()}円多く支払っている計算です
                    </p>
                  </div>

                  <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-4">
                    <p className="text-sm text-green-400 font-medium mb-1">
                      📈 この差額を運用していたら（月利2%・3年間）
                    </p>
                    <p className="text-2xl font-bold text-green-300">
                      +¥{inflationResult.ifInvested.toLocaleString()}
                    </p>
                    <p className="text-xs text-green-500/70 mt-1">
                      差額を毎月コツコツ運用するだけで取り戻せます
                    </p>
                  </div>
                </div>
              )}
            </div>

            <div className="fiana-card p-4">
              <h3 className="text-sm font-bold text-gray-300 mb-3">固定費の目安</h3>
              <div className="space-y-2 text-sm">
                {[
                  { label: "家賃・住宅ローン", example: "80,000〜150,000円" },
                  { label: "光熱費", example: "15,000〜25,000円" },
                  { label: "通信費", example: "8,000〜15,000円" },
                  { label: "保険料", example: "10,000〜30,000円" },
                  { label: "食費", example: "40,000〜80,000円" },
                ].map((item) => (
                  <div key={item.label} className="flex justify-between py-2 border-b border-white/5">
                    <span className="text-gray-300">{item.label}</span>
                    <span className="text-gray-500">{item.example}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* LINE誘導 */}
        <div className="mt-6 fiana-card p-4 text-center">
          <p className="text-sm text-gray-400 mb-3">
            気になることがあれば、いつでもご相談ください
          </p>
          <a
            href={LINE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block px-6 py-3 text-white font-bold text-sm rounded-xl"
            style={{ background: "linear-gradient(135deg, #06c755, #05a648)" }}
          >
            LINEで無料相談する
          </a>
        </div>

        <p className="text-center text-xs text-gray-600 mt-4 mb-8">
          ※これはシミュレーションです。実際の取引結果とは異なります。
        </p>
      </div>
    </div>
  );
}

// ========================================
// 取引ログ行
// ========================================
function TradeLogRow({ trade }: { trade: VirtualTrade }) {
  const isProfit = trade.pips > 0;
  return (
    <div
      className={`rounded-xl p-3 border ${
        isProfit
          ? "border-green-500/20 bg-green-500/5"
          : "border-red-500/20 bg-red-500/5"
      }`}
    >
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">
            {trade.tradeDate.slice(5)} {trade.tradeTime}
          </span>
          <span
            className={`text-xs font-bold px-1.5 py-0.5 rounded ${
              trade.direction === "BUY"
                ? "bg-indigo-500/20 text-indigo-300"
                : "bg-orange-500/20 text-orange-300"
            }`}
          >
            {trade.direction}
          </span>
        </div>
        <span className="text-xs text-gray-500">{trade.lot}lot</span>
      </div>
      <div className="flex items-center justify-between">
        <div className="text-sm text-gray-400">
          <span className="font-mono">USD/JPY</span>{" "}
          <span className="font-mono text-gray-300">{trade.entryPrice.toFixed(3)}</span>
          <span className="text-gray-600 mx-1">→</span>
          <span className="font-mono text-gray-300">{trade.exitPrice.toFixed(3)}</span>
          <span className="text-gray-500 mx-1.5">
            {isProfit ? "+" : ""}{trade.pips}pips
          </span>
        </div>
        <span className={`font-bold text-sm ${isProfit ? "text-green-400" : "text-red-400"}`}>
          {trade.profitJpy >= 0 ? "+" : ""}¥{Math.abs(trade.profitJpy).toLocaleString()}
        </span>
      </div>
    </div>
  );
}

"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { isDemoMode, getDemoProfile } from "@/lib/fiana-demo";
import { createClient } from "@/lib/supabase-browser";
import {
  EA_SYSTEMS,
  formatJPY,
  formatJPYPlain,
  DEPOSIT_OPTIONS,
  LINE_URL,
} from "@/lib/fiana-config";
import {
  generateAllTrades,
  formatDate,
  type VirtualTrade,
  type DailySnapshot,
} from "@/lib/fiana-trade-engine";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

// ========================================
// 型定義
// ========================================
interface UserProfile {
  user_id: string;
  virtual_deposit: number;
  lot_size: number;
}

type Phase = "setup" | "running" | "complete";

interface AnimState {
  dayIndex: number;
  tradeIndex: number;
  currentTrade: VirtualTrade | null;
  visibleSnapshots: DailySnapshot[];
  visibleTrades: VirtualTrade[];
  stats: {
    totalTrades: number;
    wins: number;
    losses: number;
    totalProfit: number;
    maxDrawdown: number;
    maxProfit: number;
  };
}

const CHART_COLORS = {
  grid: "rgba(255,255,255,0.06)",
  axis: "#64748b",
  green: "#22c55e",
  red: "#ef4444",
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
// バックテストページ
// ========================================
export default function BacktestPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  // 設定
  const [selectedSystem, setSelectedSystem] = useState("happiness-plus");
  const [startDate, setStartDate] = useState("2026-01-01");
  const [endDate, setEndDate] = useState("2026-01-31");
  const [deposit, setDeposit] = useState(300000);

  // バックテスト状態
  const [phase, setPhase] = useState<Phase>("setup");
  const [allTrades, setAllTrades] = useState<VirtualTrade[]>([]);
  const [allSnapshots, setAllSnapshots] = useState<DailySnapshot[]>([]);
  const [animState, setAnimState] = useState<AnimState>({
    dayIndex: 0,
    tradeIndex: 0,
    currentTrade: null,
    visibleSnapshots: [],
    visibleTrades: [],
    stats: { totalTrades: 0, wins: 0, losses: 0, totalProfit: 0, maxDrawdown: 0, maxProfit: 0 },
  });
  const animTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // プロフィール読み込み
  useEffect(() => {
    const load = async () => {
      if (isDemoMode()) {
        const demo = getDemoProfile();
        if (demo) {
          setProfile({
            user_id: demo.user_id,
            virtual_deposit: demo.virtual_deposit || 300000,
            lot_size: demo.lot_size || 0.03,
          });
          setDeposit(demo.virtual_deposit || 300000);
        }
        setLoading(false);
        return;
      }
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.replace("/fiana/register"); return; }
      const { data } = await supabase
        .from("fiana_profiles")
        .select("user_id, virtual_deposit, lot_size")
        .eq("user_id", session.user.id)
        .single();
      if (data) {
        setProfile(data as UserProfile);
        setDeposit(data.virtual_deposit || 300000);
      }
      setLoading(false);
    };
    load();
  }, [router]);

  const selectedSystemInfo = useMemo(
    () => EA_SYSTEMS.find((s) => s.id === selectedSystem) || EA_SYSTEMS[0],
    [selectedSystem]
  );

  const lotForDeposit = useMemo(() => {
    const opt = DEPOSIT_OPTIONS.find((o) => o.amount === deposit);
    return opt ? opt.lot : deposit / 10000000;
  }, [deposit]);

  // ========================================
  // バックテスト開始
  // ========================================
  const startBacktest = useCallback(() => {
    if (!profile) return;

    const { trades, snapshots } = generateAllTrades(
      profile.user_id,
      selectedSystem,
      selectedSystemInfo.name,
      lotForDeposit,
      deposit,
      startDate,
      endDate
    );

    setAllTrades(trades);
    setAllSnapshots(snapshots);
    setPhase("running");
    setAnimState({
      dayIndex: 0,
      tradeIndex: 0,
      currentTrade: null,
      visibleSnapshots: [],
      visibleTrades: [],
      stats: { totalTrades: 0, wins: 0, losses: 0, totalProfit: 0, maxDrawdown: 0, maxProfit: 0 },
    });
  }, [profile, selectedSystem, selectedSystemInfo, lotForDeposit, deposit, startDate, endDate]);

  // ========================================
  // アニメーション制御
  // ========================================
  useEffect(() => {
    if (phase !== "running" || allSnapshots.length === 0) return;

    const totalDays = allSnapshots.length;
    // 60秒で全日程を消化 → 1日あたりの基本時間
    const baseDelay = Math.max(200, Math.min(3000, 60000 / totalDays));

    // 各日の取引を集める
    const tradesByDay: Record<string, VirtualTrade[]> = {};
    for (const t of allTrades) {
      if (!tradesByDay[t.tradeDate]) tradesByDay[t.tradeDate] = [];
      tradesByDay[t.tradeDate].push(t);
    }

    let currentDay = 0;
    let currentTradeIdx = 0;
    let stats = { totalTrades: 0, wins: 0, losses: 0, totalProfit: 0, maxDrawdown: 0, maxProfit: 0 };

    const tick = () => {
      if (currentDay >= totalDays) {
        setPhase("complete");
        return;
      }

      const snap = allSnapshots[currentDay];
      const dayTrades = tradesByDay[snap.date] || [];

      if (currentTradeIdx < dayTrades.length) {
        // 個別取引のアニメーション
        const trade = dayTrades[currentTradeIdx];
        stats.totalTrades++;
        if (trade.pips > 0) stats.wins++;
        else stats.losses++;
        stats.totalProfit += trade.profitJpy;
        stats.maxProfit = Math.max(stats.maxProfit, stats.totalProfit);
        stats.maxDrawdown = Math.min(stats.maxDrawdown, stats.totalProfit);

        setAnimState((prev) => ({
          ...prev,
          dayIndex: currentDay,
          tradeIndex: currentTradeIdx,
          currentTrade: trade,
          visibleTrades: [...prev.visibleTrades, trade].slice(-10),
          stats: { ...stats },
        }));

        currentTradeIdx++;
        // 取引間は短いインターバル
        animTimerRef.current = setTimeout(tick, Math.max(100, baseDelay / (dayTrades.length + 1)));
      } else {
        // 日の完了 → スナップショット追加
        setAnimState((prev) => ({
          ...prev,
          dayIndex: currentDay,
          tradeIndex: 0,
          currentTrade: null,
          visibleSnapshots: [...prev.visibleSnapshots, snap],
          stats: { ...stats },
        }));

        currentDay++;
        currentTradeIdx = 0;
        // 日の切り替わりは少し間をおく
        animTimerRef.current = setTimeout(tick, baseDelay * 0.6);
      }
    };

    // 初回スタート
    animTimerRef.current = setTimeout(tick, 500);

    return () => {
      if (animTimerRef.current) clearTimeout(animTimerRef.current);
    };
  }, [phase, allTrades, allSnapshots]);

  // スキップ
  const skipAnimation = useCallback(() => {
    if (animTimerRef.current) clearTimeout(animTimerRef.current);

    let stats = { totalTrades: 0, wins: 0, losses: 0, totalProfit: 0, maxDrawdown: 0, maxProfit: 0 };
    let running = 0;
    for (const t of allTrades) {
      stats.totalTrades++;
      if (t.pips > 0) stats.wins++;
      else stats.losses++;
      running += t.profitJpy;
      stats.maxProfit = Math.max(stats.maxProfit, running);
      stats.maxDrawdown = Math.min(stats.maxDrawdown, running);
    }
    stats.totalProfit = running;

    setAnimState({
      dayIndex: allSnapshots.length - 1,
      tradeIndex: 0,
      currentTrade: null,
      visibleSnapshots: allSnapshots,
      visibleTrades: allTrades.slice(-10),
      stats,
    });
    setPhase("complete");
  }, [allTrades, allSnapshots]);

  // ========================================
  // ローディング
  // ========================================
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // ========================================
  // 設定画面
  // ========================================
  if (phase === "setup") {
    return (
      <div className="min-h-screen px-4 py-8">
        <div className="max-w-lg mx-auto fiana-slide-up">
          {/* ヘッダー */}
          <div className="flex items-center justify-between mb-6">
            <button
              onClick={() => router.push("/fiana/dashboard")}
              className="text-gray-400 hover:text-white text-sm transition-colors"
            >
              ← ダッシュボード
            </button>
            <h1 className="fiana-heading text-lg font-bold text-white">BACKTEST</h1>
            <div className="w-16" />
          </div>

          <div className="fiana-card p-6 mb-4">
            <h2 className="text-base font-bold text-white mb-4">バックテスト設定</h2>

            {/* システム選択 */}
            <div className="mb-4">
              <label className="text-sm text-gray-400 mb-2 block">検証システム</label>
              <div className="grid grid-cols-2 gap-2">
                {EA_SYSTEMS.filter((s) => s.fullAccess).map((sys) => (
                  <button
                    key={sys.id}
                    onClick={() => setSelectedSystem(sys.id)}
                    className={`flex items-center gap-2 p-3 rounded-xl border transition-all ${
                      selectedSystem === sys.id
                        ? "border-indigo-500 bg-indigo-500/20 text-white"
                        : "border-white/10 bg-white/5 text-gray-400 hover:border-white/20"
                    }`}
                  >
                    <span className="text-xl">{sys.icon}</span>
                    <div className="text-left">
                      <p className="text-sm font-medium">{sys.name}</p>
                      <p className="text-[10px] opacity-60">{sys.style}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* 期間選択 */}
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div>
                <label className="text-sm text-gray-400 mb-1 block">開始日</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="fiana-input w-full"
                />
              </div>
              <div>
                <label className="text-sm text-gray-400 mb-1 block">終了日</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="fiana-input w-full"
                />
              </div>
            </div>

            {/* 仮想資金 */}
            <div className="mb-6">
              <label className="text-sm text-gray-400 mb-2 block">検証用資金</label>
              <div className="grid grid-cols-3 gap-2">
                {DEPOSIT_OPTIONS.slice(0, 3).map((opt) => (
                  <button
                    key={opt.amount}
                    onClick={() => setDeposit(opt.amount)}
                    className={`py-2 px-3 rounded-xl text-sm font-medium border transition-all ${
                      deposit === opt.amount
                        ? "border-indigo-500 bg-indigo-500/20 text-white"
                        : "border-white/10 bg-white/5 text-gray-400 hover:border-white/20"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 検証サマリー */}
            <div className="bg-white/5 rounded-xl p-4 mb-6">
              <div className="grid grid-cols-3 gap-3 text-center text-sm">
                <div>
                  <p className="text-gray-500 text-xs">システム</p>
                  <p className="text-white font-medium">{selectedSystemInfo.icon} {selectedSystemInfo.name}</p>
                </div>
                <div>
                  <p className="text-gray-500 text-xs">資金</p>
                  <p className="text-white font-medium">{formatJPYPlain(deposit)}</p>
                </div>
                <div>
                  <p className="text-gray-500 text-xs">Lot</p>
                  <p className="text-white font-medium">{lotForDeposit}</p>
                </div>
              </div>
            </div>

            <button
              onClick={startBacktest}
              className="w-full py-4 text-white font-bold text-lg rounded-xl transition-all hover:scale-[1.02]"
              style={{
                background: "linear-gradient(135deg, #6366f1, #8b5cf6, #a855f7)",
                boxShadow: "0 8px 32px rgba(99,102,241,0.3)",
              }}
            >
              バックテストを開始
            </button>
          </div>

          <p className="text-center text-xs text-gray-600">
            ※シミュレーションに基づく過去検証です。将来の利益を保証するものではありません。
          </p>
        </div>
      </div>
    );
  }

  // ========================================
  // 実行中 / 完了画面
  // ========================================
  const progress = allSnapshots.length > 0
    ? Math.round((animState.visibleSnapshots.length / allSnapshots.length) * 100)
    : 0;

  const finalStats = animState.stats;
  const winRate = finalStats.totalTrades > 0
    ? ((finalStats.wins / finalStats.totalTrades) * 100).toFixed(1)
    : "0.0";
  const returnRate = deposit > 0
    ? ((finalStats.totalProfit / deposit) * 100).toFixed(2)
    : "0.00";

  const chartData = animState.visibleSnapshots.map((s) => ({
    date: s.date,
    asset: s.totalAsset,
    pnl: s.cumulativePnl,
  }));

  return (
    <div className="min-h-screen px-4 py-6">
      <div className="max-w-lg mx-auto">
        {/* ヘッダー */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <span className="text-xl">{selectedSystemInfo.icon}</span>
            <div>
              <h1 className="fiana-heading text-base font-bold text-white">
                {selectedSystemInfo.name} バックテスト
              </h1>
              <p className="text-[10px] text-gray-500">
                {startDate} 〜 {endDate}
              </p>
            </div>
          </div>
          {phase === "running" && (
            <button
              onClick={skipAnimation}
              className="text-xs text-gray-500 hover:text-white border border-white/10 px-3 py-1.5 rounded-lg transition-colors"
            >
              スキップ →
            </button>
          )}
          {phase === "complete" && (
            <button
              onClick={() => { setPhase("setup"); setAllTrades([]); setAllSnapshots([]); }}
              className="text-xs text-indigo-400 hover:text-indigo-300 border border-indigo-500/30 px-3 py-1.5 rounded-lg transition-colors"
            >
              再設定
            </button>
          )}
        </div>

        {/* プログレスバー */}
        {phase === "running" && (
          <div className="mb-4">
            <div className="flex justify-between text-xs text-gray-500 mb-1">
              <span>検証中...</span>
              <span>{progress}%</span>
            </div>
            <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{
                  width: `${progress}%`,
                  background: "linear-gradient(90deg, #6366f1, #a855f7)",
                }}
              />
            </div>
            {animState.visibleSnapshots.length > 0 && (
              <p className="text-xs text-gray-600 mt-1 text-center">
                {animState.visibleSnapshots[animState.visibleSnapshots.length - 1].date} を検証中
              </p>
            )}
          </div>
        )}

        {/* リアルタイムスタッツ */}
        <div
          className="rounded-2xl p-4 mb-4"
          style={{ background: "linear-gradient(135deg, #0f0c29, #302b63, #24243e)" }}
        >
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div className="bg-white/10 rounded-xl p-3">
              <p className="text-[10px] text-gray-400 mb-0.5">累計損益</p>
              <p className={`text-xl font-bold ${finalStats.totalProfit >= 0 ? "text-green-300" : "text-red-300"}`}>
                {formatJPY(finalStats.totalProfit)}
              </p>
              <p className="text-[10px] text-gray-500">
                収益率 {returnRate}%
              </p>
            </div>
            <div className="bg-white/10 rounded-xl p-3">
              <p className="text-[10px] text-gray-400 mb-0.5">取引回数</p>
              <p className="text-xl font-bold text-white">{finalStats.totalTrades}回</p>
              <p className="text-[10px] text-gray-500">
                勝率 {winRate}%
              </p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="bg-white/5 rounded-lg p-2 text-center">
              <p className="text-[10px] text-gray-500">勝ち</p>
              <p className="text-sm font-bold text-green-400">{finalStats.wins}</p>
            </div>
            <div className="bg-white/5 rounded-lg p-2 text-center">
              <p className="text-[10px] text-gray-500">負け</p>
              <p className="text-sm font-bold text-red-400">{finalStats.losses}</p>
            </div>
            <div className="bg-white/5 rounded-lg p-2 text-center">
              <p className="text-[10px] text-gray-500">最大DD</p>
              <p className="text-sm font-bold text-orange-400">
                {formatJPY(finalStats.maxDrawdown)}
              </p>
            </div>
          </div>
        </div>

        {/* リアルタイム取引フィード */}
        {animState.currentTrade && phase === "running" && (
          <div
            className={`rounded-xl p-3 mb-3 border animate-pulse ${
              animState.currentTrade.pips > 0
                ? "border-green-500/40 bg-green-500/10"
                : "border-red-500/40 bg-red-500/10"
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span
                  className={`text-xs font-bold px-2 py-0.5 rounded ${
                    animState.currentTrade.direction === "BUY"
                      ? "bg-indigo-500/30 text-indigo-300"
                      : "bg-orange-500/30 text-orange-300"
                  }`}
                >
                  {animState.currentTrade.direction}
                </span>
                <span className="text-xs text-gray-400">
                  {animState.currentTrade.tradeDate.slice(5)} {animState.currentTrade.tradeTime}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-gray-500">
                  {animState.currentTrade.pips > 0 ? "+" : ""}{animState.currentTrade.pips}pips
                </span>
                <span
                  className={`text-sm font-bold ${
                    animState.currentTrade.pips > 0 ? "text-green-400" : "text-red-400"
                  }`}
                >
                  {formatJPY(animState.currentTrade.profitJpy)}
                </span>
              </div>
            </div>
            <div className="mt-1 text-xs text-gray-500">
              <span className="font-mono">
                {animState.currentTrade.entryPrice.toFixed(3)} → {animState.currentTrade.exitPrice.toFixed(3)}
              </span>
              <span className="ml-2">{animState.currentTrade.lot}lot</span>
            </div>
          </div>
        )}

        {/* 資産推移チャート */}
        {chartData.length > 1 && (
          <div className="fiana-card p-4 mb-4">
            <h3 className="text-sm font-bold text-gray-300 mb-3">
              資産推移
              {phase === "running" && (
                <span className="ml-2 text-xs text-indigo-400 animate-pulse">LIVE</span>
              )}
            </h3>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="btGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop
                        offset="5%"
                        stopColor={finalStats.totalProfit >= 0 ? CHART_COLORS.green : CHART_COLORS.red}
                        stopOpacity={0.3}
                      />
                      <stop
                        offset="95%"
                        stopColor={finalStats.totalProfit >= 0 ? CHART_COLORS.green : CHART_COLORS.red}
                        stopOpacity={0}
                      />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={CHART_COLORS.grid} />
                  <XAxis
                    dataKey="date"
                    tickFormatter={formatDate}
                    tick={{ fontSize: 10, fill: CHART_COLORS.axis }}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: CHART_COLORS.axis }}
                    tickFormatter={(v: number) =>
                      v >= 10000 ? `${(v / 10000).toFixed(1)}万` : `${v}`
                    }
                    domain={["dataMin - 500", "dataMax + 500"]}
                  />
                  <Tooltip
                    {...TOOLTIP_STYLE}
                    formatter={(value) => [formatJPYPlain(Number(value)), "資産"]}
                    labelFormatter={(label) => String(label)}
                  />
                  <Area
                    type="monotone"
                    dataKey="asset"
                    stroke={finalStats.totalProfit >= 0 ? CHART_COLORS.green : CHART_COLORS.red}
                    fill="url(#btGrad)"
                    strokeWidth={2}
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* 直近の取引ログ */}
        {animState.visibleTrades.length > 0 && (
          <div className="fiana-card p-4 mb-4">
            <h3 className="text-sm font-bold text-gray-300 mb-3">
              取引ログ（直近{animState.visibleTrades.length}件）
            </h3>
            <div className="space-y-1.5">
              {[...animState.visibleTrades].reverse().map((trade) => (
                <div
                  key={trade.id}
                  className={`flex items-center justify-between py-2 px-2 rounded-lg text-xs ${
                    trade.pips > 0 ? "bg-green-500/5" : "bg-red-500/5"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`font-bold px-1.5 py-0.5 rounded ${
                        trade.direction === "BUY"
                          ? "bg-indigo-500/20 text-indigo-300"
                          : "bg-orange-500/20 text-orange-300"
                      }`}
                    >
                      {trade.direction}
                    </span>
                    <span className="text-gray-500">{trade.tradeDate.slice(5)} {trade.tradeTime}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-gray-500">{trade.pips > 0 ? "+" : ""}{trade.pips}p</span>
                    <span className={`font-bold ${trade.pips > 0 ? "text-green-400" : "text-red-400"}`}>
                      {formatJPY(trade.profitJpy)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 完了時のまとめ */}
        {phase === "complete" && (
          <div className="space-y-4 fiana-slide-up">
            <div
              className="rounded-2xl p-6 text-center"
              style={{
                background: "linear-gradient(135deg, #064e3b, #065f46, #047857)",
                boxShadow: "0 8px 32px rgba(16,185,129,0.2)",
              }}
            >
              <p className="text-emerald-200/70 text-sm mb-2">バックテスト完了</p>
              <p className="text-3xl font-bold text-white mb-1">
                {formatJPYPlain(deposit + finalStats.totalProfit)}
              </p>
              <p className="text-emerald-300 text-sm">
                元本 {formatJPYPlain(deposit)} → 収益 {formatJPY(finalStats.totalProfit)}（{returnRate}%）
              </p>
            </div>

            <div className="fiana-card p-4">
              <h3 className="text-sm font-bold text-gray-300 mb-3">検証サマリー</h3>
              <div className="space-y-2">
                {[
                  { label: "検証期間", value: `${startDate} 〜 ${endDate}` },
                  { label: "検証日数", value: `${allSnapshots.length}営業日` },
                  { label: "総取引回数", value: `${finalStats.totalTrades}回` },
                  { label: "勝ち / 負け", value: `${finalStats.wins}勝 / ${finalStats.losses}敗` },
                  { label: "勝率", value: `${winRate}%` },
                  { label: "最大利益到達", value: formatJPY(finalStats.maxProfit) },
                  { label: "最大ドローダウン", value: formatJPY(finalStats.maxDrawdown) },
                ].map((row) => (
                  <div key={row.label} className="flex justify-between py-1.5 border-b border-white/5">
                    <span className="text-sm text-gray-400">{row.label}</span>
                    <span className="text-sm text-white font-medium">{row.value}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* 個別相談CTA */}
            <div
              className="rounded-2xl p-5 border"
              style={{
                background:
                  "linear-gradient(135deg, rgba(99,102,241,0.18), rgba(139,92,246,0.1))",
                borderColor: "rgba(139,92,246,0.35)",
                boxShadow: "0 0 30px rgba(99,102,241,0.2)",
              }}
            >
              <div className="text-center mb-4">
                <div className="text-3xl mb-2">💬</div>
                <h3 className="fiana-heading text-base font-bold text-white mb-2">
                  あなたの{formatJPYPlain(deposit)}で検証した結果、{formatJPY(finalStats.totalProfit)}
                </h3>
                <p className="text-xs text-gray-300 leading-relaxed">
                  この結果をもとに、あなた専用の運用プランを資産運用アドバイザーが無料で個別に作成します。
                </p>
              </div>
              <a
                href={LINE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="block w-full text-center py-3.5 text-sm font-bold rounded-xl text-white"
                style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)" }}
              >
                無料で個別相談を予約する
              </a>
              <p className="text-center text-[10px] text-gray-500 mt-2">
                LINEで相談日時を調整します
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => { setPhase("setup"); setAllTrades([]); setAllSnapshots([]); }}
                className="py-3 text-sm font-medium text-gray-300 bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 transition-colors"
              >
                別の条件で検証
              </button>
              <button
                onClick={() => router.push("/fiana/dashboard")}
                className="py-3 text-sm font-medium text-white rounded-xl transition-all"
                style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)" }}
              >
                ダッシュボードへ
              </button>
            </div>

            <p className="text-center text-xs text-gray-600 mt-2">
              ※シミュレーションに基づく過去検証です。将来の利益を保証するものではありません。
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

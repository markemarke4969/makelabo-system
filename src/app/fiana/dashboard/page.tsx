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
  POINT_ACTIONS,
  SYSTEM_UNLOCK_COSTS,
  FIA_LEVELS,
  pointsToNextLevel,
  formatFia,
  isEarlyBird,
  getDemoPoints,
  getDemoTotalEarned,
  getDemoLedger,
  getDemoCheckins,
  addDemoPoints,
  type LedgerEntry,
} from "@/lib/fia-points";
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
  const [activeTab, setActiveTab] = useState<"portfolio" | "trades" | "inflation" | "fia">("portfolio");
  const [activeSystem, setActiveSystem] = useState("happiness-plus");
  const [now, setNow] = useState(new Date());

  // インフレ体感用（項目別固定費）
  const [expenses, setExpenses] = useState({
    rent: "",
    utilities: "",
    telecom: "",
    insurance: "",
    food: "",
    other: "",
  });
  const [inflationResult, setInflationResult] = useState<{
    totalMonthly: number;
    yearlyDiff: number;
    yearlyTotal: number;
    projections: {
      year: number;
      noAction: number; // 何もしない場合の累計支出増
      withInvest: number; // 運用した場合の資産
      diff: number; // 差額
    }[];
  } | null>(null);

  // fiaポイント
  const [fiaPoints, setFiaPoints] = useState(0);
  const [fiaTotalEarned, setFiaTotalEarned] = useState(0);
  const [fiaLedger, setFiaLedger] = useState<LedgerEntry[]>([]);
  const [fiaTodayCheckins, setFiaTodayCheckins] = useState<string[]>([]);
  const [fiaEarnAnim, setFiaEarnAnim] = useState<{ amount: number; label: string } | null>(null);
  const [fiaUnlocks, setFiaUnlocks] = useState<{ system_id: string; expires_at: string }[]>([]);
  const [unlockConfirm, setUnlockConfirm] = useState<string | null>(null); // systemId to confirm

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

  // fiaポイント読み込み
  useEffect(() => {
    if (!profile) return;
    const loadPoints = async () => {
      if (isDemoMode()) {
        const today = new Date().toISOString().split("T")[0];
        setFiaPoints(getDemoPoints());
        setFiaTotalEarned(getDemoTotalEarned());
        setFiaLedger(getDemoLedger().slice(0, 50));
        setFiaTodayCheckins(getDemoCheckins(today));
        return;
      }
      try {
        const res = await fetch("/api/fiana/points");
        if (res.ok) {
          const data = await res.json();
          setFiaPoints(data.points);
          setFiaTotalEarned(data.totalEarned);
          setFiaLedger(data.ledger);
          setFiaTodayCheckins(data.todayCheckins);
          setFiaUnlocks(data.activeUnlocks || []);
        }
      } catch {
        // ポイント取得失敗は無視
      }
    };
    loadPoints();
  }, [profile]);

  // デイリーログインポイント自動付与
  useEffect(() => {
    if (!profile) return;
    const claimLogin = async () => {
      const today = new Date().toISOString().split("T")[0];
      if (isDemoMode()) {
        const checkins = getDemoCheckins(today);
        if (!checkins.includes("daily_login")) {
          const result = addDemoPoints("daily_login", 10, "デイリーログイン");
          if (result.success) {
            setFiaPoints(result.newBalance);
            setFiaTotalEarned(getDemoTotalEarned());
            setFiaTodayCheckins(getDemoCheckins(today));
            if (result.entry) setFiaLedger((prev) => [result.entry!, ...prev]);
            showEarnAnimation(10, "デイリーログイン");
          }
        }
        // 早起きボーナス
        if (isEarlyBird() && !checkins.includes("early_bird")) {
          const result = addDemoPoints("early_bird", 10, "早起きチェックイン");
          if (result.success) {
            setFiaPoints(result.newBalance);
            setFiaTotalEarned(getDemoTotalEarned());
            setFiaTodayCheckins(getDemoCheckins(today));
            if (result.entry) setFiaLedger((prev) => [result.entry!, ...prev]);
            setTimeout(() => showEarnAnimation(10, "早起きボーナス"), 2000);
          }
        }
        return;
      }
      try {
        const res = await fetch("/api/fiana/points", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "daily_login" }),
        });
        if (res.ok) {
          const data = await res.json();
          setFiaPoints(data.points);
          setFiaTotalEarned(data.totalEarned);
          showEarnAnimation(data.earned, "デイリーログイン");
        }
        // 早起きボーナス
        if (isEarlyBird()) {
          const earlyRes = await fetch("/api/fiana/points", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "early_bird" }),
          });
          if (earlyRes.ok) {
            const data = await earlyRes.json();
            setFiaPoints(data.points);
            setFiaTotalEarned(data.totalEarned);
            setTimeout(() => showEarnAnimation(data.earned, "早起きボーナス"), 2000);
          }
        }
      } catch {
        // ログインポイント付与失敗は無視
      }
    };
    claimLogin();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile]);

  const showEarnAnimation = useCallback((amount: number, label: string) => {
    setFiaEarnAnim({ amount, label });
    setTimeout(() => setFiaEarnAnim(null), 3000);
  }, []);

  const claimFiaAction = useCallback(
    async (action: string) => {
      const actionDef = POINT_ACTIONS.find((a) => a.action === action);
      if (!actionDef) return;

      if (isDemoMode()) {
        const result = addDemoPoints(action, actionDef.points, actionDef.label);
        if (result.success) {
          const today = new Date().toISOString().split("T")[0];
          setFiaPoints(result.newBalance);
          setFiaTotalEarned(getDemoTotalEarned());
          setFiaTodayCheckins(getDemoCheckins(today));
          if (result.entry) setFiaLedger((prev) => [result.entry!, ...prev]);
          showEarnAnimation(actionDef.points, actionDef.label);
        }
        return;
      }

      try {
        const res = await fetch("/api/fiana/points", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        });
        if (res.ok) {
          const data = await res.json();
          setFiaPoints(data.points);
          setFiaTotalEarned(data.totalEarned);
          showEarnAnimation(data.earned, actionDef.label);
          // チェックイン更新
          setFiaTodayCheckins((prev) => [...prev, action]);
        }
      } catch {
        // 失敗は無視
      }
    },
    [showEarnAnimation]
  );

  const unlockSystem = useCallback(
    async (systemId: string) => {
      const cost = SYSTEM_UNLOCK_COSTS.find((c) => c.systemId === systemId);
      if (!cost) return;

      if (isDemoMode()) {
        const result = addDemoPoints(
          "system_unlock",
          -cost.fiaCost,
          `${systemId} 体験開放`
        );
        if (result.success) {
          const today = new Date().toISOString().split("T")[0];
          setFiaPoints(result.newBalance);
          setFiaTotalEarned(getDemoTotalEarned());
          setFiaTodayCheckins(getDemoCheckins(today));
          if (result.entry) setFiaLedger((prev) => [result.entry!, ...prev]);
          const expiresAt = new Date(
            Date.now() + cost.durationHours * 60 * 60 * 1000
          ).toISOString();
          setFiaUnlocks((prev) => [
            ...prev,
            { system_id: systemId, expires_at: expiresAt },
          ]);
        }
        setUnlockConfirm(null);
        return;
      }

      try {
        const res = await fetch("/api/fiana/points", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "system_unlock", systemId }),
        });
        if (res.ok) {
          const data = await res.json();
          setFiaPoints(data.points);
          setFiaUnlocks((prev) => [
            ...prev,
            { system_id: systemId, expires_at: data.expires_at },
          ]);
        }
      } catch {
        // 失敗は無視
      }
      setUnlockConfirm(null);
    },
    [showEarnAnimation]
  );

  const isSystemUnlocked = useCallback(
    (systemId: string) => {
      return fiaUnlocks.some(
        (u) =>
          u.system_id === systemId &&
          new Date(u.expires_at) > new Date()
      );
    },
    [fiaUnlocks]
  );

  const fiaLevelInfo = useMemo(() => pointsToNextLevel(fiaTotalEarned), [fiaTotalEarned]);

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

    const unlockedIds = fiaUnlocks
      .filter((u) => new Date(u.expires_at) > new Date())
      .map((u) => u.system_id);

    return EA_SYSTEMS.filter((s) => s.fullAccess || unlockedIds.includes(s.id)).map((sys) => {
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
  }, [profile, today, trialInfo, fiaUnlocks]);

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
    const vals = Object.values(expenses).map((v) => parseInt(v, 10) || 0);
    const totalMonthly = vals.reduce((a, b) => a + b, 0);
    if (totalMonthly <= 0) return;

    const inflationRate = 0.03;
    const yearlyTotal = totalMonthly * 12;
    const yearlyDiff = Math.round(yearlyTotal * inflationRate);
    const monthlyInvestReturn = 0.015; // 月利1.5%（年利約20%）

    const projections: {
      year: number;
      noAction: number;
      withInvest: number;
      diff: number;
    }[] = [];

    for (const targetYear of [1, 3, 5, 10]) {
      // インフレで増える累計支出（複利）
      let cumulativeInflation = 0;
      for (let y = 1; y <= targetYear; y++) {
        cumulativeInflation += yearlyTotal * (Math.pow(1 + inflationRate, y) - 1);
      }
      cumulativeInflation = Math.round(cumulativeInflation);

      // インフレ差額を月々運用に回した場合の資産
      let invested = 0;
      const monthlyExtra = yearlyDiff / 12;
      for (let m = 0; m < targetYear * 12; m++) {
        invested += monthlyExtra;
        invested *= 1 + monthlyInvestReturn;
      }
      invested = Math.round(invested);

      projections.push({
        year: targetYear,
        noAction: cumulativeInflation,
        withInvest: invested,
        diff: invested + cumulativeInflation,
      });
    }

    setInflationResult({
      totalMonthly,
      yearlyDiff,
      yearlyTotal,
      projections,
    });
  }, [expenses]);

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
              <p className="text-3xl font-bold text-green-300 fiana-amount fiana-text-glow-green">
                {formatJPY(totalProfit)}
              </p>
              <p className="text-sm text-green-500/70 mt-1 fiana-amount">
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
    <div className="min-h-screen pb-28">
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
            <button
              onClick={() => setActiveTab("fia")}
              className="flex items-center gap-1 bg-amber-500/20 px-2.5 py-1 rounded-lg border border-amber-500/30 hover:bg-amber-500/30 transition-colors"
            >
              <span className="text-xs">{fiaLevelInfo.current.icon}</span>
              <span className="text-xs font-bold text-amber-300 fiana-amount">{fiaPoints.toLocaleString()}</span>
              <span className="text-[10px] text-amber-400/70 fiana-label">fia</span>
            </button>
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

      {/* タブ切り替え（画面下部に固定） */}
      <div
        className="fixed bottom-0 left-0 right-0 z-30 px-4 pb-[env(safe-area-inset-bottom)] border-t"
        style={{
          background: "rgba(10, 10, 15, 0.97)",
          backdropFilter: "blur(12px)",
          borderColor: "rgba(255,255,255,0.08)",
        }}
      >
        <div className="max-w-lg mx-auto flex pt-2 pb-2">
          {[
            { key: "portfolio" as const, icon: "📈", label: "運用" },
            { key: "trades" as const, icon: "📋", label: "取引ログ" },
            { key: "fia" as const, icon: "🔥", label: "fia" },
            { key: "inflation" as const, icon: "💡", label: "家計" },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex-1 flex flex-col items-center gap-0.5 py-2 rounded-xl transition-all ${
                activeTab === tab.key
                  ? "text-indigo-400"
                  : "text-gray-600"
              }`}
            >
              <span className="text-xl leading-none">{tab.icon}</span>
              <span className={`text-[10px] font-medium ${
                activeTab === tab.key ? "text-indigo-300" : "text-gray-600"
              }`}>{tab.label}</span>
              {activeTab === tab.key && (
                <span className="w-4 h-0.5 rounded-full bg-indigo-500 mt-0.5" />
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-4">

        {/* チャートタブ */}
        {activeTab === "portfolio" && (
          <div className="space-y-4">
            {/* システム切り替え */}
            <div className="flex gap-2 overflow-x-auto pb-1">
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
              {EA_SYSTEMS.filter((s) => !s.fullAccess).map((sys) => {
                const unlocked = isSystemUnlocked(sys.id);
                const cost = SYSTEM_UNLOCK_COSTS.find((c) => c.systemId === sys.id);
                if (unlocked) {
                  return (
                    <button
                      key={sys.id}
                      onClick={() => setActiveSystem(sys.id)}
                      className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all ${
                        activeSystem === sys.id
                          ? "bg-amber-500 text-black shadow-lg shadow-amber-500/30"
                          : "bg-amber-500/10 text-amber-300 border border-amber-500/30 hover:border-amber-500/50"
                      }`}
                    >
                      <span>{sys.icon}</span>
                      <span>{sys.name}</span>
                      <span className="text-[10px]">体験中</span>
                    </button>
                  );
                }
                return (
                  <button
                    key={sys.id}
                    onClick={() => setUnlockConfirm(sys.id)}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap bg-white/5 text-gray-500 border border-white/10 hover:border-amber-500/30 hover:text-amber-400 transition-all cursor-pointer"
                  >
                    <span>{sys.icon}</span>
                    <span>{sys.name}</span>
                    <span className="text-[10px] text-amber-500/60">{cost?.fiaCost}fia</span>
                  </button>
                );
              })}
            </div>

            {/* ポートフォリオサマリー */}
            <div
              className="rounded-2xl p-5 text-white"
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

              <p className="fiana-label mb-1">Total Assets</p>
              <p className="text-3xl font-bold mb-3 fiana-amount fiana-text-glow">
                {formatJPYPlain(totalAsset)}
              </p>

              <div className="grid grid-cols-2 gap-3">
                <div className="bg-white/10 rounded-xl p-3">
                  <p className="fiana-label">Today P&L</p>
                  <p className={`text-lg fiana-amount ${todayPnl >= 0 ? "text-green-300 fiana-text-glow-green" : "text-red-300"}`}>
                    {formatJPY(todayPnl)}
                  </p>
                  <p className="text-xs opacity-50 fiana-amount">
                    {todayPnl >= 0 ? "+" : ""}{todayPnlPercent}%
                  </p>
                </div>
                <div className="bg-white/10 rounded-xl p-3">
                  <p className="fiana-label">Total P&L</p>
                  <p className={`text-lg fiana-amount ${cumulativePnl >= 0 ? "text-green-300 fiana-text-glow-green" : "text-red-300"}`}>
                    {formatJPY(cumulativePnl)}
                  </p>
                  <p className="text-xs opacity-50 fiana-amount">
                    {cumulativePnl >= 0 ? "+" : ""}{pnlPercent}%
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between mt-3 text-xs opacity-50">
                <span>元本: {formatJPYPlain(profile.virtual_deposit)}</span>
                <span>運用開始: {trialInfo.elapsed}日目</span>
              </div>
            </div>

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
            {/* 取引ログ閲覧でポイント付与ボタン */}
            {!fiaTodayCheckins.includes("view_trade_log") && (
              <button
                onClick={() => claimFiaAction("view_trade_log")}
                className="w-full py-2 bg-amber-500/20 border border-amber-500/30 rounded-xl text-amber-300 text-sm font-medium hover:bg-amber-500/30 transition-colors"
              >
                取引ログを確認して +5 fia 獲得
              </button>
            )}
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

        {/* fiaポイントタブ */}
        {activeTab === "fia" && (
          <div className="space-y-4">
            {/* ポイント獲得アニメーション */}
            {fiaEarnAnim && (
              <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 animate-bounce">
                <div className="bg-amber-500 text-black font-bold px-6 py-3 rounded-2xl shadow-lg shadow-amber-500/40 text-center">
                  <p className="text-lg">+{fiaEarnAnim.amount} fia</p>
                  <p className="text-xs opacity-80">{fiaEarnAnim.label}</p>
                </div>
              </div>
            )}

            {/* ナメクジ育成カード */}
            <div
              className="rounded-2xl p-6 text-white relative overflow-hidden"
              style={{ background: "linear-gradient(135deg, #1a0a2e, #2d1b69, #1a2a4a)" }}
            >
              <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/10 rounded-full blur-3xl" />
              <div className="relative">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <p className="text-xs text-purple-300/70 mb-1">育成キャラクター</p>
                    <div className="flex items-center gap-2">
                      <span className="text-4xl">{fiaLevelInfo.current.icon}</span>
                      <div>
                        <p className="text-lg font-bold">{fiaLevelInfo.current.name}</p>
                        <p className="text-xs text-purple-300/60">Lv.{fiaLevelInfo.current.level}</p>
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="fiana-label text-amber-300/70 mb-1">fia balance</p>
                    <p className="text-2xl font-bold text-amber-300 fiana-amount fiana-text-glow-amber">{fiaPoints.toLocaleString()}</p>
                  </div>
                </div>

                <p className="text-sm text-purple-200/80 mb-3">{fiaLevelInfo.current.description}</p>

                {/* レベルアップ進捗バー */}
                {fiaLevelInfo.next ? (
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-purple-300/60">
                        次のレベル: {fiaLevelInfo.next.icon} {fiaLevelInfo.next.name}
                      </span>
                      <span className="text-purple-300/60">
                        あと {fiaLevelInfo.remaining.toLocaleString()} fia
                      </span>
                    </div>
                    <div className="w-full h-3 bg-white/10 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-1000"
                        style={{
                          width: `${fiaLevelInfo.progress}%`,
                          background: "linear-gradient(90deg, #f59e0b, #ef4444, #8b5cf6)",
                        }}
                      />
                    </div>
                    <p className="text-[10px] text-purple-400/50 mt-1 text-right">
                      {fiaLevelInfo.progress}% 完了
                    </p>
                  </div>
                ) : (
                  <div className="text-center py-2">
                    <p className="text-sm text-amber-300 font-bold">MAX LEVEL</p>
                  </div>
                )}

                {/* 全レベル表示 */}
                <div className="flex justify-between mt-4 px-2">
                  {FIA_LEVELS.map((lv) => (
                    <div
                      key={lv.level}
                      className={`text-center ${lv.level <= fiaLevelInfo.current.level ? "opacity-100" : "opacity-30"}`}
                    >
                      <span className="text-lg">{lv.icon}</span>
                      <p className="text-[10px] text-gray-400 mt-0.5">Lv.{lv.level}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* デイリーミッション */}
            <div className="fiana-card p-4">
              <h3 className="text-sm font-bold text-gray-300 mb-3">デイリーミッション</h3>
              <div className="space-y-2">
                {POINT_ACTIONS.filter((a) => a.daily).map((action) => {
                  const claimed = fiaTodayCheckins.includes(action.action);
                  return (
                    <div
                      key={action.action}
                      className={`flex items-center justify-between p-3 rounded-xl border transition-all ${
                        claimed
                          ? "border-green-500/20 bg-green-500/5"
                          : "border-white/10 bg-white/5 hover:border-amber-500/30"
                      }`}
                    >
                      <div className="flex-1">
                        <p className={`text-sm font-medium ${claimed ? "text-green-400" : "text-white"}`}>
                          {action.label}
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5">{action.description}</p>
                      </div>
                      <div className="flex items-center gap-2 ml-3">
                        <span className="text-xs font-bold text-amber-400">+{action.points}</span>
                        {claimed ? (
                          <span className="text-xs text-green-500 font-bold px-2 py-1 bg-green-500/10 rounded-lg">
                            済
                          </span>
                        ) : (
                          <button
                            onClick={() => claimFiaAction(action.action)}
                            className="text-xs font-bold px-3 py-1.5 bg-amber-500 text-black rounded-lg hover:bg-amber-400 transition-colors"
                          >
                            獲得
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 特別ボーナス */}
            <div className="fiana-card p-4">
              <h3 className="text-sm font-bold text-gray-300 mb-3">特別ボーナス</h3>
              <div className="space-y-2">
                {POINT_ACTIONS.filter((a) => !a.daily).map((action) => (
                  <div
                    key={action.action}
                    className="flex items-center justify-between p-3 rounded-xl border border-amber-500/20 bg-amber-500/5"
                  >
                    <div className="flex-1">
                      <p className="text-sm font-medium text-white">{action.label}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{action.description}</p>
                    </div>
                    <span className="text-sm font-bold text-amber-400 ml-3">
                      +{action.points.toLocaleString()} fia
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* ポイント履歴 */}
            <div className="fiana-card p-4">
              <h3 className="text-sm font-bold text-gray-300 mb-3">ポイント履歴</h3>
              {fiaLedger.length === 0 ? (
                <p className="text-gray-500 text-center py-6 text-sm">まだ履歴がありません</p>
              ) : (
                <div className="space-y-1.5 max-h-64 overflow-y-auto">
                  {fiaLedger.slice(0, 30).map((entry) => (
                    <div
                      key={entry.id}
                      className="flex items-center justify-between py-2 px-2 rounded-lg hover:bg-white/5"
                    >
                      <div>
                        <p className="text-sm text-gray-300">{entry.description}</p>
                        <p className="text-[10px] text-gray-600">
                          {new Date(entry.created_at).toLocaleString("ja-JP", {
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </p>
                      </div>
                      <span
                        className={`text-sm font-bold ${
                          entry.amount >= 0 ? "text-green-400" : "text-red-400"
                        }`}
                      >
                        {entry.amount >= 0 ? "+" : ""}{entry.amount} fia
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* インフレ体感タブ */}
        {activeTab === "inflation" && (
          <div className="space-y-4">
            {/* 固定費入力 */}
            <div className="fiana-card p-4">
              <h3 className="text-sm font-bold text-gray-300 mb-1">
                家計シミュレーター
              </h3>
              <p className="text-xs text-gray-500 mb-4">
                月々の固定費を入力して、インフレの影響と資産運用の効果を体感しましょう
              </p>

              <div className="space-y-3 mb-4">
                {[
                  { key: "rent" as const, label: "家賃・住宅ローン", placeholder: "80000" },
                  { key: "utilities" as const, label: "光熱費", placeholder: "20000" },
                  { key: "telecom" as const, label: "通信費", placeholder: "10000" },
                  { key: "insurance" as const, label: "保険料", placeholder: "15000" },
                  { key: "food" as const, label: "食費", placeholder: "50000" },
                  { key: "other" as const, label: "その他", placeholder: "30000" },
                ].map((item) => (
                  <div key={item.key} className="flex items-center gap-3">
                    <span className="text-sm text-gray-400 w-28 shrink-0">{item.label}</span>
                    <div className="flex-1 flex items-center gap-1">
                      <span className="text-gray-600 text-sm">¥</span>
                      <input
                        type="number"
                        value={expenses[item.key]}
                        onChange={(e) =>
                          setExpenses((prev) => ({ ...prev, [item.key]: e.target.value }))
                        }
                        placeholder={item.placeholder}
                        className="fiana-input w-full"
                      />
                    </div>
                  </div>
                ))}
              </div>

              {/* 合計と計算ボタン */}
              <div className="flex items-center justify-between bg-white/5 rounded-xl p-3 mb-4">
                <span className="text-sm text-gray-300 font-medium">月額合計</span>
                <span className="text-lg font-bold text-white">
                  ¥{Object.values(expenses)
                    .reduce((s, v) => s + (parseInt(v, 10) || 0), 0)
                    .toLocaleString()}
                </span>
              </div>

              <button
                onClick={() => {
                  calcInflation();
                  if (!fiaTodayCheckins.includes("inflation_check")) {
                    claimFiaAction("inflation_check");
                  }
                }}
                className="w-full py-3 bg-indigo-500 text-white font-bold text-sm rounded-xl hover:bg-indigo-400 transition-colors"
              >
                インフレ影響を計算する
              </button>
            </div>

            {/* 結果表示 */}
            {inflationResult && (
              <>
                {/* インフレ影響サマリー */}
                <div className="fiana-card p-4">
                  <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 mb-3">
                    <p className="text-sm text-red-400 font-medium mb-1">
                      インフレによる年間影響（年率3%想定）
                    </p>
                    <p className="text-2xl font-bold text-red-300">
                      年間 -¥{inflationResult.yearlyDiff.toLocaleString()}
                    </p>
                    <p className="text-xs text-red-500/70 mt-1">
                      月額{inflationResult.totalMonthly.toLocaleString()}円 ×
                      12ヶ月 × 3% = 年間{inflationResult.yearlyDiff.toLocaleString()}円の目減り
                    </p>
                  </div>

                  <p className="text-xs text-gray-500 text-center">
                    何もしなくても、あなたのお金は毎年これだけ価値を失っています
                  </p>
                </div>

                {/* 5年後/10年後比較 */}
                <div className="fiana-card p-4">
                  <h3 className="text-sm font-bold text-gray-300 mb-3">
                    何もしない vs 資産運用した場合
                  </h3>
                  <div className="space-y-3">
                    {inflationResult.projections.map((p) => (
                      <div key={p.year} className="rounded-xl border border-white/10 p-4">
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-sm font-bold text-white">{p.year}年後</span>
                          <span
                            className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                              p.year <= 3
                                ? "bg-yellow-500/20 text-yellow-400"
                                : "bg-green-500/20 text-green-400"
                            }`}
                          >
                            {p.year <= 3 ? "短期" : "長期"}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="bg-red-500/5 rounded-lg p-3">
                            <p className="text-[10px] text-red-400/70 mb-0.5">何もしない場合</p>
                            <p className="text-sm font-bold text-red-400">
                              -¥{p.noAction.toLocaleString()}
                            </p>
                            <p className="text-[10px] text-red-500/50">
                              インフレで失う額
                            </p>
                          </div>
                          <div className="bg-green-500/5 rounded-lg p-3">
                            <p className="text-[10px] text-green-400/70 mb-0.5">差額を運用した場合</p>
                            <p className="text-sm font-bold text-green-400">
                              +¥{p.withInvest.toLocaleString()}
                            </p>
                            <p className="text-[10px] text-green-500/50">
                              月利1.5%で運用
                            </p>
                          </div>
                        </div>
                        <div className="mt-2 bg-indigo-500/10 rounded-lg p-2 text-center">
                          <span className="text-xs text-indigo-300">
                            差額: <span className="font-bold">¥{(p.withInvest + p.noAction).toLocaleString()}</span>
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 気づきメッセージ */}
                <div
                  className="rounded-2xl p-5 text-center"
                  style={{
                    background: "linear-gradient(135deg, #1e1b4b, #312e81)",
                    boxShadow: "0 8px 32px rgba(99,102,241,0.15)",
                  }}
                >
                  <p className="text-lg font-bold text-white mb-2">
                    資産を「守る」だけでは足りない時代
                  </p>
                  <p className="text-sm text-indigo-200/80 leading-relaxed mb-4">
                    インフレは見えないコスト。<br />
                    10年後、あなたの{inflationResult.totalMonthly.toLocaleString()}円は<br />
                    実質{Math.round(inflationResult.totalMonthly * Math.pow(0.97, 10)).toLocaleString()}円の価値になります。
                  </p>
                  <p className="text-sm text-indigo-300/70">
                    小さな一歩が、大きな差になります。
                  </p>
                </div>
              </>
            )}
          </div>
        )}

        {/* バックテスト誘導 */}
        <div className="mt-6">
          <button
            onClick={() => {
              if (!fiaTodayCheckins.includes("run_backtest")) {
                claimFiaAction("run_backtest");
              }
              router.push("/fiana/backtest");
            }}
            className="w-full fiana-card p-4 flex items-center justify-between hover:border-indigo-500/30 transition-all group"
          >
            <div className="flex items-center gap-3">
              <span className="text-2xl">🔬</span>
              <div className="text-left">
                <p className="text-sm font-bold text-white group-hover:text-indigo-300 transition-colors">
                  バックテスト検証
                </p>
                <p className="text-xs text-gray-500">過去のデータでシステムの成績を検証</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {!fiaTodayCheckins.includes("run_backtest") && (
                <span className="text-[10px] text-amber-400 bg-amber-500/20 px-2 py-0.5 rounded-full">
                  +20 fia
                </span>
              )}
              <span className="text-gray-600 group-hover:text-indigo-400 transition-colors">→</span>
            </div>
          </button>
        </div>

        {/* LINE誘導 */}
        <div className="mt-4 fiana-card p-4 text-center">
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

      {/* fiaポイント獲得アニメーション（全タブ共通） */}
      {fiaEarnAnim && activeTab !== "fia" && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 animate-bounce">
          <div className="bg-amber-500 text-black font-bold px-6 py-3 rounded-2xl shadow-lg shadow-amber-500/40 text-center">
            <p className="text-lg">+{fiaEarnAnim.amount} fia</p>
            <p className="text-xs opacity-80">{fiaEarnAnim.label}</p>
          </div>
        </div>
      )}

      {/* システム体験開放確認モーダル */}
      {unlockConfirm && (() => {
        const sys = EA_SYSTEMS.find((s) => s.id === unlockConfirm);
        const cost = SYSTEM_UNLOCK_COSTS.find((c) => c.systemId === unlockConfirm);
        if (!sys || !cost) return null;
        const canAfford = fiaPoints >= cost.fiaCost;
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4">
            <div className="fiana-card p-6 max-w-sm w-full fiana-slide-up">
              <div className="text-center mb-4">
                <span className="text-4xl">{sys.icon}</span>
                <h3 className="text-lg font-bold text-white mt-2">{sys.name}</h3>
                <p className="text-sm text-gray-400 mt-1">{sys.description}</p>
              </div>

              <div className="bg-white/5 rounded-xl p-4 mb-4">
                <div className="flex justify-between mb-2">
                  <span className="text-sm text-gray-400">体験コスト</span>
                  <span className="text-sm font-bold text-amber-400">{cost.fiaCost} fia</span>
                </div>
                <div className="flex justify-between mb-2">
                  <span className="text-sm text-gray-400">体験期間</span>
                  <span className="text-sm text-white">{cost.durationHours}時間</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-400">保有fia</span>
                  <span className={`text-sm font-bold ${canAfford ? "text-green-400" : "text-red-400"}`}>
                    {fiaPoints.toLocaleString()} fia
                  </span>
                </div>
              </div>

              {canAfford ? (
                <button
                  onClick={() => unlockSystem(unlockConfirm)}
                  className="w-full py-3 bg-amber-500 text-black font-bold rounded-xl hover:bg-amber-400 transition-colors mb-2"
                >
                  {cost.fiaCost} fia で体験開放する
                </button>
              ) : (
                <div className="text-center py-3 bg-red-500/10 border border-red-500/20 rounded-xl mb-2">
                  <p className="text-sm text-red-400">ポイントが足りません</p>
                  <p className="text-xs text-red-500/60 mt-1">
                    あと {(cost.fiaCost - fiaPoints).toLocaleString()} fia 必要です
                  </p>
                </div>
              )}

              <button
                onClick={() => setUnlockConfirm(null)}
                className="w-full py-2 text-sm text-gray-500 hover:text-gray-300 transition-colors"
              >
                キャンセル
              </button>
            </div>
          </div>
        );
      })()}
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

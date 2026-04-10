// ========================================
// 仮想取引ログ生成エンジン
// ========================================
// ユーザーID + 日付でシード生成し、一貫性のある取引ログを生成
// DBに保存せず、クライアントサイドで毎回同じ結果を再現

import { calcProfitForPips } from "./fiana-config";

// ========================================
// シード付き疑似乱数生成器（Mulberry32）
// ========================================
function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 文字列からシード値を生成
function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return Math.abs(hash);
}

// ========================================
// 取引ログの型定義
// ========================================
export interface VirtualTrade {
  id: string;
  systemId: string;
  systemName: string;
  tradeDate: string; // YYYY-MM-DD
  tradeTime: string; // HH:MM
  direction: "BUY" | "SELL";
  lot: number;
  entryPrice: number;
  exitPrice: number;
  pips: number;
  profitJpy: number;
}

export interface DailySnapshot {
  date: string;
  totalAsset: number;
  dailyPnl: number;
  cumulativePnl: number;
  tradeCount: number;
}

// ========================================
// 取引時間帯の重み付け
// ========================================
// 東京(9-15), ロンドン(16-24), NY(22-翌6)に集中
const TRADE_HOURS = [
  { hour: 9, weight: 3 },
  { hour: 10, weight: 3 },
  { hour: 11, weight: 2 },
  { hour: 12, weight: 1 },
  { hour: 13, weight: 2 },
  { hour: 14, weight: 2 },
  { hour: 15, weight: 1 },
  { hour: 16, weight: 3 },
  { hour: 17, weight: 3 },
  { hour: 18, weight: 2 },
  { hour: 19, weight: 2 },
  { hour: 20, weight: 3 },
  { hour: 21, weight: 4 },
  { hour: 22, weight: 4 },
  { hour: 23, weight: 2 },
];

function pickTradeHour(rng: () => number): number {
  const totalWeight = TRADE_HOURS.reduce((sum, h) => sum + h.weight, 0);
  let r = rng() * totalWeight;
  for (const h of TRADE_HOURS) {
    r -= h.weight;
    if (r <= 0) return h.hour;
  }
  return 21;
}

// ========================================
// 1日の取引ログを生成
// ========================================
export function generateDayTrades(
  userId: string,
  systemId: string,
  systemName: string,
  dateStr: string, // YYYY-MM-DD
  lot: number,
  basePrice: number, // その日のUSD/JPY基準レート
  dayIndex: number // 運用開始からの日数（0始まり）
): VirtualTrade[] {
  const seed = hashString(`${userId}-${systemId}-${dateStr}`);
  const rng = mulberry32(seed);

  // 1日3〜5回の取引
  const tradeCount = 3 + Math.floor(rng() * 3); // 3,4,5

  // 週1-2回の損切り：dayIndex % 7 が特定値の場合
  const lossSeed = hashString(`loss-${userId}-${dateStr}`);
  const lossRng = mulberry32(lossSeed);
  const hasLoss = lossRng() < 0.25; // 約25%の日に損切りあり（週1-2回相当）
  const lossTradeIndex = Math.floor(lossRng() * tradeCount);

  const trades: VirtualTrade[] = [];
  const usedHours = new Set<number>();

  for (let i = 0; i < tradeCount; i++) {
    // 時間を決定（重複しないように）
    let hour: number;
    let attempts = 0;
    do {
      hour = pickTradeHour(rng);
      attempts++;
    } while (usedHours.has(hour) && attempts < 20);
    usedHours.add(hour);

    const minute = Math.floor(rng() * 60);
    const timeStr = `${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}`;

    // BUY/SELL ランダム
    const direction: "BUY" | "SELL" = rng() > 0.5 ? "BUY" : "SELL";

    // pips決定
    let pips: number;
    if (hasLoss && i === lossTradeIndex) {
      pips = -3; // 損切り
    } else {
      pips = 5; // 通常は+5pips利益
    }

    // 価格生成（自然なばらつき）
    const priceOffset = (rng() - 0.5) * 0.5; // ±0.25程度のばらつき
    const entryPrice = parseFloat((basePrice + priceOffset).toFixed(3));
    const pipValue = 0.001; // USD/JPYの場合0.001 = 0.1pips...
    // 実際: 1pip = 0.01 for JPY pairs (3桁表示の場合0.010)
    // USD/JPY: 149.820 → 149.870 で +5pips (+0.050)
    const exitPrice = parseFloat(
      (
        entryPrice +
        (direction === "BUY" ? pips * 0.01 : -pips * 0.01)
      ).toFixed(3)
    );

    const profitJpy = calcProfitForPips(lot, pips);

    trades.push({
      id: `${dateStr}-${systemId}-${i}`,
      systemId,
      systemName,
      tradeDate: dateStr,
      tradeTime: timeStr,
      direction,
      lot,
      entryPrice,
      exitPrice,
      pips,
      profitJpy,
    });
  }

  // 時間順にソート
  trades.sort((a, b) => a.tradeTime.localeCompare(b.tradeTime));

  return trades;
}

// ========================================
// 期間全体の取引ログと資産推移を生成
// ========================================
export function generateAllTrades(
  userId: string,
  systemId: string,
  systemName: string,
  lot: number,
  virtualDeposit: number,
  trialStartDate: string, // YYYY-MM-DD
  currentDate: string // YYYY-MM-DD
): { trades: VirtualTrade[]; snapshots: DailySnapshot[] } {
  const start = new Date(trialStartDate);
  const end = new Date(currentDate);
  const allTrades: VirtualTrade[] = [];
  const snapshots: DailySnapshot[] = [];

  // 基準レート（シードベースで一貫性のある値）
  const baseSeed = hashString(`base-${userId}-${trialStartDate}`);
  const baseRng = mulberry32(baseSeed);
  let basePrice = 148 + baseRng() * 4; // 148〜152の間

  let cumulativePnl = 0;
  let dayIndex = 0;

  const current = new Date(start);
  while (current <= end) {
    const dateStr = current.toISOString().split("T")[0];

    // 土日はスキップ
    const dayOfWeek = current.getDay();
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      current.setDate(current.getDate() + 1);
      continue;
    }

    // レートを微小変動（自然なウォーク）
    const dayRng = mulberry32(hashString(`price-${userId}-${dateStr}`));
    basePrice += (dayRng() - 0.48) * 0.3; // 少し上昇傾向
    basePrice = Math.max(145, Math.min(155, basePrice)); // 範囲制限

    const dayTrades = generateDayTrades(
      userId,
      systemId,
      systemName,
      dateStr,
      lot,
      basePrice,
      dayIndex
    );

    const dailyPnl = dayTrades.reduce((sum, t) => sum + t.profitJpy, 0);
    cumulativePnl += dailyPnl;

    allTrades.push(...dayTrades);
    snapshots.push({
      date: dateStr,
      totalAsset: virtualDeposit + cumulativePnl,
      dailyPnl,
      cumulativePnl,
      tradeCount: dayTrades.length,
    });

    dayIndex++;
    current.setDate(current.getDate() + 1);
  }

  return { trades: allTrades, snapshots };
}

// ========================================
// 市場状況の判定
// ========================================
export function getCurrentMarketSession(hour: number): string {
  if (hour >= 9 && hour < 15) return "東京市場";
  if (hour >= 16 && hour < 24) return "ロンドン市場";
  if (hour >= 22 || hour < 6) return "NY市場";
  return "市場閉場中";
}

export function isMarketOpen(hour: number, dayOfWeek: number): boolean {
  if (dayOfWeek === 0 || dayOfWeek === 6) return false;
  return hour >= 7 && hour <= 23;
}

// ========================================
// 日数計算ヘルパー
// ========================================
export function daysBetween(dateA: string, dateB: string): number {
  const a = new Date(dateA);
  const b = new Date(dateB);
  const diff = b.getTime() - a.getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

export function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export function formatDateFull(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getFullYear()}/${(d.getMonth() + 1).toString().padStart(2, "0")}/${d.getDate().toString().padStart(2, "0")}`;
}

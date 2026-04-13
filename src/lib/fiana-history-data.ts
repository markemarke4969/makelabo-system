// ========================================
// 口座履歴データ（MT4互換 / 資金別に正規化）
// ========================================
// HappinessPlus EA の実績を MT4 の履歴画面互換形式で保持。
// 4 つの資金ティア（10万/30万/50万/100万）に事前正規化して
// モジュールロード時に HISTORY_BY_CAPITAL を構築する。

export type CapitalTier = 100_000 | 300_000 | 500_000 | 1_000_000;

export interface TradeTemplate {
  id: string;
  symbol: string;
  direction: "BUY" | "SELL";
  openTime: string;  // "YYYY.MM.DD HH:MM:SS" (MT4 format)
  closeTime: string;
  openPrice: number;
  closePrice: number;
}

export interface TierTradeRow extends TradeTemplate {
  lot: number;
  profit: number; // 円
}

export interface HistorySnapshot {
  capital: CapitalTier;
  label: string;
  period: { start: string; end: string }; // "YYYY.MM.DD"
  totalProfit: number;
  winRate: number;    // 0-100
  tradeCount: number;
  winCount: number;
  lossCount: number;
  trades: TierTradeRow[];
}

export const CAPITAL_TIERS: readonly CapitalTier[] = [
  100_000, 300_000, 500_000, 1_000_000,
];

const PERIOD = { start: "2026.03.30", end: "2026.04.10" };

const TIER_LOT: Record<CapitalTier, number> = {
  100_000: 0.01,
  300_000: 0.03,
  500_000: 0.05,
  1_000_000: 0.10,
};

// HappinessPlus EA のベース実績（lot 0.10 / 資金 100万円基準）。
// 資金ティアは ratio = tier / 1,000,000 で lot / profit を比例スケール。
const TEMPLATES: ReadonlyArray<{ tpl: TradeTemplate; baseProfit: number }> = [
  { tpl: { id: "t-01", symbol: "USDJPY", direction: "BUY",  openTime: "2026.03.30 09:15:08", closeTime: "2026.03.30 10:42:33", openPrice: 151.210, closePrice: 151.444 }, baseProfit:  2340 },
  { tpl: { id: "t-02", symbol: "USDJPY", direction: "SELL", openTime: "2026.03.30 14:42:17", closeTime: "2026.03.30 15:38:05", openPrice: 151.420, closePrice: 151.238 }, baseProfit:  1820 },
  { tpl: { id: "t-03", symbol: "USDJPY", direction: "BUY",  openTime: "2026.03.31 10:08:22", closeTime: "2026.03.31 11:35:47", openPrice: 151.080, closePrice: 151.348 }, baseProfit:  2680 },
  { tpl: { id: "t-04", symbol: "USDJPY", direction: "BUY",  openTime: "2026.03.31 22:15:03", closeTime: "2026.03.31 23:18:29", openPrice: 151.020, closePrice: 151.232 }, baseProfit:  2120 },
  { tpl: { id: "t-05", symbol: "USDJPY", direction: "SELL", openTime: "2026.04.01 11:30:41", closeTime: "2026.04.01 12:14:22", openPrice: 151.150, closePrice: 151.304 }, baseProfit: -1540 },
  { tpl: { id: "t-06", symbol: "USDJPY", direction: "BUY",  openTime: "2026.04.01 17:55:11", closeTime: "2026.04.01 19:08:55", openPrice: 150.920, closePrice: 151.218 }, baseProfit:  2980 },
  { tpl: { id: "t-07", symbol: "USDJPY", direction: "BUY",  openTime: "2026.04.02 09:20:34", closeTime: "2026.04.02 10:45:18", openPrice: 150.880, closePrice: 151.104 }, baseProfit:  2240 },
  { tpl: { id: "t-08", symbol: "USDJPY", direction: "SELL", openTime: "2026.04.02 21:10:28", closeTime: "2026.04.02 22:34:03", openPrice: 151.230, closePrice: 151.015 }, baseProfit:  2150 },
  { tpl: { id: "t-09", symbol: "USDJPY", direction: "BUY",  openTime: "2026.04.03 10:45:52", closeTime: "2026.04.03 12:02:44", openPrice: 150.950, closePrice: 151.148 }, baseProfit:  1980 },
  { tpl: { id: "t-10", symbol: "USDJPY", direction: "SELL", openTime: "2026.04.03 15:22:07", closeTime: "2026.04.03 16:38:21", openPrice: 151.350, closePrice: 151.102 }, baseProfit:  2480 },
  { tpl: { id: "t-11", symbol: "USDJPY", direction: "BUY",  openTime: "2026.04.06 09:05:15", closeTime: "2026.04.06 10:42:38", openPrice: 150.880, closePrice: 151.192 }, baseProfit:  3120 },
  { tpl: { id: "t-12", symbol: "USDJPY", direction: "BUY",  openTime: "2026.04.06 22:30:44", closeTime: "2026.04.06 23:18:12", openPrice: 151.050, closePrice: 150.930 }, baseProfit: -1200 },
  { tpl: { id: "t-13", symbol: "USDJPY", direction: "SELL", openTime: "2026.04.07 11:15:03", closeTime: "2026.04.07 12:28:47", openPrice: 151.410, closePrice: 151.154 }, baseProfit:  2560 },
  { tpl: { id: "t-14", symbol: "USDJPY", direction: "BUY",  openTime: "2026.04.07 19:40:22", closeTime: "2026.04.07 20:33:11", openPrice: 151.280, closePrice: 151.098 }, baseProfit: -1820 },
  { tpl: { id: "t-15", symbol: "USDJPY", direction: "BUY",  openTime: "2026.04.08 10:22:18", closeTime: "2026.04.08 11:48:05", openPrice: 150.920, closePrice: 151.158 }, baseProfit:  2380 },
  { tpl: { id: "t-16", symbol: "USDJPY", direction: "SELL", openTime: "2026.04.08 17:50:41", closeTime: "2026.04.08 19:12:33", openPrice: 151.240, closePrice: 151.032 }, baseProfit:  2080 },
  { tpl: { id: "t-17", symbol: "USDJPY", direction: "BUY",  openTime: "2026.04.09 09:30:12", closeTime: "2026.04.09 10:58:44", openPrice: 150.880, closePrice: 151.144 }, baseProfit:  2640 },
  { tpl: { id: "t-18", symbol: "USDJPY", direction: "SELL", openTime: "2026.04.09 21:45:30", closeTime: "2026.04.09 22:51:18", openPrice: 151.320, closePrice: 151.128 }, baseProfit:  1920 },
  { tpl: { id: "t-19", symbol: "USDJPY", direction: "BUY",  openTime: "2026.04.10 10:10:22", closeTime: "2026.04.10 11:35:07", openPrice: 150.950, closePrice: 151.172 }, baseProfit:  2220 },
  { tpl: { id: "t-20", symbol: "USDJPY", direction: "SELL", openTime: "2026.04.10 18:35:02", closeTime: "2026.04.10 19:58:21", openPrice: 151.380, closePrice: 151.134 }, baseProfit:  2460 },
];

function buildSnapshot(tier: CapitalTier, label: string): HistorySnapshot {
  const lot = TIER_LOT[tier];
  const ratio = tier / 1_000_000;
  const trades: TierTradeRow[] = TEMPLATES.map(({ tpl, baseProfit }) => ({
    ...tpl,
    lot,
    profit: Math.round(baseProfit * ratio),
  }));
  const totalProfit = trades.reduce((s, t) => s + t.profit, 0);
  const winCount = trades.filter((t) => t.profit > 0).length;
  const lossCount = trades.filter((t) => t.profit < 0).length;
  const winRate = Math.round((winCount / trades.length) * 100);
  return {
    capital: tier,
    label,
    period: PERIOD,
    totalProfit,
    winRate,
    tradeCount: trades.length,
    winCount,
    lossCount,
    trades,
  };
}

export const HISTORY_BY_CAPITAL: Record<CapitalTier, HistorySnapshot> = {
  100_000: buildSnapshot(100_000, "10万"),
  300_000: buildSnapshot(300_000, "30万"),
  500_000: buildSnapshot(500_000, "50万"),
  1_000_000: buildSnapshot(1_000_000, "100万"),
};

export function pickCapitalTier(deposit: number): CapitalTier {
  let best: CapitalTier = CAPITAL_TIERS[0];
  let bestDiff = Math.abs(deposit - best);
  for (const t of CAPITAL_TIERS) {
    const diff = Math.abs(deposit - t);
    if (diff < bestDiff) {
      best = t;
      bestDiff = diff;
    }
  }
  return best;
}

// ========================================
// MT4スタイル フォーマッタ
// ========================================
// MT4 は金額を "2 340.00"（スペース千桁区切り・小数2桁）で表示する

export function formatMT4Amount(n: number): string {
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n).toFixed(2);
  const [intPart, dec] = abs.split(".");
  const withSpaces = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${sign}${withSpaces}.${dec}`;
}

export function formatMT4Signed(n: number): string {
  const sign = n > 0 ? "" : n < 0 ? "-" : "";
  const abs = Math.abs(n).toFixed(2);
  const [intPart, dec] = abs.split(".");
  const withSpaces = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${sign}${withSpaces}.${dec}`;
}

export function formatMT4Price(p: number): string {
  return p.toFixed(3);
}

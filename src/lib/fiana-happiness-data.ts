// ========================================
// ハピネスプラス実績データ
// ========================================
// 体験版タブで表示する実績データ。
// すべて「基準元本 HAPPINESS_BASE_CAPITAL」で運用した想定の金額ベース。
// ユーザーの診断初期資金との比率でスケーリングして表示する。
//
// ▼▼▼ TODO: 実運用前に、実際のハピネスプラス実績データに差し替えてください ▼▼▼
// - HAPPINESS_BASE_CAPITAL: 実績データを収集した時の元本
// - HAPPINESS_DAILY_STATS: 日次のPL、取引数、勝敗
// - HAPPINESS_RECENT_TRADES: 直近14日間の個別取引（MT4エクスポートを貼る想定）

export interface HappinessDailyStat {
  date: string; // YYYY-MM-DD
  trades: number;
  wins: number;
  losses: number;
  profitAtBase: number; // 基準元本での損益（円）
}

export interface HappinessTrade {
  id: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:mm
  pair: string;
  direction: "BUY" | "SELL";
  lotAtBase: number;
  entryPrice: number;
  exitPrice: number;
  pips: number;
  profitAtBase: number; // 基準元本での損益（円）
}

// 基準元本（実績データを取った時の口座残高）
export const HAPPINESS_BASE_CAPITAL = 1_000_000; // 100万円基準

// 日次実績（直近30営業日分）
// 平均して月利8〜10%の水準、勝率68-72%、ドローダウンは小さめの想定
export const HAPPINESS_DAILY_STATS: HappinessDailyStat[] = [
  { date: "2026-03-11", trades: 3, wins: 2, losses: 1, profitAtBase: 2840 },
  { date: "2026-03-12", trades: 2, wins: 2, losses: 0, profitAtBase: 4120 },
  { date: "2026-03-13", trades: 4, wins: 3, losses: 1, profitAtBase: 5380 },
  { date: "2026-03-16", trades: 2, wins: 1, losses: 1, profitAtBase: -1240 },
  { date: "2026-03-17", trades: 3, wins: 3, losses: 0, profitAtBase: 6150 },
  { date: "2026-03-18", trades: 3, wins: 2, losses: 1, profitAtBase: 3220 },
  { date: "2026-03-19", trades: 4, wins: 3, losses: 1, profitAtBase: 4780 },
  { date: "2026-03-20", trades: 2, wins: 2, losses: 0, profitAtBase: 3650 },
  { date: "2026-03-23", trades: 3, wins: 2, losses: 1, profitAtBase: 2910 },
  { date: "2026-03-24", trades: 5, wins: 4, losses: 1, profitAtBase: 6820 },
  { date: "2026-03-25", trades: 3, wins: 2, losses: 1, profitAtBase: 2540 },
  { date: "2026-03-26", trades: 2, wins: 2, losses: 0, profitAtBase: 4380 },
  { date: "2026-03-27", trades: 3, wins: 1, losses: 2, profitAtBase: -2180 },
  { date: "2026-03-30", trades: 4, wins: 3, losses: 1, profitAtBase: 5140 },
  { date: "2026-03-31", trades: 3, wins: 3, losses: 0, profitAtBase: 6280 },
  { date: "2026-04-01", trades: 2, wins: 1, losses: 1, profitAtBase: 1420 },
  { date: "2026-04-02", trades: 4, wins: 3, losses: 1, profitAtBase: 4890 },
  { date: "2026-04-03", trades: 3, wins: 2, losses: 1, profitAtBase: 3150 },
  { date: "2026-04-06", trades: 3, wins: 3, losses: 0, profitAtBase: 5620 },
  { date: "2026-04-07", trades: 2, wins: 2, losses: 0, profitAtBase: 4240 },
  { date: "2026-04-08", trades: 4, wins: 3, losses: 1, profitAtBase: 5080 },
  { date: "2026-04-09", trades: 3, wins: 2, losses: 1, profitAtBase: 2960 },
  { date: "2026-04-10", trades: 3, wins: 3, losses: 0, profitAtBase: 6420 },
];

// 直近の取引ログ（MT4エクスポートを想定）
export const HAPPINESS_RECENT_TRADES: HappinessTrade[] = [
  {
    id: "t-001",
    date: "2026-04-10",
    time: "22:14",
    pair: "USDJPY",
    direction: "BUY",
    lotAtBase: 0.1,
    entryPrice: 151.482,
    exitPrice: 151.568,
    pips: 8.6,
    profitAtBase: 2150,
  },
  {
    id: "t-002",
    date: "2026-04-10",
    time: "18:30",
    pair: "USDJPY",
    direction: "SELL",
    lotAtBase: 0.1,
    entryPrice: 151.620,
    exitPrice: 151.538,
    pips: 8.2,
    profitAtBase: 2050,
  },
  {
    id: "t-003",
    date: "2026-04-10",
    time: "10:45",
    pair: "USDJPY",
    direction: "BUY",
    lotAtBase: 0.1,
    entryPrice: 151.210,
    exitPrice: 151.300,
    pips: 9.0,
    profitAtBase: 2220,
  },
  {
    id: "t-004",
    date: "2026-04-09",
    time: "21:50",
    pair: "USDJPY",
    direction: "BUY",
    lotAtBase: 0.1,
    entryPrice: 151.050,
    exitPrice: 151.135,
    pips: 8.5,
    profitAtBase: 2120,
  },
  {
    id: "t-005",
    date: "2026-04-09",
    time: "15:20",
    pair: "USDJPY",
    direction: "SELL",
    lotAtBase: 0.1,
    entryPrice: 151.280,
    exitPrice: 151.340,
    pips: -6.0,
    profitAtBase: -1500,
  },
  {
    id: "t-006",
    date: "2026-04-09",
    time: "09:10",
    pair: "USDJPY",
    direction: "BUY",
    lotAtBase: 0.1,
    entryPrice: 150.920,
    exitPrice: 151.014,
    pips: 9.4,
    profitAtBase: 2340,
  },
  {
    id: "t-007",
    date: "2026-04-08",
    time: "23:05",
    pair: "USDJPY",
    direction: "SELL",
    lotAtBase: 0.1,
    entryPrice: 151.385,
    exitPrice: 151.290,
    pips: 9.5,
    profitAtBase: 2380,
  },
  {
    id: "t-008",
    date: "2026-04-08",
    time: "17:40",
    pair: "USDJPY",
    direction: "BUY",
    lotAtBase: 0.1,
    entryPrice: 151.120,
    exitPrice: 151.205,
    pips: 8.5,
    profitAtBase: 2120,
  },
  {
    id: "t-009",
    date: "2026-04-08",
    time: "11:25",
    pair: "USDJPY",
    direction: "BUY",
    lotAtBase: 0.1,
    entryPrice: 150.880,
    exitPrice: 150.960,
    pips: 8.0,
    profitAtBase: 2000,
  },
  {
    id: "t-010",
    date: "2026-04-08",
    time: "08:15",
    pair: "USDJPY",
    direction: "SELL",
    lotAtBase: 0.1,
    entryPrice: 151.045,
    exitPrice: 151.125,
    pips: -8.0,
    profitAtBase: -2000,
  },
];

// ========================================
// スケーリングヘルパー
// ========================================
// ユーザーの初期資金とベース資金の比率で損益を換算
export function scaleByCapital(
  profitAtBase: number,
  userCapital: number,
): number {
  const ratio = userCapital / HAPPINESS_BASE_CAPITAL;
  return Math.round(profitAtBase * ratio);
}

export function scaleLot(lotAtBase: number, userCapital: number): number {
  const ratio = userCapital / HAPPINESS_BASE_CAPITAL;
  // 0.01lot単位に丸め
  return Math.max(0.01, Math.round(lotAtBase * ratio * 100) / 100);
}

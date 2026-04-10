// ========================================
// フィアナ投資アプリ 設定ファイル
// ========================================

// LINE公式アカウントURL（石井さん側で差し替え）
export const LINE_URL = "https://line.me/R/ti/p/PLACEHOLDER";

// 無料体験期間
export const TRIAL_DAYS = 30;

// Alpha Vantage API Key（環境変数から取得）
export const ALPHA_VANTAGE_KEY = process.env.ALPHA_VANTAGE_API_KEY || "";

// ========================================
// EAシステム一覧
// ========================================
export interface EASystem {
  id: string;
  name: string;
  icon: string; // 後から画像URLに差し替え可能
  fullAccess: boolean;
  description: string;
  style: string; // キャラクターの投資スタイル説明
}

export const EA_SYSTEMS: EASystem[] = [
  {
    id: "happiness-plus",
    name: "ハピネスプラス",
    icon: "🌟",
    fullAccess: true,
    description: "安定型の自動売買システム。堅実に利益を積み上げるスタイル。",
    style: "堅実安定型",
  },
  {
    id: "angel",
    name: "エンジェル",
    icon: "👼",
    fullAccess: true,
    description: "バランス型の自動売買システム。攻守のバランスに優れたスタイル。",
    style: "バランス型",
  },
  {
    id: "queen",
    name: "クイーン",
    icon: "👑",
    fullAccess: false,
    description: "攻撃型の自動売買システム。積極的に利益を狙うスタイル。",
    style: "積極攻撃型",
  },
  {
    id: "namekuji",
    name: "なめくじ",
    icon: "🐌",
    fullAccess: false,
    description: "超安定型の自動売買システム。ゆっくり着実に資産を増やすスタイル。",
    style: "超安定型",
  },
  {
    id: "maimai",
    name: "マイマイ",
    icon: "🐚",
    fullAccess: false,
    description: "中長期型の自動売買システム。長い目で利益を狙うスタイル。",
    style: "中長期型",
  },
  {
    id: "shodai-ghidora",
    name: "初代ギドラ",
    icon: "🐉",
    fullAccess: false,
    description: "トレンドフォロー型システム。大きな流れに乗るスタイル。",
    style: "トレンド追従型",
  },
  {
    id: "ghidora",
    name: "ギドラ",
    icon: "🔥",
    fullAccess: false,
    description: "ハイリターン型システム。短期で大きな利益を狙うスタイル。",
    style: "ハイリターン型",
  },
];

// ========================================
// 仮想入金額とlotサイズ
// ========================================
export interface DepositOption {
  amount: number;
  lot: number;
  profitPer5pips: number;
  label: string;
}

export const DEPOSIT_OPTIONS: DepositOption[] = [
  { amount: 100000, lot: 0.01, profitPer5pips: 50, label: "10万円" },
  { amount: 300000, lot: 0.03, profitPer5pips: 150, label: "30万円" },
  { amount: 500000, lot: 0.05, profitPer5pips: 250, label: "50万円" },
  { amount: 1000000, lot: 0.1, profitPer5pips: 500, label: "100万円" },
  { amount: 3000000, lot: 0.3, profitPer5pips: 1500, label: "300万円" },
];

// lotサイズから5pips利益を計算
export function calcProfitForPips(lot: number, pips: number): number {
  // 1lot = 100,000通貨、1pip = 0.01円(USD/JPY)
  // profit = lot * 100000 * pips * 0.01
  return Math.round(lot * 100000 * pips * 0.01);
}

// 金額フォーマット
export function formatJPY(amount: number): string {
  if (amount >= 0) return `+¥${amount.toLocaleString()}`;
  return `-¥${Math.abs(amount).toLocaleString()}`;
}

export function formatJPYPlain(amount: number): string {
  return `¥${amount.toLocaleString()}`;
}

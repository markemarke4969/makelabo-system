// ========================================
// fiaポイントシステム ロジック層
// ========================================
// 将来のトークン化（DEX上場）を見据え、
// 全ポイント移動を台帳（ledger）で管理する設計

// ========================================
// ポイント付与ルール
// ========================================
export interface PointAction {
  action: string;
  label: string;
  points: number;
  daily: boolean; // true = 1日1回制限
  description: string;
}

export const POINT_ACTIONS: PointAction[] = [
  {
    action: "daily_login",
    label: "デイリーログイン",
    points: 10,
    daily: true,
    description: "毎日アプリにログインするだけでfiaポイント獲得",
  },
  {
    action: "view_trade_log",
    label: "取引ログ確認",
    points: 5,
    daily: true,
    description: "取引ログをチェックして投資感覚を養おう",
  },
  {
    action: "run_backtest",
    label: "バックテスト実行",
    points: 20,
    daily: true,
    description: "バックテストで過去の成績を検証しよう",
  },
  {
    action: "inflation_check",
    label: "インフレ体感チェック",
    points: 10,
    daily: true,
    description: "インフレシミュレーターで資産を守る意識を高めよう",
  },
  {
    action: "walking",
    label: "ウォーキング",
    points: 15,
    daily: true,
    description: "健康は投資の資本。歩いてポイントを貯めよう",
  },
  {
    action: "early_bird",
    label: "早起きチェックイン",
    points: 10,
    daily: true,
    description: "7時前のログインでボーナスポイント",
  },
  {
    action: "diagnosis_complete",
    label: "診断完了ボーナス",
    points: 100,
    daily: false,
    description: "投資タイプ診断を完了した",
  },
  {
    action: "advisor_connect",
    label: "アドバイザー接続",
    points: 10000,
    daily: false,
    description: "専属アドバイザーとの個別相談で大量ポイント獲得",
  },
];

// ========================================
// レベルシステム（ナメクジ育成と連動）
// ========================================
export interface FiaLevel {
  level: number;
  name: string;
  minPoints: number; // 累計獲得ポイント（消化しても下がらない）
  icon: string;
  description: string;
}

export const FIA_LEVELS: FiaLevel[] = [
  {
    level: 1,
    name: "たまご",
    minPoints: 0,
    icon: "🥚",
    description: "投資の世界へようこそ",
  },
  {
    level: 2,
    name: "ベビーナメクジ",
    minPoints: 200,
    icon: "🐛",
    description: "少しずつ成長中...",
  },
  {
    level: 3,
    name: "ナメクジ",
    minPoints: 800,
    icon: "🐌",
    description: "着実に力をつけてきた",
  },
  {
    level: 4,
    name: "スーパーナメクジ",
    minPoints: 2000,
    icon: "🦋",
    description: "投資の感覚が身についてきた",
  },
  {
    level: 5,
    name: "ナメクジマスター",
    minPoints: 5000,
    icon: "🐉",
    description: "究極の投資マスター",
  },
];

// ========================================
// システム体験コスト
// ========================================
export interface SystemUnlockCost {
  systemId: string;
  fiaCost: number;
  durationHours: number; // 体験可能時間
}

export const SYSTEM_UNLOCK_COSTS: SystemUnlockCost[] = [
  { systemId: "queen", fiaCost: 300, durationHours: 24 },
  { systemId: "namekuji", fiaCost: 200, durationHours: 24 },
  { systemId: "maimai", fiaCost: 200, durationHours: 24 },
  { systemId: "shodai-ghidora", fiaCost: 500, durationHours: 24 },
  { systemId: "ghidora", fiaCost: 500, durationHours: 24 },
];

// ========================================
// ユーティリティ関数
// ========================================

/** 累計獲得ポイントからレベルを計算 */
export function calculateLevel(totalEarned: number): FiaLevel {
  let result = FIA_LEVELS[0];
  for (const level of FIA_LEVELS) {
    if (totalEarned >= level.minPoints) {
      result = level;
    }
  }
  return result;
}

/** 次のレベルまでのポイント数を計算 */
export function pointsToNextLevel(totalEarned: number): {
  current: FiaLevel;
  next: FiaLevel | null;
  remaining: number;
  progress: number; // 0-100
} {
  const current = calculateLevel(totalEarned);
  const nextIdx = FIA_LEVELS.findIndex((l) => l.level === current.level) + 1;
  const next = nextIdx < FIA_LEVELS.length ? FIA_LEVELS[nextIdx] : null;

  if (!next) {
    return { current, next: null, remaining: 0, progress: 100 };
  }

  const rangeStart = current.minPoints;
  const rangeEnd = next.minPoints;
  const progress = Math.min(
    100,
    Math.round(((totalEarned - rangeStart) / (rangeEnd - rangeStart)) * 100)
  );
  const remaining = next.minPoints - totalEarned;

  return { current, next, remaining, progress };
}

/** ポイント数をフォーマット */
export function formatFia(points: number): string {
  return `${points.toLocaleString()} fia`;
}

/** 早起き判定（7時前か） */
export function isEarlyBird(): boolean {
  return new Date().getHours() < 7;
}

// ========================================
// デモモード用のローカルストレージ管理
// ========================================
const DEMO_POINTS_KEY = "fiana_demo_fia_points";
const DEMO_LEDGER_KEY = "fiana_demo_fia_ledger";
const DEMO_CHECKINS_KEY = "fiana_demo_fia_checkins";
const DEMO_TOTAL_EARNED_KEY = "fiana_demo_fia_total_earned";

export interface LedgerEntry {
  id: string;
  amount: number;
  balance_after: number;
  action: string;
  description: string;
  created_at: string;
}

export function getDemoPoints(): number {
  if (typeof window === "undefined") return 0;
  return parseInt(localStorage.getItem(DEMO_POINTS_KEY) || "0", 10);
}

export function getDemoTotalEarned(): number {
  if (typeof window === "undefined") return 0;
  return parseInt(localStorage.getItem(DEMO_TOTAL_EARNED_KEY) || "0", 10);
}

export function getDemoLedger(): LedgerEntry[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(DEMO_LEDGER_KEY) || "[]");
  } catch {
    return [];
  }
}

export function getDemoCheckins(date: string): string[] {
  if (typeof window === "undefined") return [];
  try {
    const all = JSON.parse(localStorage.getItem(DEMO_CHECKINS_KEY) || "{}");
    return all[date] || [];
  } catch {
    return [];
  }
}

export function addDemoPoints(
  action: string,
  amount: number,
  description: string
): { success: boolean; newBalance: number; entry: LedgerEntry | null } {
  const actionDef = POINT_ACTIONS.find((a) => a.action === action);
  const today = new Date().toISOString().split("T")[0];

  // デイリー制限チェック
  if (actionDef?.daily) {
    const todayCheckins = getDemoCheckins(today);
    if (todayCheckins.includes(action)) {
      return { success: false, newBalance: getDemoPoints(), entry: null };
    }
  }

  const currentPoints = getDemoPoints();
  const newBalance = currentPoints + amount;

  // 残高不足チェック（消化の場合）
  if (amount < 0 && newBalance < 0) {
    return { success: false, newBalance: currentPoints, entry: null };
  }

  // ポイント更新
  localStorage.setItem(DEMO_POINTS_KEY, String(newBalance));

  // 累計獲得更新（付与のみ）
  if (amount > 0) {
    const totalEarned = getDemoTotalEarned() + amount;
    localStorage.setItem(DEMO_TOTAL_EARNED_KEY, String(totalEarned));
  }

  // 台帳に記録
  const entry: LedgerEntry = {
    id: crypto.randomUUID(),
    amount,
    balance_after: newBalance,
    action,
    description,
    created_at: new Date().toISOString(),
  };
  const ledger = getDemoLedger();
  ledger.unshift(entry);
  // 最新200件のみ保持
  localStorage.setItem(DEMO_LEDGER_KEY, JSON.stringify(ledger.slice(0, 200)));

  // デイリーチェックイン記録
  if (actionDef?.daily) {
    const allCheckins = JSON.parse(
      localStorage.getItem(DEMO_CHECKINS_KEY) || "{}"
    );
    if (!allCheckins[today]) allCheckins[today] = [];
    allCheckins[today].push(action);
    localStorage.setItem(DEMO_CHECKINS_KEY, JSON.stringify(allCheckins));
  }

  return { success: true, newBalance, entry };
}

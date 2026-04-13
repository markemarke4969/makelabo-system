// 動物占い（個性心理學の60キャラクター）
// 生年月日から運命数(1-60)を算出し、12動物×カラーに分類する。
// 参考: https://spicomi.net/articles/1125
//
// アルゴリズム:
//   運命数 = ((基準日からの経過日数 + 24) mod 60) + 1
//   基準日: 1960-01-01 = 運命数25
//
// 検証例:
//   1920-01-10 → 運命数4（spicomi 記載例と一致）
//   2000-01-01 → 運命数55（年月基準表と一致）

export type DoubutsuAnimal =
  | "チーター"
  | "たぬき"
  | "猿"
  | "コアラ"
  | "黒ひょう"
  | "虎"
  | "こじか"
  | "ゾウ"
  | "狼"
  | "ひつじ"
  | "ペガサス"
  | "ライオン";

export type DoubutsuColor =
  | "イエロー"
  | "グリーン"
  | "レッド"
  | "オレンジ"
  | "ブラウン"
  | "ブラック"
  | "ゴールド"
  | "シルバー"
  | "ブルー"
  | "パープル";

export interface DoubutsuResult {
  destinyNumber: number;
  animal: DoubutsuAnimal;
  color: DoubutsuColor;
}

// 運命数 1-60 → [動物, カラー]
// 6動物×6色(レッド/パープル/ブラウン/オレンジ/ブルー/ブラック): 猿/黒ひょう/虎/コアラ/ひつじ/狼
// 6動物×4色(グリーン/イエロー/ゴールド/シルバー): チーター/ライオン/たぬき/ゾウ/ペガサス/こじか
const DESTINY_TABLE: ReadonlyArray<readonly [DoubutsuAnimal, DoubutsuColor]> = [
  ["チーター", "イエロー"],   //  1
  ["たぬき", "グリーン"],     //  2
  ["猿", "レッド"],           //  3
  ["コアラ", "オレンジ"],     //  4
  ["黒ひょう", "ブラウン"],   //  5
  ["虎", "ブラック"],         //  6
  ["チーター", "ゴールド"],   //  7
  ["たぬき", "シルバー"],     //  8
  ["猿", "ブルー"],           //  9
  ["コアラ", "パープル"],     // 10
  ["こじか", "イエロー"],     // 11
  ["ゾウ", "グリーン"],       // 12
  ["狼", "レッド"],           // 13
  ["ひつじ", "オレンジ"],     // 14
  ["猿", "ブラウン"],         // 15
  ["コアラ", "ブラック"],     // 16
  ["こじか", "ゴールド"],     // 17
  ["ゾウ", "シルバー"],       // 18
  ["狼", "ブルー"],           // 19
  ["ひつじ", "パープル"],     // 20
  ["ペガサス", "イエロー"],   // 21
  ["ペガサス", "グリーン"],   // 22
  ["ひつじ", "レッド"],       // 23
  ["狼", "オレンジ"],         // 24
  ["狼", "ブラウン"],         // 25
  ["ひつじ", "ブラック"],     // 26
  ["ペガサス", "ゴールド"],   // 27
  ["ペガサス", "シルバー"],   // 28
  ["ひつじ", "ブルー"],       // 29
  ["狼", "パープル"],         // 30
  ["ゾウ", "イエロー"],       // 31
  ["こじか", "グリーン"],     // 32
  ["コアラ", "レッド"],       // 33
  ["猿", "オレンジ"],         // 34
  ["ひつじ", "ブラウン"],     // 35
  ["狼", "ブラック"],         // 36
  ["ゾウ", "ゴールド"],       // 37
  ["こじか", "シルバー"],     // 38
  ["コアラ", "ブルー"],       // 39
  ["猿", "パープル"],         // 40
  ["たぬき", "イエロー"],     // 41
  ["チーター", "グリーン"],   // 42
  ["虎", "レッド"],           // 43
  ["黒ひょう", "オレンジ"],   // 44
  ["コアラ", "ブラウン"],     // 45
  ["猿", "ブラック"],         // 46
  ["たぬき", "ゴールド"],     // 47
  ["チーター", "シルバー"],   // 48
  ["虎", "ブルー"],           // 49
  ["黒ひょう", "パープル"],   // 50
  ["ライオン", "イエロー"],   // 51
  ["ライオン", "グリーン"],   // 52
  ["黒ひょう", "レッド"],     // 53
  ["虎", "オレンジ"],         // 54
  ["虎", "ブラウン"],         // 55
  ["黒ひょう", "ブラック"],   // 56
  ["ライオン", "ゴールド"],   // 57
  ["ライオン", "シルバー"],   // 58
  ["黒ひょう", "ブルー"],     // 59
  ["虎", "パープル"],         // 60
];

const REFERENCE_UTC_MS = Date.UTC(1960, 0, 1);
const REFERENCE_DESTINY = 25;
const MS_PER_DAY = 86_400_000;

export function calculateDestinyNumber(
  year: number,
  month: number,
  day: number,
): number {
  const target = Date.UTC(year, month - 1, day);
  const days = Math.round((target - REFERENCE_UTC_MS) / MS_PER_DAY);
  const mod = (((days + REFERENCE_DESTINY - 1) % 60) + 60) % 60;
  return mod + 1;
}

export function diagnoseDoubutsu(
  year: number,
  month: number,
  day: number,
): DoubutsuResult {
  const destinyNumber = calculateDestinyNumber(year, month, day);
  const [animal, color] = DESTINY_TABLE[destinyNumber - 1];
  return { destinyNumber, animal, color };
}

// "YYYY-MM-DD" (<input type="date">の値) を受け取る簡易ラッパー
export function diagnoseDoubutsuFromISO(iso: string): DoubutsuResult | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return diagnoseDoubutsu(year, month, day);
}

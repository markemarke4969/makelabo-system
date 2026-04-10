// ========================================
// 診断ロジック
// ========================================
// 8問の質問で投資タイプを診断 + 動物占い風の結果表示
// 結果が何であれ、ハピネスプラスとエンジェルが必ず1位・2位

import { EA_SYSTEMS, type EASystem } from "./fiana-config";

// ========================================
// 動物タイプ定義
// ========================================
export interface AnimalType {
  id: string;
  animal: string;
  emoji: string;
  name: string;
  investorType: string;
  description: string;
  traits: string[];
}

export const ANIMAL_TYPES: AnimalType[] = [
  {
    id: "fox",
    animal: "キツネ",
    emoji: "🦊",
    name: "堅実キツネ",
    investorType: "安定重視の堅実投資家",
    description: "リスクを賢く見極め、着実に利益を積み上げるタイプ。自動売買の安定したロジックとの相性が抜群です。",
    traits: ["慎重", "分析的", "着実"],
  },
  {
    id: "owl",
    animal: "フクロウ",
    emoji: "🦉",
    name: "知性派フクロウ",
    investorType: "長期戦略型投資家",
    description: "深い洞察力で長期的に資産を育てるタイプ。じっくり腰を据えた運用で確実な成果を目指します。",
    traits: ["知的", "忍耐強い", "戦略的"],
  },
  {
    id: "eagle",
    animal: "イーグル",
    emoji: "🦅",
    name: "攻撃イーグル",
    investorType: "積極成長型投資家",
    description: "大きなチャンスを逃さない鋭い眼を持つタイプ。攻めの姿勢で資産を大きく成長させます。",
    traits: ["大胆", "行動的", "野心的"],
  },
  {
    id: "dolphin",
    animal: "イルカ",
    emoji: "🐬",
    name: "バランスイルカ",
    investorType: "バランス型投資家",
    description: "安定と成長のバランス感覚に優れたタイプ。柔軟に戦略を使い分け、安定した成果を生み出します。",
    traits: ["柔軟", "バランス感覚", "適応力"],
  },
  {
    id: "turtle",
    animal: "カメ",
    emoji: "🐢",
    name: "じっくりカメ",
    investorType: "超安定マイペース投資家",
    description: "焦らずマイペースに資産を育てるタイプ。時間を味方につけて、確実にゴールへ向かいます。",
    traits: ["忍耐", "着実", "堅実"],
  },
  {
    id: "lion",
    animal: "ライオン",
    emoji: "🦁",
    name: "王者ライオン",
    investorType: "アクティブ成長型投資家",
    description: "自信と決断力で市場を制するタイプ。積極的なトレードと成長志向で大きな成果を目指します。",
    traits: ["自信", "決断力", "リーダー"],
  },
  {
    id: "cat",
    animal: "ネコ",
    emoji: "🐱",
    name: "マイペースネコ",
    investorType: "自由気まま型投資家",
    description: "直感とマイペースを大切にするタイプ。自分のリズムで投資と向き合い、楽しみながら運用します。",
    traits: ["自由", "直感的", "マイペース"],
  },
  {
    id: "wolf",
    animal: "オオカミ",
    emoji: "🐺",
    name: "戦略オオカミ",
    investorType: "戦略的アクティブ投資家",
    description: "独自の視点と集中力で成果を出すタイプ。戦略的なアプローチで他にはない結果を追求します。",
    traits: ["戦略的", "集中力", "独自路線"],
  },
];

// ========================================
// MBTI一覧
// ========================================
export const MBTI_TYPES = [
  "INTJ", "INTP", "ENTJ", "ENTP",
  "INFJ", "INFP", "ENFJ", "ENFP",
  "ISTJ", "ISFJ", "ESTJ", "ESFJ",
  "ISTP", "ISFP", "ESTP", "ESFP",
] as const;

// ========================================
// 質問定義
// ========================================
export interface DiagnosisOption {
  label: string;
  value: string;
  score: Record<string, number>;
  depositHint?: number;
}

export interface DiagnosisQuestion {
  id: number;
  question: string;
  options: DiagnosisOption[];
}

// スコアキー: stability(安定志向), growth(成長志向), active(積極性), patience(忍耐力)
export const DIAGNOSIS_QUESTIONS: DiagnosisQuestion[] = [
  {
    id: 1,
    question: "投資で一番大切だと思うことは？",
    options: [
      { label: "損をしないこと", value: "a", score: { stability: 3, patience: 2 } },
      { label: "コツコツ増やすこと", value: "b", score: { stability: 2, growth: 2, patience: 1 } },
      { label: "大きく増やすチャンスを狙うこと", value: "c", score: { growth: 3, active: 2 } },
      { label: "プロに任せて安心したい", value: "d", score: { stability: 2, patience: 3 } },
    ],
  },
  {
    id: 2,
    question: "もし100万円が手に入ったら？",
    options: [
      { label: "全額貯金する", value: "a", score: { stability: 3, patience: 1 } },
      { label: "半分貯金、半分投資", value: "b", score: { stability: 1, growth: 2, patience: 1 } },
      { label: "積極的に投資に回す", value: "c", score: { growth: 3, active: 2 } },
      { label: "まず勉強してから考える", value: "d", score: { patience: 3, stability: 1 } },
    ],
  },
  {
    id: 3,
    question: "投資の経験はありますか？",
    options: [
      { label: "全くの初心者（経験ゼロ）", value: "a", score: { stability: 2, patience: 2 } },
      { label: "少しだけやったことがある", value: "b", score: { growth: 1, active: 1, stability: 1 } },
      { label: "FXや株の経験あり（利益は出ていない）", value: "c", score: { growth: 2, active: 2 } },
      { label: "投資信託やNISAをコツコツやっている", value: "d", score: { stability: 1, growth: 2, patience: 1 } },
    ],
  },
  {
    id: 4,
    question: "毎日チャートを見る時間はどれくらい取れそう？",
    options: [
      { label: "全く見れない", value: "a", score: { stability: 3, patience: 2 } },
      { label: "1日10〜30分くらい", value: "b", score: { stability: 1, growth: 2 } },
      { label: "1日30分以上", value: "c", score: { growth: 2, active: 2 } },
      { label: "時間があればずっと見ていたい", value: "d", score: { active: 3, growth: 1 } },
    ],
  },
  {
    id: 5,
    question: "投資で目指したい月の利益は？",
    options: [
      { label: "お小遣いレベル（月1〜3万円）", value: "a", score: { stability: 3, patience: 1 } },
      { label: "月5〜10万円", value: "b", score: { stability: 1, growth: 2 } },
      { label: "月30万円を目指したい", value: "c", score: { growth: 3, active: 1 } },
      { label: "それ以上を目指したい", value: "d", score: { active: 3, growth: 2 } },
    ],
  },
  {
    id: 6,
    question: "含み損（一時的なマイナス）が出たらどうする？",
    options: [
      { label: "怖いのですぐ損切りしたい", value: "a", score: { stability: 2, active: 1 } },
      { label: "ルール通りに対応したい", value: "b", score: { stability: 2, patience: 2 } },
      { label: "もっと勉強してから判断したい", value: "c", score: { patience: 3, growth: 1 } },
      { label: "プロの判断に任せたい", value: "d", score: { stability: 3, patience: 2 } },
    ],
  },
  {
    id: 7,
    question: "理想の投資スタイルは？",
    options: [
      { label: "完全おまかせ", value: "a", score: { stability: 3, patience: 3 } },
      { label: "たまに状況を確認する程度", value: "b", score: { stability: 2, growth: 1, patience: 1 } },
      { label: "自分でも少し判断に関わりたい", value: "c", score: { growth: 2, active: 2 } },
      { label: "積極的にトレードにも関わりたい", value: "d", score: { active: 3, growth: 3 } },
    ],
  },
  {
    id: 8,
    question: "投資に使える金額はどのくらいですか？",
    options: [
      { label: "10万円くらい", value: "a", score: { stability: 3, patience: 2 }, depositHint: 100000 },
      { label: "30万円くらい", value: "b", score: { stability: 2, growth: 1 }, depositHint: 300000 },
      { label: "50万〜100万円", value: "c", score: { growth: 2, active: 1 }, depositHint: 500000 },
      { label: "100万円以上", value: "d", score: { active: 2, growth: 2 }, depositHint: 1000000 },
    ],
  },
];

// ========================================
// 診断結果の型
// ========================================
export interface DiagnosisResult {
  type: string;
  typeLabel: string;
  description: string;
  animal: AnimalType;
  depositHint: number | null;
  rankedSystems: (EASystem & { rank: number; matchLabel: string })[];
}

// ========================================
// 動物タイプ判定
// ========================================
function determineAnimal(scores: Record<string, number>): AnimalType {
  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const top = sorted[0][0];
  const second = sorted[1][0];
  const key = `${top}-${second}`;

  const animalMap: Record<string, string> = {
    "stability-patience": "fox",
    "stability-growth": "dolphin",
    "stability-active": "fox",
    "patience-stability": "owl",
    "patience-growth": "turtle",
    "patience-active": "owl",
    "growth-active": "eagle",
    "growth-stability": "dolphin",
    "growth-patience": "wolf",
    "active-growth": "lion",
    "active-stability": "cat",
    "active-patience": "wolf",
  };

  const animalId = animalMap[key] || "dolphin";
  return ANIMAL_TYPES.find((a) => a.id === animalId) || ANIMAL_TYPES[3];
}

// ========================================
// 診断結果を算出
// ========================================
export function calculateDiagnosis(
  answers: string[]
): DiagnosisResult {
  const scores: Record<string, number> = {
    stability: 0,
    growth: 0,
    active: 0,
    patience: 0,
  };

  let depositHint: number | null = null;

  // スコア集計
  answers.forEach((answer, index) => {
    const question = DIAGNOSIS_QUESTIONS[index];
    if (!question) return;
    const option = question.options.find((o) => o.value === answer);
    if (!option) return;
    for (const [key, val] of Object.entries(option.score)) {
      scores[key] = (scores[key] || 0) + val;
    }
    if (option.depositHint) {
      depositHint = option.depositHint;
    }
  });

  // 最高スコアのタイプを判定
  const sortedTypes = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const topType = sortedTypes[0][0];

  // 動物タイプを判定
  const animal = determineAnimal(scores);

  // ========================================
  // システムランキング生成
  // 必ずハピネスプラス=1位、エンジェル=2位
  // 3位以下はスコアに応じてシャッフル
  // ========================================
  const matchLabels = [
    "あなたに最適！",
    "相性抜群！",
    "おすすめ",
    "相性良好",
    "まずまず",
    "検討候補",
    "参考",
  ];

  const otherSystems = EA_SYSTEMS.filter(
    (s) => s.id !== "happiness-plus" && s.id !== "angel"
  );
  const shuffled = otherSystems.sort(() => {
    const hash = scores.stability + scores.growth * 2 + scores.active * 3;
    return (hash % 3) - 1;
  });

  const ranked = [
    { ...EA_SYSTEMS.find((s) => s.id === "happiness-plus")!, rank: 1, matchLabel: matchLabels[0] },
    { ...EA_SYSTEMS.find((s) => s.id === "angel")!, rank: 2, matchLabel: matchLabels[1] },
    ...shuffled.map((s, i) => ({ ...s, rank: i + 3, matchLabel: matchLabels[i + 2] })),
  ];

  return {
    type: topType,
    typeLabel: animal.investorType,
    description: animal.description,
    animal,
    depositHint,
    rankedSystems: ranked,
  };
}

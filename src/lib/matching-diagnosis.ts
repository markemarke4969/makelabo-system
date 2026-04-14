// ========================================
// 副業マッチング診断ロジック
// ========================================
// 13問の質問を2軸（アプローチ軸×志向軸）でスコアリングし、16タイプに分類
// ※ 結果ページでは特定の商材名を出さない（クローザーがブラックボックスで案内）

// ========================================
// 商材定義（内部用・結果ページには非表示）
// ========================================
export interface Product {
  id: string;
  name: string;
  category: string;
  shortDescription: string;
}

export const PRODUCTS: Product[] = [
  { id: "keiba", name: "競馬・競艇 自動売買ツール", category: "投資系", shortDescription: "AI予測による自動ベッティング" },
  { id: "shopee", name: "Shopee 海外物販ツール", category: "物販系", shortDescription: "東南アジア向け越境EC" },
  { id: "qoo10", name: "Qoo10 国内物販ツール", category: "物販系", shortDescription: "国内EC特化の販売支援" },
  { id: "tsukushi", name: "つくしルート改", category: "物販系", shortDescription: "Amazon返品商品の高利益転売" },
  { id: "fx_auto", name: "FX 自動売買", category: "FX系", shortDescription: "24時間稼働の自動トレード" },
  { id: "fx_signal", name: "FX サインツール", category: "FX系", shortDescription: "売買サインに従うだけの半自動" },
  { id: "fx_discretion", name: "FX 裁量トレード", category: "FX系", shortDescription: "自分で判断するスキル型トレード" },
];

// ========================================
// 軸定義（MBTI風：2軸×各4値 = 16組合せ）
// ========================================
// 軸1：アプローチ軸（analytical / intuitive / cautious / builder）
// 軸2：志向軸（stable / steady / speed / leader）
export const AXIS1_KEYS = ["analytical", "intuitive", "cautious", "builder"] as const;
export const AXIS2_KEYS = ["stable", "steady", "speed", "leader"] as const;
export type Axis1 = (typeof AXIS1_KEYS)[number];
export type Axis2 = (typeof AXIS2_KEYS)[number];

export const AXIS1_LABELS: Record<Axis1, string> = {
  analytical: "分析派",
  intuitive: "直感型",
  cautious: "慎重派",
  builder: "仕組み構築型",
};
export const AXIS2_LABELS: Record<Axis2, string> = {
  stable: "安定志向型",
  steady: "コツコツ継続型",
  speed: "スピード重視型",
  leader: "リーダー",
};

// ========================================
// タイプ定義（16タイプ）
// ========================================
export interface MatchingType {
  id: string;
  name: string;
  emoji: string;
  headline: string;
  description: string;
  longDescription: string;
  traits: string[];
  recommendedProducts: string[];
}

export const MATCHING_TYPES: MatchingType[] = [
  // analytical × *
  {
    id: "analytical_stable",
    name: "分析派安定志向型",
    emoji: "📊",
    headline: "数字で選ぶ分析派安定志向型",
    description: "論理とリスク管理で確実な成果を積み上げるタイプです。",
    longDescription: "データと根拠を重視し、安定した成果を着実に築くタイプ。",
    traits: ["論理的", "堅実", "分析力"],
    recommendedProducts: ["fx_signal", "qoo10"],
  },
  {
    id: "analytical_steady",
    name: "分析派コツコツ継続型",
    emoji: "📈",
    headline: "データ重視の分析派コツコツ継続型",
    description: "地道な検証と継続で成果を伸ばすタイプです。",
    longDescription: "分析と継続力を武器に、時間をかけて精度を高めるタイプ。",
    traits: ["論理的", "継続力", "検証重視"],
    recommendedProducts: ["fx_signal", "qoo10"],
  },
  {
    id: "analytical_speed",
    name: "分析派スピード重視型",
    emoji: "⚡",
    headline: "瞬時に判断する分析派スピード重視型",
    description: "分析スピードと決断力で素早く成果を掴むタイプです。",
    longDescription: "素早い情報処理と即断即決で機会を逃さないタイプ。",
    traits: ["論理的", "決断力", "瞬発力"],
    recommendedProducts: ["fx_signal", "fx_discretion"],
  },
  {
    id: "analytical_leader",
    name: "分析派リーダー型",
    emoji: "🎯",
    headline: "戦略立案型の分析派リーダー",
    description: "ロジックで仕組みや人を動かすタイプです。",
    longDescription: "戦略と統率力で大きな成果を狙うタイプ。",
    traits: ["戦略的", "統率力", "先見性"],
    recommendedProducts: ["fx_discretion", "shopee"],
  },
  // intuitive × *
  {
    id: "intuitive_stable",
    name: "直感型安定志向型",
    emoji: "🌿",
    headline: "勘と堅実さの直感型安定志向型",
    description: "感覚を活かしつつリスクを抑えるタイプです。",
    longDescription: "直感と慎重さを併せ持ち、無理なく続けられるタイプ。",
    traits: ["感覚派", "堅実", "バランス"],
    recommendedProducts: ["qoo10", "tsukushi"],
  },
  {
    id: "intuitive_steady",
    name: "直感型コツコツ継続型",
    emoji: "🌱",
    headline: "ひらめきを積み上げる直感型コツコツ継続型",
    description: "ひらめきを日々の積み重ねに変えるタイプです。",
    longDescription: "感覚的な発想を継続力で形にするタイプ。",
    traits: ["感覚派", "継続力", "素直"],
    recommendedProducts: ["shopee", "qoo10"],
  },
  {
    id: "intuitive_speed",
    name: "直感型スピード重視型",
    emoji: "🚀",
    headline: "勘で即行動する直感型スピード重視型",
    description: "ひらめき即実行でチャンスを掴むタイプです。",
    longDescription: "直感と行動力でチャンスを最短距離で掴むタイプ。",
    traits: ["感覚派", "行動力", "大胆"],
    recommendedProducts: ["keiba", "shopee"],
  },
  {
    id: "intuitive_leader",
    name: "直感型リーダー型",
    emoji: "🔥",
    headline: "巻き込む力の直感型リーダー",
    description: "直感と巻き込み力で周囲を動かすタイプです。",
    longDescription: "人を引きつけ大きなうねりを作るタイプ。",
    traits: ["感覚派", "統率力", "カリスマ"],
    recommendedProducts: ["shopee", "fx_discretion"],
  },
  // cautious × *
  {
    id: "cautious_stable",
    name: "慎重派安定志向型",
    emoji: "🛡️",
    headline: "ど安定の慎重派安定志向型",
    description: "リスク最小で着実な成果を重視するタイプです。",
    longDescription: "堅実さを何より重んじ、確実な一歩を積み上げるタイプ。",
    traits: ["慎重", "堅実", "安定志向"],
    recommendedProducts: ["tsukushi", "qoo10"],
  },
  {
    id: "cautious_steady",
    name: "慎重派コツコツ継続型",
    emoji: "🏗️",
    headline: "地に足のついた慎重派コツコツ継続型",
    description: "確実な手順を踏んで成果を積み上げるタイプです。",
    longDescription: "手堅さと継続力で長く勝ち続けるタイプ。",
    traits: ["慎重", "継続力", "真面目"],
    recommendedProducts: ["tsukushi", "qoo10"],
  },
  {
    id: "cautious_speed",
    name: "慎重派スピード重視型",
    emoji: "🏃",
    headline: "準備してから一気に動く慎重派スピード重視型",
    description: "下準備を固めてから素早く動くタイプです。",
    longDescription: "慎重さと瞬発力のバランスで外さないタイプ。",
    traits: ["慎重", "瞬発力", "合理性"],
    recommendedProducts: ["fx_signal", "tsukushi"],
  },
  {
    id: "cautious_leader",
    name: "慎重派リーダー型",
    emoji: "🧱",
    headline: "手堅くまとめる慎重派リーダー",
    description: "信頼と堅実さで人を引っ張るタイプです。",
    longDescription: "慎重な判断力で組織や仕組みを支えるタイプ。",
    traits: ["慎重", "統率力", "信頼性"],
    recommendedProducts: ["qoo10", "shopee"],
  },
  // builder × *
  {
    id: "builder_stable",
    name: "仕組み構築型安定志向型",
    emoji: "⚙️",
    headline: "自動化と安定の仕組み構築型安定志向型",
    description: "自動化と堅実運用を両立するタイプです。",
    longDescription: "仕組みを作って手離れよく安定収入を狙うタイプ。",
    traits: ["仕組み志向", "堅実", "効率"],
    recommendedProducts: ["fx_auto", "qoo10"],
  },
  {
    id: "builder_steady",
    name: "仕組み構築型コツコツ継続型",
    emoji: "🔧",
    headline: "改善し続ける仕組み構築型コツコツ継続型",
    description: "自動化と継続改善で力を発揮するタイプです。",
    longDescription: "仕組みを磨きながら資産を積み上げていくタイプ。",
    traits: ["仕組み志向", "継続力", "工夫好き"],
    recommendedProducts: ["fx_auto", "tsukushi"],
  },
  {
    id: "builder_speed",
    name: "仕組み構築型スピード重視型",
    emoji: "💫",
    headline: "仕組みで加速する仕組み構築型スピード重視型",
    description: "スピードを仕組みで再現するタイプです。",
    longDescription: "自動化で時間を買いつつ一気に伸ばすタイプ。",
    traits: ["仕組み志向", "瞬発力", "効率"],
    recommendedProducts: ["fx_auto", "keiba"],
  },
  {
    id: "builder_leader",
    name: "仕組み構築型リーダー",
    emoji: "👑",
    headline: "自動化で動かす仕組み構築型リーダー",
    description: "自動化と統率力で仕組みを動かすタイプです。",
    longDescription: "仕組みを設計し大きなスケールで成果を狙うタイプ。",
    traits: ["仕組み志向", "統率力", "野心"],
    recommendedProducts: ["fx_auto", "fx_discretion"],
  },
];

// ========================================
// 質問定義
// ========================================
export interface MatchingOption {
  label: string;
  value: string;
  score: Partial<Record<string, number>>;
}

export interface MatchingQuestion {
  id: number;
  question: string;
  options: MatchingOption[];
}

// スコアキー：商材ID（keiba等） + 軸キー（ax1_analytical / ax2_stable 等）を併用
export const MATCHING_QUESTIONS: MatchingQuestion[] = [
  {
    id: 1,
    question: "今の働き方に一番近いのは？",
    options: [
      { label: "会社員（フルタイム）", value: "a", score: { fx_auto: 3, keiba: 3, fx_signal: 1, ax1_builder: 2, ax2_stable: 2 } },
      { label: "パート・派遣", value: "b", score: { qoo10: 2, tsukushi: 2, fx_signal: 2, ax1_cautious: 2, ax2_steady: 2 } },
      { label: "自営業・フリーランス", value: "c", score: { shopee: 2, fx_discretion: 2, qoo10: 1, ax1_analytical: 1, ax2_leader: 2 } },
      { label: "現在お仕事をされていない", value: "d", score: { fx_discretion: 3, shopee: 2, qoo10: 2, ax1_intuitive: 2, ax2_speed: 1 } },
    ],
  },
  {
    id: 2,
    question: "副業に使える時間は1日どれくらい？",
    options: [
      { label: "30分以内", value: "a", score: { fx_auto: 3, keiba: 3, ax1_builder: 3, ax2_speed: 2 } },
      { label: "1〜2時間", value: "b", score: { fx_signal: 3, qoo10: 2, tsukushi: 2, ax1_cautious: 2, ax2_steady: 2 } },
      { label: "3時間以上", value: "c", score: { fx_discretion: 3, shopee: 3, qoo10: 1, ax1_analytical: 2, ax2_leader: 2 } },
      { label: "できるだけ時間をかけたくない", value: "d", score: { fx_auto: 3, keiba: 3, ax1_builder: 3, ax2_speed: 2 } },
    ],
  },
  {
    id: 3,
    question: "現在の月収はどれくらいですか？",
    options: [
      { label: "20万円未満", value: "a", score: { tsukushi: 2, qoo10: 2, ax1_cautious: 1, ax2_steady: 1 } },
      { label: "20〜40万円", value: "b", score: { fx_signal: 1, shopee: 1, qoo10: 1, ax1_cautious: 1, ax2_steady: 1 } },
      { label: "40〜60万円", value: "c", score: { fx_auto: 2, fx_signal: 2, keiba: 1, ax1_analytical: 1, ax2_speed: 1 } },
      { label: "60万円以上", value: "d", score: { fx_discretion: 2, keiba: 2, fx_auto: 1, ax1_analytical: 1, ax2_leader: 2 } },
    ],
  },
  {
    id: 4,
    question: "現在の貯蓄・資産額はどれくらいですか？",
    options: [
      { label: "100万円未満", value: "a", score: { tsukushi: 3, qoo10: 2, ax1_cautious: 2, ax2_stable: 2 } },
      { label: "100〜500万円", value: "b", score: { qoo10: 2, fx_signal: 2, shopee: 1, ax1_cautious: 1, ax2_stable: 1 } },
      { label: "500〜1,000万円", value: "c", score: { fx_auto: 2, shopee: 2, keiba: 1, ax1_analytical: 1, ax2_speed: 1 } },
      { label: "1,000万円以上", value: "d", score: { fx_discretion: 2, keiba: 2, fx_auto: 2, ax2_leader: 2, ax2_speed: 1 } },
    ],
  },
  {
    id: 5,
    question: "副業で今の収入にどれくらいプラスしたいですか？",
    options: [
      { label: "月3〜5万円", value: "a", score: { qoo10: 3, tsukushi: 3, ax1_cautious: 2, ax2_steady: 3 } },
      { label: "月10〜30万円", value: "b", score: { shopee: 2, fx_signal: 2, tsukushi: 2, ax1_analytical: 1, ax2_steady: 2 } },
      { label: "月50万円以上", value: "c", score: { fx_discretion: 3, keiba: 2, fx_auto: 1, ax1_intuitive: 1, ax2_speed: 2 } },
      { label: "月100万円以上を目指したい", value: "d", score: { keiba: 3, fx_discretion: 3, ax1_intuitive: 2, ax2_leader: 3 } },
    ],
  },
  {
    id: 6,
    question: "副業を始める際に使えるお金は？",
    options: [
      { label: "5万円以内", value: "a", score: { tsukushi: 3, qoo10: 3, ax1_cautious: 2, ax2_stable: 2 } },
      { label: "10〜30万円くらい", value: "b", score: { shopee: 2, fx_signal: 2, qoo10: 1, ax1_analytical: 1, ax2_steady: 1 } },
      { label: "50万円以上", value: "c", score: { fx_auto: 3, fx_discretion: 2, keiba: 2, ax1_builder: 1, ax2_leader: 1 } },
      { label: "金額より確実性を重視したい", value: "d", score: { tsukushi: 2, qoo10: 2, fx_signal: 1, ax1_cautious: 2, ax2_stable: 2 } },
    ],
  },
  {
    id: 7,
    question: "クレジットカードについて教えてください",
    options: [
      { label: "クレジットカードを複数枚持っている", value: "a", score: {} },
      { label: "クレジットカードを1枚持っている", value: "b", score: {} },
      { label: "クレジットカードを持っていない", value: "c", score: {} },
      { label: "過去に債務整理・自己破産の経験がある", value: "d", score: {} },
    ],
  },
  {
    id: 8,
    question: "今取り組んでいる（取り組んだことがある）副業は？",
    options: [
      { label: "投資系（株・FX・仮想通貨など）", value: "a", score: { fx_auto: 2, fx_signal: 2, fx_discretion: 2, ax1_analytical: 2, ax1_builder: 1 } },
      { label: "物販・転売", value: "b", score: { shopee: 3, qoo10: 2, tsukushi: 2, ax1_intuitive: 2, ax2_steady: 1 } },
      { label: "アフィリエイト・ブログ・クライアントワーク", value: "c", score: { fx_signal: 1, shopee: 1, qoo10: 1, ax1_analytical: 1, ax1_intuitive: 1 } },
      { label: "副業経験はまだない", value: "d", score: { fx_auto: 2, keiba: 2, tsukushi: 1, qoo10: 1, ax1_cautious: 2, ax2_stable: 1 } },
    ],
  },
  {
    id: 9,
    question: "副業の経験年数は？",
    options: [
      { label: "未経験", value: "a", score: { fx_auto: 2, keiba: 2, qoo10: 1, ax1_cautious: 2, ax2_stable: 2 } },
      { label: "半年未満", value: "b", score: { tsukushi: 2, qoo10: 2, fx_signal: 1, ax1_cautious: 1, ax2_steady: 1 } },
      { label: "半年〜2年", value: "c", score: { shopee: 2, fx_signal: 2, fx_discretion: 1, ax1_analytical: 1, ax2_steady: 1 } },
      { label: "2年以上", value: "d", score: { fx_discretion: 3, shopee: 2, ax1_builder: 2, ax2_leader: 2 } },
    ],
  },
  {
    id: 10,
    question: "10万円の臨時収入が入ったら？",
    options: [
      { label: "すぐ貯金する", value: "a", score: { qoo10: 3, tsukushi: 2, ax1_cautious: 2, ax2_stable: 3 } },
      { label: "自分へのご褒美に使う", value: "b", score: { shopee: 1, keiba: 1, fx_signal: 1, ax1_intuitive: 2, ax2_speed: 1 } },
      { label: "投資に回す", value: "c", score: { fx_auto: 2, fx_discretion: 2, keiba: 3, ax1_analytical: 2, ax2_leader: 2 } },
      { label: "副業の資金に充てる", value: "d", score: { shopee: 2, qoo10: 2, tsukushi: 2, ax1_builder: 1, ax2_steady: 2 } },
    ],
  },
  {
    id: 11,
    question: "パソコン作業はどれくらい得意？",
    options: [
      { label: "ほぼ毎日使っている", value: "a", score: { shopee: 2, qoo10: 2, fx_discretion: 2, ax1_analytical: 2 } },
      { label: "スマホ中心だがPCもある", value: "b", score: { fx_auto: 2, fx_signal: 2, keiba: 1, ax1_builder: 1 } },
      { label: "スマホだけで完結したい", value: "c", score: { fx_auto: 3, keiba: 3, ax1_builder: 3, ax2_stable: 1 } },
      { label: "パソコンに苦手意識がある", value: "d", score: { fx_auto: 3, keiba: 2, tsukushi: 1, ax1_builder: 3, ax2_stable: 2 } },
    ],
  },
  {
    id: 12,
    question: "副業で一番避けたいことは？",
    options: [
      { label: "大きな損失を出すこと", value: "a", score: { qoo10: 3, tsukushi: 3, fx_signal: 1, ax1_cautious: 3, ax2_stable: 3 } },
      { label: "毎日の作業に追われること", value: "b", score: { fx_auto: 3, keiba: 3, ax1_builder: 3, ax2_speed: 2 } },
      { label: "成果が出るまで時間がかかること", value: "c", score: { keiba: 2, fx_discretion: 2, tsukushi: 2, ax1_intuitive: 1, ax2_speed: 3 } },
      { label: "難しくて理解できないこと", value: "d", score: { tsukushi: 2, qoo10: 2, fx_auto: 1, ax1_cautious: 2, ax2_stable: 2 } },
    ],
  },
  {
    id: 13,
    question: "副業を本格的に始めたいタイミングは？",
    options: [
      { label: "できれば今すぐにでも", value: "a", score: { tsukushi: 2, fx_auto: 2, keiba: 2, fx_discretion: 1, ax1_intuitive: 2, ax2_speed: 2 } },
      { label: "1ヶ月以内には動き出したい", value: "b", score: { qoo10: 2, shopee: 2, fx_signal: 2, ax1_analytical: 1, ax2_speed: 1 } },
      { label: "じっくり準備してから", value: "c", score: { shopee: 2, fx_discretion: 2, ax1_cautious: 2, ax2_stable: 2 } },
      { label: "良い機会があれば", value: "d", score: { fx_auto: 2, keiba: 2, qoo10: 1, ax1_intuitive: 1, ax2_steady: 1 } },
    ],
  },
];

// ========================================
// 診断結果の型
// ========================================
export interface MatchingResult {
  type: MatchingType;
  scores: Record<string, number>;
  topProducts: Product[];
  allProductScores: { product: Product; score: number }[];
  axis1: Axis1;
  axis2: Axis2;
}

// ========================================
// タイプ判定ロジック（16タイプ：軸1×軸2）
// ========================================
function pickTopAxis<T extends string>(
  scores: Record<string, number>,
  keys: readonly T[],
  prefix: "ax1_" | "ax2_",
): T {
  let top = keys[0];
  let topScore = -Infinity;
  for (const k of keys) {
    const s = scores[prefix + k] ?? 0;
    if (s > topScore) {
      topScore = s;
      top = k;
    }
  }
  return top;
}

function determineType(scores: Record<string, number>): {
  type: MatchingType;
  axis1: Axis1;
  axis2: Axis2;
} {
  const axis1 = pickTopAxis(scores, AXIS1_KEYS, "ax1_");
  const axis2 = pickTopAxis(scores, AXIS2_KEYS, "ax2_");
  const typeId = `${axis1}_${axis2}`;
  const type =
    MATCHING_TYPES.find((t) => t.id === typeId) ?? MATCHING_TYPES[0];
  return { type, axis1, axis2 };
}

// ========================================
// 診断結果を算出
// ========================================
export function calculateMatching(answers: string[]): MatchingResult {
  const scores: Record<string, number> = {};

  answers.forEach((answer, index) => {
    const question = MATCHING_QUESTIONS[index];
    if (!question) return;
    const option = question.options.find((o) => o.value === answer);
    if (!option) return;
    for (const [key, val] of Object.entries(option.score)) {
      scores[key] = (scores[key] || 0) + (val ?? 0);
    }
  });

  const { type, axis1, axis2 } = determineType(scores);

  const allProductScores = PRODUCTS.map((p) => ({
    product: p,
    score: scores[p.id] || 0,
  })).sort((a, b) => b.score - a.score);

  const topProducts = allProductScores.slice(0, 2).map((ps) => ps.product);

  return { type, scores, topProducts, allProductScores, axis1, axis2 };
}

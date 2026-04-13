// ========================================
// 副業マッチング診断ロジック
// ========================================
// 12問の質問で7商材への適性をスコアリングし、6タイプに分類

// ========================================
// 商材定義
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
// タイプ定義
// ========================================
export interface MatchingType {
  id: string;
  name: string;
  emoji: string;
  headline: string;
  description: string;
  longDescription: string;
  traits: string[];
  recommendedProducts: string[]; // product ids
}

export const MATCHING_TYPES: MatchingType[] = [
  {
    id: "steady",
    name: "堅実コツコツ型",
    emoji: "🏗️",
    headline: "地に足のついた堅実コツコツ型",
    description: "リスクを抑えて着実に利益を積み上げるのが得意なタイプです。",
    longDescription:
      "あなたは「確実に手元に残る利益」に最も価値を感じるタイプです。一発逆転よりも、毎月安定して積み上がっていく実感のほうが、はるかにモチベーションになります。\n\n国内ECや仕入れルートが確立された物販ビジネスとの相性が抜群です。つくしルート改のように、仕入れ値と売値の差が最初から見えているモデルなら、あなたの慎重さは「負けない力」として最大限に活きます。\n\n最初の一歩さえ踏み出せれば、あとはあなたのペースでコツコツ続けるだけ。派手さはなくても、半年後に振り返った時に一番確実に結果が出ているのは、このタイプです。",
    traits: ["慎重", "計画的", "安定志向"],
    recommendedProducts: ["qoo10", "tsukushi"],
  },
  {
    id: "global",
    name: "グローバル開拓型",
    emoji: "🌏",
    headline: "世界を舞台にするグローバル開拓型",
    description: "海外マーケットへの好奇心と行動力が武器のタイプです。",
    longDescription:
      "あなたは「まだ誰もやっていない場所」に可能性を感じるタイプです。国内で飽和した市場よりも、成長中の海外マーケットにワクワクする——そんな開拓者精神を持っています。\n\n東南アジアのEC市場は今まさに急成長中。Shopeeツールを使えば、言葉の壁や物流の不安を最小限にしながら、成長市場の波に乗ることができます。\n\n「海外はちょっと不安」という気持ちは、ツールとサポートで解消できます。あなたの好奇心と行動力があれば、国内物販では得られないレベルの利益率を実現できるポテンシャルがあります。",
    traits: ["好奇心旺盛", "チャレンジ精神", "グローバル志向"],
    recommendedProducts: ["shopee"],
  },
  {
    id: "auto",
    name: "完全自動・効率型",
    emoji: "⚡",
    headline: "仕組みで稼ぐ完全自動・効率型",
    description: "自分の時間を使わずにお金に働いてもらいたいタイプです。",
    longDescription:
      "あなたは「自分が動かなくても回る仕組み」に最も魅力を感じるタイプです。本業が忙しい、プライベートの時間も大切にしたい——だからこそ、完全自動で動くシステムに任せるのが理想のスタイル。\n\nFX自動売買や競馬・競艇の自動売買ツールなら、設定した後はシステムが24時間稼働。あなたが寝ている間にも利益を積み上げてくれます。\n\n大切なのは「どのシステムを選ぶか」という最初の判断だけ。そこさえプロと一緒に正しく選べれば、あとはあなたの時間を一切奪わずに資産が育っていきます。",
    traits: ["効率重視", "時間を大切にする", "仕組み志向"],
    recommendedProducts: ["fx_auto", "keiba"],
  },
  {
    id: "analyst",
    name: "データ分析型",
    emoji: "📊",
    headline: "数字で判断するデータ分析型",
    description: "データや根拠に基づいて行動するのが得意なタイプです。",
    longDescription:
      "あなたは「なんとなく」では動けない、根拠とロジックを重視するタイプです。感覚や勘よりも、チャートの形やデータの裏付けがあると安心して行動できる——そんな分析力が最大の武器です。\n\nFXサインツールは、プロのロジックが「買い」「売り」を明確に教えてくれるシステム。あなたの分析力と組み合わせれば、サインの精度をさらに高める使い方ができます。\n\n完全自動だと物足りない、でも全部自分で判断するのは不安——そんなあなたにとって、サインツールは最も相性の良い「半自動」のスタイルです。",
    traits: ["論理的", "分析好き", "根拠重視"],
    recommendedProducts: ["fx_signal"],
  },
  {
    id: "challenger",
    name: "チャレンジャー型",
    emoji: "🔥",
    headline: "自分の腕で勝負するチャレンジャー型",
    description: "スキルを磨いて大きな成果を手にしたいタイプです。",
    longDescription:
      "あなたは「人に任せるより自分でやりたい」「スキルで稼ぐ」ことに強く惹かれるタイプです。楽な道より、実力がそのまま収入に直結する世界のほうが燃える——そんな競争心とプライドを持っています。\n\nFX裁量トレードは、まさにあなたの力が最も試されるフィールド。相場を読み、自分で判断し、自分で利益を掴み取る。成功した時の達成感は、他のどの副業にも代えられません。\n\nもちろん独学だけでは遠回りになります。プロのメンターから最短ルートを学んだ上で、あなたのセンスと行動力を掛け合わせれば、トレーダーとしての成長スピードは格段に上がります。",
    traits: ["向上心", "負けず嫌い", "スキル志向"],
    recommendedProducts: ["fx_discretion"],
  },
  {
    id: "high_return",
    name: "ハイリターン志向型",
    emoji: "🚀",
    headline: "大きく狙うハイリターン志向型",
    description: "リスクを取ってでも大きなリターンを求めるタイプです。",
    longDescription:
      "あなたは「小さく稼ぐ」ことにあまり魅力を感じない、スケールの大きな発想を持つタイプです。人生を変えるレベルのリターンを本気で狙える胆力と、リスクを受け入れる覚悟を持っています。\n\n競馬・競艇の自動売買ツールやFX裁量トレードは、あなたの攻めの姿勢と相性抜群。特に、AI予測を活用した自動売買は、人間の感情に左右されない分、あなたの「攻めたい」という衝動をうまくコントロールしながら高いリターンを狙えます。\n\nただし、攻めるだけでは長く勝ち続けられません。プロのアドバイザーと一緒に「攻めと守りのバランス」を設計することが、ハイリターンを現実にする鍵です。",
    traits: ["大胆", "行動力", "野心的"],
    recommendedProducts: ["keiba", "fx_discretion"],
  },
];

// ========================================
// 質問定義
// ========================================
export interface MatchingOption {
  label: string;
  value: string;
  // 各商材へのスコア加算
  score: Partial<Record<string, number>>;
}

export interface MatchingQuestion {
  id: number;
  question: string;
  options: MatchingOption[];
}

// スコアキー = 商材ID: keiba, shopee, qoo10, tsukushi, fx_auto, fx_signal, fx_discretion
export const MATCHING_QUESTIONS: MatchingQuestion[] = [
  {
    id: 1,
    question: "今の働き方に一番近いのは？",
    options: [
      { label: "会社員（フルタイム）", value: "a", score: { fx_auto: 3, keiba: 3, fx_signal: 1 } },
      { label: "パート・派遣", value: "b", score: { qoo10: 2, tsukushi: 2, fx_signal: 2 } },
      { label: "自営業・フリーランス", value: "c", score: { shopee: 2, fx_discretion: 2, qoo10: 1 } },
      { label: "現在お仕事をされていない", value: "d", score: { fx_discretion: 3, shopee: 2, qoo10: 2 } },
    ],
  },
  {
    id: 2,
    question: "副業に使える時間は1日どれくらい？",
    options: [
      { label: "30分以内", value: "a", score: { fx_auto: 3, keiba: 3 } },
      { label: "1〜2時間", value: "b", score: { fx_signal: 3, qoo10: 2, tsukushi: 2 } },
      { label: "3時間以上", value: "c", score: { fx_discretion: 3, shopee: 3, qoo10: 1 } },
      { label: "できるだけ時間をかけたくない", value: "d", score: { fx_auto: 3, keiba: 3 } },
    ],
  },
  {
    id: 3,
    question: "理想の収入スタイルは？",
    options: [
      { label: "少額でもいいからコツコツ安定", value: "a", score: { qoo10: 3, tsukushi: 3 } },
      { label: "月10〜30万円を安定的に", value: "b", score: { shopee: 2, fx_signal: 2, tsukushi: 2, qoo10: 1 } },
      { label: "リスクがあっても大きく稼ぎたい", value: "c", score: { fx_discretion: 3, keiba: 3 } },
      { label: "完全放置で不労所得がほしい", value: "d", score: { fx_auto: 3, keiba: 3 } },
    ],
  },
  {
    id: 4,
    question: "10万円の臨時収入が入ったら？",
    options: [
      { label: "すぐ貯金する", value: "a", score: { qoo10: 3, tsukushi: 2 } },
      { label: "自分へのご褒美に使う", value: "b", score: { shopee: 1, qoo10: 1, fx_signal: 1, tsukushi: 1 } },
      { label: "増やすために投資に回す", value: "c", score: { fx_auto: 2, fx_discretion: 2, keiba: 3 } },
      { label: "勉強や自己投資に使う", value: "d", score: { fx_discretion: 3, shopee: 2 } },
    ],
  },
  {
    id: 5,
    question: "ゲームをやるならどのタイプ？",
    options: [
      { label: "RPGでコツコツレベル上げ", value: "a", score: { qoo10: 3, tsukushi: 2, shopee: 2 } },
      { label: "パズル・頭脳ゲーム", value: "b", score: { fx_signal: 3, fx_discretion: 2 } },
      { label: "ガチャやギャンブル系", value: "c", score: { keiba: 3, fx_discretion: 2 } },
      { label: "効率よく攻略サイトを見る", value: "d", score: { fx_auto: 3, keiba: 2, fx_signal: 1 } },
    ],
  },
  {
    id: 6,
    question: "海外に対する印象は？",
    options: [
      { label: "海外が好き・抵抗がない", value: "a", score: { shopee: 3 } },
      { label: "興味はあるがちょっと不安", value: "b", score: { shopee: 2, qoo10: 1 } },
      { label: "国内の方が安心", value: "c", score: { qoo10: 3, tsukushi: 3 } },
      { label: "あまり考えたことがない", value: "d", score: { fx_auto: 1, fx_signal: 1, keiba: 1 } },
    ],
  },
  {
    id: 7,
    question: "PC作業はどれくらい得意？",
    options: [
      { label: "ほぼ毎日使っている", value: "a", score: { shopee: 2, qoo10: 2, fx_discretion: 2 } },
      { label: "スマホ中心だがPCもある", value: "b", score: { fx_auto: 2, fx_signal: 2, keiba: 1 } },
      { label: "スマホだけで完結したい", value: "c", score: { fx_auto: 3, keiba: 3 } },
      { label: "新しいツールを覚えるのは好き", value: "d", score: { shopee: 3, qoo10: 2, fx_signal: 2 } },
    ],
  },
  {
    id: 8,
    question: "副業を始めるにあたっての初期投資は？",
    options: [
      { label: "5万円以内で始めたい", value: "a", score: { tsukushi: 3, qoo10: 3 } },
      { label: "10〜30万円くらいなら出せる", value: "b", score: { shopee: 2, fx_signal: 2, qoo10: 1 } },
      { label: "50万円以上でも大丈夫", value: "c", score: { fx_auto: 3, fx_discretion: 2, keiba: 2 } },
      { label: "投資額より確実性が大事", value: "d", score: { tsukushi: 2, qoo10: 2, fx_signal: 1 } },
    ],
  },
  {
    id: 9,
    question: "仕事で一番大事にしていることは？",
    options: [
      { label: "自由な時間", value: "a", score: { fx_auto: 3, keiba: 3 } },
      { label: "安定した収入", value: "b", score: { qoo10: 3, tsukushi: 2 } },
      { label: "大きな成果・達成感", value: "c", score: { fx_discretion: 3, keiba: 2 } },
      { label: "新しいことへの挑戦", value: "d", score: { shopee: 3, fx_discretion: 2 } },
    ],
  },
  {
    id: 10,
    question: "どんなタイプだと言われることが多い？",
    options: [
      { label: "堅実で真面目", value: "a", score: { qoo10: 3, tsukushi: 3 } },
      { label: "直感的で行動力がある", value: "b", score: { keiba: 3, fx_discretion: 2 } },
      { label: "論理的で分析好き", value: "c", score: { fx_signal: 3, fx_discretion: 2 } },
      { label: "おおらかでマイペース", value: "d", score: { fx_auto: 3, keiba: 2 } },
    ],
  },
  {
    id: 11,
    question: "副業で一番避けたいことは？",
    options: [
      { label: "大きな損失を出すこと", value: "a", score: { qoo10: 3, tsukushi: 3, fx_signal: 1 } },
      { label: "毎日の作業に追われること", value: "b", score: { fx_auto: 3, keiba: 3 } },
      { label: "成果が出るまで時間がかかること", value: "c", score: { keiba: 2, fx_discretion: 2, tsukushi: 2 } },
      { label: "難しくて理解できないこと", value: "d", score: { tsukushi: 2, qoo10: 2, fx_auto: 1 } },
    ],
  },
  {
    id: 12,
    question: "副業を本格的に始めたいタイミングは？",
    options: [
      { label: "できれば今すぐにでも", value: "a", score: { tsukushi: 2, fx_auto: 2, keiba: 2, fx_discretion: 1 } },
      { label: "1ヶ月以内には動き出したい", value: "b", score: { qoo10: 2, shopee: 2, fx_signal: 2 } },
      { label: "じっくり準備してから", value: "c", score: { shopee: 2, fx_discretion: 2 } },
      { label: "良い機会があれば", value: "d", score: { fx_auto: 2, keiba: 2, qoo10: 1 } },
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
}

// ========================================
// タイプ判定ロジック
// ========================================
function determineType(scores: Record<string, number>): MatchingType {
  // 各タイプに対して、そのタイプの推奨商材のスコア合計を算出
  let bestType = MATCHING_TYPES[0];
  let bestScore = -1;

  for (const type of MATCHING_TYPES) {
    const typeScore = type.recommendedProducts.reduce(
      (sum, pid) => sum + (scores[pid] || 0),
      0,
    );
    if (typeScore > bestScore) {
      bestScore = typeScore;
      bestType = type;
    }
  }

  return bestType;
}

// ========================================
// 診断結果を算出
// ========================================
export function calculateMatching(answers: string[]): MatchingResult {
  const scores: Record<string, number> = {
    keiba: 0,
    shopee: 0,
    qoo10: 0,
    tsukushi: 0,
    fx_auto: 0,
    fx_signal: 0,
    fx_discretion: 0,
  };

  answers.forEach((answer, index) => {
    const question = MATCHING_QUESTIONS[index];
    if (!question) return;
    const option = question.options.find((o) => o.value === answer);
    if (!option) return;
    for (const [key, val] of Object.entries(option.score)) {
      scores[key] = (scores[key] || 0) + (val ?? 0);
    }
  });

  const type = determineType(scores);

  // 全商材をスコア順にソート
  const allProductScores = PRODUCTS.map((p) => ({
    product: p,
    score: scores[p.id] || 0,
  })).sort((a, b) => b.score - a.score);

  // 上位2商材
  const topProducts = allProductScores.slice(0, 2).map((ps) => ps.product);

  return { type, scores, topProducts, allProductScores };
}

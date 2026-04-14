// ========================================
// 副業マッチング診断ロジック
// ========================================
// 13問の質問で適性をスコアリングし、6タイプに分類
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
  recommendedProducts: string[];
}

export const MATCHING_TYPES: MatchingType[] = [
  {
    id: "steady",
    name: "堅実コツコツ型",
    emoji: "🏗️",
    headline: "地に足のついた堅実コツコツ型",
    description: "リスクを抑えて着実に利益を積み上げるのが得意なタイプです。",
    longDescription:
      "あなたは「確実に手元に残る利益」に最も価値を感じるタイプです。一発逆転よりも、毎月安定して積み上がっていく実感のほうが、はるかにモチベーションになります。\n\n周囲が「もっと攻めたほうがいい」と言っても、あなたの内側にある判断基準はブレません。その芯の強さこそが、あなた最大の武器です。短期的に派手な成果を出す人を見て焦ることがあるかもしれませんが、本当に長期で結果を出し続けるのは、あなたのように「負けない戦い方」ができる人です。\n\n一方で、慎重すぎるがゆえに最初の一歩が遅れがちという面も。「もう少し調べてから」「もう少し準備してから」と言いながら、気づけば半年、1年と時間だけが過ぎていく——そんな経験に心当たりはありませんか？\n\nあなたに合っているのは、仕組みがすでに出来上がっていて、最初のステップが明確に見えるビジネスモデルです。ゼロから何かを生み出すより、すでに勝ちパターンが確立された型に乗って、それを自分のペースで積み重ねていくほうが、あなたの力は何倍にもなります。\n\n堅実なあなただからこそ、正しい方向さえ見つかれば、あとは時間が最大の味方になります。派手さはなくても、半年後に振り返った時に一番確実に結果が出ているのは、間違いなくこのタイプです。",
    traits: ["慎重", "計画的", "安定志向"],
    recommendedProducts: ["qoo10", "tsukushi"],
  },
  {
    id: "global",
    name: "グローバル開拓型",
    emoji: "🌏",
    headline: "世界を舞台にするグローバル開拓型",
    description: "新しい市場や未知の領域に可能性を感じるタイプです。",
    longDescription:
      "あなたは「まだ誰もやっていない場所」に可能性を感じるタイプです。すでに飽和した市場でレッドオーシャンの戦いをするより、成長途上の新しいフィールドでブルーオーシャンを見つけるほうが、あなたの本能が喜びます。\n\n好奇心の強さがあなたの最大のエンジンです。新しい情報に触れた時のワクワク感、まだ見ぬ可能性を想像する時の高揚感——それが行動の原動力になるからこそ、人より一歩早くチャンスを掴めるポテンシャルがあります。\n\nただし、興味の幅が広いぶん、一つのことに集中し続けるのが苦手という側面も。「面白そう」と思って始めたものの、途中で次の新しいことに目移りしてしまう。結果として、どれも中途半端に——そんなパターンに覚えはないでしょうか？\n\nあなたに最適なのは、成長市場の波に乗りながらも、仕組みやツールがしっかりサポートしてくれるビジネスモデルです。あなたの開拓者精神をシステムが支えてくれれば、飽きる前に成果が出て、成果が出るからまた続けられる——そういう好循環が生まれます。\n\nあなたの「好奇心」と「行動力」は、正しいフィールドに置けば、想像以上の結果を生み出す力になります。大切なのは、どこで戦うかを間違えないこと。それさえ見つかれば、あなたのポテンシャルは一気に花開きます。",
    traits: ["好奇心旺盛", "チャレンジ精神", "グローバル志向"],
    recommendedProducts: ["shopee"],
  },
  {
    id: "auto",
    name: "完全自動・効率型",
    emoji: "⚡",
    headline: "仕組みで稼ぐ完全自動・効率型",
    description: "自分の時間を最大限に活かしながら収入を得たいタイプです。",
    longDescription:
      "あなたは「自分が動かなくても回る仕組み」に最も魅力を感じるタイプです。同じ1時間を使うなら、その1時間分だけ稼ぐのではなく、一度の仕組み作りで何十時間分もの成果を生み出したい——そんな合理的な発想を持っています。\n\n本業が忙しくて副業に割ける時間が限られている方、あるいは家族との時間やプライベートも大切にしたい方に多いのがこのタイプ。決して「楽をしたい」のではなく、「限られたリソースで最大の成果を出したい」という、とても合理的な考え方の持ち主です。\n\nあなたの強みは、物事の本質を見抜く力と、無駄を嫌う効率思考。どんなに良い話でも「結局、自分の手を動かし続けないといけないんでしょ？」と感じるものには興味が湧かない。逆に、仕組みとして美しく動くものには、強く心を惹かれるはずです。\n\nただし、「自動」という言葉に惹かれるあまり、中身をよく理解しないまま飛びついてしまうリスクもあります。自動だからこそ、最初の選択——何を、どう動かすか——が決定的に重要です。ここを間違えると、自動で損失が積み上がることにもなりかねません。\n\nだからこそ、あなたに必要なのは「最初の一歩だけプロと一緒に正しく設計する」こと。そこさえ固まれば、あとはあなたの時間を一切奪わずに資産が育っていきます。仕組みに任せる勇気と、最初の設計だけ本気で取り組む姿勢。この2つが揃えば、あなたは最も効率よく結果を出せるタイプです。",
    traits: ["効率重視", "時間を大切にする", "仕組み志向"],
    recommendedProducts: ["fx_auto", "keiba"],
  },
  {
    id: "analyst",
    name: "データ分析型",
    emoji: "📊",
    headline: "数字で判断するデータ分析型",
    description: "データや根拠に基づいて冷静に行動するのが得意なタイプです。",
    longDescription:
      "あなたは「なんとなく」では絶対に動けない、根拠とロジックを何より重視するタイプです。感覚や勘よりも、数字やデータの裏付けがあると安心して行動できる——そんな冷静さが最大の武器です。\n\n周囲が「とりあえずやってみよう」と動く場面でも、あなたはまず情報を集め、分析し、自分なりの仮説を立ててから行動します。そのプロセスがあるからこそ、あなたの判断はブレにくく、一度決めたことを最後までやり切る力があります。\n\n一方で、分析にこだわりすぎて「分析のための分析」に陥ることも。データを集めれば集めるほど新しい疑問が生まれ、結局「まだ足りない」と感じて動けない。完璧な情報が揃う日は永遠に来ないのに、つい「もう少し調べてから」と先延ばしにしてしまう——そんな経験はありませんか？\n\nあなたに向いているのは、判断基準が明確で、あなたの分析力をそのまま活かせるビジネスモデルです。完全に自動化されたものだと物足りなさを感じるかもしれませんが、全てを自分で判断するのは負荷が大きすぎる。その中間——プロのロジックをベースにしながら、あなたの分析力で精度をさらに高められるスタイルが最適です。\n\nあなたの論理的思考力は、正しい仕組みの中に置かれた時に最大の力を発揮します。必要なのは「もっと情報を集めること」ではなく、「すでに十分な判断材料がある」と認識すること。あなたのレベルの分析力があれば、あとは動くだけで結果はついてきます。",
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
      "あなたは「人に任せるより自分でやりたい」「結果は自分の実力で掴み取りたい」——そんな強い意志を持ったタイプです。楽な道よりも、自分のスキルがそのまま収入に直結する世界のほうが燃える。他人と同じことをやるのも面白くない。あなたの中には、常に「もっと上へ」という向上心が燃えています。\n\n勝負強さと負けず嫌いはあなたの最大のエンジンです。「自分にはできる」という根拠のない自信が、困難な場面でもあなたを前に進ませてきたはず。そしてその自信は、これまでの人生で何度も成功体験に裏打ちされてきたものではないでしょうか。\n\nただし、実力主義だからこそ、うまくいかない時に「自分が悪い」と全てを背負い込みやすい面もあります。また、プライドの高さから、人に助けを求めるのが苦手。独学で遠回りしているのに気づかない——あるいは気づいていても認めたくない——そんなこともあるかもしれません。\n\nあなたに最適なのは、スキルアップの余地があり、上達すればするほどリターンが大きくなるビジネスモデルです。ただし、独学で全てをカバーしようとすると、あなたの実力が発揮されるまでに無駄な時間がかかります。プロのメンターから最短ルートを学んだ上で、あなた自身のセンスと判断力を掛け合わせる——これが最も効率的な成長パターンです。\n\nあなたの「自分の力で勝ちたい」という気持ちは、正しい方向に向ければ、とんでもない成果を生み出す可能性を秘めています。大切なのは、その力を発揮できるフィールドを間違えないこと。それだけです。",
    traits: ["向上心", "負けず嫌い", "スキル志向"],
    recommendedProducts: ["fx_discretion"],
  },
  {
    id: "high_return",
    name: "ハイリターン志向型",
    emoji: "🚀",
    headline: "大きく狙うハイリターン志向型",
    description: "リスクを取ってでも人生を変えるリターンを求めるタイプです。",
    longDescription:
      "あなたは「小さく稼ぐ」ことにあまり魅力を感じない、スケールの大きな発想を持つタイプです。月に数万円の副収入よりも、人生のステージそのものを変えるような成果を本気で狙いたい——そんな野心があなたの原動力です。\n\nその大胆さは周囲から見れば無謀に映ることもありますが、あなたにとっては合理的な選択です。「どうせ時間と労力を使うなら、リターンが大きいほうがいい」というシンプルな原則に基づいているのですから。\n\nただし、リスクを取れる胆力がある反面、冷静さを失いやすいのも事実です。大きなチャンスが目の前に現れると、細かいリスク分析をすっ飛ばして飛び込んでしまう。そして一度大きな損失を出すと、それを取り返そうとしてさらに大きなリスクを取る——この負のスパイラルに入ると、あなたの「大胆さ」が最大の敵になります。\n\nあなたに必要なのは、攻めの姿勢を活かしながらも、感情とは別のところに冷静な判断軸を持つことです。あなたの攻撃力にプロの守備力を組み合わせれば、大きなリターンを「再現可能な形」で狙えるようになります。\n\nあなたのように「人生を変えたい」と本気で思える人は、実はそう多くありません。その覚悟自体が才能です。あとは、その覚悟を正しい方向に向けるだけ。間違った方向に全力で走るのが一番もったいない。正しいフィールドを見つけさえすれば、あなたの爆発力は想像を超える結果を生み出します。",
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
  score: Partial<Record<string, number>>;
}

export interface MatchingQuestion {
  id: number;
  question: string;
  options: MatchingOption[];
}

// スコアキー = 商材ID
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
    question: "現在の月収はどれくらいですか？",
    options: [
      { label: "20万円未満", value: "a", score: { tsukushi: 2, qoo10: 2 } },
      { label: "20〜40万円", value: "b", score: { fx_signal: 1, shopee: 1, qoo10: 1 } },
      { label: "40〜60万円", value: "c", score: { fx_auto: 2, fx_signal: 2, keiba: 1 } },
      { label: "60万円以上", value: "d", score: { fx_discretion: 2, keiba: 2, fx_auto: 1 } },
    ],
  },
  {
    id: 4,
    question: "現在の貯蓄・資産額はどれくらいですか？",
    options: [
      { label: "100万円未満", value: "a", score: { tsukushi: 3, qoo10: 2 } },
      { label: "100〜500万円", value: "b", score: { qoo10: 2, fx_signal: 2, shopee: 1 } },
      { label: "500〜1,000万円", value: "c", score: { fx_auto: 2, shopee: 2, keiba: 1 } },
      { label: "1,000万円以上", value: "d", score: { fx_discretion: 2, keiba: 2, fx_auto: 2 } },
    ],
  },
  {
    id: 5,
    question: "副業で今の収入にどれくらいプラスしたいですか？",
    options: [
      { label: "月3〜5万円", value: "a", score: { qoo10: 3, tsukushi: 3 } },
      { label: "月10〜30万円", value: "b", score: { shopee: 2, fx_signal: 2, tsukushi: 2 } },
      { label: "月50万円以上", value: "c", score: { fx_discretion: 3, keiba: 2, fx_auto: 1 } },
      { label: "月100万円以上を目指したい", value: "d", score: { keiba: 3, fx_discretion: 3 } },
    ],
  },
  {
    id: 6,
    question: "副業を始める際に使えるお金は？",
    options: [
      { label: "5万円以内", value: "a", score: { tsukushi: 3, qoo10: 3 } },
      { label: "10〜30万円くらい", value: "b", score: { shopee: 2, fx_signal: 2, qoo10: 1 } },
      { label: "50万円以上", value: "c", score: { fx_auto: 3, fx_discretion: 2, keiba: 2 } },
      { label: "金額より確実性を重視したい", value: "d", score: { tsukushi: 2, qoo10: 2, fx_signal: 1 } },
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
      { label: "投資系（株・FX・仮想通貨など）", value: "a", score: { fx_auto: 2, fx_signal: 2, fx_discretion: 2 } },
      { label: "物販・転売", value: "b", score: { shopee: 3, qoo10: 2, tsukushi: 2 } },
      { label: "アフィリエイト・ブログ・クライアントワーク", value: "c", score: { fx_signal: 1, shopee: 1, qoo10: 1 } },
      { label: "副業経験はまだない", value: "d", score: { fx_auto: 2, keiba: 2, tsukushi: 1, qoo10: 1 } },
    ],
  },
  {
    id: 9,
    question: "副業の経験年数は？",
    options: [
      { label: "未経験", value: "a", score: { fx_auto: 2, keiba: 2, qoo10: 1 } },
      { label: "半年未満", value: "b", score: { tsukushi: 2, qoo10: 2, fx_signal: 1 } },
      { label: "半年〜2年", value: "c", score: { shopee: 2, fx_signal: 2, fx_discretion: 1 } },
      { label: "2年以上", value: "d", score: { fx_discretion: 3, shopee: 2 } },
    ],
  },
  {
    id: 10,
    question: "10万円の臨時収入が入ったら？",
    options: [
      { label: "すぐ貯金する", value: "a", score: { qoo10: 3, tsukushi: 2 } },
      { label: "自分へのご褒美に使う", value: "b", score: { shopee: 1, keiba: 1, fx_signal: 1 } },
      { label: "投資に回す", value: "c", score: { fx_auto: 2, fx_discretion: 2, keiba: 3 } },
      { label: "副業の資金に充てる", value: "d", score: { shopee: 2, qoo10: 2, tsukushi: 2 } },
    ],
  },
  {
    id: 11,
    question: "パソコン作業はどれくらい得意？",
    options: [
      { label: "ほぼ毎日使っている", value: "a", score: { shopee: 2, qoo10: 2, fx_discretion: 2 } },
      { label: "スマホ中心だがPCもある", value: "b", score: { fx_auto: 2, fx_signal: 2, keiba: 1 } },
      { label: "スマホだけで完結したい", value: "c", score: { fx_auto: 3, keiba: 3 } },
      { label: "パソコンに苦手意識がある", value: "d", score: { fx_auto: 3, keiba: 2, tsukushi: 1 } },
    ],
  },
  {
    id: 12,
    question: "副業で一番避けたいことは？",
    options: [
      { label: "大きな損失を出すこと", value: "a", score: { qoo10: 3, tsukushi: 3, fx_signal: 1 } },
      { label: "毎日の作業に追われること", value: "b", score: { fx_auto: 3, keiba: 3 } },
      { label: "成果が出るまで時間がかかること", value: "c", score: { keiba: 2, fx_discretion: 2, tsukushi: 2 } },
      { label: "難しくて理解できないこと", value: "d", score: { tsukushi: 2, qoo10: 2, fx_auto: 1 } },
    ],
  },
  {
    id: 13,
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

  const allProductScores = PRODUCTS.map((p) => ({
    product: p,
    score: scores[p.id] || 0,
  })).sort((a, b) => b.score - a.score);

  const topProducts = allProductScores.slice(0, 2).map((ps) => ps.product);

  return { type, scores, topProducts, allProductScores };
}

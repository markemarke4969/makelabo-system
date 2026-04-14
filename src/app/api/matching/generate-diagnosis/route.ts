import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

type Sections = {
  strengthSection: string;
  animalSection: string;
  riskSection: string;
};

function buildPrompt(userData: Record<string, string>): string {
  return `以下の情報をもとに副業適性診断の結果文を生成してください。

【入力情報】
名前：${userData.name}
年代：${userData.age}
職業：${userData.occupation}
動物占いタイプ：${userData.animal}（${userData.animalDescription}）
副業適性タイプ：${userData.type}
月収：${userData.income}
資産額：${userData.asset}
副業経験：${userData.experience}
避けたいこと：${userData.avoid}
クレジットカード状況：${userData.creditCard}

【出力形式】
以下3セクションをJSON形式で返してください。
マークダウン・コードブロック不要。JSONのみ返すこと。

{
  "strengthSection": "①あなたの本質的な強み（400〜600文字）動物タイプと副業適性タイプの掛け合わせで強みを説明。なぜその組み合わせが強いのかのロジックまで書く。二人称（あなたは）で語りかける文体。※このセクションは特に重要です。必ず400文字以上書いてください。以下の要素を全て含めること：・動物タイプと副業適性タイプの掛け合わせの説明・なぜその組み合わせが強いのかのロジック・入力された年代・月収・資産額を自然に織り込む・具体的なシーンや場面を想像させる描写",
  "animalSection": "②動物タイプのあなたへ（400〜600文字）動物の本質的な特性に必ず触れる。その特性が副業でなぜ強みになるかを副業適性タイプと紐付ける。あなたに合った環境・スタイルの示唆で締める。",
  "riskSection": "③今のあなたに潜むリスク（400〜600文字）現状維持を続けた場合の具体的な損失を描写。インフレ・同世代との格差・時間の損失を絡める。心当たりはありませんか？という問いかけを1つ入れる。面談・商品名・副業名は一切出さない。"
}

【厳守事項】
- クレジットカード状況が"過去に債務整理・自己破産の経験がある"の場合、strengthSectionで"初期資金が少なくても着実に始められる強み"を特に強調すること
- 職業が医療・介護・福祉系または建設・製造・物流系の場合、その職業特性（シフト勤務・体力仕事など）を文章に自然に織り込み、スキマ時間や自動化との親和性を強調すること
- 特定の副業名・商材名は絶対に出さない
- JSONのみ返す。前置き・後書き不要
- 各セクション400文字以上必ず書く
- 各セクションは必ず400文字以上書くこと
- 文字数が足りない場合は、以下の要素を追加して補強すること
  ・その人の年代・月収・資産額・副業経験を必ず文章の中に自然に織り込む
  ・「なぜその組み合わせが強いのか」のロジックをさらに1段階深く掘り下げる
  ・具体的なシーンや場面を想像させる描写を入れる
- 誤字脱字がないよう出力前に見直すこと
- 出力は必ず日本語のみとすること
- 英語・中国語・韓国語・その他外国語の文字を一切混ぜないこと`;
}

async function callClaudeAPI(
  client: Anthropic,
  userData: Record<string, string>,
): Promise<Sections | null> {
  const message = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4096,
    messages: [{ role: "user", content: buildPrompt(userData) }],
  });

  const text =
    message.content[0].type === "text" ? message.content[0].text : "";

  try {
    const parsed = JSON.parse(text);
    if (
      typeof parsed.strengthSection === "string" &&
      typeof parsed.animalSection === "string" &&
      typeof parsed.riskSection === "string"
    ) {
      return parsed as Sections;
    }
    return null;
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  const userData = await request.json();

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "API key not configured" }, { status: 500 });
  }

  const client = new Anthropic({ apiKey });

  let result: Sections | null = null;
  let attempts = 0;
  const maxAttempts = 3;

  while (attempts < maxAttempts) {
    attempts++;
    const candidate = await callClaudeAPI(client, userData);
    if (!candidate) continue;
    result = candidate;

    const allSectionsValid =
      candidate.strengthSection.length >= 400 &&
      candidate.animalSection.length >= 400 &&
      candidate.riskSection.length >= 400;

    if (allSectionsValid) break;
  }

  if (!result) {
    return Response.json(
      { error: "generation_failed" },
      { status: 500 },
    );
  }

  return Response.json(result);
}

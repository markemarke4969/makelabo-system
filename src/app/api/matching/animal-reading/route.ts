import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

export async function POST(request: NextRequest) {
  const { animal, animalTraits, matchingTypeName, matchingTypeId } =
    await request.json();

  if (!animal || !matchingTypeName) {
    return Response.json({ error: "パラメータ不足" }, { status: 400 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "API key not configured" }, { status: 500 });
  }

  const client = new Anthropic({ apiKey });

  const prompt = `あなたは占い師兼キャリアアドバイザーです。
以下の条件で、読んだ人が「自分のことだ」と感じる診断文を1つ書いてください。

【動物タイプ】${animal}（特性：${animalTraits}）
【副業適性タイプ】${matchingTypeName}

【条件】
- 動物の本質的な特性（${animalTraits}）に必ず触れること
- その特性が「なぜ副業で強みになるのか」を副業適性タイプ（${matchingTypeName}）と紐付けて説明すること
- 「あなたはこういう環境が合っている」という方向性の示唆で締めること
- 特定の副業名・商材名（FX、物販、アフィリエイト等）は一切出さないこと
- 文字数：400〜600文字
- 改行で2〜3段落に分けること
- 「です・ます」調で、読みやすく温かみのあるトーン
- 最初の一文で読者を引き込むこと

診断文のみを出力してください。見出しや注釈は不要です。`;

  const message = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1024,
    messages: [{ role: "user", content: prompt }],
  });

  const text =
    message.content[0].type === "text" ? message.content[0].text : "";

  return Response.json({ text });
}

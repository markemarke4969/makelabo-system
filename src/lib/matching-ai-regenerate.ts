import Anthropic from "@anthropic-ai/sdk";
import { supabaseAdmin } from "@/lib/supabase";
import { MATCHING_TYPES } from "@/lib/matching-diagnosis";
import { diagnoseDoubutsuFromISO } from "@/lib/doubutsu-uranai";
import { getDoubutsuProfile } from "@/lib/doubutsu-profile";

// ============================================================
// PR#2-D: 副業診断 AI セクション再生成ユーティリティ
// ============================================================
// matching-ai-retry cron から呼ばれる。
// matching_diagnoses 行を id で取得 → birthday/type_id/answers/name/age_group から
// prompt 入力を再構築 → Claude API 呼出(3 リトライ済)→ ai_* 列を UPDATE。
//
// POST /api/matching/diagnoses/[id]/ai-sections は既存の永続化経路で、結果ページ
// から初回生成時に叩かれる。本 util はその「再生成」を担うため、ロジックの本質
// (prompt + Claude 呼出 + UPDATE)は同等。結果ページ src/app/matching/result/page.tsx
// L242-279 の入力組立てロジックを util 化したもの。
// ============================================================

// 結果ページ src/app/matching/result/page.tsx L22-51 のラベル写像を移植。
// PR#2-D の cron が DB の answers JSON から同じ「日本語表記」に変換するため必要。
// 将来的に共通モジュール化(matching-answer-labels.ts)を検討してよいが、本 PR では
// 結果ページとの差異ゼロを目的にローカル定数として持つ。
const INCOME_LABELS: Record<string, string> = {
  a: "20万円未満",
  b: "20〜40万円",
  c: "40〜60万円",
  d: "60万円以上",
};
const ASSET_LABELS: Record<string, string> = {
  a: "100万円未満",
  b: "100〜500万円",
  c: "500〜1,000万円",
  d: "1,000万円以上",
};
const EXPERIENCE_LABELS: Record<string, string> = {
  a: "未経験",
  b: "半年未満",
  c: "半年〜2年",
  d: "2年以上",
};
const AVOID_LABELS: Record<string, string> = {
  a: "大きな損失を出すこと",
  b: "毎日の作業に追われること",
  c: "成果が出るまで時間がかかること",
  d: "難しくて理解できないこと",
};
const CREDIT_CARD_LABELS: Record<string, string> = {
  a: "クレジットカードを複数枚持っている",
  b: "クレジットカードを1枚持っている",
  c: "クレジットカードを持っていない",
  d: "過去に債務整理・自己破産の経験がある",
};

type Sections = {
  strengthSection: string;
  animalSection: string;
  riskSection: string;
};

function buildPrompt(userData: Record<string, string>): string {
  // 結果ページの POST /api/matching/generate-diagnosis L10-49 と同等プロンプト。
  // 再生成時に文面が結果ページ初回生成と完全一致するよう同一テンプレートを使う。
  return `以下の情報をもとに副業適性診断の結果文を生成してください。

【入力情報】
名前:${userData.name}
年代:${userData.age}
動物占いタイプ:${userData.animal}(${userData.animalDescription})
副業適性タイプ:${userData.type}
月収:${userData.income}
資産額:${userData.asset}
副業経験:${userData.experience}
避けたいこと:${userData.avoid}
クレジットカード状況:${userData.creditCard}

【出力形式】
以下3セクションをJSON形式で返してください。
マークダウン・コードブロック不要。JSONのみ返すこと。

{
  "strengthSection": "①あなたの本質的な強み(400〜600文字)動物タイプと副業適性タイプの掛け合わせで強みを説明。なぜその組み合わせが強いのかのロジックまで書く。二人称(あなたは)で語りかける文体。※このセクションは特に重要です。必ず400文字以上書いてください。以下の要素を全て含めること:・動物タイプと副業適性タイプの掛け合わせの説明・なぜその組み合わせが強いのかのロジック・入力された年代・月収・資産額を自然に織り込む・具体的なシーンや場面を想像させる描写",
  "animalSection": "②動物タイプのあなたへ(400〜600文字)動物の本質的な特性に必ず触れる。その特性が副業でなぜ強みになるかを副業適性タイプと紐付ける。あなたに合った環境・スタイルの示唆で締める。",
  "riskSection": "③今のあなたに潜むリスク(400〜600文字)現状維持を続けた場合の具体的な損失を描写。インフレ・同世代との格差・時間の損失を絡める。心当たりはありませんか?という問いかけを1つ入れる。面談・商品名・副業名は一切出さない。"
}

【厳守事項】
- クレジットカード状況が"過去に債務整理・自己破産の経験がある"の場合、strengthSectionで"初期資金が少なくても着実に始められる強み"を特に強調すること
- 特定の副業名・商材名は絶対に出さない
- JSONのみ返す。前置き・後書き不要
- 各セクション400文字以上必ず書く
- 各セクションは必ず400文字以上書くこと
- 各セクションは必ず3〜4段落に分けること。段落の区切りは改行2つ(\\n\\n)を使う。JSON文字列の中では "\\\\n\\\\n" とエスケープする
- 1段落あたり100〜180文字程度にまとめ、論点が変わるところで段落を分ける(例:結論→根拠→具体例→まとめ)
- 改行なしの一塊の長文は絶対に出力しないこと
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

export interface RegenerateResult {
  ok: boolean;
  reason?: string;
}

/**
 * matching_diagnoses 行を id で取得 → Claude 再呼出 → ai_* 列 UPDATE。
 * - 取得失敗・データ不整合は ok=false + reason 返却(throw しない、cron 全体を止めない)
 * - Claude API は内部で 3 リトライ + 400 文字以上 validation(generate-diagnosis route と同等)
 * - 成功時 ai_generation_status='ready' / ai_generated_at=now() に遷移
 * - 失敗時 status は 'failed' のまま(呼出側で retry_count をインクリメント済)
 */
export async function regenerateAiSectionsForDiagnosis(
  diagnosisId: string,
): Promise<RegenerateResult> {
  // 1. 入力データを DB から再構築
  const { data: row, error: selErr } = await supabaseAdmin
    .from("matching_diagnoses")
    .select("id, name, birthday, age_group, type_id, answers")
    .eq("id", diagnosisId)
    .maybeSingle();

  if (selErr) return { ok: false, reason: `select error: ${selErr.message}` };
  if (!row) return { ok: false, reason: "diagnosis_not_found" };

  const typeId = row.type_id as string;
  const type = MATCHING_TYPES.find((t) => t.id === typeId);
  if (!type) return { ok: false, reason: `unknown type_id: ${typeId}` };

  const birthdayIso =
    typeof row.birthday === "string" && row.birthday ? row.birthday : null;
  const doubutsu = birthdayIso ? diagnoseDoubutsuFromISO(birthdayIso) : null;
  const animalName = doubutsu?.animal ?? "(未判定)";
  const animalTraits = doubutsu
    ? getDoubutsuProfile(doubutsu.animal).traits.join("・")
    : "";

  const answers = Array.isArray(row.answers) ? (row.answers as string[]) : [];

  const userData: Record<string, string> = {
    name: (row.name as string | null) || "あなた",
    age: (row.age_group as string | null) || "不明",
    animal: animalName,
    animalDescription: animalTraits,
    type: type.name,
    income: INCOME_LABELS[answers[1]] || "不明",
    asset: ASSET_LABELS[answers[2]] || "不明",
    experience: EXPERIENCE_LABELS[answers[7]] || "不明",
    avoid: AVOID_LABELS[answers[10]] || "不明",
    creditCard: CREDIT_CARD_LABELS[answers[5]] || "不明",
  };

  // 2. Claude API 呼出(3 リトライ + 400 文字以上 validation)
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { ok: false, reason: "ANTHROPIC_API_KEY unset" };
  const client = new Anthropic({ apiKey });

  let result: Sections | null = null;
  const maxAttempts = 3;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    let candidate: Sections | null = null;
    try {
      candidate = await callClaudeAPI(client, userData);
    } catch (e) {
      console.warn(`[regenerate] Claude API attempt ${attempt + 1} threw:`, e);
      continue;
    }
    if (!candidate) continue;
    result = candidate;
    const allValid =
      candidate.strengthSection.length >= 400 &&
      candidate.animalSection.length >= 400 &&
      candidate.riskSection.length >= 400;
    if (allValid) break;
  }

  if (!result) return { ok: false, reason: "claude_generation_failed" };

  // 3. ai_* 列 UPDATE(POST /api/matching/diagnoses/[id]/ai-sections と同等)
  const now = new Date().toISOString();
  const { error: updErr } = await supabaseAdmin
    .from("matching_diagnoses")
    .update({
      ai_strength_section: result.strengthSection,
      ai_animal_section: result.animalSection,
      ai_risk_section: result.riskSection,
      ai_generated_at: now,
      ai_generation_status: "ready",
      updated_at: now,
    })
    .eq("id", diagnosisId);

  if (updErr) return { ok: false, reason: `update error: ${updErr.message}` };

  return { ok: true };
}

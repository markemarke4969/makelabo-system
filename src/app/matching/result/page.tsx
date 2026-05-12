"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  calculateMatching,
  type MatchingResult,
} from "@/lib/matching-diagnosis";
import {
  diagnoseDoubutsuFromISO,
  type DoubutsuResult,
} from "@/lib/doubutsu-uranai";
import {
  getDoubutsuProfile,
  type DoubutsuProfile,
} from "@/lib/doubutsu-profile";
import {
  generateDiagnosis,
  type DiagnosisResult as AIDiagnosisResult,
} from "@/lib/generateDiagnosis";

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

const LOADING_MESSAGES = [
  "あなたの回答を分析中...",
  "動物占いデータと照合中...",
  "あなただけの診断結果を生成中...",
];

// ========================================
// 簡易グラフコンポーネント（SVG）
// ========================================
function FutureGraph({ initialFund }: { initialFund: number }) {
  const months = [0, 3, 6, 9, 12];
  // 副業あり：初期資金が月10%ずつ成長
  const withSide = months.map((m) => Math.round(initialFund * Math.pow(1.1, m)));
  // 副業なし：インフレ・物価上昇による実質価値目減り（初期資金 × 0.85^(経過月数/12)）
  const withoutSide = months.map((m) =>
    Math.round(initialFund * Math.pow(0.85, m / 12)),
  );
  const maxVal = Math.max(...withSide, initialFund * 1.2);
  const w = 320;
  const h = 180;
  const pad = { top: 20, right: 20, bottom: 30, left: 10 };
  const chartW = w - pad.left - pad.right;
  const chartH = h - pad.top - pad.bottom;

  const toX = (i: number) => pad.left + (i / (months.length - 1)) * chartW;
  const toY = (val: number) =>
    pad.top + chartH - (val / maxVal) * chartH;

  const pathWith = months
    .map((_, i) => `${i === 0 ? "M" : "L"}${toX(i)},${toY(withSide[i])}`)
    .join(" ");
  const pathWithout = months
    .map((_, i) => `${i === 0 ? "M" : "L"}${toX(i)},${toY(withoutSide[i])}`)
    .join(" ");

  const formatMoney = (n: number) =>
    n >= 10000
      ? `${Math.round(n / 10000)}万`
      : `${n.toLocaleString()}円`;

  return (
    <div className="w-full overflow-hidden">
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ maxWidth: 400 }}>
        {/* Grid lines */}
        {[0, 1, 2, 3].map((i) => (
          <line
            key={i}
            x1={pad.left}
            y1={pad.top + (chartH / 3) * i}
            x2={w - pad.right}
            y2={pad.top + (chartH / 3) * i}
            stroke="rgba(255,255,255,0.08)"
          />
        ))}
        {/* Without line */}
        <path d={pathWithout} fill="none" stroke="#ef4444" strokeWidth="2" strokeDasharray="4 4" />
        {/* With line */}
        <path d={pathWith} fill="none" stroke="#22c55e" strokeWidth="2.5" />
        {/* Dots & labels - with */}
        {months.map((m, i) => (
          <g key={`w-${m}`}>
            <circle cx={toX(i)} cy={toY(withSide[i])} r="3" fill="#22c55e" />
            {i === months.length - 1 && (
              <text
                x={toX(i) - 5}
                y={toY(withSide[i]) - 10}
                fill="#22c55e"
                fontSize="10"
                textAnchor="end"
                fontWeight="bold"
              >
                {formatMoney(withSide[i])}
              </text>
            )}
          </g>
        ))}
        {/* Dots & labels - without */}
        {months.map((m, i) => (
          <g key={`wo-${m}`}>
            <circle cx={toX(i)} cy={toY(withoutSide[i])} r="3" fill="#ef4444" />
            {i === months.length - 1 && (
              <text
                x={toX(i) - 5}
                y={toY(withoutSide[i]) + 15}
                fill="#ef4444"
                fontSize="10"
                textAnchor="end"
              >
                {formatMoney(withoutSide[i])}
              </text>
            )}
          </g>
        ))}
        {/* X axis labels */}
        {months.map((m, i) => (
          <text
            key={`x-${m}`}
            x={toX(i)}
            y={h - 5}
            fill="#94a3b8"
            fontSize="10"
            textAnchor="middle"
          >
            {m === 0 ? "今" : `${m}ヶ月後`}
          </text>
        ))}
      </svg>
      <div className="flex justify-center gap-6 mt-2">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-0.5 bg-green-500 rounded" />
          <span className="text-xs text-gray-400">副業を始めた場合</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-0.5 bg-red-500 rounded border-dashed" />
          <span className="text-xs text-gray-400">何もしない場合</span>
        </div>
      </div>
      <p className="text-[10px] text-gray-500 mt-2 text-center leading-relaxed px-2">
        ※何もしない場合はインフレ・物価上昇による
        <br />
        実質的な資産目減りを考慮した試算です
      </p>
    </div>
  );
}

// ========================================
// メインコンポーネント
// ========================================
export default function MatchingResult() {
  const router = useRouter();
  const [result, setResult] = useState<MatchingResult | null>(null);
  const [userName, setUserName] = useState("");
  const [loading, setLoading] = useState(true);
  const [doubutsu, setDoubutsu] = useState<{
    result: DoubutsuResult;
    profile: DoubutsuProfile;
  } | null>(null);
  const [aiDiagnosis, setAiDiagnosis] = useState<AIDiagnosisResult | null>(
    null,
  );
  const [aiLoading, setAiLoading] = useState(false);
  const [loadingMsgIndex, setLoadingMsgIndex] = useState(0);

  // 初期資金（Q6の回答から推定）
  const [initialFund, setInitialFund] = useState(300000);

  // DB保存
  const [diagnosisId, setDiagnosisId] = useState<string | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem("matching_diagnosis");
    if (!stored) {
      router.replace("/matching/shindan");
      return;
    }
    const data = JSON.parse(stored);
    setUserName(data.name || "");
    if (data.savedId) setDiagnosisId(data.savedId);

    const res = calculateMatching(data.answers);
    setResult(res);

    // 初期資金をQ5（副業を始める際に使えるお金）の回答から推定
    const q5Answer = data.answers[4];
    const fundMap: Record<string, number> = {
      a: 50000,
      b: 200000,
      c: 500000,
      d: 300000,
    };
    setInitialFund(fundMap[q5Answer] || 300000);

    // 動物占い
    let animalName = "";
    let animalTraits = "";
    if (data.birthday) {
      const dResult = diagnoseDoubutsuFromISO(data.birthday);
      if (dResult) {
        const profile = getDoubutsuProfile(dResult.animal);
        setDoubutsu({ result: dResult, profile });
        animalName = dResult.animal;
        animalTraits = profile.traits.join("・");
      }
    }

    // Claude APIで3セクションをまとめて生成
    const answers: string[] = data.answers || [];
    setAiLoading(true);
    generateDiagnosis({
      name: data.name || "あなた",
      age: data.ageGroup || "不明",
      animal: animalName || "（未判定）",
      animalDescription: animalTraits || "",
      type: res.type.name,
      income: INCOME_LABELS[answers[1]] || "不明",
      asset: ASSET_LABELS[answers[2]] || "不明",
      experience: EXPERIENCE_LABELS[answers[7]] || "不明",
      avoid: AVOID_LABELS[answers[10]] || "不明",
      creditCard: CREDIT_CARD_LABELS[answers[5]] || "不明",
    })
      .then((json) => {
        if (json) setAiDiagnosis(json);

        // PR#2-A: 生成結果を matching_diagnoses.ai_* に永続化
        // LINE 配信側(line/webhook)が lookup API 経由で読むため。
        // UI 表示には影響させない(失敗時もユーザーには見えない fire-and-forget)。
        const savedId: string | undefined = data.savedId;
        if (!savedId) return;
        const payload = json
          ? {
              strengthSection: json.strengthSection,
              animalSection: json.animalSection,
              riskSection: json.riskSection,
              status: "ready" as const,
            }
          : { status: "failed" as const };
        void fetch(
          `/api/matching/diagnoses/${encodeURIComponent(savedId)}/ai-sections`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          },
        ).catch((e) => {
          console.error("[ai-sections POST] failed:", e);
        });
      })
      .finally(() => setAiLoading(false));

    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ローディング中のメッセージをローテーション
  useEffect(() => {
    if (!aiLoading) return;
    setLoadingMsgIndex(0);
    const id = setInterval(() => {
      setLoadingMsgIndex((i) => (i + 1) % LOADING_MESSAGES.length);
    }, 2000);
    return () => clearInterval(id);
  }, [aiLoading]);

  const handleLineCta = () => {
    if (!diagnosisId) return;
    window.location.href = `${process.env.NEXT_PUBLIC_MATCHING_BRIDGE_URL}?ref=${encodeURIComponent(diagnosisId)}`;
  };

  if (loading || !result) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-400">診断結果を分析中...</p>
        </div>
      </div>
    );
  }

  const { type } = result;
  const heroEmoji = doubutsu?.profile.emoji ?? type.emoji;

  return (
    <div className="min-h-screen px-4 py-6">
      <div className="max-w-lg mx-auto">
        {/* ヒーロー：タイプ結果 */}
        <div className="rounded-2xl bg-white/5 border border-white/10 p-8 mb-6 text-center animate-fade-in">
          <p className="text-blue-400 text-sm font-medium mb-3 tracking-wide">
            {userName ? `${userName}さんの` : "あなたの"}副業適性タイプ
          </p>
          <div className="text-7xl mb-5">{heroEmoji}</div>

          {/* 1. キャラクター名＋動物（大・ゴールド） */}
          <p
            className="font-extrabold text-white mb-3 leading-tight tracking-wide"
            style={{ fontSize: "28px" }}
          >
            あなたは
            <span
              className="mx-1 bg-gradient-to-r from-yellow-300 via-amber-300 to-orange-300 bg-clip-text text-transparent drop-shadow-[0_0_12px_rgba(251,191,36,0.45)]"
              style={{ fontSize: "36px" }}
            >
              『{type.characterName}』
            </span>
            タイプ
            {doubutsu && <>の{doubutsu.result.animal}</>}
            です
          </p>

          {/* 2. タイプ名（小・サブテキスト） */}
          <p className="text-base font-medium text-gray-300 mb-3 leading-tight">
            {type.name}
          </p>
          <div className="flex justify-center gap-2 mb-4 flex-wrap">
            {(doubutsu?.profile.traits ?? type.traits).map((trait) => (
              <span
                key={trait}
                className="px-3 py-1 rounded-full text-xs font-medium bg-blue-500/15 text-blue-300 border border-blue-500/30"
              >
                {trait}
              </span>
            ))}
          </div>
          <p className="text-gray-400 text-base">{type.description}</p>
        </div>

        {/* ①あなたの本質的な強み（Claude API生成） */}
        <div className="rounded-2xl bg-white/5 border border-white/10 p-7 mb-6">
          <h2 className="text-lg font-bold text-blue-400 mb-5 flex items-center gap-2">
            <span className="text-xl">📖</span>
            <span>あなたの本質的な強み</span>
          </h2>
          {aiLoading ? (
            <div className="flex items-center gap-3 py-4">
              <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-base text-gray-400">
                {LOADING_MESSAGES[loadingMsgIndex]}
              </p>
            </div>
          ) : aiDiagnosis ? (
            <div className="space-y-6">
              {aiDiagnosis.strengthSection.split("\n\n").map((p, i) => (
                <p
                  key={i}
                  className="text-gray-200 text-[17px] leading-[2] tracking-wide"
                >
                  {p}
                </p>
              ))}
            </div>
          ) : (
            <p className="text-base text-gray-500">
              診断結果の生成に失敗しました。時間をおいてお試しください。
            </p>
          )}
        </div>

        {/* ②動物タイプのあなたへ（Claude API生成） */}
        {doubutsu && (
          <div className="rounded-2xl bg-white/5 border border-white/10 p-7 mb-6">
            <h2 className="text-lg font-bold text-blue-400 mb-5 flex items-center gap-2">
              <span className="text-xl">🔮</span>
              <span>
                {doubutsu.result.animal}タイプのあなたへ
              </span>
            </h2>
            {aiLoading ? (
              <div className="flex items-center gap-3 py-4">
                <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                <p className="text-base text-gray-400">
                  {LOADING_MESSAGES[loadingMsgIndex]}
                </p>
              </div>
            ) : aiDiagnosis ? (
              <div className="space-y-6">
                {aiDiagnosis.animalSection.split("\n\n").map((p, i) => (
                  <p
                    key={i}
                    className="text-gray-200 text-[17px] leading-[2] tracking-wide"
                  >
                    {p}
                  </p>
                ))}
              </div>
            ) : null}
          </div>
        )}

        {/* AI未来予測（ボタンなしで最初から表示） */}
        <div className="rounded-2xl bg-gradient-to-br from-blue-500/10 to-purple-500/10 border border-blue-500/20 p-6 mb-6">
          <h3 className="text-base font-bold text-blue-400 mb-4 flex items-center gap-2">
            <span className="text-lg">🤖</span>
            <span>AIによる未来予測</span>
          </h3>

          {/* グラフ */}
          <div className="mb-5 p-4 rounded-xl bg-white/5">
            <p className="text-xs text-gray-400 mb-3 text-center">
              初期資金 {initialFund.toLocaleString()}円 での資産推移シミュレーション
            </p>
            <FutureGraph initialFund={initialFund} />
          </div>

          {/* ③今のあなたに潜むリスク（Claude API生成） */}
          <div className="mb-5 p-5 rounded-xl bg-red-500/5 border border-red-500/15">
            <p className="text-red-400 text-sm font-bold mb-3 flex items-center gap-1.5">
              <span className="text-base">⚠️</span> 今のあなたに潜むリスク
            </p>
            {aiLoading ? (
              <div className="flex items-center gap-3 py-2">
                <div className="w-4 h-4 border-2 border-red-400 border-t-transparent rounded-full animate-spin" />
                <p className="text-base text-gray-400">
                  {LOADING_MESSAGES[loadingMsgIndex]}
                </p>
              </div>
            ) : aiDiagnosis ? (
              <div className="space-y-5">
                {aiDiagnosis.riskSection.split("\n\n").map((p, i) => (
                  <p
                    key={i}
                    className="text-gray-200 text-base leading-[1.95] tracking-wide"
                  >
                    {p}
                  </p>
                ))}
              </div>
            ) : (
              <p className="text-gray-200 text-base leading-[1.95] tracking-wide">
                副業を始めないまま1年が過ぎると、物価上昇や増税の影響で実質的な可処分所得は減り続けます。今の{initialFund.toLocaleString()}円も、インフレにより1年後には実質{Math.round(initialFund * 0.85).toLocaleString()}円の価値に。
              </p>
            )}
          </div>

          {/* 適性を活かした場合 */}
          <div className="p-5 rounded-xl bg-green-500/5 border border-green-500/15">
            <p className="text-green-400 text-sm font-bold mb-3 flex items-center gap-1.5">
              <span className="text-base">✨</span> 適性を活かした場合
            </p>
            <p className="text-gray-200 text-base leading-[1.95] tracking-wide">
              {userName ? `${userName}さん` : "あなた"}の「{type.name}」としての強みを正しい方向に活かせば、3ヶ月後には最初の成果が見え始め、半年後には安定した副収入の柱を築ける可能性があります。あなたの性格に合ったやり方だからこそ、無理なく続けられ、1年後には資産{Math.round(initialFund * Math.pow(1.1, 12)).toLocaleString()}円も現実的な目標です。
            </p>
          </div>
        </div>

        {/* LINE登録CTA */}
        <div
          className="rounded-2xl p-6 mb-6 border"
          style={{
            background:
              "linear-gradient(135deg, rgba(6,199,85,0.18), rgba(6,199,85,0.08))",
            borderColor: "rgba(6,199,85,0.35)",
            boxShadow: "0 0 40px rgba(6,199,85,0.18)",
          }}
        >
          <div className="text-center mb-5">
            <h3 className="text-xl font-bold text-white mb-2 leading-snug">
              ここまでは無料診断の結果
            </h3>
            <p className="text-gray-300 text-sm leading-relaxed">
              {userName ? `${userName}さん` : "あなた"}の「{type.characterName}」タイプ
              {doubutsu && <>×{doubutsu.result.animal}</>}に合わせた
              <br />
              <span className="text-white font-medium">
                AI副業レポート
              </span>
              は専用LINEからお届けします。
            </p>
          </div>

          <button
            onClick={handleLineCta}
            disabled={!diagnosisId}
            className="w-full py-4 rounded-xl font-bold text-white text-base bg-[#06C755] hover:bg-[#05B04C] transition-colors active:scale-[0.98] disabled:opacity-50 shadow-lg shadow-[#06C755]/25 flex items-center justify-center gap-2"
          >
            <span className="text-lg">💬</span>
            <span>あなた専用のAI副業レポートをLINEで受け取る</span>
          </button>
          <p className="text-center text-xs text-gray-500 mt-3">
            ※ LINE登録は無料です。不要になればいつでもブロックできます。
          </p>
        </div>
      </div>
    </div>
  );
}

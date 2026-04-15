"use client";

import { useState, useEffect, useMemo } from "react";
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
            stroke="rgba(76, 175, 130, 0.15)"
          />
        ))}
        {/* Without line */}
        <path d={pathWithout} fill="none" stroke="#FF8C42" strokeWidth="2" strokeDasharray="4 4" />
        {/* With line */}
        <path d={pathWith} fill="none" stroke="#4CAF82" strokeWidth="2.5" />
        {/* Dots & labels - with */}
        {months.map((m, i) => (
          <g key={`w-${m}`}>
            <circle cx={toX(i)} cy={toY(withSide[i])} r="3" fill="#4CAF82" />
            {i === months.length - 1 && (
              <text
                x={toX(i) - 5}
                y={toY(withSide[i]) - 10}
                fill="#4CAF82"
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
            <circle cx={toX(i)} cy={toY(withoutSide[i])} r="3" fill="#FF8C42" />
            {i === months.length - 1 && (
              <text
                x={toX(i) - 5}
                y={toY(withoutSide[i]) + 15}
                fill="#FF8C42"
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
            fill="#888888"
            fontSize="10"
            textAnchor="middle"
          >
            {m === 0 ? "今" : `${m}ヶ月後`}
          </text>
        ))}
      </svg>
      <div className="flex justify-center gap-6 mt-2">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-0.5 bg-[#4CAF82] rounded" />
          <span className="text-xs text-[#888888] font-medium">副業を始めた場合</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-0.5 bg-[#FF8C42] rounded border-dashed" />
          <span className="text-xs text-[#888888] font-medium">何もしない場合</span>
        </div>
      </div>
      <p className="text-[10px] text-[#888888] mt-2 text-center leading-relaxed px-2">
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

  // 面談予約フォーム
  const [showBooking, setShowBooking] = useState(false);
  const [bookingDate, setBookingDate] = useState("");
  const [bookingTime, setBookingTime] = useState("");
  const [contactMethod, setContactMethod] = useState("phone");
  const [bookingSubmitting, setBookingSubmitting] = useState(false);
  const [bookingDone, setBookingDone] = useState(false);

  const availableDates = useMemo(() => {
    const dates: string[] = [];
    const now = new Date();
    for (let i = 1; i <= 14; i++) {
      const d = new Date(now);
      d.setDate(d.getDate() + i);
      dates.push(d.toISOString().split("T")[0]);
    }
    return dates;
  }, []);

  const timeSlots = [
    "10:00", "11:00", "13:00", "14:00", "15:00", "16:00", "17:00", "19:00", "20:00",
  ];

  const formatDate = (iso: string) => {
    const d = new Date(iso + "T00:00:00");
    const weekdays = ["日", "月", "火", "水", "木", "金", "土"];
    return `${d.getMonth() + 1}/${d.getDate()}（${weekdays[d.getDay()]}）`;
  };

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

  const handleBooking = async () => {
    if (!diagnosisId || !bookingDate || !bookingTime) return;
    setBookingSubmitting(true);
    try {
      const resp = await fetch("/api/matching/consultations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          diagnosisId,
          preferredDate: bookingDate,
          preferredTime: bookingTime,
          contactMethod,
        }),
      });
      if (resp.ok) setBookingDone(true);
    } catch {
      // エラーでも画面は維持
    } finally {
      setBookingSubmitting(false);
    }
  };

  if (loading || !result) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-2 border-[#4CAF82] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-[#888888] font-medium">診断結果を分析中...</p>
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
        <div className="m-card p-8 mb-6 text-center animate-fade-in">
          <p className="text-[#4CAF82] text-sm font-bold mb-3 tracking-wide">
            {userName ? `${userName}さんの` : "あなたの"}副業適性タイプ
          </p>
          <div className="text-7xl mb-5">{heroEmoji}</div>

          {/* 1. キャラクター名＋動物（大） */}
          <p
            className="font-extrabold text-[#333333] mb-3 leading-tight"
            style={{ fontSize: "28px" }}
          >
            あなたは
            <span
              className="mx-1 text-[#FF8C42]"
              style={{ fontSize: "36px" }}
            >
              『{type.characterName}』
            </span>
            タイプ
            {doubutsu && <>の{doubutsu.result.animal}</>}
            です
          </p>

          {/* 2. タイプ名（小・サブテキスト） */}
          <p className="text-base font-semibold text-[#888888] mb-3 leading-tight">
            {type.name}
          </p>
          <div className="flex justify-center gap-2 mb-4 flex-wrap">
            {(doubutsu?.profile.traits ?? type.traits).map((trait) => (
              <span
                key={trait}
                className="px-3 py-1 rounded-full text-xs font-bold bg-[#E6F4EC] text-[#4CAF82] border border-[#4CAF82]/30"
              >
                {trait}
              </span>
            ))}
          </div>
          <p className="text-[#333333] text-base leading-relaxed">{type.description}</p>
        </div>

        {/* ①あなたの本質的な強み（Claude API生成） */}
        <div className="m-card p-7 mb-6">
          <h2 className="text-lg font-extrabold text-[#4CAF82] mb-5 flex items-center gap-2">
            <span className="text-xl">📖</span>
            <span>あなたの本質的な強み</span>
          </h2>
          {aiLoading ? (
            <div className="flex items-center gap-3 py-4">
              <div className="w-5 h-5 border-2 border-[#4CAF82] border-t-transparent rounded-full animate-spin" />
              <p className="text-base text-[#888888] font-medium">
                {LOADING_MESSAGES[loadingMsgIndex]}
              </p>
            </div>
          ) : aiDiagnosis ? (
            <div className="space-y-6">
              {aiDiagnosis.strengthSection.split("\n\n").map((p, i) => (
                <p
                  key={i}
                  className="text-[#333333] text-[17px] leading-[2] tracking-wide"
                >
                  {p}
                </p>
              ))}
            </div>
          ) : (
            <p className="text-base text-[#888888]">
              診断結果の生成に失敗しました。時間をおいてお試しください。
            </p>
          )}
        </div>

        {/* ②動物タイプのあなたへ（Claude API生成） */}
        {doubutsu && (
          <div className="m-card p-7 mb-6">
            <h2 className="text-lg font-extrabold text-[#4CAF82] mb-5 flex items-center gap-2">
              <span className="text-xl">🔮</span>
              <span>
                {doubutsu.result.animal}タイプのあなたへ
              </span>
            </h2>
            {aiLoading ? (
              <div className="flex items-center gap-3 py-4">
                <div className="w-5 h-5 border-2 border-[#4CAF82] border-t-transparent rounded-full animate-spin" />
                <p className="text-base text-[#888888] font-medium">
                  {LOADING_MESSAGES[loadingMsgIndex]}
                </p>
              </div>
            ) : aiDiagnosis ? (
              <div className="space-y-6">
                {aiDiagnosis.animalSection.split("\n\n").map((p, i) => (
                  <p
                    key={i}
                    className="text-[#333333] text-[17px] leading-[2] tracking-wide"
                  >
                    {p}
                  </p>
                ))}
              </div>
            ) : null}
          </div>
        )}

        {/* AI未来予測 */}
        <div className="m-card-soft p-6 mb-6">
          <h3 className="text-base font-extrabold text-[#4CAF82] mb-4 flex items-center gap-2">
            <span className="text-lg">🤖</span>
            <span>AIによる未来予測</span>
          </h3>

          {/* グラフ */}
          <div className="mb-5 p-4 rounded-2xl bg-white border border-[#4CAF82]/15">
            <p className="text-xs text-[#888888] mb-3 text-center font-medium">
              初期資金 {initialFund.toLocaleString()}円 での資産推移シミュレーション
            </p>
            <FutureGraph initialFund={initialFund} />
          </div>

          {/* ③今のあなたに潜むリスク（Claude API生成） */}
          <div className="mb-5 p-5 rounded-2xl bg-[#FFF4EC] border border-[#FF8C42]/30">
            <p className="text-[#FF6B35] text-sm font-extrabold mb-3 flex items-center gap-1.5">
              <span className="text-base">⚠️</span> 今のあなたに潜むリスク
            </p>
            {aiLoading ? (
              <div className="flex items-center gap-3 py-2">
                <div className="w-4 h-4 border-2 border-[#FF8C42] border-t-transparent rounded-full animate-spin" />
                <p className="text-base text-[#888888] font-medium">
                  {LOADING_MESSAGES[loadingMsgIndex]}
                </p>
              </div>
            ) : aiDiagnosis ? (
              <div className="space-y-5">
                {aiDiagnosis.riskSection.split("\n\n").map((p, i) => (
                  <p
                    key={i}
                    className="text-[#333333] text-base leading-[1.95] tracking-wide"
                  >
                    {p}
                  </p>
                ))}
              </div>
            ) : (
              <p className="text-[#333333] text-base leading-[1.95] tracking-wide">
                副業を始めないまま1年が過ぎると、物価上昇や増税の影響で実質的な可処分所得は減り続けます。今の{initialFund.toLocaleString()}円も、インフレにより1年後には実質{Math.round(initialFund * 0.85).toLocaleString()}円の価値に。
              </p>
            )}
          </div>

          {/* 適性を活かした場合 */}
          <div className="p-5 rounded-2xl bg-[#E6F4EC] border border-[#4CAF82]/30">
            <p className="text-[#4CAF82] text-sm font-extrabold mb-3 flex items-center gap-1.5">
              <span className="text-base">✨</span> 適性を活かした場合
            </p>
            <p className="text-[#333333] text-base leading-[1.95] tracking-wide">
              {userName ? `${userName}さん` : "あなた"}の「{type.name}」としての強みを正しい方向に活かせば、3ヶ月後には最初の成果が見え始め、半年後には安定した副収入の柱を築ける可能性があります。あなたの性格に合ったやり方だからこそ、無理なく続けられ、1年後には資産{Math.round(initialFund * Math.pow(1.1, 12)).toLocaleString()}円も現実的な目標です。
            </p>
          </div>
        </div>

        {/* 個別相談予約 */}
        {!bookingDone ? (
          <div className="m-card p-6 mb-6">
            <div className="text-center mb-5">
              <div className="text-4xl mb-3">💬</div>
              <h3 className="text-xl font-extrabold text-[#333333] mb-2">
                専門アドバイザーに相談
              </h3>
              <p className="text-[#333333] text-sm leading-relaxed">
                診断データをもとに、あなたに合った
                <br />
                具体的な副業プランを個別にお伝えします。
                <br />
                <span className="text-[#4CAF82] font-bold">
                  無料・オンライン・60分
                </span>
              </p>
            </div>

            {!showBooking ? (
              <>
                <button
                  onClick={() => setShowBooking(true)}
                  disabled={!diagnosisId}
                  className="m-cta w-full py-4 text-base active:scale-[0.98]"
                >
                  無料の個別相談を予約する
                </button>
                <p className="text-center text-xs text-[#888888] mt-3">
                  ※ 強引な勧誘は一切ありません
                </p>
              </>
            ) : (
              <div className="space-y-4 animate-fade-in">
                {/* 希望日 */}
                <div>
                  <label className="block text-sm font-bold text-[#333333] mb-2">
                    ご希望の日程
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {availableDates.map((date) => (
                      <button
                        key={date}
                        onClick={() => setBookingDate(date)}
                        className={`m-pill py-2.5 text-sm ${bookingDate === date ? "m-pill-active" : ""}`}
                      >
                        {formatDate(date)}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 希望時間 */}
                {bookingDate && (
                  <div>
                    <label className="block text-sm font-bold text-[#333333] mb-2">
                      ご希望の時間帯
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      {timeSlots.map((time) => (
                        <button
                          key={time}
                          onClick={() => setBookingTime(time)}
                          className={`m-pill py-2.5 text-sm ${bookingTime === time ? "m-pill-active" : ""}`}
                        >
                          {time}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* 相談方法 */}
                {bookingTime && (
                  <div>
                    <label className="block text-sm font-bold text-[#333333] mb-2">
                      ご希望の相談方法
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { value: "phone", label: "電話" },
                        { value: "zoom", label: "Zoom" },
                        { value: "line", label: "LINE通話" },
                      ].map((m) => (
                        <button
                          key={m.value}
                          onClick={() => setContactMethod(m.value)}
                          className={`m-pill py-2.5 text-sm ${contactMethod === m.value ? "m-pill-active" : ""}`}
                        >
                          {m.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* 予約確定ボタン */}
                {bookingDate && bookingTime && (
                  <div className="pt-2">
                    <p className="text-center text-sm text-[#333333] mb-3">
                      <span className="text-[#4CAF82] font-bold">
                        {formatDate(bookingDate)} {bookingTime}〜
                      </span>
                      （{contactMethod === "phone" ? "電話" : contactMethod === "zoom" ? "Zoom" : "LINE通話"}）
                    </p>
                    <button
                      onClick={handleBooking}
                      disabled={bookingSubmitting}
                      className="m-cta w-full py-4 text-base active:scale-[0.98]"
                    >
                      {bookingSubmitting ? (
                        <span className="flex items-center justify-center gap-2">
                          <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          予約中...
                        </span>
                      ) : (
                        "この日時で予約する"
                      )}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="m-card p-6 mb-6 text-center animate-fade-in" style={{ background: "#E6F4EC" }}>
            <div className="text-4xl mb-3">✅</div>
            <h3 className="text-xl font-extrabold text-[#333333] mb-2">
              予約が完了しました！
            </h3>
            <p className="text-[#333333] text-sm leading-relaxed mb-2">
              <span className="text-[#4CAF82] font-bold">
                {formatDate(bookingDate)} {bookingTime}〜
              </span>
            </p>
            <p className="text-[#888888] text-xs leading-relaxed">
              担当アドバイザーから事前にご連絡いたします。
              <br />
              お気軽にご質問やご要望をお伝えください。
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

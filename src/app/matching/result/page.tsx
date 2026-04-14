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
  // 副業なし：インフレで年3%目減り（月0.25%）
  const withoutSide = months.map((m) =>
    Math.round(initialFund * Math.pow(0.9975, m)),
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

    // 初期資金をQ6の回答から推定
    const q6Answer = data.answers[5];
    const fundMap: Record<string, number> = {
      a: 50000,
      b: 200000,
      c: 500000,
      d: 300000,
    };
    setInitialFund(fundMap[q6Answer] || 300000);

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
      income: INCOME_LABELS[answers[2]] || "不明",
      asset: ASSET_LABELS[answers[3]] || "不明",
      experience: EXPERIENCE_LABELS[answers[7]] || "不明",
      avoid: AVOID_LABELS[answers[10]] || "不明",
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
          <div className="w-10 h-10 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-400">診断結果を分析中...</p>
        </div>
      </div>
    );
  }

  const { type } = result;
  const heroEmoji = doubutsu?.profile.emoji ?? type.emoji;
  const heroHeadline = doubutsu
    ? `${type.name}の${doubutsu.result.animal}タイプ`
    : type.headline;

  return (
    <div className="min-h-screen px-4 py-6">
      <div className="max-w-lg mx-auto">
        {/* ヒーロー：タイプ結果 */}
        <div className="rounded-2xl bg-white/5 border border-white/10 p-8 mb-6 text-center animate-fade-in">
          <p className="text-blue-400 text-sm font-medium mb-3 tracking-wide">
            {userName ? `${userName}さんの` : "あなたの"}副業適性タイプ
          </p>
          <div className="text-7xl mb-5">{heroEmoji}</div>
          <h1 className="text-3xl font-bold text-white mb-3 leading-tight">
            {heroHeadline}
          </h1>
          {doubutsu && (
            <p className="text-xs text-gray-500 tracking-wide mb-3">
              {doubutsu.profile.groupLabel} ／ {doubutsu.result.color} ／ 運命数
              {doubutsu.result.destinyNumber}
            </p>
          )}
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
          <p className="text-gray-400 text-sm">{type.description}</p>
        </div>

        {/* ①あなたの本質的な強み（Claude API生成） */}
        <div className="rounded-2xl bg-white/5 border border-white/10 p-6 mb-6">
          <h2 className="text-base font-bold text-blue-400 mb-4 flex items-center gap-2">
            <span className="text-lg">📖</span>
            <span>あなたの本質的な強み</span>
          </h2>
          {aiLoading ? (
            <div className="flex items-center gap-3 py-4">
              <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-gray-400">
                {LOADING_MESSAGES[loadingMsgIndex]}
              </p>
            </div>
          ) : aiDiagnosis ? (
            <div className="space-y-4">
              {aiDiagnosis.strengthSection.split("\n\n").map((p, i) => (
                <p
                  key={i}
                  className="text-gray-200 text-[15px] leading-[1.9] tracking-wide"
                >
                  {p}
                </p>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-500">
              診断結果の生成に失敗しました。時間をおいてお試しください。
            </p>
          )}
        </div>

        {/* ②動物タイプのあなたへ（Claude API生成） */}
        {doubutsu && (
          <div className="rounded-2xl bg-white/5 border border-white/10 p-6 mb-6">
            <h2 className="text-base font-bold text-blue-400 mb-4 flex items-center gap-2">
              <span className="text-lg">🔮</span>
              <span>
                {doubutsu.result.animal}タイプのあなたへ
              </span>
            </h2>
            {aiLoading ? (
              <div className="flex items-center gap-3 py-4">
                <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                <p className="text-sm text-gray-400">
                  {LOADING_MESSAGES[loadingMsgIndex]}
                </p>
              </div>
            ) : aiDiagnosis ? (
              <div className="space-y-4">
                {aiDiagnosis.animalSection.split("\n\n").map((p, i) => (
                  <p
                    key={i}
                    className="text-gray-200 text-[15px] leading-[1.9] tracking-wide"
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
          <div className="mb-4 p-4 rounded-xl bg-red-500/5 border border-red-500/15">
            <p className="text-red-400 text-xs font-bold mb-2 flex items-center gap-1">
              <span>⚠️</span> 今のあなたに潜むリスク
            </p>
            {aiLoading ? (
              <div className="flex items-center gap-3 py-2">
                <div className="w-4 h-4 border-2 border-red-400 border-t-transparent rounded-full animate-spin" />
                <p className="text-xs text-gray-400">
                  {LOADING_MESSAGES[loadingMsgIndex]}
                </p>
              </div>
            ) : aiDiagnosis ? (
              <div className="space-y-3">
                {aiDiagnosis.riskSection.split("\n\n").map((p, i) => (
                  <p
                    key={i}
                    className="text-gray-300 text-sm leading-relaxed"
                  >
                    {p}
                  </p>
                ))}
              </div>
            ) : (
              <p className="text-gray-300 text-sm leading-relaxed">
                副業を始めないまま1年が過ぎると、物価上昇や増税の影響で実質的な可処分所得は減り続けます。今の{initialFund.toLocaleString()}円も、インフレにより1年後には実質{Math.round(initialFund * 0.97).toLocaleString()}円の価値に。
              </p>
            )}
          </div>

          {/* 適性を活かした場合 */}
          <div className="p-4 rounded-xl bg-green-500/5 border border-green-500/15">
            <p className="text-green-400 text-xs font-bold mb-2 flex items-center gap-1">
              <span>✨</span> 適性を活かした場合
            </p>
            <p className="text-gray-300 text-sm leading-relaxed">
              {userName ? `${userName}さん` : "あなた"}の「{type.name}」としての強みを正しい方向に活かせば、3ヶ月後には最初の成果が見え始め、半年後には安定した副収入の柱を築ける可能性があります。あなたの性格に合ったやり方だからこそ、無理なく続けられ、1年後には資産{Math.round(initialFund * Math.pow(1.1, 12)).toLocaleString()}円も現実的な目標です。
            </p>
          </div>
        </div>

        {/* 個別相談予約 */}
        {!bookingDone ? (
          <div
            className="rounded-2xl p-6 mb-6 border"
            style={{
              background:
                "linear-gradient(135deg, rgba(59,130,246,0.15), rgba(6,182,212,0.1))",
              borderColor: "rgba(59,130,246,0.3)",
              boxShadow: "0 0 40px rgba(59,130,246,0.15)",
            }}
          >
            <div className="text-center mb-5">
              <div className="text-3xl mb-3">💬</div>
              <h3 className="text-xl font-bold text-white mb-2">
                専門アドバイザーに相談
              </h3>
              <p className="text-gray-300 text-sm leading-relaxed">
                診断データをもとに、あなたに合った
                <br />
                具体的な副業プランを個別にお伝えします。
                <br />
                <span className="text-blue-300 font-medium">
                  無料・オンライン・60分
                </span>
              </p>
            </div>

            {!showBooking ? (
              <>
                <button
                  onClick={() => setShowBooking(true)}
                  disabled={!diagnosisId}
                  className="w-full py-4 rounded-xl font-bold text-white text-base bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 transition-all shadow-lg shadow-blue-500/25 active:scale-[0.98] disabled:opacity-50"
                >
                  無料の個別相談を予約する
                </button>
                <p className="text-center text-xs text-gray-500 mt-3">
                  ※ 強引な勧誘は一切ありません
                </p>
              </>
            ) : (
              <div className="space-y-4 animate-fade-in">
                {/* 希望日 */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    ご希望の日程
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {availableDates.map((date) => (
                      <button
                        key={date}
                        onClick={() => setBookingDate(date)}
                        className={`py-2.5 rounded-lg text-sm font-medium transition-all ${
                          bookingDate === date
                            ? "bg-blue-500 text-white"
                            : "bg-white/5 border border-white/15 text-gray-300 hover:bg-white/10"
                        }`}
                      >
                        {formatDate(date)}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 希望時間 */}
                {bookingDate && (
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      ご希望の時間帯
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      {timeSlots.map((time) => (
                        <button
                          key={time}
                          onClick={() => setBookingTime(time)}
                          className={`py-2.5 rounded-lg text-sm font-medium transition-all ${
                            bookingTime === time
                              ? "bg-blue-500 text-white"
                              : "bg-white/5 border border-white/15 text-gray-300 hover:bg-white/10"
                          }`}
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
                    <label className="block text-sm font-medium text-gray-300 mb-2">
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
                          className={`py-2.5 rounded-lg text-sm font-medium transition-all ${
                            contactMethod === m.value
                              ? "bg-blue-500 text-white"
                              : "bg-white/5 border border-white/15 text-gray-300 hover:bg-white/10"
                          }`}
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
                    <p className="text-center text-sm text-gray-300 mb-3">
                      <span className="text-blue-400 font-medium">
                        {formatDate(bookingDate)} {bookingTime}〜
                      </span>
                      （{contactMethod === "phone" ? "電話" : contactMethod === "zoom" ? "Zoom" : "LINE通話"}）
                    </p>
                    <button
                      onClick={handleBooking}
                      disabled={bookingSubmitting}
                      className="w-full py-4 rounded-xl font-bold text-white text-base bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 transition-all shadow-lg shadow-blue-500/25 active:scale-[0.98] disabled:opacity-70"
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
          <div className="rounded-2xl bg-green-500/10 border border-green-500/20 p-6 mb-6 text-center animate-fade-in">
            <div className="text-4xl mb-3">✅</div>
            <h3 className="text-xl font-bold text-white mb-2">
              予約が完了しました！
            </h3>
            <p className="text-gray-300 text-sm leading-relaxed mb-2">
              <span className="text-green-400 font-medium">
                {formatDate(bookingDate)} {bookingTime}〜
              </span>
            </p>
            <p className="text-gray-400 text-xs leading-relaxed">
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

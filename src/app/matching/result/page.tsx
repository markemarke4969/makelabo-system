"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  PRODUCTS,
  calculateMatching,
  type MatchingResult,
} from "@/lib/matching-diagnosis";

export default function MatchingResult() {
  const router = useRouter();
  const [result, setResult] = useState<MatchingResult | null>(null);
  const [userName, setUserName] = useState("");
  const [loading, setLoading] = useState(true);
  const [showAi, setShowAi] = useState(false);
  const [aiGenerating, setAiGenerating] = useState(false);

  // DB保存
  const [diagnosisId, setDiagnosisId] = useState<string | null>(null);
  const [saveError, setSaveError] = useState(false);

  // 面談予約フォーム
  const [showBooking, setShowBooking] = useState(false);
  const [bookingDate, setBookingDate] = useState("");
  const [bookingTime, setBookingTime] = useState("");
  const [contactMethod, setContactMethod] = useState("phone");
  const [bookingSubmitting, setBookingSubmitting] = useState(false);
  const [bookingDone, setBookingDone] = useState(false);

  // 予約可能日（明日から14日間）
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

  // 初期化：結果計算 + DB保存
  useEffect(() => {
    const init = async () => {
      const stored = localStorage.getItem("matching_diagnosis");
      if (!stored) {
        router.replace("/matching/shindan");
        return;
      }
      const data = JSON.parse(stored);
      setUserName(data.name || "");
      const res = calculateMatching(data.answers);
      setResult(res);
      setLoading(false);

      // DB保存（まだ保存していなければ）
      if (!data.savedId) {
        try {
          const resp = await fetch("/api/matching/diagnoses", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: data.name || null,
              birthday: data.birthday || null,
              answers: data.answers,
              typeId: res.type.id,
              scores: res.scores,
              topProducts: res.topProducts.map((p) => p.id),
            }),
          });
          if (resp.ok) {
            const { id } = await resp.json();
            setDiagnosisId(id);
            // savedIdをlocalStorageに書き戻して二重保存を防ぐ
            data.savedId = id;
            localStorage.setItem("matching_diagnosis", JSON.stringify(data));
          } else {
            setSaveError(true);
          }
        } catch {
          setSaveError(true);
        }
      } else {
        setDiagnosisId(data.savedId);
      }
    };
    init();
  }, [router]);

  const handleAiGenerate = () => {
    setAiGenerating(true);
    setTimeout(() => {
      setAiGenerating(false);
      setShowAi(true);
    }, 1500);
  };

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
      if (resp.ok) {
        setBookingDone(true);
      }
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

  const { type, topProducts, allProductScores } = result;
  const maxScore = allProductScores[0]?.score || 1;

  return (
    <div className="min-h-screen px-4 py-6">
      <div className="max-w-lg mx-auto">
        {/* ヒーロー：タイプ結果 */}
        <div className="rounded-2xl bg-white/5 border border-white/10 p-8 mb-6 text-center animate-fade-in">
          <p className="text-blue-400 text-sm font-medium mb-3 tracking-wide">
            {userName ? `${userName}さんの` : "あなたの"}副業適性タイプ
          </p>
          <div className="text-7xl mb-5">{type.emoji}</div>
          <h1 className="text-3xl font-bold text-white mb-3 leading-tight">
            {type.headline}
          </h1>
          <div className="flex justify-center gap-2 mb-4 flex-wrap">
            {type.traits.map((trait) => (
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

        {/* 詳細説明 */}
        <div className="rounded-2xl bg-white/5 border border-white/10 p-6 mb-6">
          <h2 className="text-base font-bold text-blue-400 mb-4 flex items-center gap-2">
            <span className="text-lg">📖</span>
            <span>あなたの副業適性について</span>
          </h2>
          <div className="space-y-4">
            {type.longDescription.split("\n\n").map((p, i) => (
              <p
                key={i}
                className="text-gray-200 text-[15px] leading-[1.9] tracking-wide"
              >
                {p}
              </p>
            ))}
          </div>
        </div>

        {/* おすすめ商材 */}
        <div className="rounded-2xl bg-white/5 border border-white/10 p-6 mb-6">
          <h2 className="text-base font-bold text-blue-400 mb-4 flex items-center gap-2">
            <span className="text-lg">🎯</span>
            <span>あなたにおすすめの副業</span>
          </h2>
          <div className="space-y-3">
            {topProducts.map((product, i) => (
              <div
                key={product.id}
                className="flex items-start gap-3 p-4 rounded-xl bg-gradient-to-r from-blue-500/10 to-cyan-500/5 border border-blue-500/20"
              >
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-400 font-bold text-sm">
                  {i + 1}
                </div>
                <div>
                  <p className="font-bold text-white text-sm">{product.name}</p>
                  <p className="text-gray-400 text-xs mt-0.5">
                    {product.category} / {product.shortDescription}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 適性スコアバー */}
        <div className="rounded-2xl bg-white/5 border border-white/10 p-6 mb-6">
          <h2 className="text-base font-bold text-blue-400 mb-4 flex items-center gap-2">
            <span className="text-lg">📊</span>
            <span>全商材との適性スコア</span>
          </h2>
          <div className="space-y-3">
            {allProductScores.map(({ product, score }) => (
              <div key={product.id}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm text-gray-300">{product.name}</span>
                  <span className="text-xs text-gray-500">
                    {Math.round((score / maxScore) * 100)}%
                  </span>
                </div>
                <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-blue-500 to-cyan-500 transition-all duration-700"
                    style={{
                      width: `${Math.max((score / maxScore) * 100, 5)}%`,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* AI未来診断 */}
        {!showAi && (
          <div className="rounded-2xl bg-gradient-to-br from-blue-500/10 to-purple-500/10 border border-blue-500/20 p-6 mb-6 text-center">
            <div className="text-3xl mb-3">🤖</div>
            <h3 className="text-lg font-bold text-white mb-2">
              AIであなたの未来を診断
            </h3>
            <p className="text-gray-400 text-sm mb-5 leading-relaxed">
              診断データを基に、今の延長線上の未来と
              <br />
              適性を活かした場合の未来を比較します
            </p>
            <button
              onClick={handleAiGenerate}
              disabled={aiGenerating}
              className="w-full py-3.5 rounded-xl font-bold text-white text-sm bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600 transition-all shadow-lg shadow-blue-500/25 active:scale-[0.98] disabled:opacity-70"
            >
              {aiGenerating ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  AI分析中...
                </span>
              ) : (
                "AIで未来を予測する"
              )}
            </button>
          </div>
        )}

        {showAi && (
          <div className="rounded-2xl bg-gradient-to-br from-blue-500/10 to-purple-500/10 border border-blue-500/20 p-6 mb-6 animate-fade-in">
            <h3 className="text-base font-bold text-blue-400 mb-4 flex items-center gap-2">
              <span className="text-lg">🤖</span>
              <span>AI未来予測</span>
            </h3>
            <div className="mb-5 p-4 rounded-xl bg-red-500/5 border border-red-500/15">
              <p className="text-red-400 text-xs font-bold mb-2 flex items-center gap-1">
                <span>⚠️</span> 現在の延長線上
              </p>
              <p className="text-gray-300 text-sm leading-relaxed">
                副業を始めないまま1年が過ぎると、物価上昇や増税の影響で実質的な可処分所得は減り続けます。「いつかやろう」と思っている間に、同世代との収入格差は広がり、将来への不安は増す一方です。
              </p>
            </div>
            <div className="p-4 rounded-xl bg-green-500/5 border border-green-500/15">
              <p className="text-green-400 text-xs font-bold mb-2 flex items-center gap-1">
                <span>✨</span> 適性を活かした場合
              </p>
              <p className="text-gray-300 text-sm leading-relaxed">
                {userName ? `${userName}さん` : "あなた"}の「{type.name}
                」としての強みを活かせば、
                {type.recommendedProducts
                  .map((pid) => PRODUCTS.find((p) => p.id === pid)?.name)
                  .filter(Boolean)
                  .join("や")}
                で、3ヶ月後には最初の成果が見え始め、半年後には安定した副収入の柱を築ける可能性があります。あなたの性格に合ったやり方だからこそ、無理なく続けられます。
              </p>
            </div>
          </div>
        )}

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
                具体的な副業プランを個別にご提案します。
                <br />
                <span className="text-blue-300 font-medium">
                  無料・オンライン・30分
                </span>
              </p>
            </div>

            {!showBooking ? (
              <>
                <button
                  onClick={() => setShowBooking(true)}
                  disabled={!diagnosisId && !saveError}
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
          /* 予約完了メッセージ */
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

        {/* やり直しリンク */}
        <div className="text-center mb-8">
          <button
            onClick={() => {
              localStorage.removeItem("matching_diagnosis");
              router.push("/matching/shindan");
            }}
            className="text-gray-500 text-sm hover:text-gray-300 transition-colors underline underline-offset-4"
          >
            もう一度診断する
          </button>
        </div>
      </div>
    </div>
  );
}

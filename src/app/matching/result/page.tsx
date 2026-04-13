"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  MATCHING_TYPES,
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

  useEffect(() => {
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
  }, [router]);

  const handleAiGenerate = () => {
    setAiGenerating(true);
    // 演出：1.5秒のローディングアニメーション後に表示
    setTimeout(() => {
      setAiGenerating(false);
      setShowAi(true);
    }, 1500);
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

            {/* このまま何もしなかった場合 */}
            <div className="mb-5 p-4 rounded-xl bg-red-500/5 border border-red-500/15">
              <p className="text-red-400 text-xs font-bold mb-2 flex items-center gap-1">
                <span>⚠️</span> 現在の延長線上
              </p>
              <p className="text-gray-300 text-sm leading-relaxed">
                副業を始めないまま1年が過ぎると、物価上昇や増税の影響で実質的な可処分所得は減り続けます。「いつかやろう」と思っている間に、同世代との収入格差は広がり、将来への不安は増す一方です。
              </p>
            </div>

            {/* 適性を活かした場合 */}
            <div className="p-4 rounded-xl bg-green-500/5 border border-green-500/15">
              <p className="text-green-400 text-xs font-bold mb-2 flex items-center gap-1">
                <span>✨</span> 適性を活かした場合
              </p>
              <p className="text-gray-300 text-sm leading-relaxed">
                {userName ? `${userName}さん` : "あなた"}の「{type.name}」としての強みを活かせば、
                {type.recommendedProducts
                  .map((pid) => PRODUCTS.find((p) => p.id === pid)?.name)
                  .filter(Boolean)
                  .join("や")}
                で、3ヶ月後には最初の成果が見え始め、半年後には安定した副収入の柱を築ける可能性があります。あなたの性格に合ったやり方だからこそ、無理なく続けられます。
              </p>
            </div>
          </div>
        )}

        {/* 個別相談CTA */}
        <div
          className="rounded-2xl p-6 mb-6 border text-center"
          style={{
            background:
              "linear-gradient(135deg, rgba(59,130,246,0.15), rgba(6,182,212,0.1))",
            borderColor: "rgba(59,130,246,0.3)",
            boxShadow: "0 0 40px rgba(59,130,246,0.15)",
          }}
        >
          <div className="text-3xl mb-3">💬</div>
          <h3 className="text-xl font-bold text-white mb-2">
            専門アドバイザーに相談
          </h3>
          <p className="text-gray-300 text-sm leading-relaxed mb-5">
            診断データをもとに、あなたに合った
            <br />
            具体的な副業プランを個別にご提案します。
            <br />
            <span className="text-blue-300 font-medium">無料・オンライン・30分</span>
          </p>

          {/* TODO: 面談予約カレンダー埋め込み or LINE誘導 */}
          <button
            onClick={() => {
              // 後でLINE URLやカレンダー埋め込みに差し替え
              alert("面談予約機能は近日実装予定です");
            }}
            className="w-full py-4 rounded-xl font-bold text-white text-base bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 transition-all shadow-lg shadow-blue-500/25 active:scale-[0.98]"
          >
            無料の個別相談を予約する
          </button>
          <p className="text-center text-xs text-gray-500 mt-3">
            ※ 強引な勧誘は一切ありません
          </p>
        </div>

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

"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";
import { isDemoMode, getDemoProfile } from "@/lib/fiana-demo";
import { calculateDiagnosis, type DiagnosisResult } from "@/lib/fiana-diagnosis";

export default function FianaResult() {
  const router = useRouter();
  const [result, setResult] = useState<DiagnosisResult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      // デモモード
      if (isDemoMode()) {
        const demo = getDemoProfile();
        if (demo?.diagnosis_answers?.length) {
          setResult(calculateDiagnosis(demo.diagnosis_answers));
        } else {
          router.replace("/fiana/shindan");
          return;
        }
        setLoading(false);
        return;
      }

      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        router.replace("/fiana/register");
        return;
      }

      const { data: profile } = await supabase
        .from("fiana_profiles")
        .select("diagnosis_type, diagnosis_label, diagnosis_answers")
        .eq("user_id", session.user.id)
        .single();

      if (profile?.diagnosis_answers) {
        setResult(calculateDiagnosis(profile.diagnosis_answers));
      } else {
        const stored = localStorage.getItem("fiana_diagnosis");
        if (stored) {
          setResult(JSON.parse(stored));
        } else {
          router.replace("/fiana/shindan");
          return;
        }
      }
      setLoading(false);
    };
    load();
  }, [router]);

  if (loading || !result) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="fiana-heading text-2xl font-bold fiana-text-glow mb-4">FIANA</h1>
          <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-400 text-lg">結果を読み込み中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen px-4 py-6">
      <div className="max-w-lg mx-auto">
        {/* 動物タイプヘッダー */}
        <div className="fiana-card p-8 mb-6 text-center fiana-slide-up">
          <div className="text-7xl mb-4 fiana-float">{result.animal.emoji}</div>
          <p className="text-indigo-400 text-sm font-medium mb-2">
            あなたの投資タイプ
          </p>
          <h1 className="fiana-heading text-2xl font-bold text-white fiana-text-glow mb-2">
            {result.animal.name}派
          </h1>
          <p className="text-gray-400 text-sm mb-4">{result.animal.investorType}</p>

          {/* 性格特性バッジ */}
          <div className="flex justify-center gap-2 mb-4">
            {result.animal.traits.map((trait) => (
              <span
                key={trait}
                className="px-3 py-1 rounded-full text-xs font-medium bg-indigo-500/20 text-indigo-300 border border-indigo-500/30"
              >
                {trait}
              </span>
            ))}
          </div>

          <p className="text-gray-300 text-sm leading-relaxed">
            {result.description}
          </p>
        </div>

        {/* おすすめシステムランキング */}
        <div className="mb-4">
          <h2 className="text-lg font-bold text-white mb-3">
            あなたにおすすめのシステム
          </h2>
        </div>

        <div className="space-y-3">
          {result.rankedSystems.map((system) => {
            const isTop2 = system.rank <= 2;
            const isFirst = system.rank === 1;

            return (
              <div
                key={system.id}
                className={`relative fiana-card p-4 transition-all ${
                  isFirst
                    ? "border-yellow-500/50 fiana-glow-pulse"
                    : isTop2
                      ? "border-indigo-500/50"
                      : ""
                }`}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${
                      isFirst
                        ? "bg-yellow-500 text-black"
                        : isTop2
                          ? "bg-indigo-500 text-white"
                          : "bg-white/10 text-gray-400"
                    }`}
                  >
                    {system.rank}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-2xl">{system.icon}</span>
                      <div>
                        <h3 className="font-bold text-white text-base">
                          {system.name}
                        </h3>
                        <span
                          className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                            isFirst
                              ? "bg-yellow-500/20 text-yellow-300"
                              : isTop2
                                ? "bg-indigo-500/20 text-indigo-300"
                                : "bg-white/5 text-gray-500"
                          }`}
                        >
                          {system.matchLabel}
                        </span>
                      </div>
                    </div>

                    <p className="text-sm text-gray-400 mt-1">
                      {system.description}
                    </p>

                    {system.fullAccess ? (
                      <div className="mt-2 flex items-center gap-1.5">
                        <span className="w-2 h-2 bg-green-400 rounded-full" />
                        <span className="text-xs text-green-400 font-medium">
                          フル機能体験OK
                        </span>
                      </div>
                    ) : (
                      <div className="mt-2 flex items-center gap-1.5">
                        <span className="w-2 h-2 bg-gray-600 rounded-full" />
                        <span className="text-xs text-gray-500">
                          ポイントで開放可能
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {isFirst && (
                  <div className="absolute -top-3 right-4 bg-yellow-500 text-black text-xs font-bold px-3 py-1 rounded-full">
                    BEST MATCH
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* 次へボタン */}
        <div className="mt-8 mb-4">
          <button
            onClick={() => {
              const params = result.depositHint
                ? `?suggested=${result.depositHint}`
                : "";
              router.push(`/fiana/setup${params}`);
            }}
            className="w-full fiana-btn py-4 text-lg font-bold"
          >
            シミュレーションを始める →
          </button>
          <p className="text-center text-xs text-gray-500 mt-2">
            上位2つのシステムで30日間の無料体験ができます
          </p>
        </div>
      </div>
    </div>
  );
}

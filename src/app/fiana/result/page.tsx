"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";
import { isDemoMode, getDemoProfile } from "@/lib/fiana-demo";
import { calculateDiagnosis, type DiagnosisResult } from "@/lib/fiana-diagnosis";
import { LINE_URL } from "@/lib/fiana-config";

export default function FianaResult() {
  const router = useRouter();
  const [result, setResult] = useState<DiagnosisResult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
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
        .select("diagnosis_answers")
        .eq("user_id", session.user.id)
        .single();

      if (profile?.diagnosis_answers) {
        setResult(calculateDiagnosis(profile.diagnosis_answers));
      } else {
        const stored = localStorage.getItem("fiana_diagnosis_answers");
        if (stored) {
          setResult(calculateDiagnosis(JSON.parse(stored)));
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

  const paragraphs = result.longDescription.split("\n\n");

  return (
    <div className="min-h-screen px-4 py-6">
      <div className="max-w-lg mx-auto">
        {/* 動物タイプヘッダー */}
        <div className="fiana-card p-8 mb-6 text-center fiana-slide-up">
          <p className="text-indigo-400 text-sm font-medium mb-3 tracking-wide">
            あなたの投資タイプ診断結果
          </p>
          <div className="text-8xl mb-5 fiana-float">{result.animal.emoji}</div>
          <h1 className="fiana-heading text-3xl font-bold text-white fiana-text-glow mb-3 leading-tight">
            {result.headline}
          </h1>
          <div className="flex justify-center gap-2 mb-2">
            {result.animal.traits.map((trait) => (
              <span
                key={trait}
                className="px-3 py-1 rounded-full text-xs font-medium bg-indigo-500/20 text-indigo-300 border border-indigo-500/30"
              >
                {trait}
              </span>
            ))}
          </div>
        </div>

        {/* 記述式の本文 */}
        <div className="fiana-card p-6 md:p-8 mb-6">
          <h2 className="text-base font-bold text-indigo-400 mb-4 flex items-center gap-2">
            <span className="text-lg">📖</span>
            <span>あなたの投資性格について</span>
          </h2>
          <div className="space-y-5">
            {paragraphs.map((p, i) => (
              <p
                key={i}
                className="text-gray-200 text-[15px] leading-[1.95] tracking-wide"
              >
                {p}
              </p>
            ))}
          </div>
        </div>

        {/* 一発目の個別相談CTA */}
        <div
          className="rounded-2xl p-6 mb-6 border"
          style={{
            background:
              "linear-gradient(135deg, rgba(99,102,241,0.18), rgba(139,92,246,0.12))",
            borderColor: "rgba(139,92,246,0.35)",
            boxShadow: "0 0 40px rgba(99,102,241,0.25)",
          }}
        >
          <div className="text-center mb-5">
            <div className="text-3xl mb-3">💬</div>
            <h3 className="fiana-heading text-xl font-bold text-white mb-2">
              もっと詳しく知りたい方へ
            </h3>
            <p className="text-gray-300 text-sm leading-relaxed">
              {result.animal.name}のあなたに
              <br className="md:hidden" />
              本当に合う運用スタイルを、
              <br />
              <span className="text-indigo-300 font-medium">
                資産運用アドバイザー
              </span>
              が個別にご提案します。
            </p>
          </div>

          <a
            href={LINE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="block w-full fiana-btn text-center py-4 text-base font-bold"
          >
            無料で個別相談を予約する
          </a>
          <p className="text-center text-xs text-gray-500 mt-3">
            LINEで相談日時を調整します
          </p>
        </div>

        {/* ダッシュボードへの導線 */}
        <div className="mb-6">
          <button
            onClick={() => router.push("/fiana/dashboard")}
            className="w-full py-4 rounded-xl border border-white/15 text-gray-300 text-base font-medium hover:bg-white/5 transition-all"
          >
            診断結果をもとにアプリを体験する →
          </button>
          <p className="text-center text-xs text-gray-500 mt-2">
            システム体験版・バックテスト・経済指標が見られます
          </p>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";
import { isDemoMode, saveDemoProfile } from "@/lib/fiana-demo";
import {
  DIAGNOSIS_QUESTIONS,
  MBTI_TYPES,
  calculateDiagnosis,
  type DiagnosisResult,
} from "@/lib/fiana-diagnosis";

type Phase = "pre" | "questions" | "result";

export default function FianaShindan() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("pre");
  const [currentQ, setCurrentQ] = useState(0);
  const [answers, setAnswers] = useState<string[]>([]);
  const [result, setResult] = useState<DiagnosisResult | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [demo, setDemo] = useState(false);

  // 事前入力
  const [birthday, setBirthday] = useState("");
  const [mbti, setMbti] = useState("");

  useEffect(() => {
    if (isDemoMode()) {
      setDemo(true);
      setUserId("demo-user-001");
      return;
    }
    const checkAuth = async () => {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        router.replace("/fiana/register");
        return;
      }
      setUserId(session.user.id);
    };
    checkAuth();
  }, [router]);

  const totalQuestions = DIAGNOSIS_QUESTIONS.length;
  const progress = result
    ? 100
    : Math.round((currentQ / totalQuestions) * 100);

  const handleAnswer = (value: string) => {
    const newAnswers = [...answers, value];
    setAnswers(newAnswers);

    if (currentQ + 1 < totalQuestions) {
      setCurrentQ(currentQ + 1);
    } else {
      const diagResult = calculateDiagnosis(newAnswers);
      setResult(diagResult);
      setPhase("result");
    }
  };

  const handleBack = () => {
    if (currentQ > 0) {
      setCurrentQ(currentQ - 1);
      setAnswers(answers.slice(0, -1));
    }
  };

  const handleConfirmResult = async () => {
    if (!userId || !result) return;
    setSaving(true);

    try {
      if (demo) {
        saveDemoProfile({
          diagnosis_type: result.type,
          diagnosis_label: result.typeLabel,
          diagnosis_answers: answers,
          animal_type: result.animal.id,
          deposit_hint: result.depositHint ?? undefined,
          birthday: birthday || undefined,
          mbti: mbti || undefined,
        });
        router.push("/fiana/result");
        return;
      }

      const supabase = createClient();
      await supabase
        .from("fiana_profiles")
        .update({
          diagnosis_type: result.type,
          diagnosis_label: result.typeLabel,
          diagnosis_answers: answers,
          animal_type: result.animal.id,
          ...(birthday ? { birthday } : {}),
          ...(mbti ? { mbti } : {}),
        })
        .eq("user_id", userId);

      router.push("/fiana/result");
    } catch {
      localStorage.setItem("fiana_diagnosis", JSON.stringify(result));
      localStorage.setItem("fiana_diagnosis_answers", JSON.stringify(answers));
      router.push("/fiana/result");
    } finally {
      setSaving(false);
    }
  };

  const questionIcons = ["💰", "💎", "📈", "⏰", "🎯", "📊", "🏆", "💼"];

  // ========================================
  // Phase: 事前入力（生年月日・MBTI）
  // ========================================
  if (phase === "pre") {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-md fiana-slide-up">
          <div className="text-center mb-8">
            <h1 className="fiana-heading text-2xl font-bold text-white fiana-text-glow mb-3">
              投資タイプ診断
            </h1>
            <p className="text-gray-400 text-sm">
              あなたにぴったりの投資スタイルを見つけましょう
            </p>
          </div>

          <div className="fiana-card p-6 space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                生年月日（任意）
              </label>
              <input
                type="date"
                value={birthday}
                onChange={(e) => setBirthday(e.target.value)}
                className="fiana-input w-full"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                MBTI（任意）
              </label>
              <div className="grid grid-cols-4 gap-2">
                {MBTI_TYPES.map((type) => (
                  <button
                    key={type}
                    onClick={() => setMbti(mbti === type ? "" : type)}
                    className={`py-2 px-1 rounded-lg text-xs font-medium transition-all ${
                      mbti === type
                        ? "bg-indigo-500 text-white shadow-lg shadow-indigo-500/30"
                        : "bg-white/5 text-gray-400 border border-white/10 hover:border-indigo-500/50 hover:text-gray-200"
                    }`}
                  >
                    {type}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setPhase("questions")}
                className="flex-1 py-3 text-gray-400 text-sm rounded-xl border border-white/10 hover:border-white/20 transition-all"
              >
                スキップ
              </button>
              <button
                onClick={() => setPhase("questions")}
                className="flex-1 fiana-btn text-sm"
              >
                診断を始める
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ========================================
  // Phase: 質問
  // ========================================
  if (phase === "questions" && !result) {
    const question = DIAGNOSIS_QUESTIONS[currentQ];

    return (
      <div className="min-h-screen flex flex-col">
        {/* プログレスバー */}
        <div
          className="sticky top-0 z-10 px-4 py-3 border-b"
          style={{
            background: "rgba(10, 10, 15, 0.9)",
            backdropFilter: "blur(8px)",
            borderColor: "var(--fiana-border)",
          }}
        >
          <div className="max-w-md mx-auto">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-400">
                質問 {currentQ + 1} / {totalQuestions}
              </span>
              <span className="text-sm font-medium text-indigo-400">
                {progress}%
              </span>
            </div>
            <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${progress}%`,
                  background: "var(--fiana-gradient-btn)",
                }}
              />
            </div>
          </div>
        </div>

        {/* 質問 */}
        <div className="flex-1 flex items-center justify-center px-4 py-8">
          <div className="w-full max-w-md fiana-slide-up" key={currentQ}>
            {currentQ > 0 && (
              <button
                onClick={handleBack}
                className="text-gray-500 text-sm mb-4 flex items-center gap-1 hover:text-indigo-400 transition-colors"
              >
                ← 前の質問
              </button>
            )}

            <div className="fiana-card p-6">
              <div className="text-center mb-6">
                <span className="text-3xl">
                  {questionIcons[currentQ % questionIcons.length]}
                </span>
              </div>

              <h2 className="text-lg font-bold text-white text-center mb-6 leading-relaxed">
                {question.question}
              </h2>

              <div className="space-y-3">
                {question.options.map((option) => (
                  <button
                    key={option.value}
                    onClick={() => handleAnswer(option.value)}
                    className="w-full text-left px-5 py-4 bg-white/5 hover:bg-indigo-500/10 border border-white/10 hover:border-indigo-500/50 rounded-xl transition-all text-base text-gray-300 hover:text-white font-medium"
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ========================================
  // Phase: 診断結果プレビュー
  // ========================================
  if (!result) return null;

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-md fiana-slide-up">
        <div className="fiana-card p-8">
          <div className="text-center mb-6">
            <div className="text-7xl mb-4 fiana-float">{result.animal.emoji}</div>
            <p className="text-indigo-400 text-sm font-medium mb-2">
              あなたの投資タイプ
            </p>
            <h2 className="fiana-heading text-2xl font-bold text-white fiana-text-glow mb-1">
              {result.animal.name}派
            </h2>
            <p className="text-gray-400 text-sm">{result.animal.investorType}</p>
          </div>

          {/* 性格特性バッジ */}
          <div className="flex justify-center gap-2 mb-6">
            {result.animal.traits.map((trait) => (
              <span
                key={trait}
                className="px-3 py-1 rounded-full text-xs font-medium bg-indigo-500/20 text-indigo-300 border border-indigo-500/30"
              >
                {trait}
              </span>
            ))}
          </div>

          <p className="text-gray-300 text-base leading-relaxed mb-6 text-center">
            {result.description}
          </p>

          <button
            onClick={handleConfirmResult}
            disabled={saving}
            className="w-full fiana-btn text-base font-bold disabled:opacity-50"
          >
            {saving ? "保存中..." : "おすすめシステムを見る →"}
          </button>
        </div>
      </div>
    </div>
  );
}

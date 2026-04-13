"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";
import { isDemoMode, saveDemoProfile } from "@/lib/fiana-demo";
import { DEPOSIT_OPTIONS } from "@/lib/fiana-config";
import {
  DIAGNOSIS_QUESTIONS,
  calculateDiagnosis,
} from "@/lib/fiana-diagnosis";

type Phase = "pre" | "questions";

export default function FianaShindan() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("pre");
  const [currentQ, setCurrentQ] = useState(0);
  const [answers, setAnswers] = useState<string[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [demo, setDemo] = useState(false);

  // 動物占い計算のため1980年代中盤をデフォルトに
  const [birthYear, setBirthYear] = useState(1985);
  const [birthMonth, setBirthMonth] = useState(6);
  const [birthDay, setBirthDay] = useState(15);

  const currentYear = new Date().getFullYear();
  const yearOptions = Array.from(
    { length: currentYear - 1920 + 1 },
    (_, i) => currentYear - i,
  );
  const daysInBirthMonth = new Date(birthYear, birthMonth, 0).getDate();

  useEffect(() => {
    if (birthDay > daysInBirthMonth) setBirthDay(daysInBirthMonth);
  }, [birthDay, daysInBirthMonth]);

  const birthday = `${birthYear}-${String(birthMonth).padStart(2, "0")}-${String(birthDay).padStart(2, "0")}`;

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
  const progress = Math.round((currentQ / totalQuestions) * 100);

  const finalize = async (allAnswers: string[]) => {
    if (!userId) return;
    setSaving(true);
    const result = calculateDiagnosis(allAnswers);

    // 初期資金からlotサイズを自動算出
    const deposit = result.depositHint ?? 300000;
    const matched =
      DEPOSIT_OPTIONS.find((o) => o.amount === deposit) ?? DEPOSIT_OPTIONS[1];
    const today = new Date().toISOString().split("T")[0];

    try {
      if (demo) {
        saveDemoProfile({
          diagnosis_type: result.type,
          diagnosis_label: result.typeLabel,
          diagnosis_answers: allAnswers,
          animal_type: result.animal.id,
          deposit_hint: result.depositHint ?? undefined,
          current_assets: result.assetsHint ?? undefined,
          virtual_deposit: matched.amount,
          lot_size: matched.lot,
          trial_start_date: today,
          birthday: birthday || undefined,
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
          diagnosis_answers: allAnswers,
          animal_type: result.animal.id,
          virtual_deposit: matched.amount,
          lot_size: matched.lot,
          trial_start_date: today,
          ...(birthday ? { birthday } : {}),
        })
        .eq("user_id", userId);

      router.push("/fiana/result");
    } catch {
      localStorage.setItem("fiana_diagnosis_answers", JSON.stringify(allAnswers));
      router.push("/fiana/result");
    } finally {
      setSaving(false);
    }
  };

  const handleAnswer = (value: string) => {
    const newAnswers = [...answers, value];
    setAnswers(newAnswers);

    if (currentQ + 1 < totalQuestions) {
      setCurrentQ(currentQ + 1);
    } else {
      finalize(newAnswers);
    }
  };

  const handleBack = () => {
    if (currentQ > 0) {
      setCurrentQ(currentQ - 1);
      setAnswers(answers.slice(0, -1));
    }
  };

  const questionIcons = [
    "💰", "💎", "📈", "⏰", "🎯", "📊",
    "🏆", "💼", "🏦", "🌟", "📰", "🚀",
  ];

  // ========================================
  // Phase: 事前入力（生年月日）
  // ========================================
  if (phase === "pre") {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-md fiana-slide-up">
          <div className="text-center mb-8">
            <h1 className="fiana-heading text-2xl font-bold text-white fiana-text-glow mb-3">
              投資タイプ診断
            </h1>
            <p className="text-gray-400 text-sm leading-relaxed">
              12問の質問であなたに合った投資スタイルを見つけます
              <br />
              所要時間：約2分
            </p>
          </div>

          <div className="fiana-card p-6 space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                生年月日（任意）
              </label>
              <div className="grid grid-cols-3 gap-2">
                <select
                  value={birthYear}
                  onChange={(e) => setBirthYear(Number(e.target.value))}
                  className="fiana-input"
                  aria-label="年"
                >
                  {yearOptions.map((y) => (
                    <option key={y} value={y}>
                      {y}年
                    </option>
                  ))}
                </select>
                <select
                  value={birthMonth}
                  onChange={(e) => setBirthMonth(Number(e.target.value))}
                  className="fiana-input"
                  aria-label="月"
                >
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                    <option key={m} value={m}>
                      {m}月
                    </option>
                  ))}
                </select>
                <select
                  value={birthDay}
                  onChange={(e) => setBirthDay(Number(e.target.value))}
                  className="fiana-input"
                  aria-label="日"
                >
                  {Array.from(
                    { length: daysInBirthMonth },
                    (_, i) => i + 1,
                  ).map((d) => (
                    <option key={d} value={d}>
                      {d}日
                    </option>
                  ))}
                </select>
              </div>
              <p className="text-xs text-gray-500 mt-2">
                より精度の高い診断結果と、動物占いとのクロス診断に反映されます
              </p>
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
  const question = DIAGNOSIS_QUESTIONS[currentQ];

  return (
    <div className="min-h-screen flex flex-col">
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
                  disabled={saving}
                  className="w-full text-left px-5 py-4 bg-white/5 hover:bg-indigo-500/10 border border-white/10 hover:border-indigo-500/50 rounded-xl transition-all text-base text-gray-300 hover:text-white font-medium disabled:opacity-50"
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {saving && (
            <p className="text-center text-xs text-gray-500 mt-4">
              診断結果を生成中...
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  MATCHING_QUESTIONS,
  calculateMatching,
} from "@/lib/matching-diagnosis";

type Phase = "intro" | "info" | "questions";

export default function MatchingShindan() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("intro");
  const [currentQ, setCurrentQ] = useState(0);
  const [answers, setAnswers] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  // 基本情報
  const [name, setName] = useState("");
  const [gender, setGender] = useState("");
  const [ageGroup, setAgeGroup] = useState("");
  const [familyStatus, setFamilyStatus] = useState("");
  const [birthYear, setBirthYear] = useState(1990);
  const [birthMonth, setBirthMonth] = useState(1);
  const [birthDay, setBirthDay] = useState(1);

  const currentYear = new Date().getFullYear();
  const yearOptions = Array.from(
    { length: currentYear - 1940 + 1 },
    (_, i) => currentYear - i,
  );
  const daysInMonth = new Date(birthYear, birthMonth, 0).getDate();

  const totalQuestions = MATCHING_QUESTIONS.length;
  const progress = Math.round((currentQ / totalQuestions) * 100);

  const questionIcons = [
    "💼", "⏰", "💰", "🏦", "📈", "📦",
    "🔧", "📅", "🎁", "💻", "⚠️", "🚀",
  ];

  const infoComplete =
    name.trim() !== "" && gender !== "" && ageGroup !== "" && familyStatus !== "";

  const finalize = async (allAnswers: string[]) => {
    setSaving(true);
    const result = calculateMatching(allAnswers);
    const birthday = `${birthYear}-${String(birthMonth).padStart(2, "0")}-${String(birthDay).padStart(2, "0")}`;

    // DB保存
    let savedId: string | null = null;
    try {
      const resp = await fetch("/api/matching/diagnoses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name || null,
          birthday: birthday || null,
          answers: allAnswers,
          typeId: result.type.id,
          scores: result.scores,
          topProducts: result.topProducts.map((p) => p.id),
          gender,
          ageGroup,
          familyStatus,
        }),
      });
      if (resp.ok) {
        const json = await resp.json();
        savedId = json.id;
      }
    } catch {
      // DB保存失敗しても結果ページには進む
    }

    const data = {
      name,
      birthday,
      gender,
      ageGroup,
      familyStatus,
      answers: allAnswers,
      result: {
        typeId: result.type.id,
        scores: result.scores,
      },
      savedId,
      createdAt: new Date().toISOString(),
    };
    localStorage.setItem("matching_diagnosis", JSON.stringify(data));
    router.push("/matching/result");
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

  // ========================================
  // Phase: イントロ
  // ========================================
  if (phase === "intro") {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-md animate-fade-in">
          <div className="text-center mb-8">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-medium mb-6">
              <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
              AI診断
            </div>
            <h1 className="text-3xl font-bold text-white mb-3 leading-tight">
              あなたに最適な
              <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-cyan-400">
                副業
              </span>
              をAIがマッチング
            </h1>
            <p className="text-gray-400 text-sm leading-relaxed">
              12問の簡単な質問に答えるだけ。
              <br />
              AIがあなたの性格・ライフスタイルから
              <br />
              ぴったりの副業タイプを診断します。
            </p>
          </div>

          <div className="space-y-3 mb-8">
            {[
              { icon: "🧠", text: "AIがあなたの適性を分析" },
              { icon: "⏱️", text: "所要時間たったの2分" },
              { icon: "🎯", text: "あなたに最適な副業をマッチング" },
            ].map((item) => (
              <div
                key={item.text}
                className="flex items-center gap-3 px-4 py-3 rounded-xl bg-white/5 border border-white/10"
              >
                <span className="text-xl">{item.icon}</span>
                <span className="text-sm text-gray-300">{item.text}</span>
              </div>
            ))}
          </div>

          <button
            onClick={() => setPhase("info")}
            className="w-full py-4 rounded-xl font-bold text-white text-base bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 transition-all shadow-lg shadow-blue-500/25 active:scale-[0.98]"
          >
            無料で診断スタート
          </button>
          <p className="text-center text-xs text-gray-500 mt-3">
            個人情報は厳重に管理されます
          </p>
        </div>
      </div>
    );
  }

  // ========================================
  // Phase: 基本情報入力
  // ========================================
  if (phase === "info") {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-md animate-fade-in">
          <div className="text-center mb-6">
            <p className="text-blue-400 text-sm font-medium mb-2">STEP 1</p>
            <h2 className="text-xl font-bold text-white mb-2">
              基本情報を入力
            </h2>
            <p className="text-gray-400 text-xs">
              より精度の高い診断結果をお届けします
            </p>
          </div>

          <div className="rounded-2xl bg-white/5 border border-white/10 p-6 space-y-5">
            {/* 氏名 */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                お名前 <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="山田 太郎"
                className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/15 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/25 transition-all"
              />
            </div>

            {/* 性別 */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                性別 <span className="text-red-400">*</span>
              </label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { value: "male", label: "男性" },
                  { value: "female", label: "女性" },
                ].map((g) => (
                  <button
                    key={g.value}
                    onClick={() => setGender(g.value)}
                    className={`py-3 rounded-xl text-sm font-medium transition-all ${
                      gender === g.value
                        ? "bg-blue-500 text-white"
                        : "bg-white/5 border border-white/15 text-gray-300 hover:bg-white/10"
                    }`}
                  >
                    {g.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 年代 */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                年代 <span className="text-red-400">*</span>
              </label>
              <div className="grid grid-cols-3 gap-2">
                {["10代", "20代", "30代", "40代", "50代", "60代以上"].map((age) => (
                  <button
                    key={age}
                    onClick={() => setAgeGroup(age)}
                    className={`py-2.5 rounded-xl text-sm font-medium transition-all ${
                      ageGroup === age
                        ? "bg-blue-500 text-white"
                        : "bg-white/5 border border-white/15 text-gray-300 hover:bg-white/10"
                    }`}
                  >
                    {age}
                  </button>
                ))}
              </div>
            </div>

            {/* 家族構成 */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                家族構成 <span className="text-red-400">*</span>
              </label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { value: "single", label: "独身" },
                  { value: "married_no_kids", label: "既婚（子供なし）" },
                  { value: "married_with_kids", label: "既婚（子供あり）" },
                  { value: "single_with_kids", label: "シングル（子供あり）" },
                ].map((f) => (
                  <button
                    key={f.value}
                    onClick={() => setFamilyStatus(f.value)}
                    className={`py-2.5 rounded-xl text-sm font-medium transition-all ${
                      familyStatus === f.value
                        ? "bg-blue-500 text-white"
                        : "bg-white/5 border border-white/15 text-gray-300 hover:bg-white/10"
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 生年月日 */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                生年月日
              </label>
              <div className="grid grid-cols-3 gap-2">
                <select
                  value={birthYear}
                  onChange={(e) => setBirthYear(Number(e.target.value))}
                  className="px-3 py-3 rounded-xl bg-white/5 border border-white/15 text-white focus:outline-none focus:border-blue-500/50 transition-all appearance-none"
                  aria-label="年"
                >
                  {yearOptions.map((y) => (
                    <option key={y} value={y} className="bg-slate-800">
                      {y}年
                    </option>
                  ))}
                </select>
                <select
                  value={birthMonth}
                  onChange={(e) => setBirthMonth(Number(e.target.value))}
                  className="px-3 py-3 rounded-xl bg-white/5 border border-white/15 text-white focus:outline-none focus:border-blue-500/50 transition-all appearance-none"
                  aria-label="月"
                >
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                    <option key={m} value={m} className="bg-slate-800">
                      {m}月
                    </option>
                  ))}
                </select>
                <select
                  value={birthDay}
                  onChange={(e) => setBirthDay(Number(e.target.value))}
                  className="px-3 py-3 rounded-xl bg-white/5 border border-white/15 text-white focus:outline-none focus:border-blue-500/50 transition-all appearance-none"
                  aria-label="日"
                >
                  {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(
                    (d) => (
                      <option key={d} value={d} className="bg-slate-800">
                        {d}日
                      </option>
                    ),
                  )}
                </select>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                動物占いによる性格分析に使用します
              </p>
            </div>
          </div>

          <div className="flex gap-3 mt-6">
            <button
              onClick={() => setPhase("intro")}
              className="px-6 py-3.5 rounded-xl border border-white/15 text-gray-400 text-sm hover:bg-white/5 transition-all"
            >
              戻る
            </button>
            <button
              onClick={() => setPhase("questions")}
              disabled={!infoComplete}
              className="flex-1 py-3.5 rounded-xl font-bold text-white text-base bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 transition-all shadow-lg shadow-blue-500/25 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
            >
              次へ進む
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ========================================
  // Phase: 質問
  // ========================================
  const question = MATCHING_QUESTIONS[currentQ];

  return (
    <div className="min-h-screen flex flex-col">
      <div
        className="sticky top-0 z-10 px-4 py-3 border-b border-white/10"
        style={{
          background: "rgba(15, 23, 42, 0.95)",
          backdropFilter: "blur(8px)",
        }}
      >
        <div className="max-w-md mx-auto">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-400">
              質問 {currentQ + 1} / {totalQuestions}
            </span>
            <span className="text-sm font-medium text-blue-400">
              {progress}%
            </span>
          </div>
          <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500 ease-out bg-gradient-to-r from-blue-500 to-cyan-500"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-md animate-fade-in" key={currentQ}>
          {currentQ > 0 && (
            <button
              onClick={handleBack}
              className="text-gray-500 text-sm mb-4 flex items-center gap-1 hover:text-blue-400 transition-colors"
            >
              ← 前の質問
            </button>
          )}

          <div className="rounded-2xl bg-white/5 border border-white/10 p-6">
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
                  className="w-full text-left px-5 py-4 bg-white/5 hover:bg-blue-500/10 border border-white/10 hover:border-blue-500/40 rounded-xl transition-all text-base text-gray-300 hover:text-white font-medium disabled:opacity-50 active:scale-[0.98]"
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {saving && (
            <div className="text-center mt-6">
              <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-sm text-gray-400">
                AIが診断結果を生成中...
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

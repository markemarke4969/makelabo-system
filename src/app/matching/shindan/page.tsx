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
  const [occupation, setOccupation] = useState("");
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
    "💳", "🔧", "📅", "🎁", "💻", "⚠️", "🚀",
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
      occupation,
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
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#E6F4EC] border border-[#4CAF82]/30 text-[#4CAF82] text-xs font-bold mb-6">
              <span className="w-2 h-2 rounded-full bg-[#4CAF82] animate-pulse" />
              AI診断
            </div>
            <h1 className="text-[32px] font-extrabold text-[#333333] mb-3 leading-tight">
              あなたに最適な
              <br />
              <span className="text-[#4CAF82]">副業</span>
              をAIがマッチング
            </h1>
            <p className="text-[#888888] text-sm leading-relaxed">
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
                className="flex items-center gap-3 px-4 py-3.5 m-card-soft"
              >
                <span className="text-xl">{item.icon}</span>
                <span className="text-sm text-[#333333] font-medium">{item.text}</span>
              </div>
            ))}
          </div>

          <button
            onClick={() => setPhase("info")}
            className="m-cta w-full py-4 text-base active:scale-[0.98]"
          >
            無料で診断スタート
          </button>
          <p className="text-center text-xs text-[#888888] mt-3">
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
            <p className="text-[#4CAF82] text-sm font-bold mb-2">STEP 1</p>
            <h2 className="text-2xl font-extrabold text-[#333333] mb-2">
              基本情報を入力
            </h2>
            <p className="text-[#888888] text-xs">
              より精度の高い診断結果をお届けします
            </p>
          </div>

          <div className="m-card p-6 space-y-5">
            {/* 氏名 */}
            <div>
              <label className="block text-sm font-bold text-[#333333] mb-2">
                お名前 <span className="text-[#FF6B35]">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="山田 太郎"
                className="m-input w-full"
              />
            </div>

            {/* 性別 */}
            <div>
              <label className="block text-sm font-bold text-[#333333] mb-2">
                性別 <span className="text-[#FF6B35]">*</span>
              </label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { value: "male", label: "男性" },
                  { value: "female", label: "女性" },
                ].map((g) => (
                  <button
                    key={g.value}
                    onClick={() => setGender(g.value)}
                    className={`m-pill py-3 text-sm ${gender === g.value ? "m-pill-active" : ""}`}
                  >
                    {g.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 職業（任意・プルダウン） */}
            <div>
              <label className="block text-sm font-bold text-[#333333] mb-2">
                職業 <span className="text-[#888888] text-xs font-normal">（任意）</span>
              </label>
              <select
                value={occupation}
                onChange={(e) => setOccupation(e.target.value)}
                aria-label="職業"
                className="m-select w-full appearance-none"
              >
                <option value="">選択してください（任意）</option>
                {[
                  { value: "office_clerical", label: "会社員（事務系）" },
                  { value: "office_engineer", label: "会社員（技術・エンジニア系）" },
                  { value: "office_sales", label: "会社員（営業・販売系）" },
                  { value: "medical", label: "医療・介護・福祉系（看護師・介護士など）" },
                  { value: "construction_manufacturing", label: "建設・製造・物流系" },
                  { value: "self_employed", label: "自営業・経営者" },
                  { value: "housewife", label: "主婦・主夫" },
                  { value: "student", label: "学生" },
                  { value: "other", label: "その他・無職" },
                ].map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>

            {/* 年代 */}
            <div>
              <label className="block text-sm font-bold text-[#333333] mb-2">
                年代 <span className="text-[#FF6B35]">*</span>
              </label>
              <div className="grid grid-cols-3 gap-2">
                {["10代", "20代", "30代", "40代", "50代", "60代以上"].map((age) => (
                  <button
                    key={age}
                    onClick={() => setAgeGroup(age)}
                    className={`m-pill py-2.5 text-sm ${ageGroup === age ? "m-pill-active" : ""}`}
                  >
                    {age}
                  </button>
                ))}
              </div>
            </div>

            {/* 家族構成 */}
            <div>
              <label className="block text-sm font-bold text-[#333333] mb-2">
                家族構成 <span className="text-[#FF6B35]">*</span>
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
                    className={`m-pill py-2.5 text-sm ${familyStatus === f.value ? "m-pill-active" : ""}`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 生年月日 */}
            <div>
              <label className="block text-sm font-bold text-[#333333] mb-2">
                生年月日
              </label>
              <div className="grid grid-cols-3 gap-2">
                <select
                  value={birthYear}
                  onChange={(e) => setBirthYear(Number(e.target.value))}
                  className="m-select appearance-none"
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
                  className="m-select appearance-none"
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
                  className="m-select appearance-none"
                  aria-label="日"
                >
                  {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(
                    (d) => (
                      <option key={d} value={d}>
                        {d}日
                      </option>
                    ),
                  )}
                </select>
              </div>
            </div>
          </div>

          <div className="flex gap-3 mt-6">
            <button
              onClick={() => setPhase("intro")}
              className="m-cta-sub px-6 py-3.5 text-sm"
            >
              戻る
            </button>
            <button
              onClick={() => setPhase("questions")}
              disabled={!infoComplete}
              className="m-cta flex-1 py-3.5 text-base active:scale-[0.98]"
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
        className="sticky top-0 z-10 px-4 py-3 border-b border-[#4CAF82]/15"
        style={{
          background: "rgba(250, 250, 248, 0.95)",
          backdropFilter: "blur(8px)",
        }}
      >
        <div className="max-w-md mx-auto">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-[#888888] font-medium">
              質問 {currentQ + 1} / {totalQuestions}
            </span>
            <span className="text-sm font-bold text-[#4CAF82]">
              {progress}%
            </span>
          </div>
          <div className="w-full h-2.5 bg-[#E6F4EC] rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500 ease-out"
              style={{
                width: `${progress}%`,
                background: "linear-gradient(90deg, #4CAF82 0%, #66C999 100%)",
              }}
            />
          </div>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-md animate-fade-in" key={currentQ}>
          {currentQ > 0 && (
            <button
              onClick={handleBack}
              className="text-[#888888] text-sm mb-4 flex items-center gap-1 hover:text-[#4CAF82] transition-colors font-medium"
            >
              ← 前の質問
            </button>
          )}

          <div className="m-card p-6">
            <div className="text-center mb-6">
              <span className="text-4xl">
                {questionIcons[currentQ % questionIcons.length]}
              </span>
            </div>

            <h2 className="text-xl font-extrabold text-[#333333] text-center mb-6 leading-relaxed">
              {question.question}
            </h2>

            <div className="space-y-3">
              {question.options.map((option) => (
                <button
                  key={option.value}
                  onClick={() => handleAnswer(option.value)}
                  disabled={saving}
                  className="w-full text-left px-5 py-4 bg-white hover:bg-[#E6F4EC] border-2 border-[#E5E7E3] hover:border-[#4CAF82] rounded-2xl transition-all text-base text-[#333333] font-semibold disabled:opacity-50 active:scale-[0.98]"
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {saving && (
            <div className="text-center mt-6">
              <div className="w-8 h-8 border-2 border-[#4CAF82] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-sm text-[#888888] font-medium">
                AIが診断結果を生成中...
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

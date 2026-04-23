"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";

interface Question {
  id: string;
  question_order: number;
  question_text: string;
  question_type: string;
  options: Array<{ label: string; value: string }>;
  is_required: boolean;
}

interface Survey {
  id: string;
  name: string;
  description: string | null;
  questions: Question[];
}

export default function SurveyPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const surveyId = params.id as string;
  const lineUserId = searchParams.get("uid") ?? "";

  const [survey, setSurvey] = useState<Survey | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [thankYou, setThankYou] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`/api/line/surveys/respond?survey_id=${surveyId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) {
          setError(data.error === "inactive" ? "このアンケートは終了しています" : "アンケートが見つかりません");
        } else {
          setSurvey(data);
        }
      })
      .catch(() => setError("読み込みに失敗しました"));
  }, [surveyId]);

  const handleSubmit = async () => {
    if (!survey || !lineUserId) return;

    // 必須チェック
    for (const q of survey.questions) {
      if (q.is_required && !answers[q.id]?.trim()) {
        alert(`「${q.question_text}」は必須項目です`);
        return;
      }
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/line/surveys/respond", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          survey_id: surveyId,
          line_user_id: lineUserId,
          answers,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setThankYou(data.thank_you_message ?? "ご回答ありがとうございました！");
        setSubmitted(true);
      } else {
        alert(data.error ?? "送信に失敗しました");
      }
    } catch {
      alert("送信エラー");
    } finally {
      setSubmitting(false);
    }
  };

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center max-w-md w-full">
          <p className="text-gray-500">{error}</p>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center max-w-md w-full">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
          </div>
          <p className="text-gray-800 text-lg font-bold mb-2">送信完了</p>
          <p className="text-gray-600 text-sm">{thankYou}</p>
        </div>
      </div>
    );
  }

  if (!survey) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-400 text-sm">読み込み中...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-lg mx-auto">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="bg-[#06C755] px-6 py-5">
            <h1 className="text-white text-lg font-bold">{survey.name}</h1>
            {survey.description && <p className="text-white/80 text-sm mt-1">{survey.description}</p>}
          </div>

          <div className="p-6 space-y-6">
            {survey.questions.map((q) => (
              <div key={q.id}>
                <label className="text-sm font-medium text-gray-800 block mb-2">
                  {q.question_text}
                  {q.is_required && <span className="text-red-500 ml-1">*</span>}
                </label>

                {q.question_type === "text" && (
                  <input
                    type="text"
                    value={answers[q.id] ?? ""}
                    onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:border-[#06C755] focus:outline-none focus:ring-1 focus:ring-[#06C755]"
                  />
                )}

                {q.question_type === "email" && (
                  <input
                    type="email"
                    value={answers[q.id] ?? ""}
                    onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}
                    placeholder="example@email.com"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:border-[#06C755] focus:outline-none focus:ring-1 focus:ring-[#06C755]"
                  />
                )}

                {q.question_type === "phone" && (
                  <input
                    type="tel"
                    value={answers[q.id] ?? ""}
                    onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}
                    placeholder="090-1234-5678"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:border-[#06C755] focus:outline-none focus:ring-1 focus:ring-[#06C755]"
                  />
                )}

                {q.question_type === "number" && (
                  <input
                    type="number"
                    value={answers[q.id] ?? ""}
                    onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:border-[#06C755] focus:outline-none focus:ring-1 focus:ring-[#06C755]"
                  />
                )}

                {q.question_type === "select" && (
                  <div className="space-y-2">
                    {(q.options ?? []).map((opt) => (
                      <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name={`q-${q.id}`}
                          value={opt.value}
                          checked={answers[q.id] === opt.value}
                          onChange={() => setAnswers({ ...answers, [q.id]: opt.value })}
                          className="accent-[#06C755]"
                        />
                        <span className="text-sm text-gray-700">{opt.label}</span>
                      </label>
                    ))}
                  </div>
                )}

                {q.question_type === "multi_select" && (
                  <div className="space-y-2">
                    {(q.options ?? []).map((opt) => {
                      const selected = (answers[q.id] ?? "").split(",").filter(Boolean);
                      const isChecked = selected.includes(opt.value);
                      return (
                        <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => {
                              const next = isChecked
                                ? selected.filter((v) => v !== opt.value)
                                : [...selected, opt.value];
                              setAnswers({ ...answers, [q.id]: next.join(",") });
                            }}
                            className="accent-[#06C755]"
                          />
                          <span className="text-sm text-gray-700">{opt.label}</span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}

            <button
              onClick={handleSubmit}
              disabled={submitting || !lineUserId}
              className="w-full py-3 bg-[#06C755] hover:bg-[#05a648] disabled:opacity-50 text-white font-bold rounded-lg transition text-sm"
            >
              {submitting ? "送信中..." : "回答を送信"}
            </button>

            {!lineUserId && (
              <p className="text-xs text-red-500 text-center">LINE経由でアクセスしてください</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

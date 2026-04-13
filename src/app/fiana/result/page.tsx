"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";
import { isDemoMode, getDemoProfile, saveDemoProfile } from "@/lib/fiana-demo";
import { calculateDiagnosis, type DiagnosisResult } from "@/lib/fiana-diagnosis";
import {
  diagnoseDoubutsuFromISO,
  type DoubutsuResult,
} from "@/lib/doubutsu-uranai";
import {
  getDoubutsuProfile,
  buildCrossReading,
  type DoubutsuProfile,
} from "@/lib/doubutsu-profile";
import { LINE_URL } from "@/lib/fiana-config";

interface DoubutsuReading {
  result: DoubutsuResult;
  profile: DoubutsuProfile;
  paragraphs: string[];
}

function buildDoubutsuReading(
  birthday: string | null | undefined,
  investorType: string,
): DoubutsuReading | null {
  if (!birthday) return null;
  const result = diagnoseDoubutsuFromISO(birthday);
  if (!result) return null;
  const profile = getDoubutsuProfile(result.animal);
  const paragraphs = buildCrossReading(profile, investorType);
  return { result, profile, paragraphs };
}

export default function FianaResult() {
  const router = useRouter();
  const [result, setResult] = useState<DiagnosisResult | null>(null);
  const [doubutsu, setDoubutsu] = useState<DoubutsuReading | null>(null);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
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

  const applyBirthdayToState = (iso: string | null | undefined) => {
    if (!iso) return;
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
    if (!m) return;
    setBirthYear(Number(m[1]));
    setBirthMonth(Number(m[2]));
    setBirthDay(Number(m[3]));
  };

  useEffect(() => {
    const load = async () => {
      if (isDemoMode()) {
        const demo = getDemoProfile();
        if (demo?.diagnosis_answers?.length) {
          const diag = calculateDiagnosis(demo.diagnosis_answers);
          setResult(diag);
          setDoubutsu(buildDoubutsuReading(demo.birthday, diag.typeLabel));
          applyBirthdayToState(demo.birthday);
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

      setUserId(session.user.id);

      const { data: profile } = await supabase
        .from("fiana_profiles")
        .select("diagnosis_answers, birthday")
        .eq("user_id", session.user.id)
        .single();

      if (profile?.diagnosis_answers) {
        const diag = calculateDiagnosis(profile.diagnosis_answers);
        setResult(diag);
        setDoubutsu(buildDoubutsuReading(profile.birthday, diag.typeLabel));
        applyBirthdayToState(profile.birthday);
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

  const commitBirthday = async (y: number, m: number, d: number) => {
    const maxDay = new Date(y, m, 0).getDate();
    const clampedDay = Math.min(d, maxDay);
    setBirthYear(y);
    setBirthMonth(m);
    setBirthDay(clampedDay);
    if (!result) return;
    const iso = `${y}-${String(m).padStart(2, "0")}-${String(clampedDay).padStart(2, "0")}`;
    const reading = buildDoubutsuReading(iso, result.typeLabel);
    if (!reading) return;
    setDoubutsu(reading);
    if (isDemoMode()) {
      saveDemoProfile({ birthday: iso });
      return;
    }
    if (userId) {
      try {
        const supabase = createClient();
        await supabase
          .from("fiana_profiles")
          .update({ birthday: iso })
          .eq("user_id", userId);
      } catch {
        // 保存失敗しても表示は続行
      }
    }
  };

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

  const heroEmoji = doubutsu?.profile.emoji ?? result.animal.emoji;
  const heroHeadline = doubutsu
    ? `${result.typeLabel}の${doubutsu.result.animal}タイプ`
    : result.headline;
  const heroTraits = doubutsu?.profile.traits ?? result.animal.traits;
  const heroParagraphs = doubutsu
    ? doubutsu.paragraphs
    : result.longDescription.split("\n\n");
  const ctaTypeLabel = doubutsu
    ? `${result.typeLabel}の${doubutsu.result.animal}タイプ`
    : result.animal.name;

  return (
    <div className="min-h-screen px-4 py-6">
      <div className="max-w-lg mx-auto">
        {/* 診断結果ヒーロー */}
        <div className="fiana-card p-8 mb-6 text-center fiana-slide-up">
          <p className="text-indigo-400 text-sm font-medium mb-3 tracking-wide">
            あなたの投資タイプ診断結果
          </p>
          <div className="text-8xl mb-5 fiana-float">{heroEmoji}</div>
          <h1 className="fiana-heading text-3xl font-bold text-white fiana-text-glow mb-3 leading-tight">
            {heroHeadline}
          </h1>
          {doubutsu && (
            <p className="text-xs text-gray-500 tracking-wide mb-3">
              {doubutsu.profile.groupLabel} ／ {doubutsu.result.color} ／ 運命数
              {doubutsu.result.destinyNumber}
            </p>
          )}
          <div className="flex justify-center gap-2 mb-2 flex-wrap">
            {heroTraits.map((trait) => (
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
            {heroParagraphs.map((p, i) => (
              <p
                key={i}
                className="text-gray-200 text-[15px] leading-[1.95] tracking-wide"
              >
                {p}
              </p>
            ))}
          </div>
        </div>

        {/* 生年月日未入力時のみ：動物占い × 投資スタイルの誘導カード */}
        {!doubutsu && (
          <div className="fiana-card p-6 md:p-8 mb-6">
            <h2 className="text-base font-bold text-indigo-400 mb-3 flex items-center gap-2">
              <span className="text-lg">🔮</span>
              <span>動物占い × 投資スタイル</span>
            </h2>
            <p className="text-sm text-gray-300 leading-relaxed mb-4">
              生年月日を入力すると、あなたの本来の性格タイプ（動物占い）と今回の投資スタイル診断を掛け合わせた、専用の解説文が表示されます。
            </p>
            <label className="block text-xs font-medium text-gray-400 mb-2">
              生年月日
            </label>
            <div className="grid grid-cols-3 gap-2">
              <select
                value={birthYear}
                onChange={(e) =>
                  commitBirthday(
                    Number(e.target.value),
                    birthMonth,
                    birthDay,
                  )
                }
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
                onChange={(e) =>
                  commitBirthday(
                    birthYear,
                    Number(e.target.value),
                    birthDay,
                  )
                }
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
                onChange={(e) =>
                  commitBirthday(
                    birthYear,
                    birthMonth,
                    Number(e.target.value),
                  )
                }
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
            <p className="text-[11px] text-gray-500 mt-2">
              入力すると即座に結果に反映されます
            </p>
          </div>
        )}

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
              {ctaTypeLabel}のあなたに
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
            className="block w-full fiana-btn text-center py-4 text-base font-bold leading-snug"
          >
            あなたの投資タイプに合った
            <br className="sm:hidden" />
            専用アドバイザーに無料で相談する
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

import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "親の介護と両立できる副業診断｜自分の時間がない女性へ",
  description: "介護中でも無理なく続けられる副業をAIが提案",
};

export default function LpNursingCare() {
  return (
    <div className="min-h-screen bg-[#f4f1ec] text-stone-700">
      <div className="mx-auto w-full max-w-[480px] px-6 py-12">
        <div className="mb-10">
          <div className="inline-flex items-center gap-2 bg-emerald-700/10 rounded-full px-4 py-1.5 mb-6">
            <span className="text-lg">🍃</span>
            <span className="text-[11px] font-semibold text-emerald-800 tracking-wider">
              CARE & CARRY
            </span>
          </div>
          <h1 className="text-[26px] font-bold leading-[1.7] text-stone-800">
            親の介護で
            <br />
            自分の時間がない。
            <br />
            <span className="text-emerald-700">
              そんなあなたでもできる
            </span>
            <br />
            <span className="text-[22px] font-semibold">副業を診断します。</span>
          </h1>
        </div>

        <div className="relative bg-white rounded-2xl p-6 mb-10 border border-amber-200/60">
          <div className="absolute -top-3 left-6 bg-[#f4f1ec] px-3">
            <span className="text-amber-700 text-xs tracking-widest">
              ✿ YOU MATTER ✿
            </span>
          </div>
          <p className="text-[13px] leading-[2] text-stone-600 pt-2">
            通院の送り迎え、夜中の見守り、
            <br />
            自分の食事さえ忘れる日もある。
            <br />
            <br />
            <span className="text-emerald-700 font-bold">
              でも、あなた自身の将来も大切です。
            </span>
          </p>
        </div>

        <section className="mb-10">
          <h2 className="text-emerald-700 text-[12px] tracking-[0.3em] font-bold mb-5 text-center">
            ─ ✿ 3つの特徴 ✿ ─
          </h2>
          <div className="space-y-3">
            {[
              {
                emoji: "⏳",
                t: "5分〜の超短時間型を提案",
                d: "介護の合間の細切れ時間で完結",
              },
              {
                emoji: "🏡",
                t: "在宅・外出不要の副業のみ",
                d: "親の近くにいられるものだけ",
              },
              {
                emoji: "🫶",
                t: "精神的負担がかからない設計",
                d: "頭も心も消耗しない作業を厳選",
              },
            ].map((f, i) => (
              <div
                key={f.t}
                className={`bg-white rounded-2xl p-5 border border-stone-200/70 ${i === 1 ? "ml-6" : i === 2 ? "ml-12" : ""}`}
              >
                <div className="flex gap-4 items-center">
                  <div className="w-12 h-12 rounded-full bg-emerald-700/10 flex items-center justify-center shrink-0 text-2xl">
                    {f.emoji}
                  </div>
                  <div>
                    <p className="font-bold text-[14px] text-stone-800">{f.t}</p>
                    <p className="text-[12px] text-stone-500 mt-0.5">{f.d}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="mb-10 bg-emerald-700/5 rounded-2xl p-6 border border-emerald-700/20">
          <h2 className="text-[13px] font-bold text-emerald-800 mb-5 flex items-center gap-2">
            <span className="text-xl">📖</span>
            診断でわかる3つのこと
          </h2>
          <ul className="space-y-4">
            {[
              "介護と両立できる副業の見つけ方",
              "1日10〜30分で積み上げる現実的な月収",
              "燃え尽きないための働き方の区切り",
            ].map((t, i) => (
              <li key={t} className="flex gap-4 pb-4 border-b border-emerald-700/10 last:border-0 last:pb-0">
                <span className="text-amber-600 font-serif text-lg shrink-0">
                  {["一.", "二.", "三."][i]}
                </span>
                <p className="text-[13px] leading-relaxed text-stone-700">{t}</p>
              </li>
            ))}
          </ul>
        </section>

        <Link
          href="/matching/shindan"
          className="block w-full text-center py-4 bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded-full shadow-md shadow-emerald-700/20 transition"
        >
          今すぐ無料で診断する 🍃
        </Link>
        <p className="text-center text-[11px] text-stone-500 mt-3 italic">
          登録不要・約60秒
        </p>

        <section className="my-14 text-center">
          <div className="inline-block border-y border-amber-600/40 py-6 px-10">
            <p className="text-[11px] tracking-[0.3em] text-amber-700 mb-3">
              ✿ ご利用実績 ✿
            </p>
            <p className="text-5xl font-bold text-emerald-800">
              950<span className="text-base text-amber-700 ml-2">名</span>
            </p>
            <p className="text-[11px] text-stone-500 mt-3">
              介護中のご家族の診断実績
            </p>
          </div>
          <p className="text-[12px] italic text-stone-600 leading-relaxed mt-6 px-4">
            「自分のことを考えていい、
            <br />
            って思えました」
          </p>
          <p className="text-[10px] text-emerald-700 mt-2">— 48歳・母を介護中</p>
        </section>

        <Link
          href="/matching/shindan"
          className="block w-full text-center py-4 bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded-full shadow-md shadow-emerald-700/20 transition"
        >
          今すぐ無料で診断する 🍃
        </Link>
      </div>
    </div>
  );
}

import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "シングルマザーのための副業診断｜無理なく稼げる道を60秒で",
  description: "一人で子育てしながらできる副業をAIが診断",
};

export default function LpSingleMother() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-purple-100 via-pink-50 to-orange-50 text-stone-800">
      <div className="mx-auto w-full max-w-[480px] px-6 py-12">
        <header className="mb-8 text-center">
          <div className="inline-block text-5xl mb-3">🌷</div>
          <p className="text-[11px] tracking-[0.3em] text-fuchsia-600 font-bold mb-5">
            FOR SINGLE MOTHER
          </p>
          <h1 className="text-[25px] font-bold leading-[1.7] text-stone-900">
            一人で子供を育てながら
            <br />
            <span className="inline-block bg-gradient-to-r from-fuchsia-600 to-orange-500 bg-clip-text text-transparent text-[28px]">
              無理なく稼げる副業
            </span>
            を
            <br />
            診断で見つける。
          </h1>
        </header>

        <div className="bg-white/80 backdrop-blur rounded-3xl px-6 py-5 mb-10 border-2 border-fuchsia-200 shadow-sm shadow-fuchsia-100">
          <p className="text-[13px] leading-[2] text-stone-700 text-center">
            時間もお金も、気持ちの余裕もない。
            <br />
            <span className="font-bold text-fuchsia-600">
              そんなあなたに"今だけの副業設計"を。
            </span>
          </p>
        </div>

        <section className="mb-10">
          <h2 className="text-center text-[12px] text-fuchsia-700 font-bold mb-4 tracking-widest">
            💪 応援する3つの特徴 💪
          </h2>
          <div className="space-y-3">
            {[
              {
                gradient: "from-fuchsia-500 to-pink-400",
                emoji: "💰",
                t: "初期費用ゼロ円から",
                d: "貯金を切り崩さず始められる",
              },
              {
                gradient: "from-pink-500 to-orange-400",
                emoji: "🏠",
                t: "家で子供と一緒に",
                d: "保育料も通勤時間も不要",
              },
              {
                gradient: "from-orange-500 to-amber-400",
                emoji: "✨",
                t: "資格・経験すべて不問",
                d: "今日から始められる設計",
              },
            ].map((f) => (
              <div
                key={f.t}
                className="relative overflow-hidden rounded-2xl bg-white shadow-md shadow-pink-100"
              >
                <div className={`absolute left-0 top-0 bottom-0 w-2 bg-gradient-to-b ${f.gradient}`} />
                <div className="flex items-center gap-4 px-5 py-4 pl-6">
                  <span className="text-3xl">{f.emoji}</span>
                  <div>
                    <p className="font-bold text-[14px] text-stone-900">{f.t}</p>
                    <p className="text-[12px] text-stone-500 mt-0.5">{f.d}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="mb-10 bg-white/90 rounded-3xl p-6 border-2 border-dashed border-fuchsia-300">
          <h2 className="text-center font-bold text-fuchsia-600 mb-5 text-[14px]">
            ♡ 診断でわかる3つのこと ♡
          </h2>
          <div className="space-y-3">
            {[
              "1日30分でも積み上がる副業の型",
              "児童手当＋副業で届く月収目標",
              "子供の成長に合わせた働き方の変え方",
            ].map((t, i) => (
              <div
                key={t}
                className="flex items-center gap-3 bg-fuchsia-50 rounded-full px-4 py-3"
              >
                <span className="w-7 h-7 bg-gradient-to-br from-fuchsia-500 to-orange-400 text-white rounded-full text-[11px] font-bold flex items-center justify-center shrink-0">
                  {i + 1}
                </span>
                <p className="text-[13px] text-stone-700 font-medium flex-1">{t}</p>
              </div>
            ))}
          </div>
        </section>

        <Link
          href="/matching/shindan"
          className="block w-full text-center py-5 bg-gradient-to-r from-fuchsia-500 via-pink-500 to-orange-400 text-white font-black text-lg rounded-full shadow-xl shadow-pink-200 transition hover:scale-[1.02]"
        >
          今すぐ無料で診断する 🌸
        </Link>
        <p className="text-center text-[11px] text-stone-500 mt-3">
          無料・登録不要・60秒
        </p>

        <section className="my-14">
          <div className="bg-white rounded-3xl p-6 text-center shadow-md shadow-fuchsia-100">
            <p className="text-[11px] text-fuchsia-600 font-bold tracking-widest mb-3">
              ♡ 応援されている理由 ♡
            </p>
            <p className="text-5xl font-black text-stone-800">
              1,500<span className="text-base text-fuchsia-500 ml-2">名</span>
            </p>
            <p className="text-[11px] text-stone-500 mt-2">
              シングルマザーの診断実績
            </p>
            <div className="mt-4 pt-4 border-t border-fuchsia-100">
              <p className="text-[12px] italic text-stone-600 leading-relaxed">
                「諦めずに済んだ。
                <br />
                子供と笑って過ごせています」
              </p>
              <p className="text-[10px] text-fuchsia-500 mt-2">
                — 35歳・3人の母
              </p>
            </div>
          </div>
        </section>

        <Link
          href="/matching/shindan"
          className="block w-full text-center py-5 bg-gradient-to-r from-fuchsia-500 via-pink-500 to-orange-400 text-white font-black text-lg rounded-full shadow-xl shadow-pink-200 transition"
        >
          今すぐ無料で診断する 🌸
        </Link>
      </div>
    </div>
  );
}

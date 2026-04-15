import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "副業経験者のための再挑戦診断｜いくつも試した方へ",
  description: "試したけど稼げなかった方に。本当に合う副業を再特定",
};

export default function LpExperiencedMale() {
  return (
    <div className="min-h-screen bg-[#1a1128] text-violet-50">
      <div className="mx-auto w-full max-w-[480px] px-6 py-12">
        <p className="text-[10px] tracking-[0.45em] text-amber-400 mb-8 font-serif">
          — CHAPTER 02 —
        </p>

        <h1 className="text-[27px] font-bold leading-[1.6] mb-6 font-serif">
          いくつか試したけど
          <br />
          稼げなかった。
          <br />
          <span className="italic text-amber-400">
            本当に合う副業、
          </span>
          <br />
          <span className="italic text-amber-400">
            まだ見つかっていませんか？
          </span>
        </h1>

        <div className="border-l-2 border-amber-400/60 pl-5 py-2 my-8">
          <p className="text-[13px] text-violet-200/70 leading-[2] italic">
            せどりも、ライティングも、
            <br />
            動画編集も挫折した——
            <br />
            それは"あなた"の問題ではなく、
            <br />
            選んだ副業が合わなかっただけ。
          </p>
        </div>

        <section className="mb-10">
          <div className="relative bg-[#2a1d44] rounded-lg p-6 border border-amber-400/20">
            <div className="absolute -top-3 left-5 bg-[#1a1128] px-3">
              <span className="text-[10px] tracking-[0.3em] text-amber-400 font-serif">
                ✦ FEATURES ✦
              </span>
            </div>
            <div className="space-y-5 pt-2">
              {[
                { t: "失敗パターンを逆算", d: "合わなかった理由を先に解明" },
                { t: "既に試した副業は自動除外", d: "被らない次の一手を提示" },
                { t: "経験者だけの上級ルート", d: "初心者向けの遠回りは一切なし" },
              ].map((f, i) => (
                <div key={f.t} className="flex gap-4">
                  <span className="text-amber-400 font-serif text-2xl leading-none pt-1">
                    {["Ⅰ", "Ⅱ", "Ⅲ"][i]}
                  </span>
                  <div>
                    <p className="font-semibold text-[15px] mb-1 text-amber-100">
                      {f.t}
                    </p>
                    <p className="text-[12px] text-violet-200/60 leading-relaxed">
                      {f.d}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mb-10 text-center">
          <p className="text-[11px] tracking-[0.3em] text-amber-400 mb-5 font-serif">
            ── 診断でわかる3つのこと ──
          </p>
          <ul className="space-y-4 text-left">
            {[
              "なぜ過去の副業が続かなかったのか",
              "あなたが本当に消耗する・消耗しない領域",
              "次の1つに絞るべき副業ジャンル",
            ].map((t, i) => (
              <li
                key={t}
                className="flex gap-4 items-baseline pb-3 border-b border-violet-900/60"
              >
                <span className="text-amber-400 font-serif">0{i + 1}.</span>
                <span className="text-[14px] text-violet-100 leading-relaxed">
                  {t}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <Link
          href="/matching/shindan"
          className="block w-full text-center py-4 bg-gradient-to-b from-amber-400 to-amber-600 text-[#1a1128] font-bold tracking-wider rounded shadow-lg shadow-amber-500/30 transition hover:shadow-amber-500/50"
        >
          今すぐ無料で診断する
        </Link>
        <p className="text-center text-[11px] text-violet-300/50 mt-3 font-serif italic">
          所要 60 秒
        </p>

        <section className="my-16 text-center">
          <div className="inline-block">
            <div className="text-[10px] tracking-[0.4em] text-amber-400 mb-3 font-serif">
              SURVIVORS
            </div>
            <p className="text-5xl font-serif font-bold text-amber-400 leading-none">
              2,800
            </p>
            <p className="text-xs text-violet-200/60 mt-3 tracking-wider">
              副業経験者が再挑戦のために受診
            </p>
          </div>
        </section>

        <Link
          href="/matching/shindan"
          className="block w-full text-center py-4 bg-gradient-to-b from-amber-400 to-amber-600 text-[#1a1128] font-bold tracking-wider rounded transition"
        >
          今すぐ無料で診断する
        </Link>
      </div>
    </div>
  );
}

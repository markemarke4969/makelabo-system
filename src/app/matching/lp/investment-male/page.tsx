import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "働かずに稼ぐ仕組みを｜投資・自動化志向の方向け副業診断",
  description: "時間を売らずに収入を生む仕組みをAIが60秒で特定",
};

export default function LpInvestmentMale() {
  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <div
        className="absolute inset-x-0 top-0 h-64 opacity-[0.15] pointer-events-none"
        style={{
          backgroundImage:
            "linear-gradient(180deg, #facc15 0%, transparent 100%)",
        }}
      />

      <div className="relative mx-auto w-full max-w-[480px] px-6 py-12">
        <div className="flex items-center gap-3 mb-8">
          <div className="h-px flex-1 bg-gradient-to-r from-transparent to-yellow-500" />
          <p className="text-[11px] tracking-[0.4em] text-yellow-500 font-light">
            PASSIVE INCOME
          </p>
          <div className="h-px flex-1 bg-gradient-to-l from-transparent to-yellow-500" />
        </div>

        <h1 className="text-[29px] font-light leading-[1.5] mb-6 text-center">
          働かずに稼ぐ仕組みを
          <br />
          <span className="font-bold bg-gradient-to-b from-yellow-200 to-yellow-500 bg-clip-text text-transparent">
            最短で
          </span>
          手に入れたい人へ。
        </h1>

        <p className="text-center text-[12px] leading-[2] text-neutral-400 mb-12 border-t border-b border-neutral-800 py-5">
          時間を切り売りする労働には、
          <br />
          必ず上限がある。
          <br />
          — それを超える働き方を、
          <br />
          あなたも欲しがっている。
        </p>

        <section className="mb-12">
          <div className="space-y-3">
            {[
              { k: "01", t: "自動化志向に特化した診断", d: "作業型・受注型は提案外" },
              { k: "02", t: "資産型・ストック型のみ抽出", d: "積み上げで指数関数的に増える型" },
              { k: "03", t: "初期投資額と回収時期を明示", d: "入口と出口を先に見せる" },
            ].map((f) => (
              <div
                key={f.k}
                className="bg-gradient-to-b from-neutral-900 to-neutral-950 border border-yellow-500/20 rounded-lg p-5 hover:border-yellow-500/50 transition"
              >
                <div className="flex items-start gap-4">
                  <span className="text-yellow-500 font-light text-3xl tracking-wider leading-none">
                    {f.k}
                  </span>
                  <div className="flex-1">
                    <p className="font-semibold text-[15px] text-neutral-100">
                      {f.t}
                    </p>
                    <p className="text-[12px] text-neutral-500 mt-1.5">{f.d}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="mb-12 bg-black p-6 border border-yellow-500/30">
          <p className="text-center text-[10px] tracking-[0.4em] text-yellow-500 mb-5">
            ❖ DIAGNOSIS ❖
          </p>
          <div className="space-y-4">
            {[
              ["ROI", "あなたに合う投資回収モデル"],
              ["CAPITAL", "最適な初期投下資金の水準"],
              ["TIMELINE", "キャッシュフロー化までの期間"],
            ].map(([k, v]) => (
              <div key={k} className="flex items-baseline justify-between border-b border-neutral-800 pb-3">
                <span className="text-[10px] text-yellow-500 tracking-[0.3em]">
                  {k}
                </span>
                <span className="text-[13px] text-neutral-200 text-right">
                  {v}
                </span>
              </div>
            ))}
          </div>
        </section>

        <Link
          href="/matching/shindan"
          className="block w-full text-center py-5 bg-gradient-to-b from-yellow-400 via-yellow-500 to-yellow-600 text-black font-bold tracking-[0.15em] rounded-sm shadow-lg shadow-yellow-500/20 transition"
        >
          今すぐ無料で診断する
        </Link>
        <p className="text-center text-[10px] tracking-[0.3em] text-neutral-500 mt-3">
          FREE · 60 SECONDS
        </p>

        <section className="my-16">
          <div className="text-center">
            <p className="text-[11px] tracking-[0.4em] text-neutral-500 mb-3">
              ─── CLIENTS ───
            </p>
            <p className="text-[40px] font-light text-yellow-500 leading-none">
              1,700
              <span className="text-lg text-yellow-700 ml-2">+</span>
            </p>
            <p className="text-[11px] text-neutral-500 mt-3 tracking-wider">
              自動化志向の投資家・経営者が受診
            </p>
          </div>
        </section>

        <Link
          href="/matching/shindan"
          className="block w-full text-center py-5 bg-gradient-to-b from-yellow-400 via-yellow-500 to-yellow-600 text-black font-bold tracking-[0.15em] rounded-sm transition"
        >
          今すぐ無料で診断する
        </Link>
      </div>
    </div>
  );
}

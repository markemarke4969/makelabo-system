import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "家族を守る副業診断｜30〜40代既婚・子持ち男性向け",
  description: "家族がいるからこそリスクなく始められる副業を60秒で診断",
};

export default function LpMarriedMale() {
  return (
    <div className="min-h-screen bg-stone-50 text-stone-800">
      <div className="mx-auto w-full max-w-[480px] px-6 py-12">
        <header className="mb-10 text-center">
          <p className="text-[11px] tracking-[0.4em] text-emerald-800 font-semibold mb-6">
            FOR FAMILY MAN
          </p>
          <h1 className="text-[27px] font-bold leading-[1.55] mb-6">
            家族を守りたい
            <br />
            30〜40代へ。
            <br />
            <span className="text-emerald-800 border-b-2 border-amber-600 pb-1">
              リスクなく始められる副業
            </span>
            を
            <br />
            60秒で診断。
          </h1>
          <p className="text-[13px] leading-[2] text-stone-600">
            家のローン、子供の教育費、老後資金——
            <br />
            あなたの肩にかかる責任は重い。
            <br />
            だからこそ、冒険ではなく「確実に守る副業」を。
          </p>
        </header>

        <section className="mb-10">
          <div className="space-y-0 border border-stone-300 rounded-lg overflow-hidden bg-white">
            {[
              { n: "一", t: "元手ゼロから選択可能", d: "家計に負担をかけずスタート" },
              { n: "二", t: "家族・職場にバレない", d: "匿名・自宅・スキマ時間で完結" },
              { n: "三", t: "月3万円から安定的に", d: "投機ではなく堅実な積み上げ型" },
            ].map((f, i) => (
              <div
                key={f.n}
                className={`flex items-center gap-5 px-5 py-4 ${i !== 2 ? "border-b border-stone-200" : ""}`}
              >
                <div className="w-10 h-10 rounded-full bg-emerald-800 text-amber-300 font-bold flex items-center justify-center shrink-0 text-[15px]">
                  {f.n}
                </div>
                <div>
                  <p className="font-bold text-[14px] mb-0.5">{f.t}</p>
                  <p className="text-[12px] text-stone-500">{f.d}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="mb-10 bg-emerald-900/5 border border-emerald-900/20 rounded-lg p-6">
          <p className="text-center text-xs text-emerald-800 tracking-[0.2em] mb-4 font-semibold">
            診断でわかる3つのこと
          </p>
          <div className="space-y-4">
            {[
              "家族を守りながら続けられる副業の種類",
              "あなたの家計に必要な副収入の目標金額",
              "今の貯金・収入を減らさず始める順序",
            ].map((t, i) => (
              <div key={t} className="flex gap-3 items-start">
                <span className="text-amber-600 font-bold text-lg leading-none">
                  ◆
                </span>
                <div>
                  <p className="text-[10px] text-stone-500 tracking-widest">
                    POINT {i + 1}
                  </p>
                  <p className="text-[14px] font-semibold mt-0.5">{t}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <Link
          href="/matching/shindan"
          className="block w-full text-center py-4 bg-emerald-800 hover:bg-emerald-900 text-amber-50 font-bold tracking-wider rounded-md shadow-lg shadow-emerald-900/20 transition"
        >
          今すぐ無料で診断する
        </Link>
        <p className="text-center text-[11px] text-stone-400 mt-2">無料・登録不要</p>

        <section className="my-14 text-center">
          <p className="text-[11px] text-stone-500 tracking-wider mb-4">
            — 選ばれている理由 —
          </p>
          <div className="inline-block bg-white px-8 py-6 rounded-lg border border-stone-200 shadow-sm">
            <p className="text-4xl font-bold text-emerald-800 leading-none">
              3,100<span className="text-lg text-amber-700 ml-1">名</span>
            </p>
            <p className="text-[11px] text-stone-500 mt-2">
              既婚・子持ち男性の診断実績
            </p>
            <div className="w-8 h-px bg-amber-600 mx-auto my-3" />
            <p className="text-[11px] text-stone-600 leading-relaxed">
              「家族と話し合うきっかけになった」
              <br />
              — 40代・2児の父
            </p>
          </div>
        </section>

        <Link
          href="/matching/shindan"
          className="block w-full text-center py-4 bg-emerald-800 hover:bg-emerald-900 text-amber-50 font-bold tracking-wider rounded-md transition"
        >
          今すぐ無料で診断する
        </Link>
      </div>
    </div>
  );
}

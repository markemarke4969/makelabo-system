import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "現場仕事の後でもできる副業診断｜建設・製造業向け",
  description: "体力仕事で疲れていてもスキマ時間でできる副業をAIが診断",
};

export default function LpConstructionMale() {
  return (
    <div className="min-h-screen bg-zinc-900 text-zinc-100">
      <div className="mx-auto w-full max-w-[480px] px-5 py-10">
        <div className="inline-block bg-orange-500 text-zinc-900 text-[11px] font-black px-3 py-1 rounded-sm mb-5 tracking-wider">
          現場の男へ
        </div>

        <h1 className="text-[28px] font-black leading-[1.4] mb-5">
          現場仕事で疲れて帰っても
          <br />
          <span className="text-orange-400 inline-block border-b-4 border-orange-500 pb-1">
            スキマ時間でできる副業
          </span>
          <br />
          がある。
        </h1>

        <p className="text-[14px] leading-relaxed text-zinc-400 mb-10 border-l-4 border-orange-500 pl-4">
          体力仕事で毎日クタクタ。
          帰ってからPCに向かう気力はない——
          そう思って副業を諦めていませんか？
        </p>

        <section className="mb-10">
          <div className="bg-zinc-800 p-5 rounded border-t-2 border-orange-500">
            <h2 className="text-[13px] font-bold text-orange-400 mb-4 tracking-wider">
              🔧 3つの特徴
            </h2>
            <div className="space-y-4">
              {[
                { t: "1日15分からOK", d: "風呂上がりのスマホ操作で完結" },
                { t: "頭を使わない副業も提案", d: "疲れてても無心でできる" },
                { t: "未経験・資格なしでOK", d: "学歴・スキル一切不問" },
              ].map((f) => (
                <div key={f.t} className="flex gap-3">
                  <div className="w-8 h-8 bg-orange-500 text-zinc-900 font-black flex items-center justify-center shrink-0 rounded-sm">
                    ▶
                  </div>
                  <div>
                    <p className="font-bold text-[15px]">{f.t}</p>
                    <p className="text-[12px] text-zinc-400 mt-0.5">{f.d}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mb-10">
          <h2 className="text-[13px] font-bold mb-4 tracking-wider">
            ⚡ 診断でわかること
          </h2>
          <div className="grid grid-cols-1 gap-2">
            {[
              "体力を消耗しないあなた向けの副業",
              "平日30分×月収アップの現実ライン",
              "同業からの成功パターンと失敗パターン",
            ].map((item, i) => (
              <div
                key={item}
                className="flex items-center gap-3 bg-zinc-800/60 px-4 py-3 border-l-2 border-orange-500"
              >
                <span className="font-black text-orange-500 text-xl">0{i + 1}</span>
                <p className="text-[13px]">{item}</p>
              </div>
            ))}
          </div>
        </section>

        <Link
          href="/matching/shindan"
          className="block w-full text-center py-5 bg-orange-500 hover:bg-orange-600 text-zinc-900 font-black text-lg tracking-wider rounded-sm shadow-[0_0_30px_rgba(249,115,22,0.4)] transition"
        >
          今すぐ無料で診断する
        </Link>
        <p className="text-center text-[11px] text-zinc-500 mt-2">▼ 所要60秒 ▼</p>

        <section className="my-14">
          <div className="bg-zinc-800 py-6 px-4 rounded border-y border-orange-500">
            <p className="text-center text-[11px] text-zinc-400 mb-3 tracking-wider">
              現場系ワーカーの診断実績
            </p>
            <p className="text-center text-5xl font-black text-orange-400">
              5,400<span className="text-xl text-orange-300">名</span>
            </p>
            <p className="text-center text-[11px] text-zinc-400 mt-2">
              建設・製造・物流業界の方が受診
            </p>
          </div>
        </section>

        <Link
          href="/matching/shindan"
          className="block w-full text-center py-5 bg-orange-500 hover:bg-orange-600 text-zinc-900 font-black text-lg tracking-wider rounded-sm transition"
        >
          今すぐ無料で診断する
        </Link>
      </div>
    </div>
  );
}

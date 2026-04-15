import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "副業未経験の女性のための診断｜失敗が怖い方へ",
  description: "初心者でも失敗しない副業をAIが丁寧に診断",
};

export default function LpBeginnerFemale() {
  return (
    <div className="min-h-screen bg-sky-50 text-slate-800">
      <div className="mx-auto w-full max-w-[480px] px-6 py-12">
        <header className="mb-10">
          <div className="flex items-center gap-2 mb-5">
            <span className="w-8 h-8 rounded-full bg-sky-500 text-white text-xs font-bold flex items-center justify-center">
              ✓
            </span>
            <span className="text-[11px] font-bold text-sky-600 tracking-[0.25em]">
              BEGINNER FRIENDLY
            </span>
          </div>
          <h1 className="text-[25px] font-bold leading-[1.7] text-slate-900 mb-5">
            何から始めればいいか
            <br />
            わからない。
            <br />
            <span className="text-sky-600">
              そんな初心者でも
            </span>
            <br />
            <span className="text-[30px] font-black text-sky-600">
              最短で副業を見つける
            </span>
            <br />
            方法。
          </h1>
          <p className="text-[13px] text-slate-600 leading-[2] bg-white/70 rounded-xl p-4 border border-sky-100">
            "失敗したくない"って、当たり前の感情。
            その慎重さを活かせる副業を、私たちが一緒に探します。
          </p>
        </header>

        <section className="mb-10">
          <h2 className="text-sky-600 font-bold text-[13px] mb-4 flex items-center gap-2">
            <span className="w-5 h-0.5 bg-sky-500" />
            初心者のためだけに設計された3つの特徴
          </h2>
          <div className="space-y-3">
            {[
              {
                step: "STEP 01",
                t: "初心者用の副業だけを抽出",
                d: "上級者向け・先行者利益系は除外",
              },
              {
                step: "STEP 02",
                t: "始めかたも診断結果と一緒に表示",
                d: "『何から』を具体的にナビゲート",
              },
              {
                step: "STEP 03",
                t: "リスクの高い案件は回答不可",
                d: "失敗しやすいパターンに自動ブロック",
              },
            ].map((f) => (
              <div
                key={f.step}
                className="bg-white rounded-2xl p-5 border border-sky-100 shadow-sm"
              >
                <p className="text-[10px] font-bold text-sky-500 tracking-widest mb-2">
                  {f.step}
                </p>
                <p className="font-bold text-[15px] text-slate-900 mb-1">{f.t}</p>
                <p className="text-[12px] text-slate-500 leading-relaxed">{f.d}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mb-10">
          <div className="bg-gradient-to-br from-sky-100 to-emerald-50 rounded-2xl p-6 border border-sky-200">
            <h2 className="text-center text-[13px] font-bold text-sky-700 mb-5 flex items-center justify-center gap-2">
              <span>🌱</span> 診断でわかる3つのこと <span>🌱</span>
            </h2>
            <div className="space-y-3">
              {[
                "あなたの性格に一番合う副業1つ",
                "避けたほうがいい副業の種類",
                "安全に始めるための手順",
              ].map((t, i) => (
                <div
                  key={t}
                  className="bg-white/80 rounded-xl px-4 py-3 flex items-start gap-3"
                >
                  <div className="w-6 h-6 bg-emerald-500 text-white rounded-full text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                    {i + 1}
                  </div>
                  <p className="text-[13px] text-slate-700 leading-relaxed flex-1">
                    {t}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <Link
          href="/matching/shindan"
          className="block w-full text-center py-4 bg-gradient-to-r from-sky-500 to-emerald-500 text-white font-bold rounded-2xl shadow-lg shadow-sky-200 transition hover:shadow-xl"
        >
          今すぐ無料で診断する
        </Link>
        <p className="text-center text-[11px] text-slate-400 mt-2">
          ☁️ 登録なし・60秒で完了 ☁️
        </p>

        <section className="my-14 bg-white rounded-2xl p-6 text-center border border-sky-100">
          <p className="text-[11px] text-sky-600 font-bold tracking-widest mb-3">
            ☁️ 初心者に選ばれています ☁️
          </p>
          <p className="text-5xl font-black text-slate-900">
            11,000<span className="text-base text-sky-500 ml-1">名</span>
          </p>
          <p className="text-[11px] text-slate-500 mt-2">
            副業未経験の方が診断済み
          </p>
          <div className="mt-5 grid grid-cols-3 gap-2">
            {[
              { n: "98%", t: "わかりやすかった" },
              { n: "94%", t: "一歩踏み出せた" },
              { n: "91%", t: "周囲にすすめたい" },
            ].map((x) => (
              <div key={x.n} className="bg-sky-50 rounded-lg py-3">
                <p className="text-lg font-bold text-sky-600">{x.n}</p>
                <p className="text-[9px] text-slate-500 mt-0.5">{x.t}</p>
              </div>
            ))}
          </div>
        </section>

        <Link
          href="/matching/shindan"
          className="block w-full text-center py-4 bg-gradient-to-r from-sky-500 to-emerald-500 text-white font-bold rounded-2xl shadow-lg shadow-sky-200 transition"
        >
          今すぐ無料で診断する
        </Link>
      </div>
    </div>
  );
}

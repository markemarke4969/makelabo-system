import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "副業を調べるほど何が正解かわからない会社員男性へ｜AI副業診断",
  description: "情報過多で迷う会社員男性のための60秒AI副業診断",
};

export default function LpCompanyMale() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 selection:bg-blue-200/60">
      <div className="mx-auto w-full max-w-[480px] px-6 py-12">
        <header className="mb-10">
          <span className="inline-block text-[11px] tracking-[0.2em] font-semibold text-blue-700 border-b border-blue-700 pb-1 mb-5">
            FOR BUSINESS PERSON
          </span>
          <h1 className="text-[30px] font-bold leading-[1.45] mb-5 tracking-tight">
            副業を調べるほど
            <br />
            <span className="text-blue-700">何が正解か</span>
            わからなく
            <br />
            なっていませんか？
          </h1>
          <p className="text-[14px] leading-[1.9] text-slate-600">
            YouTube、X、note、セミナー…。
            情報を集めれば集めるほど迷い、
            気づけば週末が潰れている。
            それでも「答え」は見つからない。
          </p>
        </header>

        <section className="mb-10 space-y-3">
          <h2 className="text-xs font-semibold tracking-[0.2em] text-slate-500 mb-4">
            ── 3 つの特徴
          </h2>
          {[
            { n: "01", t: "12問・60秒で完了", d: "通勤中の電車でも判定可能" },
            { n: "02", t: "16タイプのAI分類", d: "曖昧な助言ではなく一点に絞る" },
            { n: "03", t: "会社員に特化した副業のみ提案", d: "怪しい案件は徹底的に除外" },
          ].map((f) => (
            <div
              key={f.n}
              className="flex gap-4 items-start border-l-2 border-blue-700 bg-white px-5 py-4 rounded-r"
            >
              <span className="text-sm font-bold text-blue-700 shrink-0 tracking-wider pt-0.5">
                {f.n}
              </span>
              <div>
                <p className="font-bold text-[15px] mb-1">{f.t}</p>
                <p className="text-[12px] text-slate-500 leading-relaxed">{f.d}</p>
              </div>
            </div>
          ))}
        </section>

        <section className="mb-10 bg-white border border-slate-200 rounded-lg p-6">
          <h2 className="text-sm font-bold mb-4 flex items-center gap-2">
            <span className="w-1 h-4 bg-blue-700" />
            診断でわかる3つのこと
          </h2>
          <ul className="space-y-3 text-[14px] leading-relaxed">
            <li className="flex gap-3">
              <span className="text-blue-700 font-bold">✓</span>
              <span>あなたの思考傾向に合った副業タイプ</span>
            </li>
            <li className="flex gap-3">
              <span className="text-blue-700 font-bold">✓</span>
              <span>踏み込むと時間を浪費する副業の種類</span>
            </li>
            <li className="flex gap-3">
              <span className="text-blue-700 font-bold">✓</span>
              <span>現在の年収と資産に適した始め方</span>
            </li>
          </ul>
        </section>

        <Link
          href="/matching/shindan"
          className="block w-full text-center py-4 bg-blue-700 hover:bg-blue-800 text-white font-bold tracking-wide rounded shadow-md shadow-blue-700/30 transition"
        >
          今すぐ無料で診断する →
        </Link>
        <p className="text-center text-[11px] text-slate-400 mt-2">所要時間 約60秒</p>

        <section className="my-14 pt-10 border-t border-slate-200">
          <p className="text-center text-[11px] tracking-[0.2em] text-slate-500 mb-6">
            ── TRUSTED BY ──
          </p>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div>
              <p className="text-3xl font-bold text-blue-700">8,200<span className="text-xs ml-0.5">名</span></p>
              <p className="text-[10px] text-slate-500 mt-1">会社員の診断実績</p>
            </div>
            <div>
              <p className="text-3xl font-bold text-blue-700">94.1<span className="text-xs ml-0.5">%</span></p>
              <p className="text-[10px] text-slate-500 mt-1">満足度</p>
            </div>
            <div>
              <p className="text-3xl font-bold text-blue-700">60<span className="text-xs ml-0.5">秒</span></p>
              <p className="text-[10px] text-slate-500 mt-1">平均所要時間</p>
            </div>
          </div>
        </section>

        <Link
          href="/matching/shindan"
          className="block w-full text-center py-4 bg-slate-900 hover:bg-black text-white font-bold tracking-wide rounded shadow-md transition"
        >
          今すぐ無料で診断する →
        </Link>
      </div>
    </div>
  );
}

import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "今からでも間に合う副業診断｜40〜50代女性向け・老後対策",
  description: "老後2000万円問題に備える。今からでも間に合う副業を診断",
};

export default function LpSeniorFemale() {
  return (
    <div className="min-h-screen bg-[#faf7f2] text-stone-800">
      <div className="mx-auto w-full max-w-[480px] px-6 py-12">
        <div className="text-center mb-10">
          <div className="inline-block border-y-2 border-amber-600/50 py-2 px-6 mb-6">
            <p className="text-[11px] tracking-[0.3em] text-amber-700 font-medium">
              MATURE WOMEN
            </p>
          </div>
          <h1 className="text-[27px] font-bold leading-[1.7] text-stone-900 mb-5 tracking-wide">
            老後
            <span className="text-purple-800 mx-1">2000万</span>
            問題。
            <br />
            <span className="text-[22px] font-medium text-stone-700">
              今からでも
            </span>
            <br />
            <span className="text-purple-800 text-[29px] font-bold">
              間に合う副業診断。
            </span>
          </h1>
          <div className="flex items-center gap-2 justify-center text-amber-600">
            <span className="w-8 h-px bg-amber-600" />
            <span className="text-xs tracking-widest">✦</span>
            <span className="w-8 h-px bg-amber-600" />
          </div>
        </div>

        <div className="bg-white rounded-lg p-6 mb-10 border border-stone-200 shadow-sm">
          <p className="text-[13px] leading-[2.1] text-stone-700 text-center">
            「もう年齢的に遅いかも…」
            <br />
            そう思って諦めかけていませんか？
            <br />
            <br />
            <span className="font-bold text-purple-800">
              最も多い受診者は50代女性です。
            </span>
          </p>
        </div>

        <section className="mb-10">
          <p className="text-center text-[11px] text-purple-800 tracking-[0.3em] font-semibold mb-5">
            ── 3 つの特徴 ──
          </p>
          <div className="space-y-3">
            {[
              { t: "年齢不問の副業を厳選", d: "60代・70代の受診者も在籍" },
              { t: "スマホ操作に不慣れでもOK", d: "解説を丁寧に表示" },
              { t: "今の生活ペースを崩さない設計", d: "家族・健康を優先した副業のみ" },
            ].map((f, i) => (
              <div
                key={f.t}
                className="bg-white rounded-lg p-5 shadow-sm border border-stone-200 relative"
              >
                <div className="absolute -left-2 -top-2 w-8 h-8 bg-purple-800 text-amber-200 rounded-full flex items-center justify-center font-serif text-sm font-bold">
                  {i + 1}
                </div>
                <p className="font-bold text-[15px] text-stone-900 mb-1 ml-4">
                  {f.t}
                </p>
                <p className="text-[12px] text-stone-500 ml-4">{f.d}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mb-10 bg-gradient-to-b from-purple-50 to-amber-50 rounded-lg p-6 border border-amber-200">
          <h2 className="text-center text-[14px] font-bold text-purple-800 mb-5">
            ◆ 診断でわかる3つのこと ◆
          </h2>
          <div className="space-y-3">
            {[
              "今から10年で作れる老後資金の目安",
              "あなたの生活リズムに合う副業",
              "年金＋副業で月○万円の現実ライン",
            ].map((t, i) => (
              <div
                key={t}
                className="flex items-start gap-3 bg-white/60 rounded-md px-4 py-3 border border-amber-100"
              >
                <span className="text-amber-700 font-serif text-xl leading-none">
                  {["壱", "弐", "参"][i]}
                </span>
                <p className="text-[13px] text-stone-700 leading-relaxed">{t}</p>
              </div>
            ))}
          </div>
        </section>

        <Link
          href="/matching/shindan"
          className="block w-full text-center py-5 bg-purple-800 hover:bg-purple-900 text-amber-100 font-bold tracking-wider rounded-lg shadow-lg shadow-purple-900/20 transition"
        >
          今すぐ無料で診断する
        </Link>
        <p className="text-center text-[11px] text-stone-500 mt-3">
          登録不要・約60秒で完了
        </p>

        <section className="my-14 text-center">
          <p className="text-[11px] text-amber-700 tracking-[0.3em] mb-5">
            ✦ 選ばれる実績 ✦
          </p>
          <div className="bg-white rounded-lg p-8 shadow-sm border border-stone-200">
            <p className="text-5xl font-bold text-purple-800 leading-none">
              4,800
              <span className="text-xl text-amber-600 ml-2">名</span>
            </p>
            <p className="text-[11px] text-stone-500 mt-3">
              40〜60代女性の診断実績
            </p>
            <div className="w-12 h-px bg-amber-600 mx-auto my-4" />
            <p className="text-[12px] italic text-stone-600 leading-relaxed">
              「50代からでも遅くないと
              <br />
              自信がつきました」
            </p>
            <p className="text-[10px] text-amber-700 mt-2">— 54歳・主婦</p>
          </div>
        </section>

        <Link
          href="/matching/shindan"
          className="block w-full text-center py-5 bg-purple-800 hover:bg-purple-900 text-amber-100 font-bold tracking-wider rounded-lg transition"
        >
          今すぐ無料で診断する
        </Link>
      </div>
    </div>
  );
}

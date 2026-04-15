import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "会社員女性のための副業診断｜このままでいいの？と思った方へ",
  description: "将来が不安な会社員女性に、自分に合う副業を60秒で",
};

export default function LpCompanyFemale() {
  return (
    <div className="min-h-screen bg-rose-50 text-neutral-800">
      <div className="mx-auto w-full max-w-[480px] px-6 py-12">
        <div className="text-center mb-10">
          <div className="inline-block bg-white px-5 py-2 rounded-full shadow-sm mb-6">
            <span className="text-[11px] tracking-[0.25em] text-rose-600 font-semibold">
              for working women
            </span>
          </div>
          <h1 className="text-[28px] font-bold leading-[1.6] text-neutral-900 mb-5">
            このまま
            <br />
            <span className="text-rose-600 relative">
              会社員
              <span className="absolute bottom-0 left-0 w-full h-2 bg-rose-200 -z-10 translate-y-1" />
            </span>
            でいいの？
            <br />
            <span className="text-[20px] font-medium text-neutral-600">
              自分に合う副業を、無料で診断。
            </span>
          </h1>
          <p className="text-[13px] leading-[2] text-neutral-500">
            朝、通勤電車の中でため息。
            <br />
            「このまま何年も働くの…？」
            <br />
            そう思う日が増えているなら。
          </p>
        </div>

        <section className="mb-10 space-y-3">
          {[
            { emoji: "💐", t: "女性特化のタイプ診断", d: "共働き・時短勤務にも対応" },
            { emoji: "🤫", t: "会社・夫にバレない", d: "匿名・在宅・通勤時間でOK" },
            { emoji: "🌿", t: "ムリのない副業だけ提案", d: "心身の健康を崩さない設計" },
          ].map((f) => (
            <div
              key={f.t}
              className="flex items-center gap-4 bg-white rounded-2xl px-5 py-4 shadow-sm shadow-rose-100"
            >
              <div className="w-12 h-12 bg-rose-100 rounded-full flex items-center justify-center shrink-0 text-2xl">
                {f.emoji}
              </div>
              <div>
                <p className="font-bold text-[14px] text-neutral-900">{f.t}</p>
                <p className="text-[12px] text-neutral-500 mt-0.5">{f.d}</p>
              </div>
            </div>
          ))}
        </section>

        <section className="mb-10 bg-gradient-to-br from-rose-100/60 to-white border border-rose-200 rounded-2xl p-6">
          <h2 className="text-center text-rose-600 font-bold text-[14px] mb-5 flex items-center justify-center gap-2">
            <span>🎀</span> 診断でわかること <span>🎀</span>
          </h2>
          <div className="space-y-3">
            {[
              "あなたの隠れた強みと向いてる業種",
              "会社員のまま始められる具体的な方法",
              "1年後・3年後のキャリアの選択肢",
            ].map((t, i) => (
              <div
                key={t}
                className="flex items-start gap-3 bg-white/70 rounded-xl px-4 py-3"
              >
                <span className="w-6 h-6 bg-rose-600 text-white rounded-full text-xs font-bold flex items-center justify-center shrink-0">
                  {i + 1}
                </span>
                <p className="text-[13px] text-neutral-700 leading-relaxed">{t}</p>
              </div>
            ))}
          </div>
        </section>

        <Link
          href="/matching/shindan"
          className="block w-full text-center py-4 bg-gradient-to-r from-rose-500 to-rose-600 text-white font-bold rounded-full shadow-lg shadow-rose-300 transition hover:shadow-xl"
        >
          今すぐ無料で診断する 💕
        </Link>
        <p className="text-center text-[11px] text-neutral-400 mt-3">
          登録不要・約60秒
        </p>

        <section className="my-14 text-center">
          <div className="bg-white rounded-3xl px-6 py-8 shadow-sm shadow-rose-100">
            <p className="text-[11px] text-rose-600 tracking-widest mb-3 font-semibold">
              ♡ 選ばれています ♡
            </p>
            <p className="text-4xl font-bold text-neutral-900">
              9,400<span className="text-sm text-rose-500 ml-1">名</span>
            </p>
            <p className="text-[11px] text-neutral-500 mt-2">
              20〜40代の女性会社員が診断済
            </p>
            <div className="flex justify-center gap-1 mt-4">
              {[...Array(5)].map((_, i) => (
                <span key={i} className="text-amber-400">★</span>
              ))}
              <span className="text-[11px] text-neutral-500 ml-2">4.8 / 5.0</span>
            </div>
          </div>
        </section>

        <Link
          href="/matching/shindan"
          className="block w-full text-center py-4 bg-gradient-to-r from-rose-500 to-rose-600 text-white font-bold rounded-full shadow-lg shadow-rose-300 transition"
        >
          今すぐ無料で診断する 💕
        </Link>
      </div>
    </div>
  );
}

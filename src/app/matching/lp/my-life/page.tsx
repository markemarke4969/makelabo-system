import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "自分のことは後回し、そんなあなたへ｜副業診断",
  description: "ずっと誰かのために生きてきたあなたへ。自分の人生を取り戻す副業診断",
};

export default function LpMyLife() {
  return (
    <div className="min-h-screen bg-[#1a0f14] text-rose-50">
      <div
        className="absolute inset-0 opacity-20 pointer-events-none"
        style={{
          backgroundImage:
            "radial-gradient(ellipse at top, rgba(251, 191, 36, 0.15) 0%, transparent 60%)",
        }}
      />
      <div className="relative mx-auto w-full max-w-[480px] px-6 py-14">
        <p className="text-[10px] tracking-[0.5em] text-amber-300/70 mb-8 text-center font-serif">
          — A LETTER FOR YOU —
        </p>

        <h1 className="text-[26px] leading-[1.9] mb-8 font-serif text-center">
          仕事・家事・育児・介護…
          <br />
          <span className="text-amber-300 italic">
            自分のことは
          </span>
          <br />
          <span className="text-amber-300 italic">
            後回しにしてきた
          </span>
          <br />
          あなたへ。
        </h1>

        <div className="relative my-10">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-px h-full bg-gradient-to-b from-amber-300/50 via-amber-300/20 to-transparent" />
          <p className="text-center text-[12px] leading-[2.2] text-rose-200/80 italic px-4">
            気づいたら、
            <br />
            誰かのための日々が何年も続いて、
            <br />
            "やりたかったこと"が思い出せない——
            <br />
            <br />
            <span className="text-amber-200">
              もう、遅くはないです。
            </span>
          </p>
        </div>

        <section className="mb-10">
          <p className="text-center text-[11px] tracking-[0.35em] text-amber-300/80 font-serif mb-6">
            ✦ 3つの約束 ✦
          </p>
          <div className="space-y-4">
            {[
              { t: "自分のための時間を作る副業", d: "誰かのためではなく、あなたのために" },
              { t: "誰にも内緒で始められる", d: "家族にも職場にも知られず" },
              { t: "小さな一歩からで大丈夫", d: "1日10分・月数千円から始められる" },
            ].map((f, i) => (
              <div
                key={f.t}
                className="relative pl-8 border-l border-amber-300/30 pb-2"
              >
                <span className="absolute -left-[9px] top-0 w-4 h-4 rounded-full bg-amber-300 border-4 border-[#1a0f14]" />
                <p className="text-[10px] tracking-[0.3em] text-amber-300/70 font-serif mb-1">
                  PROMISE {["Ⅰ", "Ⅱ", "Ⅲ"][i]}
                </p>
                <p className="font-serif text-[15px] text-rose-50 mb-1">{f.t}</p>
                <p className="text-[12px] text-rose-200/60 leading-relaxed">
                  {f.d}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="mb-10 border-y border-amber-300/20 py-8">
          <p className="text-center text-amber-300/80 text-[11px] tracking-[0.4em] font-serif mb-6">
            ✧ 診断で見えるもの ✧
          </p>
          <div className="space-y-5">
            {[
              "あなたが本当にやりたかったこと",
              "今の生活を壊さず始められる一歩",
              "自分を大切にして稼ぐ働き方",
            ].map((t, i) => (
              <div key={t} className="text-center">
                <p className="text-[10px] tracking-[0.4em] text-amber-300/60 font-serif mb-1">
                  · {["ONE", "TWO", "THREE"][i]} ·
                </p>
                <p className="text-[14px] font-serif leading-relaxed text-rose-50">
                  {t}
                </p>
              </div>
            ))}
          </div>
        </section>

        <Link
          href="/matching/shindan"
          className="block w-full text-center py-5 bg-gradient-to-b from-amber-300 to-amber-500 text-[#1a0f14] font-serif font-bold tracking-[0.15em] rounded-sm shadow-2xl shadow-amber-400/20 transition"
        >
          今すぐ無料で診断する
        </Link>
        <p className="text-center text-[10px] text-rose-300/50 mt-3 font-serif italic tracking-wider">
          — for your life, at last —
        </p>

        <section className="my-16 text-center">
          <p className="text-[11px] text-amber-300/60 font-serif tracking-[0.4em] mb-4">
            ✦
          </p>
          <p className="text-5xl font-serif font-bold text-amber-300 leading-none">
            6,200
          </p>
          <p className="text-[11px] text-rose-200/60 mt-3 tracking-wider">
            自分を取り戻した方がいます
          </p>
          <div className="w-12 h-px bg-amber-300/40 mx-auto my-5" />
          <p className="text-[12px] italic text-rose-100/80 leading-[2] font-serif">
            「ずっと我慢していたことに、
            <br />
            やっと気づけました」
          </p>
          <p className="text-[10px] text-amber-300/70 mt-3 tracking-widest">
            — 52歳 女性
          </p>
        </section>

        <Link
          href="/matching/shindan"
          className="block w-full text-center py-5 bg-gradient-to-b from-amber-300 to-amber-500 text-[#1a0f14] font-serif font-bold tracking-[0.15em] rounded-sm transition"
        >
          今すぐ無料で診断する
        </Link>
      </div>
    </div>
  );
}

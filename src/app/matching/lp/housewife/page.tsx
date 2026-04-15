import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "家事・育児の合間にできる副業診断｜主婦のための60秒診断",
  description: "子育て中でもできる副業をAIが最短で見つけます",
};

export default function LpHousewife() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-orange-50 via-pink-50 to-yellow-50 text-stone-800">
      <div className="mx-auto w-full max-w-[480px] px-6 py-12">
        <div className="text-center mb-8">
          <span className="text-6xl mb-3 inline-block animate-bounce">🧺</span>
          <h1 className="text-[26px] font-bold leading-[1.7] text-stone-800">
            家事・育児の合間にできる
            <br />
            <span className="bg-gradient-to-r from-pink-500 to-orange-400 bg-clip-text text-transparent">
              副業を最短で見つける
            </span>
            <br />
            診断。
          </h1>
        </div>

        <div className="bg-white/80 backdrop-blur rounded-[2rem] p-6 mb-8 border-2 border-dashed border-pink-300">
          <p className="text-[13px] leading-[2] text-stone-600 text-center">
            子どもが昼寝した30分、
            <br />
            洗濯機を回している10分、
            <br />
            <span className="font-bold text-pink-500">
              その"スキマ"だけで副業はできる。
            </span>
          </p>
        </div>

        <section className="mb-8">
          <div className="grid grid-cols-3 gap-3">
            {[
              { emoji: "📱", t: "スマホ" },
              { emoji: "🕐", t: "3分〜" },
              { emoji: "🤱", t: "子連れ◎" },
            ].map((f) => (
              <div
                key={f.t}
                className="bg-white rounded-3xl p-4 text-center shadow-md shadow-pink-100/50"
              >
                <div className="text-3xl mb-1">{f.emoji}</div>
                <p className="text-[12px] font-bold text-stone-700">{f.t}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 space-y-2 px-2">
            {[
              "🌸 スマホ1台あれば始められる",
              "🌸 3分のスキマ時間からOK",
              "🌸 子どもが起きててもできる作業",
            ].map((t) => (
              <p key={t} className="text-[13px] text-stone-700 leading-relaxed">
                {t}
              </p>
            ))}
          </div>
        </section>

        <section className="mb-8 bg-white/80 rounded-[2rem] p-6 shadow-sm shadow-pink-100">
          <h2 className="text-center font-bold text-pink-500 mb-5 text-[15px]">
            🎁 診断でわかる3つのこと 🎁
          </h2>
          <div className="space-y-4">
            {[
              { icon: "⏰", t: "あなたの空き時間で稼げる金額" },
              { icon: "💖", t: "家族バレせず続けられる副業" },
              { icon: "🌈", t: "スキル0でも始められる手順" },
            ].map((item) => (
              <div
                key={item.t}
                className="flex items-center gap-4 bg-gradient-to-r from-pink-100/50 to-orange-100/50 rounded-2xl px-4 py-3"
              >
                <span className="text-2xl">{item.icon}</span>
                <p className="text-[13px] text-stone-700 font-semibold flex-1">
                  {item.t}
                </p>
              </div>
            ))}
          </div>
        </section>

        <Link
          href="/matching/shindan"
          className="block w-full text-center py-5 bg-gradient-to-r from-pink-400 via-orange-400 to-yellow-400 text-white font-black text-lg rounded-full shadow-xl shadow-pink-200 transition hover:scale-[1.02]"
        >
          今すぐ無料で診断する 🌸
        </Link>
        <p className="text-center text-[11px] text-stone-400 mt-3">
          登録不要・約60秒で完了
        </p>

        <section className="my-14 bg-white/80 rounded-[2rem] p-6 text-center border border-pink-100">
          <p className="text-[11px] text-pink-500 tracking-widest font-bold mb-3">
            ♡ 主婦のみなさまに選ばれています ♡
          </p>
          <p className="text-4xl font-black text-stone-800 mb-2">
            7,300<span className="text-lg text-pink-500 ml-1">名</span>
          </p>
          <p className="text-[11px] text-stone-500">
            全国の主婦が診断済み
          </p>
          <div className="mt-4 pt-4 border-t border-pink-100">
            <p className="text-[12px] text-stone-600 leading-relaxed italic">
              「家のことしながら、月3万円。
              <br />
              自分のお小遣いができました」
            </p>
            <p className="text-[10px] text-pink-500 mt-2">— 30代・2児のママ</p>
          </div>
        </section>

        <Link
          href="/matching/shindan"
          className="block w-full text-center py-5 bg-gradient-to-r from-pink-400 via-orange-400 to-yellow-400 text-white font-black text-lg rounded-full shadow-xl shadow-pink-200 transition"
        >
          今すぐ無料で診断する 🌸
        </Link>
      </div>
    </div>
  );
}

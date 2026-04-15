import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "遠回りしない副業診断｜20代男性向け",
  description: "最短で自分に合う副業をAIが特定。60秒で完了",
};

export default function LpTwentiesMale() {
  return (
    <div className="min-h-screen bg-black text-white overflow-hidden relative">
      <div
        className="absolute inset-0 opacity-20 pointer-events-none"
        style={{
          backgroundImage:
            "radial-gradient(circle at 20% 10%, #84cc16 0%, transparent 40%), radial-gradient(circle at 80% 80%, #06b6d4 0%, transparent 40%)",
        }}
      />

      <div className="relative mx-auto w-full max-w-[480px] px-5 py-10">
        <div className="flex items-center gap-2 mb-6">
          <span className="w-2 h-2 bg-lime-400 rounded-full animate-pulse" />
          <span className="text-[11px] font-mono text-lime-400 tracking-[0.3em]">
            FOR.TWENTIES_v2.0
          </span>
        </div>

        <h1 className="text-[32px] font-black leading-[1.2] mb-6 tracking-tight">
          遠回りしたくない
          <br />
          <span className="bg-gradient-to-r from-lime-400 to-cyan-400 bg-clip-text text-transparent">
            20代へ。
          </span>
          <br />
          自分に合う副業を
          <br />
          今すぐ特定する。
        </h1>

        <p className="text-[13px] text-zinc-400 mb-10 leading-relaxed">
          「何から始めればいい？」「どれが稼げる？」
          <br />
          その"迷い"こそが、あなたの時間を奪っている。
        </p>

        <section className="mb-8">
          <div className="grid grid-cols-3 gap-2">
            {[
              { icon: "⚡", t: "60秒", d: "爆速診断" },
              { icon: "🎯", t: "1択", d: "AI即判定" },
              { icon: "🚀", t: "0円", d: "完全無料" },
            ].map((f) => (
              <div
                key={f.t}
                className="border border-lime-400/30 bg-lime-400/5 rounded-lg p-4 text-center backdrop-blur-sm"
              >
                <div className="text-2xl mb-1">{f.icon}</div>
                <p className="text-lime-400 font-black text-lg">{f.t}</p>
                <p className="text-[10px] text-zinc-400 mt-1">{f.d}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mb-10 border border-cyan-400/30 rounded-lg p-5 bg-cyan-400/5">
          <p className="text-[10px] font-mono text-cyan-400 tracking-[0.3em] mb-4">
            /// DIAGNOSIS_OUTPUT
          </p>
          <div className="space-y-3 font-mono">
            {[
              "あなたの副業タイプ",
              "今すぐ切るべき選択肢",
              "最速で成果を出す順序",
            ].map((t, i) => (
              <div key={t} className="flex gap-3 items-center text-[13px]">
                <span className="text-cyan-400 text-xs">&gt;</span>
                <span className="text-zinc-500 text-xs">0{i + 1}</span>
                <span>{t}</span>
              </div>
            ))}
          </div>
        </section>

        <Link
          href="/matching/shindan"
          className="block w-full text-center py-5 bg-gradient-to-r from-lime-400 to-cyan-400 text-black font-black text-lg rounded-lg shadow-[0_0_40px_rgba(132,204,22,0.5)] hover:shadow-[0_0_60px_rgba(132,204,22,0.7)] transition tracking-wide"
        >
          今すぐ無料で診断する →
        </Link>
        <p className="text-center text-[10px] text-zinc-500 mt-2 font-mono">
          // free. no-signup. 60s.
        </p>

        <section className="my-14 border-t border-zinc-800 pt-10">
          <div className="grid grid-cols-2 gap-4">
            <div className="border border-lime-400/30 p-4 rounded">
              <p className="text-xs text-zinc-500 font-mono mb-1">USERS</p>
              <p className="text-3xl font-black text-lime-400">12,400+</p>
            </div>
            <div className="border border-cyan-400/30 p-4 rounded">
              <p className="text-xs text-zinc-500 font-mono mb-1">AGE 20-29</p>
              <p className="text-3xl font-black text-cyan-400">73%</p>
            </div>
          </div>
          <p className="text-center text-[11px] text-zinc-500 mt-4">
            20代からの受診が圧倒的多数
          </p>
        </section>

        <Link
          href="/matching/shindan"
          className="block w-full text-center py-5 bg-gradient-to-r from-lime-400 to-cyan-400 text-black font-black text-lg rounded-lg transition tracking-wide"
        >
          今すぐ無料で診断する →
        </Link>
      </div>
    </div>
  );
}

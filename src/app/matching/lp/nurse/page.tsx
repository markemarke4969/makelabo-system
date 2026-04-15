import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "不規則シフトでもできる副業診断｜看護師・介護士向け",
  description: "夜勤・日勤・休日バラバラでもOKの副業をAIが診断",
};

export default function LpNurse() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      <div className="mx-auto w-full max-w-[480px] px-6 py-12">
        <div className="mb-8">
          <div className="inline-flex items-center gap-2 bg-teal-50 border border-teal-200 rounded-full px-4 py-1.5 mb-5">
            <span className="w-1.5 h-1.5 bg-teal-500 rounded-full" />
            <span className="text-[11px] font-bold text-teal-700 tracking-wider">
              MEDICAL / NURSING CARE
            </span>
          </div>
          <h1 className="text-[26px] font-bold leading-[1.6] text-slate-900">
            不規則なシフト勤務でも
            <br />
            <span className="relative inline-block">
              <span className="relative z-10 text-teal-600">無理なく稼げる</span>
              <span className="absolute bottom-1 left-0 right-0 h-3 bg-teal-100 -z-0" />
            </span>
            副業を
            <br />
            <span className="text-[20px] font-medium">60秒で診断。</span>
          </h1>
        </div>

        <div className="bg-white border-l-4 border-teal-500 pl-5 py-4 mb-10 rounded-r-lg">
          <p className="text-[13px] leading-[1.9] text-slate-600">
            夜勤明けのぼんやりした時間、
            <br />
            連休だけど体がだるい日——
            <br />
            そんな日でもできる副業、実はあります。
          </p>
        </div>

        <section className="mb-10">
          <p className="text-[11px] font-bold text-teal-700 tracking-widest mb-4">
            ━ 特徴 ━
          </p>
          <div className="space-y-3">
            {[
              {
                icon: "🏥",
                t: "シフトに合わせて調整可能",
                d: "固定の時間拘束がない副業を厳選",
              },
              {
                icon: "😴",
                t: "夜勤明け・疲れていてもOK",
                d: "頭を使わず体力も消耗しないもの",
              },
              {
                icon: "📋",
                t: "医療・福祉の知識を活かす道も",
                d: "これまでの経験を収入に変える選択肢",
              },
            ].map((f) => (
              <div
                key={f.t}
                className="flex gap-4 bg-white rounded-xl p-4 border border-slate-200"
              >
                <div className="w-12 h-12 bg-teal-50 rounded-lg flex items-center justify-center shrink-0 text-2xl">
                  {f.icon}
                </div>
                <div>
                  <p className="font-bold text-[14px] text-slate-900">{f.t}</p>
                  <p className="text-[12px] text-slate-500 mt-1">{f.d}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="mb-10 bg-teal-50/50 border border-teal-200 rounded-2xl p-6">
          <h2 className="flex items-center gap-2 font-bold text-teal-700 text-[14px] mb-4">
            <span className="w-1 h-4 bg-teal-500 rounded" />
            診断でわかる3つのこと
          </h2>
          <ul className="space-y-3">
            {[
              "勤務体系に合う副業の種類と時間配分",
              "無理なく続けられる月収の現実ライン",
              "体調を崩さず稼ぐためのペース設計",
            ].map((t, i) => (
              <li key={t} className="flex gap-3 items-start">
                <div className="w-5 h-5 bg-teal-500 text-white rounded-full text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                  {i + 1}
                </div>
                <p className="text-[13px] text-slate-700 leading-relaxed flex-1">
                  {t}
                </p>
              </li>
            ))}
          </ul>
        </section>

        <Link
          href="/matching/shindan"
          className="block w-full text-center py-4 bg-teal-500 hover:bg-teal-600 text-white font-bold rounded-xl shadow-md shadow-teal-200 transition"
        >
          今すぐ無料で診断する
        </Link>
        <p className="text-center text-[11px] text-slate-400 mt-2">
          登録不要 / 所要60秒
        </p>

        <section className="my-14">
          <div className="bg-white border border-slate-200 rounded-2xl p-6">
            <p className="text-center text-[11px] text-teal-600 tracking-widest font-bold mb-3">
              + 信頼の診断実績 +
            </p>
            <div className="flex items-end justify-center gap-1 mb-2">
              <p className="text-5xl font-bold text-slate-900">2,900</p>
              <p className="text-lg text-teal-500 mb-1 ml-1">名</p>
            </div>
            <p className="text-center text-[11px] text-slate-500">
              医療・介護従事者が診断済み
            </p>
            <div className="mt-5 pt-5 border-t border-slate-100 flex items-center gap-3 justify-center">
              <div className="flex gap-0.5">
                {[...Array(5)].map((_, i) => (
                  <span key={i} className="text-teal-500 text-xs">
                    ★
                  </span>
                ))}
              </div>
              <span className="text-[11px] text-slate-500">
                4.9 / 5.0 の高評価
              </span>
            </div>
          </div>
        </section>

        <Link
          href="/matching/shindan"
          className="block w-full text-center py-4 bg-teal-500 hover:bg-teal-600 text-white font-bold rounded-xl shadow-md shadow-teal-200 transition"
        >
          今すぐ無料で診断する
        </Link>
      </div>
    </div>
  );
}

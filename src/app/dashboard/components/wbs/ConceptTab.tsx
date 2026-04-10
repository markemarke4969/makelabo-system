"use client";
import { useState } from "react";
import type { WbsProject } from "@/lib/wbs-data";

type CatchCopy = { id: number; text: string };
type FunnelEpisode = { ep: string; title: string; url: string; viewRate: string };
type ConceptData = {
  concept: string;
  appeal: string;
  enemy: string;
  catches: CatchCopy[];
  scriptUrl: string;
  lpUrl: string;
  stepUrl: string;
  episodes: FunnelEpisode[];
};

const INIT: ConceptData = {
  concept: "",
  appeal: "",
  enemy: "",
  catches: [
    { id: 1, text: "" },
    { id: 2, text: "" },
  ],
  scriptUrl: "",
  lpUrl: "",
  stepUrl: "",
  episodes: [
    { ep: "1話", title: "", url: "", viewRate: "" },
    { ep: "2話", title: "", url: "", viewRate: "" },
    { ep: "3話", title: "", url: "", viewRate: "" },
    { ep: "4話", title: "", url: "", viewRate: "" },
    { ep: "5話", title: "", url: "", viewRate: "" },
  ],
};

export default function ConceptTab({ project }: { project: WbsProject }) {
  const [d, setD] = useState<ConceptData>(INIT);
  const [nextCatchId, setNextCatchId] = useState(3);

  function addCatch() {
    setD(p => ({ ...p, catches: [...p.catches, { id: nextCatchId, text: "" }] }));
    setNextCatchId(n => n + 1);
  }
  function updateCatch(id: number, text: string) {
    setD(p => ({ ...p, catches: p.catches.map(c => c.id === id ? { ...c, text } : c) }));
  }
  function removeCatch(id: number) {
    setD(p => ({ ...p, catches: p.catches.filter(c => c.id !== id) }));
  }
  function updateEp(idx: number, field: keyof FunnelEpisode, val: string) {
    setD(p => ({ ...p, episodes: p.episodes.map((e, i) => i === idx ? { ...e, [field]: val } : e) }));
  }

  return (
    <div className="space-y-6">
      {/* ローンチコンセプト */}
      <div className="bg-[#1e2235] rounded-2xl border border-[#2a2f45] p-5">
        <h3 className="text-base font-bold text-white mb-4">ローンチコンセプト</h3>
        <textarea value={d.concept} onChange={e => setD(p => ({ ...p, concept: e.target.value }))}
          placeholder="このローンチの核となるコンセプトを記入&#10;例：「完全初心者が3ヶ月で月収30万円を達成するFX自動売買プログラム」"
          rows={5}
          className="w-full bg-[#13162a] border border-[#2a2f45] rounded-lg px-4 py-3 text-sm text-white placeholder-[#4a4f65] focus:border-[#4f8ff7] focus:outline-none resize-none" />
      </div>

      {/* 訴求軸・仮想敵 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-[#1e2235] rounded-2xl border border-[#2a2f45] p-5">
          <h3 className="text-base font-bold text-[#4f8ff7] mb-4">訴求軸</h3>
          <textarea value={d.appeal} onChange={e => setD(p => ({ ...p, appeal: e.target.value }))}
            placeholder="メインの訴求ポイント&#10;例：・時間がない人でもOK&#10;・スマホだけで完結&#10;・実績者多数"
            rows={6}
            className="w-full bg-[#13162a] border border-[#2a2f45] rounded-lg px-3 py-2.5 text-sm text-white placeholder-[#4a4f65] focus:border-[#4f8ff7] focus:outline-none resize-none" />
        </div>
        <div className="bg-[#1e2235] rounded-2xl border border-red-500/20 p-5">
          <h3 className="text-base font-bold text-red-400 mb-4">仮想敵</h3>
          <textarea value={d.enemy} onChange={e => setD(p => ({ ...p, enemy: e.target.value }))}
            placeholder="ターゲットが感じている「敵」&#10;例：・裁量トレードで負け続ける日々&#10;・高額スクールに騙された経験&#10;・独学の限界"
            rows={6}
            className="w-full bg-[#13162a] border border-[#2a2f45] rounded-lg px-3 py-2.5 text-sm text-white placeholder-[#4a4f65] focus:border-red-500 focus:outline-none resize-none" />
        </div>
      </div>

      {/* キャッチコピー候補 */}
      <div className="bg-[#1e2235] rounded-2xl border border-[#2a2f45] p-5">
        <h3 className="text-base font-bold text-white mb-4">キャッチコピー候補</h3>
        <div className="space-y-2">
          {d.catches.map((c, i) => (
            <div key={c.id} className="flex items-center gap-2">
              <span className="text-sm font-bold text-[#4f8ff7] w-6 text-center">{i + 1}</span>
              <input value={c.text} onChange={e => updateCatch(c.id, e.target.value)}
                placeholder="キャッチコピーを入力"
                className="flex-1 bg-[#13162a] border border-[#2a2f45] rounded-lg px-3 py-2.5 text-sm text-white placeholder-[#4a4f65] focus:border-[#4f8ff7] focus:outline-none" />
              <button onClick={() => removeCatch(c.id)} className="text-[#6b7194] hover:text-red-400 text-lg transition">×</button>
            </div>
          ))}
        </div>
        <button onClick={addCatch}
          className="mt-3 px-4 py-2 rounded-lg bg-[#4f8ff7]/10 border border-[#4f8ff7]/30 text-sm font-bold text-[#4f8ff7] hover:bg-[#4f8ff7]/20 transition">
          + 候補を追加
        </button>
      </div>

      {/* ファネル情報 */}
      <div className="bg-[#1e2235] rounded-2xl border border-[#2a2f45] p-5">
        <h3 className="text-base font-bold text-white mb-4">ファネル情報</h3>

        {/* URL */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
          <div>
            <label className="text-xs font-bold text-[#9aa0b8] mb-1.5 block">動画台本URL</label>
            <input value={d.scriptUrl} onChange={e => setD(p => ({ ...p, scriptUrl: e.target.value }))} placeholder="https://..."
              className="w-full bg-[#13162a] border border-[#2a2f45] rounded-lg px-3 py-2.5 text-sm text-white placeholder-[#4a4f65] focus:border-[#4f8ff7] focus:outline-none" />
          </div>
          <div>
            <label className="text-xs font-bold text-[#9aa0b8] mb-1.5 block">個別相談ページURL</label>
            <input value={d.lpUrl} onChange={e => setD(p => ({ ...p, lpUrl: e.target.value }))} placeholder="https://..."
              className="w-full bg-[#13162a] border border-[#2a2f45] rounded-lg px-3 py-2.5 text-sm text-white placeholder-[#4a4f65] focus:border-[#4f8ff7] focus:outline-none" />
          </div>
          <div>
            <label className="text-xs font-bold text-[#9aa0b8] mb-1.5 block">ステップシナリオURL</label>
            <input value={d.stepUrl} onChange={e => setD(p => ({ ...p, stepUrl: e.target.value }))} placeholder="https://..."
              className="w-full bg-[#13162a] border border-[#2a2f45] rounded-lg px-3 py-2.5 text-sm text-white placeholder-[#4a4f65] focus:border-[#4f8ff7] focus:outline-none" />
          </div>
        </div>

        {/* 各話 */}
        <h4 className="text-sm font-bold text-[#9aa0b8] mb-3">ファネル各話</h4>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-xs font-bold text-[#6b7194]">
                <th className="text-left px-3 py-2 w-16">話数</th>
                <th className="text-left px-3 py-2">タイトル</th>
                <th className="text-left px-3 py-2">URL</th>
                <th className="text-left px-3 py-2 w-24">視聴率</th>
              </tr>
            </thead>
            <tbody>
              {d.episodes.map((ep, i) => (
                <tr key={ep.ep} className="border-t border-[#2a2f45]/50">
                  <td className="px-3 py-2">
                    <span className="text-sm font-bold text-[#4f8ff7]">{ep.ep}</span>
                  </td>
                  <td className="px-3 py-2">
                    <input value={ep.title} onChange={e => updateEp(i, "title", e.target.value)} placeholder="タイトル"
                      className="w-full bg-[#13162a] border border-[#2a2f45] rounded-lg px-3 py-2 text-sm text-white placeholder-[#4a4f65] focus:border-[#4f8ff7] focus:outline-none" />
                  </td>
                  <td className="px-3 py-2">
                    <input value={ep.url} onChange={e => updateEp(i, "url", e.target.value)} placeholder="https://..."
                      className="w-full bg-[#13162a] border border-[#2a2f45] rounded-lg px-3 py-2 text-sm text-white placeholder-[#4a4f65] focus:border-[#4f8ff7] focus:outline-none" />
                  </td>
                  <td className="px-3 py-2">
                    <input value={ep.viewRate} onChange={e => updateEp(i, "viewRate", e.target.value)} placeholder="0%"
                      className="w-full bg-[#13162a] border border-[#2a2f45] rounded-lg px-3 py-2 text-sm text-white text-center placeholder-[#4a4f65] focus:border-[#4f8ff7] focus:outline-none" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

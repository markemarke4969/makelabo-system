"use client";
import { useState } from "react";
import type { WbsProject } from "@/lib/wbs-data";

type ChronoEntry = { id: number; year: string; event: string; note: string };

type HolderData = {
  name: string; age: string; genre: string;
  strengths: string; weaknesses: string; failures: string; achievements: string;
  character: string; ngItems: string;
  tanaoroshi: string;
  chronology: ChronoEntry[];
};

const INIT: HolderData = {
  name: "", age: "", genre: "",
  strengths: "", weaknesses: "", failures: "", achievements: "",
  character: "", ngItems: "",
  tanaoroshi: "",
  chronology: [
    { id: 1, year: "2020", event: "FX自動売買を開始", note: "サンプル" },
    { id: 2, year: "2022", event: "月収100万円達成", note: "" },
    { id: 3, year: "2024", event: "コミュニティ立ち上げ", note: "" },
  ],
};

export default function HolderTab({ project }: { project: WbsProject }) {
  const [d, setD] = useState<HolderData>(INIT);
  const [nextId, setNextId] = useState(4);

  function set<K extends keyof HolderData>(k: K, v: HolderData[K]) { setD(p => ({ ...p, [k]: v })); }
  function updateChrono(id: number, field: keyof ChronoEntry, val: string) {
    setD(p => ({ ...p, chronology: p.chronology.map(c => c.id === id ? { ...c, [field]: val } : c) }));
  }
  function addChrono() {
    setD(p => ({ ...p, chronology: [...p.chronology, { id: nextId, year: "", event: "", note: "" }] }));
    setNextId(n => n + 1);
  }
  function removeChrono(id: number) {
    setD(p => ({ ...p, chronology: p.chronology.filter(c => c.id !== id) }));
  }

  return (
    <div className="space-y-6">
      {/* 基本情報 */}
      <Section title="基本情報">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Field label="ホルダー名" value={d.name} onChange={v => set("name", v)} placeholder="例：田中太郎" />
          <Field label="年齢" value={d.age} onChange={v => set("age", v)} placeholder="例：35歳" />
          <Field label="得意ジャンル" value={d.genre} onChange={v => set("genre", v)} placeholder="例：FX自動売買" />
        </div>
      </Section>

      {/* 強み・弱み */}
      <Section title="強み・弱み・実績">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Area label="強み" value={d.strengths} onChange={v => set("strengths", v)} placeholder="強みを記入" rows={3} />
          <Area label="弱み" value={d.weaknesses} onChange={v => set("weaknesses", v)} placeholder="弱みを記入" rows={3} />
          <Area label="失敗談" value={d.failures} onChange={v => set("failures", v)} placeholder="共感を得られる失敗エピソード" rows={3} />
          <Area label="過去実績" value={d.achievements} onChange={v => set("achievements", v)} placeholder="数字で語れる実績" rows={3} />
        </div>
      </Section>

      {/* キャラクター設定 */}
      <Section title="キャラクター設定・NG事項">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Area label="キャラクター設定" value={d.character} onChange={v => set("character", v)} placeholder="どんな人物像で見せるか" rows={4} />
          <Area label="NG事項" value={d.ngItems} onChange={v => set("ngItems", v)} placeholder="絶対に言ってはいけないこと等" rows={4} />
        </div>
      </Section>

      {/* 棚卸しデータ */}
      <Section title="棚卸しデータ">
        <Area label="" value={d.tanaoroshi} onChange={v => set("tanaoroshi", v)}
          placeholder="ホルダーの人生棚卸し・ヒアリング内容をここに入力" rows={8} />
      </Section>

      {/* ホルダー年表 */}
      <Section title="ホルダー年表">
        <div className="space-y-2">
          {/* ヘッダー */}
          <div className="grid grid-cols-[80px_1fr_1fr_40px] gap-2 px-1 text-xs font-bold text-[#6b7194]">
            <span>年</span><span>出来事</span><span>備考</span><span />
          </div>
          {d.chronology.map(c => (
            <div key={c.id} className="grid grid-cols-[80px_1fr_1fr_40px] gap-2 items-center">
              <input value={c.year} onChange={e => updateChrono(c.id, "year", e.target.value)}
                className="bg-[#13162a] border border-[#2a2f45] rounded-lg px-2 py-2 text-sm text-white focus:border-[#4f8ff7] focus:outline-none" placeholder="年" />
              <input value={c.event} onChange={e => updateChrono(c.id, "event", e.target.value)}
                className="bg-[#13162a] border border-[#2a2f45] rounded-lg px-3 py-2 text-sm text-white focus:border-[#4f8ff7] focus:outline-none" placeholder="出来事" />
              <input value={c.note} onChange={e => updateChrono(c.id, "note", e.target.value)}
                className="bg-[#13162a] border border-[#2a2f45] rounded-lg px-3 py-2 text-sm text-white focus:border-[#4f8ff7] focus:outline-none" placeholder="備考" />
              <button onClick={() => removeChrono(c.id)}
                className="text-[#6b7194] hover:text-red-400 text-lg transition">×</button>
            </div>
          ))}
          <button onClick={addChrono}
            className="mt-2 px-4 py-2 rounded-lg bg-[#4f8ff7]/10 border border-[#4f8ff7]/30 text-sm font-bold text-[#4f8ff7] hover:bg-[#4f8ff7]/20 transition">
            + 年表を追加
          </button>
        </div>
      </Section>
    </div>
  );
}

// --- 共通UI ---
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-[#1e2235] rounded-2xl border border-[#2a2f45] p-5">
      {title && <h3 className="text-base font-bold text-white mb-4">{title}</h3>}
      {children}
    </div>
  );
}
function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      {label && <label className="text-xs font-bold text-[#9aa0b8] mb-1.5 block">{label}</label>}
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="w-full bg-[#13162a] border border-[#2a2f45] rounded-lg px-3 py-2.5 text-sm text-white placeholder-[#4a4f65] focus:border-[#4f8ff7] focus:outline-none" />
    </div>
  );
}
function Area({ label, value, onChange, placeholder, rows = 3 }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; rows?: number }) {
  return (
    <div>
      {label && <label className="text-xs font-bold text-[#9aa0b8] mb-1.5 block">{label}</label>}
      <textarea value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={rows}
        className="w-full bg-[#13162a] border border-[#2a2f45] rounded-lg px-3 py-2.5 text-sm text-white placeholder-[#4a4f65] focus:border-[#4f8ff7] focus:outline-none resize-none" />
    </div>
  );
}

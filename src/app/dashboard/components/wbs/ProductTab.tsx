"use client";
import { useState } from "react";
import type { WbsProject } from "@/lib/wbs-data";

type PriceRow = { label: string; fe: string; upsell: string; downsell: string };
type CourseRow = { label: string; content: string; bonus: string };
type ProductData = {
  productName: string;
  prices: PriceRow[];
  courses: CourseRow[];
  targetAge: string; targetJob: string; targetPain: string; targetGoal: string;
};

const INIT: ProductData = {
  productName: "",
  prices: [
    { label: "松", fe: "", upsell: "", downsell: "" },
    { label: "竹", fe: "", upsell: "", downsell: "" },
    { label: "梅", fe: "", upsell: "", downsell: "" },
  ],
  courses: [
    { label: "松", content: "", bonus: "" },
    { label: "竹", content: "", bonus: "" },
    { label: "梅", content: "", bonus: "" },
  ],
  targetAge: "", targetJob: "", targetPain: "", targetGoal: "",
};

export default function ProductTab({ project }: { project: WbsProject }) {
  const [d, setD] = useState<ProductData>(INIT);

  function updatePrice(i: number, field: keyof PriceRow, v: string) {
    setD(p => ({ ...p, prices: p.prices.map((r, idx) => idx === i ? { ...r, [field]: v } : r) }));
  }
  function updateCourse(i: number, field: keyof CourseRow, v: string) {
    setD(p => ({ ...p, courses: p.courses.map((r, idx) => idx === i ? { ...r, [field]: v } : r) }));
  }

  const TIER_COLORS = ["#4f8ff7", "#34d399", "#fbbf24"];

  return (
    <div className="space-y-6">
      {/* 商品名 */}
      <div className="bg-[#1e2235] rounded-2xl border border-[#2a2f45] p-5">
        <h3 className="text-base font-bold text-white mb-4">商品名</h3>
        <input value={d.productName} onChange={e => setD(p => ({ ...p, productName: e.target.value }))}
          placeholder="例：ハピネスサロン"
          className="w-full bg-[#13162a] border border-[#2a2f45] rounded-lg px-4 py-3 text-lg text-white font-bold placeholder-[#4a4f65] focus:border-[#4f8ff7] focus:outline-none" />
      </div>

      {/* 松竹梅 価格設定 */}
      <div className="bg-[#1e2235] rounded-2xl border border-[#2a2f45] p-5">
        <h3 className="text-base font-bold text-white mb-4">松/竹/梅 価格設定</h3>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-xs font-bold text-[#6b7194]">
                <th className="text-left px-3 py-2 w-20">コース</th>
                <th className="text-left px-3 py-2">FE価格</th>
                <th className="text-left px-3 py-2">アップセル価格</th>
                <th className="text-left px-3 py-2">ダウンセル価格</th>
              </tr>
            </thead>
            <tbody>
              {d.prices.map((r, i) => (
                <tr key={r.label}>
                  <td className="px-3 py-2">
                    <span className="text-base font-bold px-3 py-1 rounded-lg" style={{ color: TIER_COLORS[i], background: TIER_COLORS[i] + "15", border: `1px solid ${TIER_COLORS[i]}33` }}>
                      {r.label}
                    </span>
                  </td>
                  {(["fe", "upsell", "downsell"] as const).map(f => (
                    <td key={f} className="px-3 py-2">
                      <input value={r[f]} onChange={e => updatePrice(i, f, e.target.value)} placeholder="¥0"
                        className="w-full bg-[#13162a] border border-[#2a2f45] rounded-lg px-3 py-2 text-sm text-white placeholder-[#4a4f65] focus:border-[#4f8ff7] focus:outline-none" />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 各コースの内容・特典 */}
      <div className="bg-[#1e2235] rounded-2xl border border-[#2a2f45] p-5">
        <h3 className="text-base font-bold text-white mb-4">各コースの内容・特典</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {d.courses.map((c, i) => (
            <div key={c.label} className="rounded-xl border p-4" style={{ borderColor: TIER_COLORS[i] + "40", background: TIER_COLORS[i] + "08" }}>
              <p className="text-lg font-bold mb-3" style={{ color: TIER_COLORS[i] }}>{c.label}コース</p>
              <label className="text-xs font-bold text-[#9aa0b8] mb-1 block">内容</label>
              <textarea value={c.content} onChange={e => updateCourse(i, "content", e.target.value)}
                placeholder="コース内容を入力" rows={4}
                className="w-full bg-[#13162a] border border-[#2a2f45] rounded-lg px-3 py-2 text-sm text-white placeholder-[#4a4f65] focus:border-[#4f8ff7] focus:outline-none resize-none mb-3" />
              <label className="text-xs font-bold text-[#9aa0b8] mb-1 block">特典</label>
              <textarea value={c.bonus} onChange={e => updateCourse(i, "bonus", e.target.value)}
                placeholder="特典を入力" rows={3}
                className="w-full bg-[#13162a] border border-[#2a2f45] rounded-lg px-3 py-2 text-sm text-white placeholder-[#4a4f65] focus:border-[#4f8ff7] focus:outline-none resize-none" />
            </div>
          ))}
        </div>
      </div>

      {/* ターゲット設定 */}
      <div className="bg-[#1e2235] rounded-2xl border border-[#2a2f45] p-5">
        <h3 className="text-base font-bold text-white mb-4">ターゲット設定</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-bold text-[#9aa0b8] mb-1.5 block">年齢層</label>
            <input value={d.targetAge} onChange={e => setD(p => ({ ...p, targetAge: e.target.value }))} placeholder="例：30〜50代"
              className="w-full bg-[#13162a] border border-[#2a2f45] rounded-lg px-3 py-2.5 text-sm text-white placeholder-[#4a4f65] focus:border-[#4f8ff7] focus:outline-none" />
          </div>
          <div>
            <label className="text-xs font-bold text-[#9aa0b8] mb-1.5 block">職業</label>
            <input value={d.targetJob} onChange={e => setD(p => ({ ...p, targetJob: e.target.value }))} placeholder="例：会社員・主婦"
              className="w-full bg-[#13162a] border border-[#2a2f45] rounded-lg px-3 py-2.5 text-sm text-white placeholder-[#4a4f65] focus:border-[#4f8ff7] focus:outline-none" />
          </div>
          <div>
            <label className="text-xs font-bold text-[#9aa0b8] mb-1.5 block">悩み</label>
            <textarea value={d.targetPain} onChange={e => setD(p => ({ ...p, targetPain: e.target.value }))} placeholder="ターゲットが抱える悩み" rows={3}
              className="w-full bg-[#13162a] border border-[#2a2f45] rounded-lg px-3 py-2.5 text-sm text-white placeholder-[#4a4f65] focus:border-[#4f8ff7] focus:outline-none resize-none" />
          </div>
          <div>
            <label className="text-xs font-bold text-[#9aa0b8] mb-1.5 block">ゴール</label>
            <textarea value={d.targetGoal} onChange={e => setD(p => ({ ...p, targetGoal: e.target.value }))} placeholder="購入後に得たい未来" rows={3}
              className="w-full bg-[#13162a] border border-[#2a2f45] rounded-lg px-3 py-2.5 text-sm text-white placeholder-[#4a4f65] focus:border-[#4f8ff7] focus:outline-none resize-none" />
          </div>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import Link from "next/link";

interface WebinarItem {
  id: string; date: string; title: string;
  delivery_platform: string; target_category: string;
  registrant_count: number; live_viewer_count: number;
  kw_sender_count: number; appointment_count: number;
  close_count: number; close_unit_price: number;
  revenue: number; deposit_amount: number;
  script_url: string; transcript_url: string;
}

interface Props {
  projectName: string; projectColor: string;
  items: WebinarItem[];
}

const CATEGORIES = [
  { key: null, label: "すべて" },
  { key: "all", label: "全ブッパ" },
  { key: "unpurchased", label: "未購入者向け" },
  { key: "purchased", label: "購入者向け" },
];

const SAMPLE_ITEMS: WebinarItem[] = [
  { id: "sample-all", date: "2026-04-01", title: "(サンプル)全ブッパウェビナー", delivery_platform: "UTAGE", target_category: "all", registrant_count: 0, live_viewer_count: 0, kw_sender_count: 0, appointment_count: 0, close_count: 0, close_unit_price: 0, revenue: 0, deposit_amount: 0, script_url: "", transcript_url: "" },
  { id: "sample-unpurchased", date: "2026-04-01", title: "(サンプル)未購入者向けウェビナー", delivery_platform: "UTAGE", target_category: "unpurchased", registrant_count: 0, live_viewer_count: 0, kw_sender_count: 0, appointment_count: 0, close_count: 0, close_unit_price: 0, revenue: 0, deposit_amount: 0, script_url: "", transcript_url: "" },
  { id: "sample-purchased", date: "2026-04-01", title: "(サンプル)購入者向けウェビナー", delivery_platform: "UTAGE", target_category: "purchased", registrant_count: 0, live_viewer_count: 0, kw_sender_count: 0, appointment_count: 0, close_count: 0, close_unit_price: 0, revenue: 0, deposit_amount: 0, script_url: "", transcript_url: "" },
];

function formatYen(n: number) { return "\u00A5" + Math.round(n || 0).toLocaleString(); }

const DEMO_CUSTOMERS = [
  { name: "T.S", age: "40代", gender: "男性", job: "会社員", bg: "副業に興味あり", reason: "価格の安心感" },
  { name: "M.K", age: "30代", gender: "女性", job: "主婦", bg: "在宅ワーク希望", reason: "サポートの充実" },
  { name: "Y.H", age: "50代", gender: "男性", job: "自営業", bg: "新規事業模索中", reason: "実績への信頼" },
  { name: "A.N", age: "20代", gender: "女性", job: "フリーター", bg: "スキルアップ目的", reason: "再現性の高さ" },
  { name: "K.O", age: "40代", gender: "男性", job: "公務員", bg: "定年後の準備", reason: "将来への安心感" },
];

const SAMPLE_DESCRIPTION = "このウェビナーでは、副業で月収100万円を達成するための具体的なロードマップを解説します。実績者のインタビューを交えながら、初心者でも実践できるステップバイステップの手法をお伝えします。";

const SAMPLE_BEST_CONTENTS = [
  "将来の不安を具体的に数字で示した",
  "成功者との比較トーク",
  "返金保証の説明",
  "「今始めないと損」の緊急性トーク",
  "受講後の生活イメージを描写",
];

const SAMPLE_WORST_CONTENTS = [
  "商品スペックの羅列",
  "抽象的なメリット説明",
  "競合との比較なし",
  "一方的な実績自慢",
  "質問を挟まない長尺トーク",
];

export default function WebinarDetail({ projectName, projectColor, items }: Props) {
  const [category, setCategory] = useState<string | null>(null);
  const [detail, setDetail] = useState<string | null>(null);
  const [subView, setSubView] = useState<"" | "pending" | "deposit">("");

  const allItems = items.length > 0 ? items : SAMPLE_ITEMS;
  const isSample = items.length === 0;
  const filtered = category ? allItems.filter(i => i.target_category === category) : allItems;
  const detailItem = detail ? allItems.find(i => i.id === detail) : null;

  return (
    <div>
      {/* Category toggle */}
      <div className="flex gap-2 mb-5 flex-wrap">
        {CATEGORIES.map(c => {
          const cnt = c.key ? allItems.filter(i => i.target_category === c.key).length : allItems.length;
          return (
            <button key={c.key ?? "all-btn"} onClick={() => { setCategory(c.key); setDetail(null); setSubView(""); }}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                category === c.key ? "bg-[#4f8ff7]/20 text-[#4f8ff7] border border-[#4f8ff7]/40" : "bg-[#1e2235] text-[#6b7194] border border-[#2a2f45]"
              }`}>
              {c.label}({cnt}件)
            </button>
          );
        })}
      </div>

      {isSample && <p className="text-xs text-[#6b7194] mb-4">*サンプルデータです</p>}

      {/* ====== Detail view ====== */}
      {detailItem ? (
        <div className="space-y-5">
          <button onClick={() => { setDetail(null); setSubView(""); }} className="text-sm text-[#4f8ff7] hover:underline">← 一覧に戻る</button>
          <h4 className="text-xl font-bold text-white">{detailItem.title}</h4>

          {/* 今回のウェビナー方向性セクション */}
          <div className="bg-[#1e2235] rounded-2xl border border-[#2a2f45] p-5">
            <h5 className="text-sm font-bold text-white mb-3">今回のウェビナー方向性</h5>
            <p className="text-sm text-[#9aa0b8] leading-relaxed">{SAMPLE_DESCRIPTION}</p>
            <p className="text-xs text-[#6b7194] mt-3">*サンプルデータです</p>
          </div>

          {/* 配信文セクション */}
          <div className="bg-[#1e2235] rounded-2xl border border-[#2a2f45] p-5">
            <div className="flex items-center justify-between">
              <h5 className="text-sm font-bold text-white">配信文</h5>
              <Link href="/dashboard/delivery-text"
                className="text-xs text-[#4f8ff7] bg-[#4f8ff7]/10 px-3 py-1.5 rounded-lg border border-[#4f8ff7]/30 hover:bg-[#4f8ff7]/20 transition">
                配信文を見る →
              </Link>
            </div>
          </div>

          {/* LIVE台本・スライド */}
          <div className="bg-[#1e2235] rounded-2xl border border-[#2a2f45] p-5">
            <h5 className="text-sm font-bold text-white mb-4">LIVE台本・スライド</h5>
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <span className="text-sm text-[#9aa0b8] w-24 shrink-0">LIVE台本</span>
                <input
                  type="text"
                  defaultValue=""
                  className="flex-1 rounded-lg bg-[#13162a] border border-[#2a2f45]/50 text-xs text-[#9aa0b8] px-3 py-2 focus:outline-none focus:border-[#4f8ff7]/50"
                  placeholder="台本URLを入力..."
                />
                <a href="#" className="text-xs text-[#4f8ff7] bg-[#4f8ff7]/10 px-3 py-2 rounded-lg border border-[#4f8ff7]/30 hover:bg-[#4f8ff7]/20 transition whitespace-nowrap">
                  開く →
                </a>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm text-[#9aa0b8] w-24 shrink-0">スライド</span>
                <input
                  type="text"
                  defaultValue=""
                  className="flex-1 rounded-lg bg-[#13162a] border border-[#2a2f45]/50 text-xs text-[#9aa0b8] px-3 py-2 focus:outline-none focus:border-[#4f8ff7]/50"
                  placeholder="スライドURLを入力..."
                />
                <a href="#" className="text-xs text-[#4f8ff7] bg-[#4f8ff7]/10 px-3 py-2 rounded-lg border border-[#4f8ff7]/30 hover:bg-[#4f8ff7]/20 transition whitespace-nowrap">
                  開く →
                </a>
              </div>
            </div>
          </div>

          {/* Main KPI row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-xl p-4 bg-gradient-to-br from-blue-500/20 to-transparent border border-blue-500/20">
              <p className="text-xs text-blue-300/80 mb-1 font-medium">配信人数</p>
              <p className="text-2xl font-bold text-blue-300">{detailItem.registrant_count.toLocaleString()}</p>
            </div>
            <div className="rounded-xl p-4 bg-gradient-to-br from-cyan-500/20 to-transparent border border-cyan-500/20">
              <p className="text-xs text-cyan-300/80 mb-1 font-medium">参加者数</p>
              <p className="text-2xl font-bold text-cyan-300">{detailItem.live_viewer_count.toLocaleString()}</p>
            </div>
            <div className="rounded-xl p-4 bg-gradient-to-br from-purple-500/20 to-transparent border border-purple-500/20">
              <p className="text-xs text-purple-300/80 mb-1 font-medium">KW送信数</p>
              <p className="text-2xl font-bold text-purple-300">{detailItem.kw_sender_count.toLocaleString()}</p>
            </div>
            <div className="rounded-xl p-4 bg-gradient-to-br from-emerald-500/20 to-transparent border border-emerald-500/20">
              <p className="text-xs text-emerald-300/80 mb-1 font-medium">面談実施数</p>
              <p className="text-2xl font-bold text-emerald-300">{detailItem.appointment_count.toLocaleString()}</p>
            </div>
          </div>

          {/* Sales KPI row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-xl p-4 bg-gradient-to-br from-orange-500/20 to-transparent border border-orange-500/20">
              <p className="text-xs text-orange-300/80 mb-1 font-medium">成約件数</p>
              <p className="text-2xl font-bold text-orange-300">{detailItem.close_count}件</p>
            </div>
            <div className="rounded-xl p-4 bg-gradient-to-br from-yellow-500/20 to-transparent border border-yellow-500/20">
              <p className="text-xs text-yellow-300/80 mb-1 font-medium">単価</p>
              <p className="text-2xl font-bold text-yellow-300">{formatYen(detailItem.close_unit_price)}</p>
            </div>
            <div className="rounded-xl p-4 border border-[#2a2f45]/50" style={{ background: `linear-gradient(135deg, ${projectColor}20, transparent)`, borderColor: `${projectColor}40` }}>
              <p className="text-xs text-[#9aa0b8] mb-1 font-medium">成約金額</p>
              <p className="text-2xl font-bold" style={{ color: projectColor }}>{formatYen(detailItem.revenue)}</p>
            </div>
            <div className="rounded-xl p-4 bg-gradient-to-br from-emerald-500/20 to-transparent border border-emerald-500/20">
              <p className="text-xs text-emerald-300/80 mb-1 font-medium">着金額</p>
              <p className="text-2xl font-bold text-emerald-300">{formatYen(detailItem.deposit_amount)}</p>
            </div>
          </div>

          {/* Additional KPI row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-xl p-4 bg-[#1e2235] border border-[#2a2f45]/50">
              <p className="text-xs text-[#9aa0b8] mb-1 font-medium">配信対象</p>
              <p className="text-lg font-bold text-white">{detailItem.target_category === "purchased" ? "購入者" : detailItem.target_category === "unpurchased" ? "未購入者" : "全ブッパ"}</p>
            </div>
            <div className="rounded-xl p-4 bg-[#1e2235] border border-[#2a2f45]/50">
              <p className="text-xs text-[#9aa0b8] mb-1 font-medium">音声登録数</p>
              <p className="text-lg font-bold text-white">{detailItem.kw_sender_count.toLocaleString()}</p>
            </div>
            <div className="rounded-xl p-4 bg-gradient-to-br from-red-500/10 to-transparent border border-red-500/20">
              <p className="text-xs text-red-300/80 mb-1 font-medium">保留件数</p>
              <p className="text-2xl font-bold text-red-300">0</p>
            </div>
            <div className="rounded-xl p-4 bg-gradient-to-br from-amber-500/10 to-transparent border border-amber-500/20">
              <p className="text-xs text-amber-300/80 mb-1 font-medium">デポ件数</p>
              <p className="text-2xl font-bold text-amber-300">0</p>
            </div>
          </div>

          {/* URLs */}
          <div className="flex gap-3">
            {detailItem.script_url && <a href={detailItem.script_url} target="_blank" rel="noreferrer" className="text-sm text-[#4f8ff7] bg-[#4f8ff7]/10 px-4 py-2 rounded-lg border border-[#4f8ff7]/30">📄 台本</a>}
            {detailItem.transcript_url && <a href={detailItem.transcript_url} target="_blank" rel="noreferrer" className="text-sm text-[#4f8ff7] bg-[#4f8ff7]/10 px-4 py-2 rounded-lg border border-[#4f8ff7]/30">📝 文字起こし</a>}
          </div>

          {/* 刺さったコンテンツ */}
          <div className="bg-[#1e2235] rounded-2xl border border-[#2a2f45] p-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <h5 className="text-sm font-bold text-emerald-400 mb-3">刺さったセールストーク ベスト5</h5>
                <div className="space-y-2">
                  {SAMPLE_BEST_CONTENTS.map((c, i) => (
                    <div key={i} className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-emerald-500/5 border border-emerald-500/10">
                      <span className="text-sm font-bold text-emerald-400 w-6">{i + 1}.</span>
                      <span className="text-sm text-white">{c}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <h5 className="text-sm font-bold text-red-400 mb-3">刺さらなかったセールストーク ワースト5</h5>
                <div className="space-y-2">
                  {SAMPLE_WORST_CONTENTS.map((c, i) => (
                    <div key={i} className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-red-500/5 border border-red-500/10">
                      <span className="text-sm font-bold text-red-400 w-6">{i + 1}.</span>
                      <span className="text-sm text-white">{c}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <p className="text-xs text-[#6b7194] mt-3">*サンプルデータです</p>
          </div>

          {/* Customer attributes */}
          <div className="bg-[#1e2235] rounded-2xl border border-[#2a2f45] p-5">
            <h4 className="text-sm font-bold text-white mb-4">顧客属性 TOP5(成約者)</h4>
            <div className="space-y-2 mb-5">
              {DEMO_CUSTOMERS.map((c, i) => (
                <div key={i} className="px-4 py-3 rounded-xl bg-[#13162a] border border-[#2a2f45]/30">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-bold text-white w-6">{i + 1}.</span>
                    <span className="text-sm text-[#9aa0b8] w-12">{c.age}</span>
                    <span className="text-sm text-[#9aa0b8] w-10">{c.gender}</span>
                    <span className="text-sm text-white font-medium flex-1">{c.job}</span>
                    <span className="text-xs text-[#6b7194]">{c.bg}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-2 ml-9">
                    <span className="text-xs text-[#fbbf24]">💡 決め手:</span>
                    <span className="text-xs text-white font-medium px-2 py-0.5 rounded-full bg-[#fbbf24]/10 border border-[#fbbf24]/20">{c.reason}</span>
                  </div>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              <div>
                <p className="text-xs text-[#6b7194] mb-2 font-semibold">男女比</p>
                <div className="flex rounded-full overflow-hidden h-6">
                  <div className="bg-blue-500 flex items-center justify-center text-xs text-white font-bold" style={{ width: "60%" }}>男 60%</div>
                  <div className="bg-pink-500 flex items-center justify-center text-xs text-white font-bold" style={{ width: "40%" }}>女 40%</div>
                </div>
              </div>
              <div>
                <p className="text-xs text-[#6b7194] mb-2 font-semibold">年代分布</p>
                {[{ label: "20代", pct: 10 }, { label: "30代", pct: 25 }, { label: "40代", pct: 40 }, { label: "50代", pct: 20 }, { label: "60代", pct: 5 }].map(a => (
                  <div key={a.label} className="flex items-center gap-2 mb-1.5">
                    <span className="text-xs text-[#6b7194] w-10">{a.label}</span>
                    <div className="flex-1 bg-[#0f1117] rounded-full h-3"><div className="h-3 rounded-full bg-[#4f8ff7]" style={{ width: `${a.pct}%` }} /></div>
                    <span className="text-xs text-[#9aa0b8] w-10 text-right">{a.pct}%</span>
                  </div>
                ))}
              </div>
              <div>
                <p className="text-xs text-[#6b7194] mb-2 font-semibold">職業分布</p>
                {[{ label: "会社員", pct: 35 }, { label: "自営業", pct: 25 }, { label: "主婦", pct: 20 }, { label: "フリー", pct: 15 }, { label: "その他", pct: 5 }].map(j => (
                  <div key={j.label} className="flex items-center gap-2 mb-1.5">
                    <span className="text-xs text-[#6b7194] w-14">{j.label}</span>
                    <div className="flex-1 bg-[#0f1117] rounded-full h-3"><div className="h-3 rounded-full bg-[#34d399]" style={{ width: `${j.pct}%` }} /></div>
                    <span className="text-xs text-[#9aa0b8] w-10 text-right">{j.pct}%</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* 保留追跡・着金追跡ボタン */}
          <div className="flex gap-2">
            <button onClick={() => setSubView(subView === "pending" ? "" : "pending")}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                subView === "pending" ? "bg-[#4f8ff7] text-white" : "bg-[#1e2235] border border-[#2a2f45] text-[#9aa0b8] hover:border-[#4f8ff7]"
              }`}>保留追跡</button>
            <button onClick={() => setSubView(subView === "deposit" ? "" : "deposit")}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                subView === "deposit" ? "bg-[#4f8ff7] text-white" : "bg-[#1e2235] border border-[#2a2f45] text-[#9aa0b8] hover:border-[#4f8ff7]"
              }`}>着金追跡</button>
          </div>

          {/* 保留追跡カード */}
          {subView === "pending" && (
            <div className="rounded-2xl border-2 border-[#2a2f45] bg-[#13162a] p-5">
              <div className="flex items-center justify-between mb-4">
                <p className="text-lg font-bold text-white">(サンプル)山田太郎</p>
                <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-yellow-500/10 text-yellow-400 border border-yellow-500/20">保留中</span>
              </div>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div className="rounded-xl p-3 bg-gradient-to-br from-blue-500/20 to-transparent border border-blue-500/20">
                  <p className="text-xs text-blue-300/80 mb-1 font-medium">経過日数</p>
                  <p className="text-xl font-bold text-emerald-300">0日</p>
                </div>
                <div className="rounded-xl p-3 bg-gradient-to-br from-cyan-500/20 to-transparent border border-cyan-500/20">
                  <p className="text-xs text-cyan-300/80 mb-1 font-medium">担当</p>
                  <p className="text-xl font-bold text-cyan-300">西垣</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-[#1e2235]/80 rounded-xl p-3 border border-[#2a2f45]/50">
                  <p className="text-xs text-[#9aa0b8] mb-1 font-medium">面談日</p>
                  <p className="text-sm font-bold text-white">-</p>
                </div>
                <div className="bg-[#1e2235]/80 rounded-xl p-3 border border-[#2a2f45]/50">
                  <p className="text-xs text-[#9aa0b8] mb-1 font-medium">再架電予定</p>
                  <p className="text-sm font-bold text-white">-</p>
                </div>
                <div className="bg-[#1e2235]/80 rounded-xl p-3 border border-[#2a2f45]/50">
                  <p className="text-xs text-[#9aa0b8] mb-1 font-medium">最終連絡</p>
                  <p className="text-sm font-bold text-white">-</p>
                </div>
                <div className="bg-[#1e2235]/80 rounded-xl p-3 border border-[#2a2f45]/50">
                  <p className="text-xs text-[#9aa0b8] mb-1 font-medium">ステータス</p>
                  <p className="text-sm font-bold text-white">継続保留</p>
                </div>
              </div>
              <p className="mt-3 text-xs text-[#6b7194]">*サンプルデータです</p>
            </div>
          )}

          {/* 着金追跡カード */}
          {subView === "deposit" && (
            <div className="rounded-2xl border-2 border-[#2a2f45] bg-[#13162a] p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-lg font-bold text-white">(サンプル)佐藤花子</p>
                  <p className="text-sm text-[#9aa0b8]">担当: ケーマ</p>
                </div>
                <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20">入金待ち</span>
              </div>
              <div className="rounded-xl p-4 bg-gradient-to-br from-blue-500/20 to-transparent border border-blue-500/20 mb-3">
                <p className="text-xs text-blue-300/80 mb-1 font-medium">成約金額</p>
                <p className="text-2xl font-bold text-blue-300">{formatYen(0)}</p>
              </div>
              <div className="mb-3">
                <div className="flex justify-between text-xs text-[#6b7194] mb-1"><span>入金進捗</span><span className="text-white font-medium">0%</span></div>
                <div className="w-full bg-[#0f1117] rounded-full h-2.5"><div className="h-2.5 rounded-full bg-gradient-to-r from-emerald-500 to-blue-500" style={{ width: "0%" }} /></div>
                <div className="flex justify-between text-xs mt-1"><span className="text-emerald-400">入金済 {formatYen(0)}</span><span className="text-red-400">残 {formatYen(0)}</span></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-[#1e2235]/80 rounded-xl p-3 border border-[#2a2f45]/50">
                  <p className="text-xs text-[#9aa0b8] mb-1 font-medium">成約日</p>
                  <p className="text-sm font-bold text-white">-</p>
                </div>
                <div className="bg-[#1e2235]/80 rounded-xl p-3 border border-[#2a2f45]/50">
                  <p className="text-xs text-[#9aa0b8] mb-1 font-medium">約束日</p>
                  <p className="text-sm font-bold text-white">-</p>
                </div>
              </div>
              <p className="mt-3 text-xs text-[#6b7194]">*サンプルデータです</p>
            </div>
          )}
        </div>
      ) : (
        /* ====== List view ====== */
        <div className="space-y-2">
          {filtered.length === 0 ? (
            <p className="text-sm text-[#6b7194] py-8 text-center">データなし</p>
          ) : filtered.map(item => (
            <button key={item.id} onClick={() => setDetail(item.id)}
              className="w-full flex items-center justify-between px-4 py-3.5 rounded-xl bg-[#1e2235] border border-[#2a2f45]/50 hover:border-[#4f8ff7]/40 transition text-left">
              <div>
                <p className="text-sm font-medium text-white">{item.title}</p>
                <p className="text-xs text-[#6b7194] mt-1">{item.date} | {item.target_category === "purchased" ? "購入者向け" : item.target_category === "unpurchased" ? "未購入者向け" : "全ブッパ"} | 参加{item.live_viewer_count}人</p>
              </div>
              <div className="text-right">
                <p className="text-sm text-emerald-400 font-bold">{item.close_count}件成約</p>
                <p className="text-sm" style={{ color: projectColor }}>{formatYen(item.revenue)}</p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

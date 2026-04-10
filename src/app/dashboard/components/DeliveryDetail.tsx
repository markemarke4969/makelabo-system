"use client";

import { useState } from "react";

interface DeliveryItem {
  id: string; date: string; title: string; channel: string;
  delivery_platform: string; genre: string; target_segment: string;
  send_count: number; open_rate: number; click_rate: number; body: string;
}

interface KillerWord {
  id: string; word: string; context: string; genre: string;
  effectiveness_score: number;
}

interface Props {
  projectName: string; projectColor: string;
  items: DeliveryItem[];
  killerWords: KillerWord[];
  top5: { title: string; click_rate: number }[];
  worst5: { title: string; click_rate: number }[];
}

const GENRES = ["全て", "週報", "動画誘導", "LIVE告知", "ウェビナー告知", "その他"];

const TREND_GENRES = ["物販", "副業", "FX", "競馬/ギャンブル", "金融", "政治"];
const TREND_DATA: Record<string, { words: string[]; newsUrl: string }> = {
  "物販": { words: ["Amazon規約変更", "越境EC", "無在庫転売", "中国輸入2026"], newsUrl: "https://example.com/news/bussan" },
  "副業": { words: ["副業解禁", "リモートワーク", "スキマ時間", "月5万円"], newsUrl: "https://example.com/news/fukugyo" },
  "FX": { words: ["ドル円急変", "利上げ観測", "自動売買", "スキャルピング"], newsUrl: "https://example.com/news/fx" },
  "競馬/ギャンブル": { words: ["AI予想", "回収率", "地方競馬", "重賞データ"], newsUrl: "https://example.com/news/keiba" },
  "金融": { words: ["新NISA", "仮想通貨ETF", "金利政策", "インフレ対策"], newsUrl: "https://example.com/news/kinyu" },
  "政治": { words: ["経済対策", "減税法案", "規制緩和", "選挙動向"], newsUrl: "https://example.com/news/seiji" },
};

const SAMPLE_VIDEOS = [
  { title: "(サンプル)副業月収100万ロードマップ動画", opt: 0, close: 0, unitPrice: 0, reason: "高成約率 - 具体的なステップで信頼性UP" },
  { title: "(サンプル)AI自動化で月30万稼ぐ方法", opt: 0, close: 0, unitPrice: 0, reason: "高クリック率 - トレンドワード活用" },
  { title: "(サンプル)成功者インタビュー実績動画", opt: 0, close: 0, unitPrice: 0, reason: "高単価 - 権威性で高額成約につながりやすい" },
];

function pct(n: number) { return `${(n || 0).toFixed(1)}%`; }
function formatYen(n: number) { return "\u00A5" + Math.round(n || 0).toLocaleString(); }

const DEMO_CUSTOMERS = [
  { name: "T.S", age: "40代", gender: "男性", job: "会社員", bg: "副業に興味あり" },
  { name: "M.K", age: "30代", gender: "女性", job: "主婦", bg: "在宅ワーク希望" },
  { name: "Y.H", age: "50代", gender: "男性", job: "自営業", bg: "新規事業模索中" },
];

export default function DeliveryDetail({ projectName, projectColor, items, killerWords, top5, worst5 }: Props) {
  const [genre, setGenre] = useState("全て");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [trendGenre, setTrendGenre] = useState("物販");
  const [videoDetail, setVideoDetail] = useState<number | null>(null);

  const filtered = genre === "全て" ? items : items.filter(i => i.genre === genre);
  const filteredKw = genre === "全て" ? killerWords : killerWords.filter(k => k.genre === genre);
  const showVideos = genre === "全て" || genre === "動画誘導";

  const trend = TREND_DATA[trendGenre] ?? { words: [], newsUrl: "" };

  return (
    <div className="space-y-5">
      {/* Genre filter */}
      <div className="flex gap-2 flex-wrap">
        {GENRES.map(g => (
          <button key={g} onClick={() => setGenre(g)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
              genre === g ? "bg-[#4f8ff7] text-white" : "bg-[#1e2235] text-[#9aa0b8] border border-[#2a2f45]"
            }`}>{g}</button>
        ))}
      </div>

      {/* Trend Keywords */}
      <div className="bg-[#1e2235] rounded-2xl border border-[#6366f1]/20 p-5">
        <h3 className="text-sm font-bold text-[#6366f1] mb-4">📈 トレンドキーワード</h3>
        <div className="flex gap-2 flex-wrap mb-4">
          {TREND_GENRES.map(g => (
            <button key={g} onClick={() => setTrendGenre(g)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                trendGenre === g ? "bg-[#6366f1]/20 text-[#6366f1] border border-[#6366f1]/40" : "bg-[#13162a] text-[#6b7194] border border-[#2a2f45]"
              }`}>{g}</button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2 mb-3">
          {trend.words.map((w, i) => (
            <span key={i} className="px-3 py-1.5 rounded-full bg-[#6366f1]/10 text-[#a5b4fc] text-sm border border-[#6366f1]/20">{w}</span>
          ))}
        </div>
        <a href={trend.newsUrl} target="_blank" rel="noreferrer" className="text-xs text-[#4f8ff7] hover:underline">関連ニュースを見る →</a>
        <p className="text-xs text-[#6b7194] mt-1">*サンプルデータです</p>
      </div>

      {/* Recommended Videos TOP3 */}
      {showVideos && videoDetail === null && (
        <div className="bg-[#1e2235] rounded-2xl border border-[#8b5cf6]/20 p-5">
          <h3 className="text-sm font-bold text-[#8b5cf6] mb-4">🎬 次の配信おすすめ動画 TOP3</h3>
          <p className="text-xs text-[#6b7194] mb-3">配信から1週間以上経過した動画から、オプト獲得数・成約数・成約単価が高い順にピックアップ</p>
          <div className="space-y-3">
            {SAMPLE_VIDEOS.map((vid, i) => (
              <button key={i} onClick={() => setVideoDetail(i)}
                className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-[#13162a] border border-[#2a2f45]/30 hover:border-[#8b5cf6]/40 transition text-left">
                <div className="flex items-center gap-3">
                  <span className="text-base font-bold text-[#8b5cf6] w-6">{i + 1}.</span>
                  <div>
                    <p className="text-sm font-medium text-white">{vid.title}</p>
                    <p className="text-xs text-[#6b7194] mt-0.5">成約理由: {vid.reason}</p>
                  </div>
                </div>
                <div className="flex gap-5 text-xs text-[#9aa0b8]">
                  <span>オプト <strong className="text-white">{vid.opt}</strong></span>
                  <span>成約 <strong className="text-emerald-400">{vid.close}</strong></span>
                  <span>単価 <strong className="text-[#fbbf24]">{formatYen(vid.unitPrice)}</strong></span>
                </div>
              </button>
            ))}
          </div>
          <p className="text-xs text-[#6b7194] mt-3">*サンプルデータです</p>
        </div>
      )}

      {/* Video Detail Page */}
      {showVideos && videoDetail !== null && (
        <div className="bg-[#1e2235] rounded-2xl border border-[#8b5cf6]/20 p-5 space-y-4">
          <button onClick={() => setVideoDetail(null)} className="text-sm text-[#4f8ff7] hover:underline">← おすすめ動画一覧に戻る</button>
          <h3 className="text-lg font-bold text-white">{SAMPLE_VIDEOS[videoDetail].title}</h3>

          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-xl p-4 bg-gradient-to-br from-blue-500/20 to-transparent border border-blue-500/20">
              <p className="text-xs text-blue-300/80 mb-1 font-medium">オプト数</p>
              <p className="text-2xl font-bold text-blue-300">{SAMPLE_VIDEOS[videoDetail].opt}</p>
            </div>
            <div className="rounded-xl p-4 bg-gradient-to-br from-emerald-500/20 to-transparent border border-emerald-500/20">
              <p className="text-xs text-emerald-300/80 mb-1 font-medium">成約件数</p>
              <p className="text-2xl font-bold text-emerald-300">{SAMPLE_VIDEOS[videoDetail].close}件</p>
            </div>
            <div className="rounded-xl p-4 bg-gradient-to-br from-yellow-500/20 to-transparent border border-yellow-500/20">
              <p className="text-xs text-yellow-300/80 mb-1 font-medium">単価</p>
              <p className="text-2xl font-bold text-yellow-300">{formatYen(SAMPLE_VIDEOS[videoDetail].unitPrice)}</p>
            </div>
          </div>

          {/* 成約理由 */}
          <div className="bg-[#13162a] rounded-xl border border-[#8b5cf6]/20 p-4">
            <p className="text-sm font-semibold text-[#8b5cf6] mb-2">成約につながった理由(営業日報より)</p>
            <p className="text-sm text-[#9aa0b8]">{SAMPLE_VIDEOS[videoDetail].reason}</p>
            <p className="text-xs text-[#6b7194] mt-1">*サンプルデータです</p>
          </div>

          {/* 成約者属性 */}
          <div className="bg-[#13162a] rounded-xl border border-[#2a2f45] p-4">
            <h4 className="text-sm font-bold text-white mb-3">成約者属性</h4>
            <div className="space-y-2 mb-4">
              {DEMO_CUSTOMERS.map((c, i) => (
                <div key={i} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-[#1e2235]/60 border border-[#2a2f45]/30">
                  <span className="text-sm text-[#9aa0b8] w-10">{c.age}</span>
                  <span className="text-sm text-[#9aa0b8] w-8">{c.gender}</span>
                  <span className="text-sm text-white font-medium flex-1">{c.job}</span>
                  <span className="text-xs text-[#6b7194]">{c.bg}</span>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-[#6b7194] mb-2 font-semibold">男女比</p>
                <div className="flex rounded-full overflow-hidden h-5">
                  <div className="bg-blue-500 flex items-center justify-center text-xs text-white font-bold" style={{ width: "60%" }}>男 60%</div>
                  <div className="bg-pink-500 flex items-center justify-center text-xs text-white font-bold" style={{ width: "40%" }}>女 40%</div>
                </div>
              </div>
              <div>
                <p className="text-xs text-[#6b7194] mb-2 font-semibold">年代分布</p>
                {[{ label: "30代", pct: 30 }, { label: "40代", pct: 45 }, { label: "50代", pct: 25 }].map(a => (
                  <div key={a.label} className="flex items-center gap-2 mb-1">
                    <span className="text-xs text-[#6b7194] w-10">{a.label}</span>
                    <div className="flex-1 bg-[#0f1117] rounded-full h-2.5"><div className="h-2.5 rounded-full bg-[#4f8ff7]" style={{ width: `${a.pct}%` }} /></div>
                    <span className="text-xs text-[#9aa0b8] w-10 text-right">{a.pct}%</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <p className="text-xs text-[#6b7194]">*全てサンプルデータです</p>
        </div>
      )}

      {/* Rankings */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-[#1e2235] rounded-2xl border border-emerald-500/20 p-5">
          <h3 className="text-sm font-bold text-emerald-400 mb-3">🏆 クリック率 TOP 5</h3>
          {top5.length === 0 ? <p className="text-sm text-[#6b7194]">データなし</p> : top5.map((r, i) => (
            <div key={i} className="flex justify-between text-sm py-2 border-b border-[#2a2f45]/30 last:border-0">
              <span className="text-[#9aa0b8]">{i + 1}. {r.title || "(無題)"}</span>
              <span className="text-emerald-400 font-bold tabular-nums">{pct(r.click_rate)}</span>
            </div>
          ))}
        </div>
        <div className="bg-[#1e2235] rounded-2xl border border-red-500/20 p-5">
          <h3 className="text-sm font-bold text-red-400 mb-3">💀 クリック率 WORST 5</h3>
          {worst5.length === 0 ? <p className="text-sm text-[#6b7194]">データなし</p> : worst5.map((r, i) => (
            <div key={i} className="flex justify-between text-sm py-2 border-b border-[#2a2f45]/30 last:border-0">
              <span className="text-[#9aa0b8]">{i + 1}. {r.title || "(無題)"}</span>
              <span className="text-red-400 font-bold tabular-nums">{pct(r.click_rate)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Delivery list */}
      <div className="bg-[#1e2235] rounded-2xl border border-[#2a2f45] overflow-hidden">
        <div className="px-5 py-3 border-b border-[#2a2f45]"><h3 className="text-sm font-bold text-white">直近の配信一覧({filtered.length}件)</h3></div>
        {filtered.length === 0 ? (
          <div className="px-5 py-8 text-center text-[#6b7194] text-sm">データなし</div>
        ) : (
          <div className="divide-y divide-[#2a2f45]/50">
            {filtered.map(item => (
              <div key={item.id}>
                <button onClick={() => setExpanded(expanded === item.id ? null : item.id)}
                  className="w-full text-left px-5 py-3.5 hover:bg-white/[0.02] transition">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      {item.genre && <span className="px-2 py-0.5 rounded-full bg-[#4f8ff7]/10 text-[#4f8ff7] text-xs">{item.genre}</span>}
                      <span className="text-sm font-medium text-white">{item.title || "(無題)"}</span>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-xs text-[#6b7194]">{item.date}</span>
                      <span className="text-xs text-[#9aa0b8]">開封{pct(item.open_rate)}</span>
                      <span className={`text-sm font-bold ${item.click_rate >= 5 ? "text-emerald-400" : item.click_rate >= 2 ? "text-yellow-400" : "text-red-400"}`}>
                        {pct(item.click_rate)}
                      </span>
                    </div>
                  </div>
                </button>
                {expanded === item.id && (
                  <div className="px-5 pb-4">
                    <div className="grid grid-cols-3 gap-3 p-4 bg-[#13162a] rounded-xl">
                      <div className="text-center"><p className="text-xs text-[#6b7194]">配信対象</p><p className="text-sm text-white font-medium">{item.target_segment || "-"}</p></div>
                      <div className="text-center"><p className="text-xs text-[#6b7194]">配信数</p><p className="text-sm text-white font-medium">{item.send_count.toLocaleString()}</p></div>
                      <div className="text-center"><p className="text-xs text-[#6b7194]">プラットフォーム</p><p className="text-sm text-white font-medium">{item.delivery_platform || "UTAGE"}</p></div>
                    </div>
                    {item.body && <p className="mt-3 text-xs text-[#9aa0b8] bg-[#13162a] rounded-xl p-3 max-h-24 overflow-y-auto">{item.body.slice(0, 300)}{item.body.length > 300 ? "..." : ""}</p>}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Auto-extracted Killer Words */}
      <div className="bg-[#1e2235] rounded-2xl border border-[#fbbf24]/20 p-5">
        <h3 className="text-sm font-bold text-[#fbbf24] mb-4">🔥 自動抽出キラーワード</h3>
        {filteredKw.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {filteredKw.map(w => (
              <span key={w.id} className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#13162a] border border-[#fbbf24]/20 text-sm">
                <span className="text-white font-medium">&ldquo;{w.word}&rdquo;</span>
                {w.genre && <span className="px-2 py-0.5 rounded-full bg-[#fbbf24]/10 text-[#fbbf24] text-xs">{w.genre}</span>}
                <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-400">★{w.effectiveness_score}</span>
              </span>
            ))}
          </div>
        ) : (
          <p className="text-sm text-[#6b7194]">抽出されたキラーワードなし</p>
        )}
      </div>
    </div>
  );
}

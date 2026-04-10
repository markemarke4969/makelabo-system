"use client";

import { useState } from "react";
import {
  WBS_ALL_TASKS, WBS_PROJECTS, WBS_PROJECT_COLORS, WBS_LAUNCH_DATES,
  PHASE_TABS, recalcTaskDates,
  type WbsTask, type WbsProject, type PhaseTab,
} from "@/lib/wbs-data";
import HolderTab from "./wbs/HolderTab";
import ProductTab from "./wbs/ProductTab";
import MtgTab from "./wbs/MtgTab";
import ConceptTab from "./wbs/ConceptTab";

type DetailTab = "wbs" | "holder" | "product" | "mtg" | "concept";
const DETAIL_TABS: { key: DetailTab; label: string; icon: string }[] = [
  { key: "wbs", label: "WBSタスク", icon: "📋" },
  { key: "holder", label: "ホルダー情報", icon: "👤" },
  { key: "product", label: "商品設計", icon: "📦" },
  { key: "mtg", label: "MTG議事録", icon: "📝" },
  { key: "concept", label: "コンセプト", icon: "💡" },
];

// ============================================================
// 日付ヘルパー
// ============================================================
const TODAY = new Date().toISOString().slice(0, 10);
const NOW_MS = Date.now();

function daysLeft(due: string): number | null {
  if (!due) return null;
  return Math.ceil((new Date(due).getTime() - NOW_MS) / 86400000);
}
function isOverdue(t: WbsTask): boolean {
  return !t.done && !!t.dueDate && t.dueDate < TODAY;
}
function isNearDue(t: WbsTask): boolean {
  const d = daysLeft(t.dueDate);
  return !t.done && d !== null && d >= 0 && d <= 7;
}
function detectCurrentPhase(tasks: WbsTask[]): PhaseTab {
  for (const tab of PHASE_TABS) {
    if (tasks.filter(t => t.phaseTab === tab).some(t => !t.done)) return tab;
  }
  return PHASE_TABS[PHASE_TABS.length - 1];
}
function sortByDueDate(tasks: WbsTask[]): WbsTask[] {
  return [...tasks].sort((a, b) => {
    if (!a.dueDate && !b.dueDate) return 0;
    if (!a.dueDate) return 1;
    if (!b.dueDate) return -1;
    return a.dueDate.localeCompare(b.dueDate);
  });
}
function fmtDate(d: string): string {
  if (!d) return "";
  const [, m, day] = d.split("-");
  return `${parseInt(m)}/${parseInt(day)}`;
}
function estimateDelay(tasks: WbsTask[]): number {
  let max = 0;
  for (const t of tasks) {
    if (isOverdue(t)) {
      const dl = daysLeft(t.dueDate);
      if (dl !== null && Math.abs(dl) > max) max = Math.abs(dl);
    }
  }
  return max;
}
function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

// ============================================================
// メインコンポーネント
// ============================================================
export default function WbsTab() {
  const [tasks, setTasks] = useState<WbsTask[]>(WBS_ALL_TASKS);
  const [selectedProject, setSelectedProject] = useState<WbsProject | null>(null);
  const [activePhase, setActivePhase] = useState<PhaseTab | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [detailTab, setDetailTab] = useState<DetailTab>("wbs");
  const [launchDates, setLaunchDates] = useState<Record<string, { fe: string; upsell: string }>>({
    ...WBS_LAUNCH_DATES,
  });

  function toggle(id: string) {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, done: !t.done } : t));
  }
  function updateMemo(id: string, memo: string) {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, memo } : t));
  }
  function selectProject(proj: WbsProject) {
    setSelectedProject(proj);
    setActivePhase(detectCurrentPhase(tasks.filter(t => t.project === proj)));
    setCategoryFilter("all");
    setDetailTab("wbs");
  }
  function addOneMonth(dateStr: string): string {
    const d = new Date(dateStr);
    d.setMonth(d.getMonth() + 1);
    return d.toISOString().slice(0, 10);
  }
  function updateLaunchDate(project: WbsProject, field: "fe" | "upsell", value: string) {
    let fe: string;
    let up: string;
    if (field === "fe") {
      fe = value;
      up = value ? addOneMonth(value) : "";
    } else {
      fe = launchDates[project].fe;
      up = value;
    }
    const newDates = { ...launchDates, [project]: { fe, upsell: up } };
    setLaunchDates(newDates);
    setTasks(prev => recalcTaskDates(prev, project, fe, up));
  }

  // ============================================================
  // トップページ
  // ============================================================
  if (!selectedProject) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {WBS_PROJECTS.map(proj => (
            <ProjectCard key={proj} project={proj} tasks={tasks} launchDates={launchDates[proj]} onOpen={() => selectProject(proj)} />
          ))}
        </div>
        <OverdueAlertList tasks={tasks} />
      </div>
    );
  }

  // ============================================================
  // 案件詳細ページ
  // ============================================================
  const proj = selectedProject;
  const projTasks = tasks.filter(t => t.project === proj);
  const phase = activePhase ?? detectCurrentPhase(projTasks);
  const filtered = sortByDueDate(
    projTasks.filter(t => t.phaseTab === phase && (categoryFilter === "all" || t.category === categoryFilter))
  );

  return (
    <div className="space-y-5">
      {/* 戻る + 案件切替 */}
      <div className="flex gap-2 flex-wrap items-center">
        <button onClick={() => setSelectedProject(null)}
          className="px-5 py-2.5 rounded-xl text-sm font-bold transition-colors border-2 border-[#2a2f45] text-[#9aa0b8] hover:border-[#4f8ff7] hover:text-[#4f8ff7]">
          ← 一覧
        </button>
        {WBS_PROJECTS.map(p => {
          const c = WBS_PROJECT_COLORS[p];
          const active = p === proj;
          return (
            <button key={p} onClick={() => selectProject(p)}
              className="px-5 py-2.5 rounded-xl text-sm font-bold transition-colors border-2"
              style={{ borderColor: active ? c : "#2a2f45", background: active ? c + "22" : "transparent", color: active ? c : "#6b7194" }}>
              {p}
            </button>
          );
        })}
      </div>

      {/* サマリーパネル */}
      <DetailSummary project={proj} tasks={projTasks} launchDates={launchDates[proj]} onLaunchChange={(f, v) => updateLaunchDate(proj, f, v)} />

      {/* サブタブナビ */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 border-b border-[#2a2f45] -mx-1 px-1">
        {DETAIL_TABS.map(tab => (
          <button key={tab.key} onClick={() => setDetailTab(tab.key)}
            className={`flex items-center gap-2 px-5 py-3 rounded-t-xl text-sm font-bold whitespace-nowrap transition-all ${
              detailTab === tab.key
                ? "bg-[#1e2235] text-white border-2 border-b-0 border-[#4f8ff7]/40"
                : "text-[#6b7194] hover:text-[#9aa0b8] hover:bg-[#1e2235]/50 border-2 border-transparent"
            }`}>
            <span>{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {/* サブタブ: ホルダー情報 */}
      {detailTab === "holder" && <HolderTab project={proj} />}
      {/* サブタブ: 商品設計 */}
      {detailTab === "product" && <ProductTab project={proj} />}
      {/* サブタブ: MTG議事録 */}
      {detailTab === "mtg" && <MtgTab project={proj} />}
      {/* サブタブ: コンセプト */}
      {detailTab === "concept" && <ConceptTab project={proj} />}

      {/* サブタブ: WBSタスク（既存） */}
      {detailTab !== "wbs" ? null : <>
      {/* フェーズタブ */}
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {PHASE_TABS.map(ph => {
          const phT = projTasks.filter(t => t.phaseTab === ph);
          const done = phT.filter(t => t.done).length;
          const od = phT.filter(isOverdue).length;
          return (
            <button key={ph} onClick={() => setActivePhase(ph)}
              className={`flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-bold whitespace-nowrap transition-all ${
                ph === phase
                  ? "bg-[#4f8ff7]/15 text-[#4f8ff7] border-2 border-[#4f8ff7]/40"
                  : "text-[#6b7194] hover:text-[#9aa0b8] hover:bg-[#1e2235] border-2 border-transparent"
              }`}>
              {ph}
              <span className="text-xs opacity-70">{done}/{phT.length}</span>
              {od > 0 && <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />}
            </button>
          );
        })}
      </div>

      {/* カテゴリフィルタ */}
      <div className="flex gap-2">
        {["all", "新規FE", "アップセル", "動画コンテンツ"].map(cat => (
          <button key={cat} onClick={() => setCategoryFilter(cat)}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-colors ${
              categoryFilter === cat
                ? "bg-[#4f8ff7]/15 text-[#4f8ff7] border border-[#4f8ff7]/30"
                : "text-[#6b7194] bg-[#1e2235] border border-[#2a2f45] hover:border-[#4f8ff7]/30"
            }`}>
            {cat === "all" ? "全て" : cat}
          </button>
        ))}
      </div>

      {/* タスクカード 2列グリッド */}
      {filtered.length === 0 ? (
        <p className="text-base text-[#6b7194] text-center py-12">このフェーズ・カテゴリにタスクはありません</p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {filtered.map(t => <TaskCard key={t.id} task={t} onToggle={toggle} onMemo={updateMemo} />)}
        </div>
      )}
      </>}
    </div>
  );
}

// ============================================================
// トップページ 案件カード
// ============================================================
function ProjectCard({ project, tasks, launchDates, onOpen }: { project: WbsProject; tasks: WbsTask[]; launchDates: { fe: string; upsell: string }; onOpen: () => void }) {
  const color = WBS_PROJECT_COLORS[project];
  const pt = tasks.filter(t => t.project === project);
  const total = pt.length;
  const doneCount = pt.filter(t => t.done).length;
  const rate = total > 0 ? Math.round((doneCount / total) * 100) : 0;
  const overdueList = pt.filter(isOverdue);
  const launch = launchDates;
  const delayDays = estimateDelay(pt);
  const delayWeeks = Math.ceil(delayDays / 7);

  const upcoming = pt.filter(t => !t.done && t.dueDate && t.dueDate >= TODAY).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const nextDue = upcoming[0];

  return (
    <button onClick={onOpen} className="text-left w-full rounded-2xl border-2 bg-[#13162a] p-6 hover:bg-[#1a1f3a] transition-all group" style={{ borderColor: color }}>
      {/* ヘッダー */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <span className="w-4 h-4 rounded-full" style={{ background: color }} />
          <p className="text-xl font-bold text-white">{project}</p>
        </div>
        <span className="text-sm text-[#6b7194] group-hover:text-[#4f8ff7] transition font-medium">詳細 →</span>
      </div>

      {/* 発射日（大きく） */}
      {!launch.fe && !launch.upsell ? (
        <div className="mb-4 px-4 py-4 rounded-xl bg-yellow-500/10 border-2 border-yellow-500/30 text-center">
          <p className="text-base font-bold text-yellow-400">発射日を入力してください</p>
          <p className="text-xs text-yellow-400/70 mt-1">案件を開いて発射日を設定すると、全タスクの期日が自動計算されます</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="bg-[#0f1117]/60 rounded-xl p-3 border border-[#4f8ff7]/20 text-center">
            <p className="text-xs text-[#6b7194] mb-1 font-medium">FE発射</p>
            <p className="text-2xl font-bold text-[#4f8ff7]">{launch.fe ? fmtDate(launch.fe) : "未設定"}</p>
          </div>
          <div className="bg-[#0f1117]/60 rounded-xl p-3 border border-[#a78bfa]/20 text-center">
            <p className="text-xs text-[#6b7194] mb-1 font-medium">UP発射</p>
            <p className="text-2xl font-bold text-[#a78bfa]">{launch.upsell ? fmtDate(launch.upsell) : "未設定"}</p>
          </div>
        </div>
      )}

      {/* 進捗バー（太く） */}
      <div className="mb-4">
        <div className="flex justify-between text-sm text-[#9aa0b8] mb-2">
          <span className="font-bold">進捗率</span>
          <span className="text-[#4f8ff7] font-bold text-lg">{rate}%</span>
        </div>
        <div className="w-full bg-[#0f1117] rounded-full h-3">
          <div className="h-3 rounded-full bg-gradient-to-r from-purple-500 to-blue-500 transition-all" style={{ width: `${Math.min(rate, 100)}%` }} />
        </div>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="bg-[#1e2235]/80 rounded-xl p-3 border border-[#2a2f45]/50 text-center">
          <p className="text-xs text-[#9aa0b8] mb-1 font-medium">総タスク</p>
          <p className="text-xl font-bold text-white">{total}</p>
        </div>
        <div className="bg-[#1e2235]/80 rounded-xl p-3 border border-emerald-500/20 text-center">
          <p className="text-xs text-[#9aa0b8] mb-1 font-medium">完了</p>
          <p className="text-xl font-bold text-emerald-400">{doneCount}</p>
        </div>
        <div className={`rounded-xl p-3 border text-center ${overdueList.length > 0 ? "bg-red-500/10 border-red-500/30" : "bg-[#1e2235]/80 border-[#2a2f45]/50"}`}>
          <p className="text-xs text-[#9aa0b8] mb-1 font-medium">期日超過</p>
          <p className={`text-xl font-bold ${overdueList.length > 0 ? "text-red-400" : "text-white"}`}>{overdueList.length}</p>
        </div>
      </div>

      {/* 遅延見込み */}
      {delayDays > 0 && (
        <div className="mb-4 px-4 py-3 rounded-xl bg-yellow-500/10 border border-yellow-500/30">
          <p className="text-base font-bold text-yellow-400">
            約{delayWeeks}週間（{delayDays}日）遅延見込み
          </p>
        </div>
      )}

      {/* 直近の納期 */}
      {nextDue && (
        <div className="px-4 py-3 rounded-xl bg-[#1e2235] border border-[#2a2f45]/50">
          <p className="text-xs text-[#6b7194] mb-1 font-medium">直近の納期</p>
          <p className="text-sm text-white font-bold">{nextDue.dueDate} — {nextDue.task}</p>
        </div>
      )}
    </button>
  );
}

// ============================================================
// 詳細ページ サマリーパネル
// ============================================================
function DetailSummary({ project, tasks, launchDates, onLaunchChange }: {
  project: WbsProject;
  tasks: WbsTask[];
  launchDates: { fe: string; upsell: string };
  onLaunchChange: (field: "fe" | "upsell", value: string) => void;
}) {
  const color = WBS_PROJECT_COLORS[project];
  const total = tasks.length;
  const doneCount = tasks.filter(t => t.done).length;
  const rate = total > 0 ? Math.round((doneCount / total) * 100) : 0;
  const overdueCount = tasks.filter(isOverdue).length;
  const nearDueCount = tasks.filter(isNearDue).length;
  const launch = launchDates;
  const delayDays = estimateDelay(tasks);
  const delayWeeks = Math.ceil(delayDays / 7);
  const estFe = launch.fe && delayDays > 0 ? addDays(launch.fe, delayDays) : launch.fe;
  const estUp = launch.upsell && delayDays > 0 ? addDays(launch.upsell, delayDays) : launch.upsell;
  const hasLaunch = launch.fe || launch.upsell;

  // マニュアル紐付けタスク
  const manualLinks = tasks.filter(t => t.isManualLink);

  return (
    <div className="rounded-2xl border-2 bg-gradient-to-br from-[#1a1f3a] to-[#0f1117] p-6" style={{ borderColor: color + "66" }}>
      {/* タイトル */}
      <div className="flex items-center gap-3 mb-5">
        <span className="w-4 h-4 rounded-full" style={{ background: color }} />
        <h2 className="text-xl font-bold text-white">{project}</h2>
      </div>

      {/* 発射日入力エリア */}
      <div className="grid grid-cols-2 gap-3 mb-5">
        <div className="bg-[#0f1117]/80 rounded-xl p-4 border border-[#4f8ff7]/25">
          <label className="block text-xs text-[#6b7194] mb-2 font-medium text-center">FE 発射予定日</label>
          <input
            type="date"
            value={launch.fe}
            onChange={e => onLaunchChange("fe", e.target.value)}
            className="w-full bg-[#13162a] border border-[#4f8ff7]/30 rounded-lg px-3 py-2.5 text-center text-lg font-bold text-[#4f8ff7] focus:border-[#4f8ff7] focus:outline-none focus:ring-1 focus:ring-[#4f8ff7]/50 [color-scheme:dark]"
          />
          {launch.fe && <p className="text-center text-2xl font-bold text-[#4f8ff7] mt-2">{fmtDate(launch.fe)}</p>}
        </div>
        <div className="bg-[#0f1117]/80 rounded-xl p-4 border border-[#a78bfa]/25">
          <label className="block text-xs text-[#6b7194] mb-2 font-medium text-center">UP 発射予定日</label>
          <input
            type="date"
            value={launch.upsell}
            onChange={e => onLaunchChange("upsell", e.target.value)}
            className="w-full bg-[#13162a] border border-[#a78bfa]/30 rounded-lg px-3 py-2.5 text-center text-lg font-bold text-[#a78bfa] focus:border-[#a78bfa] focus:outline-none focus:ring-1 focus:ring-[#a78bfa]/50 [color-scheme:dark]"
          />
          {launch.upsell && <p className="text-center text-2xl font-bold text-[#a78bfa] mt-2">{fmtDate(launch.upsell)}</p>}
        </div>
      </div>

      {/* 発射日未入力の警告 */}
      {!hasLaunch && (
        <div className="mb-5 px-5 py-4 rounded-xl bg-yellow-500/10 border-2 border-yellow-500/30 text-center">
          <p className="text-lg font-bold text-yellow-400">発射日を入力してください</p>
          <p className="text-sm text-yellow-400/70 mt-1">発射日を入力すると全タスクの期日が逆算で自動計算されます</p>
        </div>
      )}

      {/* 推定遅延・推定発射日 */}
      {hasLaunch && (
        <div className="grid grid-cols-2 gap-3 mb-5">
          <div className={`rounded-xl p-4 border text-center ${delayDays > 0 ? "bg-red-500/10 border-red-500/40" : "bg-emerald-500/10 border-emerald-500/30"}`}>
            <p className="text-xs text-[#6b7194] mb-2 font-medium">推定遅延</p>
            <p className={`text-3xl font-bold ${delayDays > 0 ? "text-red-400" : "text-emerald-400"}`}>
              {delayDays > 0 ? `${delayDays}日` : "なし"}
            </p>
          </div>
          <div className={`rounded-xl p-4 border text-center ${delayDays > 0 ? "bg-orange-500/10 border-orange-500/30" : "bg-[#0f1117]/80 border-[#2a2f45]/50"}`}>
            <p className="text-xs text-[#6b7194] mb-2 font-medium">推定FE発射日</p>
            <p className={`text-3xl font-bold ${delayDays > 0 ? "text-orange-400" : "text-white"}`}>
              {estFe ? fmtDate(estFe) : "-"}
            </p>
          </div>
        </div>
      )}

      {/* 遅延アラート */}
      {delayDays > 7 && (
        <div className="mb-5 px-5 py-4 rounded-xl bg-red-500/10 border-2 border-red-500/40">
          <p className="text-lg font-bold text-red-400 mb-1">発射日遅延の可能性</p>
          <p className="text-sm text-red-300/90">
            現在のペースだと約<span className="font-bold text-red-400">{delayWeeks}週間</span>の遅延が見込まれます
          </p>
          <p className="text-sm text-red-300/90 mt-1">
            推定FE発射日：<span className="font-bold text-orange-400">{estFe}</span> ／ 推定UP発射日：<span className="font-bold text-orange-400">{estUp}</span>
          </p>
        </div>
      )}

      {/* マニュアル紐付け */}
      {manualLinks.length > 0 && (
        <div className="mb-5 rounded-xl bg-[#1e2235]/60 border border-[#2a2f45] p-4">
          <p className="text-xs text-[#6b7194] font-bold mb-3">マニュアル紐付け（自動連動）</p>
          <div className="space-y-2">
            {manualLinks.map(ml => {
              const overdue = isOverdue(ml);
              return (
                <div key={ml.id} className={`flex items-center justify-between px-3 py-2 rounded-lg border ${overdue ? "bg-red-500/10 border-red-500/30" : "bg-[#13162a] border-[#2a2f45]/50"}`}>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-white">{ml.task}</span>
                    {ml.linkedTo && <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#4f8ff7]/10 text-[#4f8ff7] border border-[#4f8ff7]/20">← {ml.linkedTo}</span>}
                  </div>
                  <div className="flex items-center gap-2">
                    {ml.dueDate ? (
                      <span className={`text-lg font-bold ${overdue ? "text-red-400 animate-pulse" : "text-[#9aa0b8]"}`}>{fmtDate(ml.dueDate)}</span>
                    ) : (
                      <span className="text-xs text-[#4a4f65]">期日未定</span>
                    )}
                    {overdue && <span className="px-1.5 py-0.5 rounded-full bg-red-500/20 text-red-400 text-[10px] font-bold animate-pulse">超過</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 全体進捗バー */}
      <div className="mb-4">
        <div className="flex justify-between items-end mb-2">
          <span className="text-sm font-bold text-[#9aa0b8]">全体進捗</span>
          <span className="text-2xl font-bold text-purple-300">{rate}%<span className="text-sm text-[#6b7194] ml-2">({doneCount}/{total})</span></span>
        </div>
        <div className="w-full bg-[#0f1117] rounded-full h-4">
          <div className="h-4 rounded-full bg-gradient-to-r from-purple-500 to-blue-500 transition-all" style={{ width: `${Math.min(rate, 100)}%` }} />
        </div>
      </div>

      {/* バッジ */}
      <div className="flex gap-3 flex-wrap">
        {overdueCount > 0 && (
          <span className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold border-2 bg-red-500/10 text-red-400 border-red-500/30">
            ✕ 期日超過 {overdueCount}件
          </span>
        )}
        {nearDueCount > 0 && (
          <span className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold border-2 bg-yellow-500/10 text-yellow-400 border-yellow-500/30">
            ⚠ 7日以内 {nearDueCount}件
          </span>
        )}
        <span className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold border-2 bg-emerald-500/10 text-emerald-400 border-emerald-500/30">
          ✓ 完了 {doneCount}件
        </span>
      </div>
    </div>
  );
}

// ============================================================
// タスクカード（コンパクト2列対応）
// ============================================================
function TaskCard({ task: t, onToggle, onMemo }: {
  task: WbsTask;
  onToggle: (id: string) => void;
  onMemo: (id: string, memo: string) => void;
}) {
  const [memoOpen, setMemoOpen] = useState(t.memo !== "");
  const [videoOpen, setVideoOpen] = useState(false);
  const overdue = isOverdue(t);
  const near = isNearDue(t);
  const dl = daysLeft(t.dueDate);

  return (
    <div className={`rounded-xl border px-4 py-3 transition-all ${
      overdue ? "bg-red-500/5 border-red-500/30" :
      near ? "bg-yellow-500/5 border-yellow-500/30" :
      t.done ? "bg-emerald-500/5 border-emerald-500/20 opacity-60" :
      "bg-[#1e2235] border-[#2a2f45]"
    }`}>
      {/* 上段: チェック + タスク名 + 期日 */}
      <div className="flex items-start gap-2.5">
        <button onClick={() => onToggle(t.id)}
          className={`mt-1 flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${
            t.done ? "bg-emerald-500 border-emerald-500 text-white" : "border-[#4a4f65] hover:border-[#4f8ff7]"
          }`}>
          {t.done && <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <p className={`text-sm font-bold leading-snug ${t.done ? "line-through text-[#6b7194]" : "text-white"}`}>{t.task}</p>
            {t.isManualLink && <span className="px-1.5 py-0.5 rounded-full bg-[#4f8ff7]/15 text-[#4f8ff7] text-[10px] font-bold border border-[#4f8ff7]/30">紐付け</span>}
            {overdue && <span className="px-1.5 py-0.5 rounded-full bg-red-500/20 text-red-400 text-[10px] font-bold animate-pulse">超過</span>}
            {near && !overdue && <span className="px-1.5 py-0.5 rounded-full bg-yellow-500/20 text-yellow-400 text-[10px] font-bold">間近</span>}
            {t.done && <span className="px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-[10px] font-bold">完了</span>}
          </div>
          {t.isManualLink && t.linkedTo && (
            <p className="text-[10px] text-[#6b7194] mt-0.5">← {t.linkedTo} に連動</p>
          )}
        </div>

        {/* 期日（大きく目立つ） */}
        {t.dueDate ? (
          <div className="flex-shrink-0 text-right pl-2">
            <p className={`font-bold leading-none ${
              overdue ? "text-xl text-red-400" : near ? "text-lg text-yellow-400" : "text-lg text-[#9aa0b8]"
            }`}>
              {fmtDate(t.dueDate)}
            </p>
            {dl !== null && !t.done && (
              <p className={`text-xs mt-1 font-bold ${
                overdue ? "text-red-400" : near ? "text-yellow-400" : "text-[#6b7194]"
              }`}>
                {overdue ? `${Math.abs(dl)}日超過` : `残${dl}日`}
              </p>
            )}
          </div>
        ) : (
          <span className="flex-shrink-0 text-xs text-[#4a4f65]">期日未定</span>
        )}
      </div>

      {/* 下段: メタ + アクション */}
      <div className="flex items-center gap-2 mt-2 ml-[30px] flex-wrap">
        {t.department && <span className="text-xs px-2 py-0.5 rounded bg-[#252a40] border border-[#2a2f45] text-[#9aa0b8] font-medium">{t.department}</span>}
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#252a40]/50 border border-[#2a2f45]/50 text-[#6b7194]">{t.category}</span>
        {t.workDays > 0 && <span className="text-[10px] text-[#6b7194]">{t.workDays}日</span>}
        <span className="flex-1" />

        <button onClick={() => setMemoOpen(!memoOpen)}
          className={`text-[10px] px-2 py-0.5 rounded font-medium transition-colors ${
            memoOpen || t.memo ? "bg-[#4f8ff7]/15 text-[#4f8ff7] border border-[#4f8ff7]/30" : "text-[#6b7194] bg-[#252a40] border border-[#2a2f45] hover:border-[#4f8ff7]/30"
          }`}>
          備考
        </button>
        {t.videos.length > 0 ? (
          <button onClick={() => setVideoOpen(!videoOpen)}
            className={`text-[10px] px-2 py-0.5 rounded font-medium transition-colors ${
              videoOpen ? "bg-purple-500/15 text-purple-400 border border-purple-500/30" : "text-[#6b7194] bg-[#252a40] border border-[#2a2f45] hover:border-purple-500/30"
            }`}>
            動画({t.videos.length})
          </button>
        ) : (
          <span className="text-[10px] px-2 py-0.5 rounded text-[#4a4f65] bg-[#1a1f3a] border border-[#2a2f45]/30">動画なし</span>
        )}
      </div>

      {/* 備考欄 */}
      {memoOpen && (
        <textarea value={t.memo} onChange={e => onMemo(t.id, e.target.value)}
          placeholder="備考を入力（期日漏れ・トラブルなど）"
          className="mt-2 ml-[30px] w-[calc(100%-30px)] bg-[#13162a] border border-[#2a2f45] rounded-lg px-3 py-2 text-xs text-white placeholder-[#4a4f65] focus:border-[#4f8ff7] focus:outline-none resize-none"
          rows={2} />
      )}

      {/* マニュアル動画 */}
      {videoOpen && t.videos.length > 0 && (
        <div className="mt-2 ml-[30px] space-y-1">
          {t.videos.map((vid, i) => (
            <a key={i} href={vid.url} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-purple-500/5 border border-purple-500/15 hover:border-purple-500/40 transition text-xs text-purple-300 hover:text-purple-200 font-medium">
              <svg className="w-3.5 h-3.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z" /></svg>
              {vid.label}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================
// 期日超過アラート一覧（トップページ）
// ============================================================
function OverdueAlertList({ tasks }: { tasks: WbsTask[] }) {
  const overdueItems = tasks.filter(isOverdue).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  if (overdueItems.length === 0) return null;

  return (
    <div className="bg-red-500/5 rounded-2xl border-2 border-red-500/25 p-6">
      <h3 className="text-base font-bold text-red-400 mb-4">期日超過タスク ({overdueItems.length}件)</h3>
      <div className="space-y-2 max-h-[350px] overflow-y-auto">
        {overdueItems.slice(0, 20).map(t => {
          const dl = daysLeft(t.dueDate);
          return (
            <div key={t.id} className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-[#1e2235]/80 border border-red-500/15">
              <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: WBS_PROJECT_COLORS[t.project] }} />
              <span className="text-sm text-white font-medium flex-1 truncate">{t.task}</span>
              <span className="text-xs text-[#9aa0b8] flex-shrink-0">{t.project}</span>
              <span className="text-sm text-red-400 font-bold flex-shrink-0">{fmtDate(t.dueDate)}</span>
              <span className="text-xs text-red-400 font-bold flex-shrink-0">{dl !== null ? `${Math.abs(dl)}日` : ""}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

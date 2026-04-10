"use client";
import { useState } from "react";
import type { WbsProject } from "@/lib/wbs-data";
import { WBS_ALL_TASKS, type WbsTask } from "@/lib/wbs-data";

type Todo = { text: string; done: boolean };
type MtgRecord = {
  id: number; date: string; participants: string; agenda: string;
  decisions: string; rawTranscript: string; todos: Todo[];
};

const SAMPLE: MtgRecord[] = [
  {
    id: 1, date: "2026-03-22", participants: "宮さん, 責任者, プロモーター",
    agenda: "キックオフMTG：コンセプト・ブランディング方向性の確認",
    decisions: "・コンセプトは「初心者が3ヶ月で月収30万」に決定\n・撮影日は5/1〜5/3で仮押さえ\n・シナリオ初稿は4/16締切",
    rawTranscript: "",
    todos: [
      { text: "シナリオ初稿を4/16までに作成（プロモーター）", done: false },
      { text: "スタジオ予約を確定（責任者）", done: false },
      { text: "ヒアリングシートのフィードバック（宮さん）", done: true },
    ],
  },
];

export default function MtgTab({ project }: { project: WbsProject }) {
  const [records, setRecords] = useState<MtgRecord[]>(SAMPLE);
  const [nextId, setNextId] = useState(2);
  const [expandedId, setExpandedId] = useState<number | null>(1);
  const [transcriptInput, setTranscriptInput] = useState("");
  const [showTranscriptModal, setShowTranscriptModal] = useState(false);

  function addRecord() {
    const nr: MtgRecord = {
      id: nextId, date: new Date().toISOString().slice(0, 10),
      participants: "", agenda: "", decisions: "", rawTranscript: "", todos: [],
    };
    setRecords(p => [nr, ...p]);
    setNextId(n => n + 1);
    setExpandedId(nextId);
  }

  function updateRecord(id: number, field: keyof MtgRecord, val: string) {
    setRecords(p => p.map(r => r.id === id ? { ...r, [field]: val } as MtgRecord : r));
  }

  function addTodo(id: number) {
    setRecords(p => p.map(r => r.id === id ? { ...r, todos: [...r.todos, { text: "", done: false }] } : r));
  }

  function updateTodo(recId: number, idx: number, field: keyof Todo, val: string | boolean) {
    setRecords(p => p.map(r => r.id === recId ? {
      ...r, todos: r.todos.map((t, i) => i === idx ? { ...t, [field]: val } : t),
    } : r));
  }

  function removeTodo(recId: number, idx: number) {
    setRecords(p => p.map(r => r.id === recId ? { ...r, todos: r.todos.filter((_, i) => i !== idx) } : r));
  }

  // 文字起こし自動整形
  function formatTranscript() {
    if (!transcriptInput.trim() || expandedId === null) return;
    const lines = transcriptInput.split("\n").filter(l => l.trim());
    const agenda = lines.slice(0, 3).join("\n");
    const decisions = lines.filter(l => l.includes("決定") || l.includes("決まり") || l.includes("にする")).join("\n") || "（自動抽出なし）";
    const todoLines = lines.filter(l => l.includes("やる") || l.includes("する") || l.includes("まで") || l.includes("担当") || l.includes("お願い"));
    const todos: Todo[] = todoLines.map(t => ({ text: t.trim(), done: false }));

    setRecords(p => p.map(r => r.id === expandedId ? {
      ...r,
      rawTranscript: transcriptInput,
      agenda: r.agenda || agenda,
      decisions: r.decisions || decisions,
      todos: [...r.todos, ...todos],
    } : r));
    setTranscriptInput("");
    setShowTranscriptModal(false);
  }

  // WBSタスクから次にやるべきタスク
  const projTasks = WBS_ALL_TASKS.filter(t => t.project === project && !t.done && t.dueDate)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    .slice(0, 5);

  // 全TODO集約
  const allTodos = records.flatMap(r => r.todos.filter(t => !t.done).map(t => ({ ...t, date: r.date })));

  return (
    <div className="space-y-6">
      {/* 新規追加 + 文字起こし */}
      <div className="flex gap-3 flex-wrap">
        <button onClick={addRecord}
          className="px-5 py-2.5 rounded-xl bg-[#4f8ff7]/10 border-2 border-[#4f8ff7]/30 text-sm font-bold text-[#4f8ff7] hover:bg-[#4f8ff7]/20 transition">
          + 新しい議事録
        </button>
        <button onClick={() => setShowTranscriptModal(!showTranscriptModal)}
          className="px-5 py-2.5 rounded-xl bg-purple-500/10 border-2 border-purple-500/30 text-sm font-bold text-purple-400 hover:bg-purple-500/20 transition">
          文字起こしから整形
        </button>
      </div>

      {/* 文字起こし入力 */}
      {showTranscriptModal && (
        <div className="bg-[#1e2235] rounded-2xl border-2 border-purple-500/30 p-5">
          <h3 className="text-base font-bold text-purple-400 mb-3">Zoom/Meet 文字起こしを貼り付け</h3>
          <textarea value={transcriptInput} onChange={e => setTranscriptInput(e.target.value)}
            placeholder="ここに文字起こしテキストを貼り付けてください。自動で議事録フォーマットに整形します。"
            rows={8}
            className="w-full bg-[#13162a] border border-[#2a2f45] rounded-lg px-4 py-3 text-sm text-white placeholder-[#4a4f65] focus:border-purple-500 focus:outline-none resize-none mb-3" />
          <button onClick={formatTranscript}
            className="px-5 py-2.5 rounded-xl bg-purple-500 text-white text-sm font-bold hover:bg-purple-600 transition">
            自動整形して議事録に反映
          </button>
          {!expandedId && <p className="text-xs text-yellow-400 mt-2">※ 議事録を選択（展開）してから整形してください</p>}
        </div>
      )}

      {/* 未完了TODO + 次のWBSタスク */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-[#1e2235] rounded-2xl border border-[#2a2f45] p-5">
          <h3 className="text-base font-bold text-[#4f8ff7] mb-3">未完了TODO（議事録から）</h3>
          {allTodos.length === 0 ? (
            <p className="text-sm text-[#6b7194]">未完了のTODOはありません</p>
          ) : (
            <div className="space-y-2">
              {allTodos.slice(0, 10).map((t, i) => (
                <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#13162a] border border-[#2a2f45]">
                  <span className="text-xs text-[#6b7194]">{t.date}</span>
                  <span className="text-sm text-white flex-1">{t.text}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="bg-[#1e2235] rounded-2xl border border-[#2a2f45] p-5">
          <h3 className="text-base font-bold text-emerald-400 mb-3">次にやるべきWBSタスク</h3>
          {projTasks.length === 0 ? (
            <p className="text-sm text-[#6b7194]">未完了タスクはありません</p>
          ) : (
            <div className="space-y-2">
              {projTasks.map(t => (
                <div key={t.id} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#13162a] border border-[#2a2f45]">
                  <span className="text-xs text-[#9aa0b8] flex-shrink-0">{t.dueDate}</span>
                  <span className="text-sm text-white flex-1 truncate">{t.task}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#252a40] text-[#6b7194]">{t.department || "-"}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 議事録一覧 */}
      <div className="space-y-3">
        {records.map(r => {
          const isOpen = expandedId === r.id;
          return (
            <div key={r.id} className="bg-[#1e2235] rounded-2xl border border-[#2a2f45] overflow-hidden">
              {/* ヘッダー */}
              <button onClick={() => setExpandedId(isOpen ? null : r.id)}
                className="w-full text-left px-5 py-4 flex items-center gap-3 hover:bg-[#252a40] transition">
                <span className="text-sm font-bold text-[#4f8ff7]">{r.date || "日付未定"}</span>
                <span className="text-sm text-white font-medium flex-1 truncate">{r.agenda || "（議題未入力）"}</span>
                <span className="text-xs text-[#6b7194]">TODO {r.todos.filter(t => !t.done).length}件</span>
                <span className="text-[#6b7194]">{isOpen ? "▼" : "▶"}</span>
              </button>
              {/* 展開時 */}
              {isOpen && (
                <div className="px-5 pb-5 space-y-4 border-t border-[#2a2f45]">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4">
                    <div>
                      <label className="text-xs font-bold text-[#9aa0b8] mb-1.5 block">日付</label>
                      <input type="date" value={r.date} onChange={e => updateRecord(r.id, "date", e.target.value)}
                        className="w-full bg-[#13162a] border border-[#2a2f45] rounded-lg px-3 py-2 text-sm text-white focus:border-[#4f8ff7] focus:outline-none" />
                    </div>
                    <div>
                      <label className="text-xs font-bold text-[#9aa0b8] mb-1.5 block">参加者</label>
                      <input value={r.participants} onChange={e => updateRecord(r.id, "participants", e.target.value)} placeholder="カンマ区切り"
                        className="w-full bg-[#13162a] border border-[#2a2f45] rounded-lg px-3 py-2 text-sm text-white placeholder-[#4a4f65] focus:border-[#4f8ff7] focus:outline-none" />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-bold text-[#9aa0b8] mb-1.5 block">議題</label>
                    <textarea value={r.agenda} onChange={e => updateRecord(r.id, "agenda", e.target.value)} rows={2} placeholder="議題を入力"
                      className="w-full bg-[#13162a] border border-[#2a2f45] rounded-lg px-3 py-2 text-sm text-white placeholder-[#4a4f65] focus:border-[#4f8ff7] focus:outline-none resize-none" />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-[#9aa0b8] mb-1.5 block">決定事項</label>
                    <textarea value={r.decisions} onChange={e => updateRecord(r.id, "decisions", e.target.value)} rows={3} placeholder="決定事項を入力"
                      className="w-full bg-[#13162a] border border-[#2a2f45] rounded-lg px-3 py-2 text-sm text-white placeholder-[#4a4f65] focus:border-[#4f8ff7] focus:outline-none resize-none" />
                  </div>
                  {/* TODO */}
                  <div>
                    <label className="text-xs font-bold text-[#9aa0b8] mb-2 block">TODO</label>
                    <div className="space-y-2">
                      {r.todos.map((todo, idx) => (
                        <div key={idx} className="flex items-center gap-2">
                          <button onClick={() => updateTodo(r.id, idx, "done", !todo.done)}
                            className={`flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center transition ${
                              todo.done ? "bg-emerald-500 border-emerald-500 text-white" : "border-[#4a4f65] hover:border-[#4f8ff7]"
                            }`}>
                            {todo.done && <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                          </button>
                          <input value={todo.text} onChange={e => updateTodo(r.id, idx, "text", e.target.value)}
                            className={`flex-1 bg-[#13162a] border border-[#2a2f45] rounded-lg px-3 py-2 text-sm text-white placeholder-[#4a4f65] focus:border-[#4f8ff7] focus:outline-none ${todo.done ? "line-through opacity-50" : ""}`}
                            placeholder="TODOを入力" />
                          <button onClick={() => removeTodo(r.id, idx)} className="text-[#6b7194] hover:text-red-400 transition">×</button>
                        </div>
                      ))}
                    </div>
                    <button onClick={() => addTodo(r.id)}
                      className="mt-2 px-3 py-1.5 rounded-lg bg-[#4f8ff7]/10 border border-[#4f8ff7]/30 text-xs font-bold text-[#4f8ff7] hover:bg-[#4f8ff7]/20 transition">
                      + TODO追加
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

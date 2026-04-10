"use client";

import { useState } from "react";

interface KillerWord {
  id: string;
  word: string;
  context: string;
  department: string;
  shared_to: string[];
  effectiveness_score: number;
  submitted_by: string;
  created_at: string;
  project_name?: string;
}

interface Props {
  words: KillerWord[];
  projectNames: string[];
}

const DEPTS = ["動画", "広告", "インスタ", "CS", "営業", "マーケ"];
const PROJECT_COLORS: Record<string, string> = {
  "ハピネス": "#4f8ff7", "WBC": "#34d399", "競馬": "#fbbf24", "レインボー": "#a78bfa",
};

export default function KillerWordPanel({ words, projectNames }: Props) {
  const [filter, setFilter] = useState<string>("all");
  const [newWord, setNewWord] = useState({ word: "", context: "", department: "", project_name: projectNames[0] || "ハピネス", submitted_by: "" });
  const [saving, setSaving] = useState(false);
  const [shareTarget, setShareTarget] = useState<Record<string, string[]>>({});

  const filtered = filter === "all" ? words : words.filter(w => w.project_name === filter);
  const sorted = [...filtered].sort((a, b) => b.effectiveness_score - a.effectiveness_score);

  async function saveWord() {
    if (!newWord.word) return;
    setSaving(true);
    try {
      await fetch("/api/killer-words", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newWord),
      });
      setNewWord({ word: "", context: "", department: "", project_name: projectNames[0] || "ハピネス", submitted_by: "" });
    } finally {
      setSaving(false);
    }
  }

  function toggleShare(wordId: string, dept: string) {
    setShareTarget(prev => {
      const current = prev[wordId] || [];
      return { ...prev, [wordId]: current.includes(dept) ? current.filter(d => d !== dept) : [...current, dept] };
    });
  }

  return (
    <div className="space-y-5">
      {/* Project filter */}
      <div className="flex gap-2 flex-wrap">
        <button onClick={() => setFilter("all")}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
            filter === "all" ? "bg-[#4f8ff7] text-white" : "bg-[#1e2235] text-[#9aa0b8] border border-[#2a2f45]"
          }`}>全案件</button>
        {projectNames.map(name => {
          const color = PROJECT_COLORS[name] ?? "#4f8ff7";
          return (
            <button key={name} onClick={() => setFilter(name)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition border-2`}
              style={{
                borderColor: filter === name ? color : "#2a2f45",
                background: filter === name ? color + "22" : "transparent",
                color: filter === name ? color : "#6b7194",
              }}>{name}</button>
          );
        })}
      </div>

      {/* Word list */}
      <div className="space-y-2">
        {sorted.length === 0 ? (
          <div className="bg-[#1e2235] rounded-xl border border-[#2a2f45] px-4 py-8 text-center text-[#6b7194] text-xs">
            キラーワード未登録
          </div>
        ) : sorted.map(w => (
          <div key={w.id} className="bg-[#1e2235] rounded-xl border border-[#2a2f45] p-4">
            <div className="flex items-start justify-between mb-2">
              <div>
                <p className="text-sm font-bold text-white">&ldquo;{w.word}&rdquo;</p>
                {w.context && <p className="text-xs text-[#9aa0b8] mt-1">{w.context}</p>}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-[#6b7194]">{w.department || "-"}</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-400">
                  ★{w.effectiveness_score}
                </span>
              </div>
            </div>
            {/* Share buttons */}
            <div className="flex gap-1.5 flex-wrap">
              {DEPTS.map(dept => {
                const shared = (w.shared_to || []).includes(dept) || (shareTarget[w.id] || []).includes(dept);
                return (
                  <button key={dept} onClick={() => toggleShare(w.id, dept)}
                    className={`px-2 py-1 rounded text-[10px] font-medium transition ${
                      shared ? "bg-[#4f8ff7]/20 text-[#4f8ff7] border border-[#4f8ff7]/40" : "bg-[#13162a] text-[#6b7194] border border-[#2a2f45]"
                    }`}>{shared ? "✓ " : ""}{dept}に共有</button>
                );
              })}
            </div>
            <div className="flex gap-2 mt-2 text-[10px] text-[#6b7194]">
              <span>投稿: {w.submitted_by || "-"}</span>
              <span>{w.created_at?.slice(0, 10)}</span>
            </div>
          </div>
        ))}
      </div>

      {/* New word form */}
      <div className="bg-[#1e2235] rounded-xl border border-[#2a2f45] p-4">
        <p className="text-xs font-semibold text-white mb-3">キラーワードを登録</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-2">
          <input value={newWord.word} onChange={e => setNewWord({ ...newWord, word: e.target.value })}
            placeholder="キラーワード *" className="px-2 py-1.5 text-xs bg-[#13162a] border border-[#2a2f45] rounded text-white" />
          <input value={newWord.context} onChange={e => setNewWord({ ...newWord, context: e.target.value })}
            placeholder="使用場面・文脈" className="px-2 py-1.5 text-xs bg-[#13162a] border border-[#2a2f45] rounded text-white" />
          <select value={newWord.department} onChange={e => setNewWord({ ...newWord, department: e.target.value })}
            className="px-2 py-1.5 text-xs bg-[#13162a] border border-[#2a2f45] rounded text-white">
            <option value="">部署を選択</option>
            {DEPTS.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
          <select value={newWord.project_name} onChange={e => setNewWord({ ...newWord, project_name: e.target.value })}
            className="px-2 py-1.5 text-xs bg-[#13162a] border border-[#2a2f45] rounded text-white">
            {projectNames.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
        <input value={newWord.submitted_by} onChange={e => setNewWord({ ...newWord, submitted_by: e.target.value })}
          placeholder="投稿者名" className="w-full mb-2 px-2 py-1.5 text-xs bg-[#13162a] border border-[#2a2f45] rounded text-white" />
        <button onClick={saveWord} disabled={saving || !newWord.word}
          className="px-3 py-1.5 bg-[#4f8ff7] text-white text-xs rounded-lg hover:bg-[#3d7de5] disabled:opacity-50">
          {saving ? "保存中..." : "登録する"}
        </button>
      </div>
    </div>
  );
}

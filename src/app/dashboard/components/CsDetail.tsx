"use client";

import { useState } from "react";

interface CsLog {
  id: string;
  customer_name: string;
  response_type: string;
  content: string;
  is_alert: boolean;
  alert_reason: string;
  created_at: string;
}

interface CsTemplate {
  id: string;
  title: string;
  body: string;
  category: string;
  usage_count: number;
}

interface Threshold {
  metric_name: string;
  threshold_value: number;
  direction: string;
}

interface Props {
  projectName: string;
  projectColor: string;
  logs: CsLog[];
  templates: CsTemplate[];
  thresholds: Threshold[];
}

export default function CsDetail({ projectName, projectColor, logs, templates, thresholds }: Props) {
  const [tab, setTab] = useState<"logs" | "templates" | "thresholds">("logs");
  const [newTemplate, setNewTemplate] = useState({ title: "", body: "", category: "" });
  const [saving, setSaving] = useState(false);

  // Group logs by response_type and sort by frequency
  const typeMap: Record<string, CsLog[]> = {};
  logs.forEach(l => { const t = l.response_type || "その他"; typeMap[t] = [...(typeMap[t] || []), l]; });
  const sortedTypes = Object.entries(typeMap).sort((a, b) => b[1].length - a[1].length);

  const alertLogs = logs.filter(l => l.is_alert);

  async function saveTemplate() {
    if (!newTemplate.title || !newTemplate.body) return;
    setSaving(true);
    try {
      await fetch("/api/cs-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...newTemplate, project_name: projectName }),
      });
      setNewTemplate({ title: "", body: "", category: "" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-2xl border-2 bg-[#13162a] p-5" style={{ borderColor: projectColor }}>
      <div className="flex items-center gap-2 mb-4">
        <span className="w-3 h-3 rounded-full" style={{ background: projectColor }} />
        <p className="text-lg font-bold text-white">{projectName}</p>
      </div>

      {/* Sub-tabs */}
      <div className="flex gap-2 mb-4">
        {[
          { key: "logs" as const, label: "対応履歴" },
          { key: "templates" as const, label: "テンプレート" },
          { key: "thresholds" as const, label: "基準値" },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
              tab === t.key ? "bg-[#4f8ff7] text-white" : "bg-[#1e2235] text-[#9aa0b8] border border-[#2a2f45]"
            }`}>{t.label}</button>
        ))}
      </div>

      {/* Alerts */}
      {alertLogs.length > 0 && (
        <div className="mb-4 space-y-1">
          {alertLogs.slice(0, 3).map((l, i) => (
            <div key={i} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-400">
              <span>🚨</span>
              <span>{l.alert_reason || "基準値超過"}: {l.customer_name}</span>
            </div>
          ))}
        </div>
      )}

      {/* Logs tab */}
      {tab === "logs" && (
        <div className="space-y-2">
          {sortedTypes.length === 0 ? (
            <p className="text-xs text-[#6b7194] py-4 text-center">対応履歴なし</p>
          ) : sortedTypes.map(([type, items]) => (
            <details key={type} className="group">
              <summary className="flex items-center justify-between cursor-pointer px-3 py-2 rounded-lg bg-[#1e2235]/60 border border-[#2a2f45]/50 hover:border-[#4f8ff7]/40">
                <span className="text-xs font-medium text-white">{type}</span>
                <span className="text-[10px] text-[#6b7194]">{items.length}件</span>
              </summary>
              <div className="mt-1 space-y-1 pl-2">
                {items.map((l, i) => (
                  <div key={i} className={`px-3 py-2 rounded-lg text-xs ${l.is_alert ? "bg-red-500/5 border border-red-500/20" : "bg-[#0f1117] border border-[#2a2f45]/30"}`}>
                    <div className="flex justify-between">
                      <span className="text-white font-medium">{l.customer_name || "-"}</span>
                      <span className="text-[#6b7194]">{l.created_at?.slice(0, 10)}</span>
                    </div>
                    {l.content && <p className="text-[#9aa0b8] mt-1">{l.content.slice(0, 100)}</p>}
                  </div>
                ))}
              </div>
            </details>
          ))}
        </div>
      )}

      {/* Templates tab */}
      {tab === "templates" && (
        <div className="space-y-3">
          {templates.length > 0 && (
            <div className="space-y-1">
              {templates.map((t, i) => (
                <div key={i} className="px-3 py-2 rounded-lg bg-[#1e2235]/60 border border-[#2a2f45]/50">
                  <div className="flex justify-between">
                    <span className="text-xs font-medium text-white">{t.title}</span>
                    <span className="text-[10px] text-[#6b7194]">使用 {t.usage_count}回</span>
                  </div>
                  <p className="text-[10px] text-[#9aa0b8] mt-1">{t.body.slice(0, 80)}...</p>
                </div>
              ))}
            </div>
          )}
          {/* New template form */}
          <div className="p-3 rounded-lg bg-[#0f1117] border border-[#2a2f45]/50">
            <p className="text-xs font-medium text-[#9aa0b8] mb-2">新規テンプレート登録</p>
            <input value={newTemplate.title} onChange={e => setNewTemplate({ ...newTemplate, title: e.target.value })}
              placeholder="タイトル" className="w-full mb-2 px-2 py-1.5 text-xs bg-[#13162a] border border-[#2a2f45] rounded text-white" />
            <textarea value={newTemplate.body} onChange={e => setNewTemplate({ ...newTemplate, body: e.target.value })}
              placeholder="テンプレート本文" rows={3} className="w-full mb-2 px-2 py-1.5 text-xs bg-[#13162a] border border-[#2a2f45] rounded text-white" />
            <button onClick={saveTemplate} disabled={saving}
              className="px-3 py-1.5 bg-[#4f8ff7] text-white text-xs rounded-lg hover:bg-[#3d7de5] disabled:opacity-50">
              {saving ? "保存中..." : "登録"}
            </button>
          </div>
        </div>
      )}

      {/* Thresholds tab */}
      {tab === "thresholds" && (
        <div className="space-y-1">
          {thresholds.length === 0 ? (
            <p className="text-xs text-[#6b7194] py-4 text-center">基準値未設定</p>
          ) : thresholds.map((t, i) => (
            <div key={i} className="flex justify-between px-3 py-2 rounded-lg bg-[#1e2235]/60 border border-[#2a2f45]/50">
              <span className="text-xs text-white">{t.metric_name}</span>
              <span className="text-xs text-yellow-400">{t.direction === "below" ? "≤" : "≥"} {t.threshold_value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

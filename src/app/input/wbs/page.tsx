"use client";

import { useState } from "react";
import Link from "next/link";

const DEPARTMENT_OPTIONS = ["", "責任者", "プロモーター", "デザイナー", "決済チーム", "動画", "サブ"];

interface FormData {
  phase: string;
  task_name: string;
  due_date: string;
  department: string;
  is_completed: boolean;
  reverse_days: string;
  work_days: string;
  reference_url: string;
  memo: string;
}

const INITIAL_FORM: FormData = {
  phase: "",
  task_name: "",
  due_date: "",
  department: "",
  is_completed: false,
  reverse_days: "",
  work_days: "",
  reference_url: "",
  memo: "",
};

export default function WbsTaskInputPage() {
  const [form, setForm] = useState<FormData>(INITIAL_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) {
    const target = e.target;
    if (target instanceof HTMLInputElement && target.type === "checkbox") {
      setForm((prev) => ({ ...prev, [target.name]: target.checked }));
    } else {
      setForm((prev) => ({ ...prev, [target.name]: target.value }));
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setMessage(null);

    try {
      const payload = {
        ...form,
        reverse_days: form.reverse_days ? Number(form.reverse_days) : 0,
        work_days: form.work_days ? Number(form.work_days) : 0,
        due_date: form.due_date || null,
      };

      const res = await fetch("/api/project-tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const result = await res.json();

      if (!res.ok) {
        setMessage({ type: "error", text: result.error || "保存に失敗しました" });
        return;
      }

      setMessage({ type: "success", text: "WBSタスクを保存しました" });
      setForm(INITIAL_FORM);
    } catch {
      setMessage({ type: "error", text: "通信エラーが発生しました" });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#0f1117]">
      {/* ヘッダー */}
      <header className="bg-[#1e2235] border-b border-[#2a2f45] px-6 py-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div>
            <Link href="/" className="text-sm text-[#4f8ff7] hover:underline">← ダッシュボードに戻る</Link>
            <h1 className="text-xl font-bold text-white mt-1">WBSタスク入力</h1>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-6">
        {message && (
          <div className={`mb-6 px-4 py-3 rounded-lg text-sm font-medium ${
            message.type === "success"
              ? "bg-green-900/30 text-green-400 border border-green-800"
              : "bg-red-900/30 text-red-400 border border-red-800"
          }`}>
            {message.text}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* タスク基本情報 */}
          <section className="bg-[#1e2235] rounded-xl shadow-sm border border-[#2a2f45] p-5">
            <h2 className="text-base font-semibold text-white mb-4">タスク基本情報</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-[#9aa0b8] mb-1">フェーズ</label>
                <input
                  type="text"
                  name="phase"
                  value={form.phase}
                  onChange={handleChange}
                  className="w-full bg-[#13162a] border border-[#2a2f45] text-white rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#4f8ff7] focus:border-[#4f8ff7]"
                  placeholder="例: 企画フェーズ"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#9aa0b8] mb-1">
                  タスク名<span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="task_name"
                  value={form.task_name}
                  onChange={handleChange}
                  required
                  className="w-full bg-[#13162a] border border-[#2a2f45] text-white rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#4f8ff7] focus:border-[#4f8ff7]"
                  placeholder="例: LP制作"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#9aa0b8] mb-1">期日</label>
                <input
                  type="date"
                  name="due_date"
                  value={form.due_date}
                  onChange={handleChange}
                  className="w-full bg-[#13162a] border border-[#2a2f45] text-white rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#4f8ff7] focus:border-[#4f8ff7]"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#9aa0b8] mb-1">担当部署</label>
                <select
                  name="department"
                  value={form.department}
                  onChange={handleChange}
                  className="w-full bg-[#13162a] border border-[#2a2f45] text-white rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#4f8ff7] focus:border-[#4f8ff7]"
                >
                  {DEPARTMENT_OPTIONS.map((o) => (
                    <option key={o} value={o}>{o || "-- 選択 --"}</option>
                  ))}
                </select>
              </div>
            </div>
          </section>

          {/* 進捗・工数 */}
          <section className="bg-[#1e2235] rounded-xl shadow-sm border border-[#2a2f45] p-5">
            <h2 className="text-base font-semibold text-white mb-4">進捗・工数</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  name="is_completed"
                  checked={form.is_completed}
                  onChange={handleChange}
                  className="w-4 h-4 rounded border-[#2a2f45] bg-[#13162a] text-[#4f8ff7] focus:ring-[#4f8ff7]"
                />
                <label className="text-sm font-medium text-[#9aa0b8]">完了</label>
              </div>
              <div>
                <label className="block text-sm font-medium text-[#9aa0b8] mb-1">逆算日数</label>
                <input
                  type="number"
                  name="reverse_days"
                  value={form.reverse_days}
                  onChange={handleChange}
                  className="w-full bg-[#13162a] border border-[#2a2f45] text-white rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#4f8ff7] focus:border-[#4f8ff7]"
                  placeholder="例: 14"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#9aa0b8] mb-1">作業日数</label>
                <input
                  type="number"
                  name="work_days"
                  value={form.work_days}
                  onChange={handleChange}
                  className="w-full bg-[#13162a] border border-[#2a2f45] text-white rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#4f8ff7] focus:border-[#4f8ff7]"
                  placeholder="例: 3"
                />
              </div>
            </div>
          </section>

          {/* 参考・メモ */}
          <section className="bg-[#1e2235] rounded-xl shadow-sm border border-[#2a2f45] p-5">
            <h2 className="text-base font-semibold text-white mb-4">参考・メモ</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-[#9aa0b8] mb-1">参考URL</label>
                <input
                  type="text"
                  name="reference_url"
                  value={form.reference_url}
                  onChange={handleChange}
                  className="w-full bg-[#13162a] border border-[#2a2f45] text-white rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#4f8ff7] focus:border-[#4f8ff7]"
                  placeholder="例: https://example.com/reference"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#9aa0b8] mb-1">備考</label>
                <textarea
                  name="memo"
                  value={form.memo}
                  onChange={handleChange}
                  rows={3}
                  className="w-full bg-[#13162a] border border-[#2a2f45] text-white rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#4f8ff7] focus:border-[#4f8ff7]"
                  placeholder="自由記入"
                />
              </div>
            </div>
          </section>

          {/* 送信ボタン */}
          <div className="flex justify-end gap-3">
            <Link
              href="/"
              className="px-6 py-2.5 border border-[#2a2f45] rounded-lg text-sm font-medium text-[#9aa0b8] hover:bg-[#1e2235] transition"
            >
              キャンセル
            </Link>
            <button
              type="submit"
              disabled={submitting}
              className="px-6 py-2.5 bg-[#4f8ff7] text-white rounded-lg text-sm font-medium hover:bg-[#3d7de5] transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? "保存中..." : "保存する"}
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}

"use client";

import { useState } from "react";
import Link from "next/link";

const STATUS_OPTIONS = ["", "planning", "active", "completed", "cancelled"];

interface FormData {
  jv_name: string;
  partner: string;
  status: string;
  due_date: string;
  revenue: string;
  memo: string;
}

const INITIAL_FORM: FormData = {
  jv_name: "",
  partner: "",
  status: "",
  due_date: "",
  revenue: "",
  memo: "",
};

export default function JvProjectInputPage() {
  const [form, setForm] = useState<FormData>(INITIAL_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setMessage(null);

    try {
      const payload = {
        ...form,
        revenue: form.revenue ? Number(form.revenue) : 0,
        due_date: form.due_date || null,
      };

      const res = await fetch("/api/jv-projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const result = await res.json();

      if (!res.ok) {
        setMessage({ type: "error", text: result.error || "保存に失敗しました" });
        return;
      }

      setMessage({ type: "success", text: "JV企画を保存しました" });
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
            <h1 className="text-xl font-bold text-white mt-1">JV企画入力</h1>
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
          {/* 基本情報 */}
          <section className="bg-[#1e2235] rounded-xl shadow-sm border border-[#2a2f45] p-5">
            <h2 className="text-base font-semibold text-white mb-4">基本情報</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-[#9aa0b8] mb-1">
                  JV企画名<span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="jv_name"
                  value={form.jv_name}
                  onChange={handleChange}
                  required
                  className="w-full bg-[#13162a] border border-[#2a2f45] text-white rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#4f8ff7] focus:border-[#4f8ff7]"
                  placeholder="例: コラボセミナー企画"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#9aa0b8] mb-1">パートナー</label>
                <input
                  type="text"
                  name="partner"
                  value={form.partner}
                  onChange={handleChange}
                  className="w-full bg-[#13162a] border border-[#2a2f45] text-white rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#4f8ff7] focus:border-[#4f8ff7]"
                  placeholder="例: 株式会社ABC"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#9aa0b8] mb-1">ステータス</label>
                <select
                  name="status"
                  value={form.status}
                  onChange={handleChange}
                  className="w-full bg-[#13162a] border border-[#2a2f45] text-white rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#4f8ff7] focus:border-[#4f8ff7]"
                >
                  {STATUS_OPTIONS.map((o) => (
                    <option key={o} value={o}>{o || "-- 選択 --"}</option>
                  ))}
                </select>
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
            </div>
          </section>

          {/* 金額 */}
          <section className="bg-[#1e2235] rounded-xl shadow-sm border border-[#2a2f45] p-5">
            <h2 className="text-base font-semibold text-white mb-4">金額</h2>
            <div>
              <label className="block text-sm font-medium text-[#9aa0b8] mb-1">売上</label>
              <input
                type="number"
                name="revenue"
                value={form.revenue}
                onChange={handleChange}
                className="w-full bg-[#13162a] border border-[#2a2f45] text-white rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-[#4f8ff7] focus:border-[#4f8ff7]"
                placeholder="例: 1000000"
              />
            </div>
          </section>

          {/* メモ */}
          <section className="bg-[#1e2235] rounded-xl shadow-sm border border-[#2a2f45] p-5">
            <h2 className="text-base font-semibold text-white mb-4">メモ</h2>
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

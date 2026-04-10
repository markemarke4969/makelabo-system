"use client";

import { useState } from "react";
import Link from "next/link";

interface FormData {
  year_month: string;
  target_revenue: string;
  target_opt_in: string;
  target_appointment: string;
  target_close_count: string;
  target_roas: string;
}

const INITIAL_FORM: FormData = {
  year_month: "",
  target_revenue: "",
  target_opt_in: "",
  target_appointment: "",
  target_close_count: "",
  target_roas: "",
};

export default function MonthlyTargetsInputPage() {
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
        year_month: form.year_month,
        target_revenue: form.target_revenue ? Number(form.target_revenue) : null,
        target_opt_in: form.target_opt_in ? Number(form.target_opt_in) : null,
        target_appointment: form.target_appointment ? Number(form.target_appointment) : null,
        target_close_count: form.target_close_count ? Number(form.target_close_count) : null,
        target_roas: form.target_roas ? Number(form.target_roas) : null,
      };

      const res = await fetch("/api/monthly-targets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const result = await res.json();

      if (!res.ok) {
        setMessage({ type: "error", text: result.error || "保存に失敗しました" });
        return;
      }

      setMessage({ type: "success", text: "月次目標を保存しました" });
      setForm(INITIAL_FORM);
    } catch {
      setMessage({ type: "error", text: "通信エラーが発生しました" });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div>
            <Link href="/" className="text-sm text-blue-600 hover:underline">← ダッシュボードに戻る</Link>
            <h1 className="text-xl font-bold text-gray-900 mt-1">月次目標入力</h1>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-6">
        {message && (
          <div className={`mb-6 px-4 py-3 rounded-lg text-sm font-medium ${
            message.type === "success" ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"
          }`}>
            {message.text}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* 基本情報 */}
          <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
            <h2 className="text-base font-semibold text-gray-900 mb-4">基本情報</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  対象年月<span className="text-red-500">*</span>
                </label>
                <input type="text" name="year_month" value={form.year_month} onChange={handleChange} required
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="2026-03" />
              </div>
            </div>
          </section>

          {/* 目標 */}
          <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
            <h2 className="text-base font-semibold text-gray-900 mb-4">目標</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">目標売上</label>
                <input type="number" name="target_revenue" value={form.target_revenue} onChange={handleChange}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">目標オプト数</label>
                <input type="number" name="target_opt_in" value={form.target_opt_in} onChange={handleChange}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">目標アポ数</label>
                <input type="number" name="target_appointment" value={form.target_appointment} onChange={handleChange}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">目標成約数</label>
                <input type="number" name="target_close_count" value={form.target_close_count} onChange={handleChange}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">目標ROAS</label>
                <input type="number" name="target_roas" value={form.target_roas} onChange={handleChange}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
              </div>
            </div>
          </section>

          {/* 送信ボタン */}
          <div className="flex justify-end gap-3">
            <Link href="/"
              className="px-6 py-2.5 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition">
              キャンセル
            </Link>
            <button type="submit" disabled={submitting}
              className="px-6 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed">
              {submitting ? "保存中..." : "保存する"}
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}

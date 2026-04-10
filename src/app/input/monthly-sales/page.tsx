"use client";

import { useState } from "react";
import Link from "next/link";

const PRODUCT_TYPE_OPTIONS = ["", "front", "upsell"];

interface FormData {
  year_month: string;
  product_type: string;
  total_revenue: string;
  total_deposit: string;
  deal_count: string;
  avg_unit_price: string;
  pending_count: string;
  unpaid_amount: string;
  unpaid_count: string;
  cooling_off_count: string;
  refund_rate: string;
  refund_amount: string;
}

const INITIAL_FORM: FormData = {
  year_month: "",
  product_type: "",
  total_revenue: "",
  total_deposit: "",
  deal_count: "",
  avg_unit_price: "",
  pending_count: "",
  unpaid_amount: "",
  unpaid_count: "",
  cooling_off_count: "",
  refund_rate: "",
  refund_amount: "",
};

export default function MonthlySalesInputPage() {
  const [form, setForm] = useState<FormData>(INITIAL_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setMessage(null);

    try {
      const payload = {
        ...form,
        total_revenue: form.total_revenue ? Number(form.total_revenue) : 0,
        total_deposit: form.total_deposit ? Number(form.total_deposit) : 0,
        deal_count: form.deal_count ? Number(form.deal_count) : 0,
        avg_unit_price: form.avg_unit_price ? Number(form.avg_unit_price) : 0,
        pending_count: form.pending_count ? Number(form.pending_count) : 0,
        unpaid_amount: form.unpaid_amount ? Number(form.unpaid_amount) : 0,
        unpaid_count: form.unpaid_count ? Number(form.unpaid_count) : 0,
        cooling_off_count: form.cooling_off_count ? Number(form.cooling_off_count) : 0,
        refund_rate: form.refund_rate ? Number(form.refund_rate) : 0,
        refund_amount: form.refund_amount ? Number(form.refund_amount) : 0,
      };

      const res = await fetch("/api/monthly-sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const result = await res.json();

      if (!res.ok) {
        setMessage({ type: "error", text: result.error || "保存に失敗しました" });
        return;
      }

      setMessage({ type: "success", text: "営業月次サマリーを保存しました" });
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
            <h1 className="text-xl font-bold text-gray-900 mt-1">営業月次サマリー入力</h1>
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
                <label className="block text-sm font-medium text-gray-700 mb-1">年月</label>
                <input type="text" name="year_month" value={form.year_month} onChange={handleChange}
                  placeholder="2026-03"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">商品タイプ</label>
                <select name="product_type" value={form.product_type} onChange={handleChange}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                  {PRODUCT_TYPE_OPTIONS.map((o) => <option key={o} value={o}>{o || "-- 選択 --"}</option>)}
                </select>
              </div>
            </div>
          </section>

          {/* 売上 */}
          <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
            <h2 className="text-base font-semibold text-gray-900 mb-4">売上</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">売上合計</label>
                <input type="number" name="total_revenue" value={form.total_revenue} onChange={handleChange}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">着金合計</label>
                <input type="number" name="total_deposit" value={form.total_deposit} onChange={handleChange}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">成約件数</label>
                <input type="number" name="deal_count" value={form.deal_count} onChange={handleChange}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">平均単価</label>
                <input type="number" name="avg_unit_price" value={form.avg_unit_price} onChange={handleChange}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
              </div>
            </div>
          </section>

          {/* 未着金 */}
          <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
            <h2 className="text-base font-semibold text-gray-900 mb-4">未着金</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">保留件数</label>
                <input type="number" name="pending_count" value={form.pending_count} onChange={handleChange}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">未着金額</label>
                <input type="number" name="unpaid_amount" value={form.unpaid_amount} onChange={handleChange}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">未着金件数</label>
                <input type="number" name="unpaid_count" value={form.unpaid_count} onChange={handleChange}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
              </div>
            </div>
          </section>

          {/* 返金 */}
          <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
            <h2 className="text-base font-semibold text-gray-900 mb-4">返金</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">クーリングオフ件数</label>
                <input type="number" name="cooling_off_count" value={form.cooling_off_count} onChange={handleChange}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">返金率</label>
                <input type="number" name="refund_rate" value={form.refund_rate} onChange={handleChange}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">返金額</label>
                <input type="number" name="refund_amount" value={form.refund_amount} onChange={handleChange}
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
            <button
              type="submit"
              disabled={submitting}
              className="px-6 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? "保存中..." : "保存する"}
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}

"use client";

import { useState } from "react";
import Link from "next/link";

const CASE_TYPE_OPTIONS = ["", "consumer_center", "lawyer"];
const STATUS_OPTIONS = ["", "終了", "対応中", "弊社弁護士対応", "合意承認待ち", "要確認"];

interface FormData {
  refund_no: string;
  case_type: string;
  status: string;
  customer_name: string;
  source_name: string;
  company_name: string;
  center_name: string;
  contact_info: string;
  staff_name: string;
  closer_name: string;
  requested_amount: string;
  bank_amount: string;
  credit_amount: string;
  settlement_amount: string;
  installments: string;
  next_payment_date: string;
  handling_fee: string;
  fee_paid: boolean;
  settlement_paid: boolean;
  is_blocked: boolean;
  blocked_amount: string;
  description: string;
  memo: string;
}

const INITIAL_FORM: FormData = {
  refund_no: "",
  case_type: "",
  status: "",
  customer_name: "",
  source_name: "",
  company_name: "",
  center_name: "",
  contact_info: "",
  staff_name: "",
  closer_name: "",
  requested_amount: "",
  bank_amount: "",
  credit_amount: "",
  settlement_amount: "",
  installments: "",
  next_payment_date: "",
  handling_fee: "",
  fee_paid: false,
  settlement_paid: false,
  is_blocked: false,
  blocked_amount: "",
  description: "",
  memo: "",
};

export default function RefundCasesInputPage() {
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
        refund_no: form.refund_no ? Number(form.refund_no) : 0,
        requested_amount: form.requested_amount ? Number(form.requested_amount) : 0,
        bank_amount: form.bank_amount ? Number(form.bank_amount) : 0,
        credit_amount: form.credit_amount ? Number(form.credit_amount) : 0,
        settlement_amount: form.settlement_amount ? Number(form.settlement_amount) : 0,
        installments: form.installments ? Number(form.installments) : 0,
        next_payment_date: form.next_payment_date || null,
        handling_fee: form.handling_fee ? Number(form.handling_fee) : 0,
        blocked_amount: form.blocked_amount ? Number(form.blocked_amount) : 0,
      };

      const res = await fetch("/api/refund-cases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const result = await res.json();

      if (!res.ok) {
        setMessage({ type: "error", text: result.error || "保存に失敗しました" });
        return;
      }

      setMessage({ type: "success", text: "返金・クーリングオフ情報を保存しました" });
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
            <h1 className="text-xl font-bold text-gray-900 mt-1">返金・クーリングオフ入力</h1>
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
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">返金No</label>
                <input type="number" name="refund_no" value={form.refund_no} onChange={handleChange}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">ケースタイプ</label>
                <select name="case_type" value={form.case_type} onChange={handleChange}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                  {CASE_TYPE_OPTIONS.map((o) => <option key={o} value={o}>{o || "-- 選択 --"}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">ステータス</label>
                <select name="status" value={form.status} onChange={handleChange}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                  {STATUS_OPTIONS.map((o) => <option key={o} value={o}>{o || "-- 選択 --"}</option>)}
                </select>
              </div>
            </div>
          </section>

          {/* 相手方 */}
          <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
            <h2 className="text-base font-semibold text-gray-900 mb-4">相手方</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  顧客名<span className="text-red-500">*</span>
                </label>
                <input type="text" name="customer_name" value={form.customer_name} onChange={handleChange} required
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">消費者センター名/弁護士事務所</label>
                <input type="text" name="source_name" value={form.source_name} onChange={handleChange}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">会社名</label>
                <input type="text" name="company_name" value={form.company_name} onChange={handleChange}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">センター名</label>
                <input type="text" name="center_name" value={form.center_name} onChange={handleChange}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">連絡先</label>
                <input type="text" name="contact_info" value={form.contact_info} onChange={handleChange}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
              </div>
            </div>
          </section>

          {/* 担当 */}
          <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
            <h2 className="text-base font-semibold text-gray-900 mb-4">担当</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">担当者名</label>
                <input type="text" name="staff_name" value={form.staff_name} onChange={handleChange}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">クローザー名</label>
                <input type="text" name="closer_name" value={form.closer_name} onChange={handleChange}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
              </div>
            </div>
          </section>

          {/* 金額 */}
          <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
            <h2 className="text-base font-semibold text-gray-900 mb-4">金額</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">請求金額</label>
                <input type="number" name="requested_amount" value={form.requested_amount} onChange={handleChange}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">銀行振込額</label>
                <input type="number" name="bank_amount" value={form.bank_amount} onChange={handleChange}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">クレジット額</label>
                <input type="number" name="credit_amount" value={form.credit_amount} onChange={handleChange}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">和解金額</label>
                <input type="number" name="settlement_amount" value={form.settlement_amount} onChange={handleChange}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">分割回数</label>
                <input type="number" name="installments" value={form.installments} onChange={handleChange}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">次回支払日</label>
                <input type="date" name="next_payment_date" value={form.next_payment_date} onChange={handleChange}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
              </div>
            </div>
          </section>

          {/* 対応費 */}
          <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
            <h2 className="text-base font-semibold text-gray-900 mb-4">対応費</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">対応費</label>
                <input type="number" name="handling_fee" value={form.handling_fee} onChange={handleChange}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
              </div>
              <div className="flex items-center pt-6">
                <input type="checkbox" name="fee_paid" checked={form.fee_paid} onChange={handleChange}
                  className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500" />
                <label className="ml-2 text-sm font-medium text-gray-700">対応費支払済</label>
              </div>
              <div className="flex items-center pt-6">
                <input type="checkbox" name="settlement_paid" checked={form.settlement_paid} onChange={handleChange}
                  className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500" />
                <label className="ml-2 text-sm font-medium text-gray-700">和解金支払済</label>
              </div>
            </div>
          </section>

          {/* 結果 */}
          <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
            <h2 className="text-base font-semibold text-gray-900 mb-4">結果</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex items-center">
                <input type="checkbox" name="is_blocked" checked={form.is_blocked} onChange={handleChange}
                  className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500" />
                <label className="ml-2 text-sm font-medium text-gray-700">返金阻止</label>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">阻止金額</label>
                <input type="number" name="blocked_amount" value={form.blocked_amount} onChange={handleChange}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
              </div>
            </div>
          </section>

          {/* メモ */}
          <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
            <h2 className="text-base font-semibold text-gray-900 mb-4">メモ</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">説明</label>
                <textarea name="description" value={form.description} onChange={handleChange} rows={3}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="案件の説明" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">備考</label>
                <textarea name="memo" value={form.memo} onChange={handleChange} rows={3}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="自由記入" />
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

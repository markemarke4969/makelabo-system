"use client";

import { useState } from "react";
import Link from "next/link";

const RESULT_OPTIONS = ["", "成約", "成約デポ", "成約（未着金）", "不成約", "保留", "キャンセル", "バックレ"];
const SOURCE_OPTIONS = ["", "webinar", "audio", "live", "line", "掘り起こし"];
const PAYMENT_OPTIONS = ["", "bank", "credit", "loan", "deposit"];
const CLOSER_OPTIONS = ["", "西垣", "ケーマ", "粋花", "atto"];
const CHANNEL_OPTIONS = ["", "YouTube", "YT広告", "FB広告", "Instagram", "ブログ", "号外", "公式サイト"];

interface FormData {
  customer_name: string;
  keyword: string;
  keyword_date: string;
  appointment_date: string;
  interview_date: string;
  source: string;
  reservation_status: string;
  interview_result: string;
  deal_amount: string;
  deposit_amount: string;
  payment_method: string;
  closer_name: string;
  channel_name: string;
  trigger_source: string;
  customer_note: string;
  memo: string;
}

const INITIAL_FORM: FormData = {
  customer_name: "",
  keyword: "",
  keyword_date: "",
  appointment_date: "",
  interview_date: "",
  source: "",
  reservation_status: "",
  interview_result: "",
  deal_amount: "",
  deposit_amount: "",
  payment_method: "",
  closer_name: "",
  channel_name: "",
  trigger_source: "",
  customer_note: "",
  memo: "",
};

export default function AppointmentInputPage() {
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
        deal_amount: form.deal_amount ? Number(form.deal_amount) : 0,
        deposit_amount: form.deposit_amount ? Number(form.deposit_amount) : 0,
        keyword_date: form.keyword_date || null,
        appointment_date: form.appointment_date || null,
        interview_date: form.interview_date || null,
      };

      const res = await fetch("/api/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const result = await res.json();

      if (!res.ok) {
        setMessage({ type: "error", text: result.error || "保存に失敗しました" });
        return;
      }

      setMessage({ type: "success", text: "面談記録を保存しました" });
      setForm(INITIAL_FORM);
    } catch {
      setMessage({ type: "error", text: "通信エラーが発生しました" });
    } finally {
      setSubmitting(false);
    }
  }

  const showDealFields = form.interview_result?.includes("成約");

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ヘッダー */}
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div>
            <Link href="/" className="text-sm text-blue-600 hover:underline">← ダッシュボードに戻る</Link>
            <h1 className="text-xl font-bold text-gray-900 mt-1">面談記録入力（ハピネス）</h1>
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
          {/* 顧客情報 */}
          <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
            <h2 className="text-base font-semibold text-gray-900 mb-4">顧客情報</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  顧客名（LINE名）<span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="customer_name"
                  value={form.customer_name}
                  onChange={handleChange}
                  required
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="例: 宮崎明宏"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">送信キーワード</label>
                <input
                  type="text"
                  name="keyword"
                  value={form.keyword}
                  onChange={handleChange}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="例: 穴場"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">KW送信日</label>
                <input type="date" name="keyword_date" value={form.keyword_date} onChange={handleChange}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">流入チャネル</label>
                <select name="channel_name" value={form.channel_name} onChange={handleChange}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                  {CHANNEL_OPTIONS.map((o) => <option key={o} value={o}>{o || "-- 選択 --"}</option>)}
                </select>
              </div>
            </div>
          </section>

          {/* 面談情報 */}
          <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
            <h2 className="text-base font-semibold text-gray-900 mb-4">面談情報</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">面談予約日</label>
                <input type="date" name="appointment_date" value={form.appointment_date} onChange={handleChange}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">面談実施日</label>
                <input type="date" name="interview_date" value={form.interview_date} onChange={handleChange}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">面談きっかけ</label>
                <select name="source" value={form.source} onChange={handleChange}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                  {SOURCE_OPTIONS.map((o) => <option key={o} value={o}>{o || "-- 選択 --"}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">予約ステータス</label>
                <input type="text" name="reservation_status" value={form.reservation_status} onChange={handleChange}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="例: 日程調整中" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">担当クローザー</label>
                <select name="closer_name" value={form.closer_name} onChange={handleChange}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                  {CLOSER_OPTIONS.map((o) => <option key={o} value={o}>{o || "-- 選択 --"}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">面談結果</label>
                <select name="interview_result" value={form.interview_result} onChange={handleChange}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                  {RESULT_OPTIONS.map((o) => <option key={o} value={o}>{o || "-- 選択 --"}</option>)}
                </select>
              </div>
            </div>
          </section>

          {/* 成約情報（結果が成約系の場合のみ表示） */}
          {showDealFields && (
            <section className="bg-white rounded-xl shadow-sm border border-green-200 p-5">
              <h2 className="text-base font-semibold text-green-700 mb-4">成約情報</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">成約金額</label>
                  <input type="number" name="deal_amount" value={form.deal_amount} onChange={handleChange}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500"
                    placeholder="例: 2640000" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">着金額</label>
                  <input type="number" name="deposit_amount" value={form.deposit_amount} onChange={handleChange}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500"
                    placeholder="例: 2640000" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">決済方法</label>
                  <select name="payment_method" value={form.payment_method} onChange={handleChange}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500">
                    {PAYMENT_OPTIONS.map((o) => <option key={o} value={o}>{o || "-- 選択 --"}</option>)}
                  </select>
                </div>
              </div>
            </section>
          )}

          {/* メモ */}
          <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
            <h2 className="text-base font-semibold text-gray-900 mb-4">メモ</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">面談のきっかけ</label>
                <input type="text" name="trigger_source" value={form.trigger_source} onChange={handleChange}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="例: 自動化物販に興味あり" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">顧客の特徴</label>
                <input type="text" name="customer_note" value={form.customer_note} onChange={handleChange}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="例: やる気はあるがお金がない（融資）" />
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

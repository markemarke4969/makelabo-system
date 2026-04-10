"use client";

import { useState } from "react";
import Link from "next/link";

const CHANNEL_OPTIONS = ["", "LINE", "メルマガ"];
const TARGET_SEGMENT_OPTIONS = ["", "全体", "購入者のみ", "DSシナリオのみ"];

interface FormData {
  date: string;
  channel: string;
  delivery_time: string;
  target_segment: string;
  title: string;
  body: string;
  manuscript_url: string;
  is_approved: string;
  send_count: string;
  open_count: string;
  open_rate: string;
  click_count: string;
  click_rate: string;
}

const INITIAL_FORM: FormData = {
  date: "",
  channel: "",
  delivery_time: "",
  target_segment: "",
  title: "",
  body: "",
  manuscript_url: "",
  is_approved: "false",
  send_count: "",
  open_count: "",
  open_rate: "",
  click_count: "",
  click_rate: "",
};

export default function DeliveryContentsInputPage() {
  const [form, setForm] = useState<FormData>(INITIAL_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) {
    const target = e.target;
    if (target instanceof HTMLInputElement && target.type === "checkbox") {
      setForm((prev) => ({ ...prev, [target.name]: target.checked ? "true" : "false" }));
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
        date: form.date || null,
        is_approved: form.is_approved === "true",
        send_count: form.send_count ? Number(form.send_count) : null,
        open_count: form.open_count ? Number(form.open_count) : null,
        open_rate: form.open_rate ? Number(form.open_rate) : null,
        click_count: form.click_count ? Number(form.click_count) : null,
        click_rate: form.click_rate ? Number(form.click_rate) : null,
      };

      const res = await fetch("/api/delivery-contents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const result = await res.json();

      if (!res.ok) {
        setMessage({ type: "error", text: result.error || "保存に失敗しました" });
        return;
      }

      setMessage({ type: "success", text: "配信文面を保存しました" });
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
            <h1 className="text-xl font-bold text-gray-900 mt-1">配信文面入力</h1>
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
                  配信日<span className="text-red-500">*</span>
                </label>
                <input type="date" name="date" value={form.date} onChange={handleChange} required
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  チャネル<span className="text-red-500">*</span>
                </label>
                <select name="channel" value={form.channel} onChange={handleChange} required
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                  {CHANNEL_OPTIONS.map((o) => <option key={o} value={o}>{o || "-- 選択 --"}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">配信時刻</label>
                <input type="text" name="delivery_time" value={form.delivery_time} onChange={handleChange}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">対象セグメント</label>
                <select name="target_segment" value={form.target_segment} onChange={handleChange}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                  {TARGET_SEGMENT_OPTIONS.map((o) => <option key={o} value={o}>{o || "-- 選択 --"}</option>)}
                </select>
              </div>
            </div>
          </section>

          {/* コンテンツ */}
          <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
            <h2 className="text-base font-semibold text-gray-900 mb-4">コンテンツ</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">件名</label>
                <input type="text" name="title" value={form.title} onChange={handleChange}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">本文</label>
                <textarea name="body" value={form.body} onChange={handleChange} rows={5}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">原稿URL</label>
                <input type="text" name="manuscript_url" value={form.manuscript_url} onChange={handleChange}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
              </div>
            </div>
          </section>

          {/* 承認 */}
          <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
            <h2 className="text-base font-semibold text-gray-900 mb-4">承認</h2>
            <div className="flex items-center">
              <input type="checkbox" name="is_approved" checked={form.is_approved === "true"} onChange={handleChange}
                className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500" />
              <label className="ml-2 text-sm font-medium text-gray-700">承認済み</label>
            </div>
          </section>

          {/* 実績 */}
          <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
            <h2 className="text-base font-semibold text-gray-900 mb-4">実績</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">送信数</label>
                <input type="number" name="send_count" value={form.send_count} onChange={handleChange}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">開封数</label>
                <input type="number" name="open_count" value={form.open_count} onChange={handleChange}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">開封率 %</label>
                <input type="number" name="open_rate" value={form.open_rate} onChange={handleChange}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">クリック数</label>
                <input type="number" name="click_count" value={form.click_count} onChange={handleChange}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">クリック率 %</label>
                <input type="number" name="click_rate" value={form.click_rate} onChange={handleChange}
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

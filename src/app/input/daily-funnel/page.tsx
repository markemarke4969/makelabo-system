"use client";

import { useState } from "react";
import Link from "next/link";

const CHANNEL_OPTIONS = ["", "YouTube", "YT広告", "FB広告", "Instagram", "ブログ", "号外", "公式サイト", "TikTok"];
const SCENARIO_OPTIONS = ["", "FE", "DS"];

interface FormData {
  date: string;
  channel_name: string;
  scenario_type: string;
  video1_click: string;
  video2_click: string;
  video3_click: string;
  video4_click: string;
  video5_click: string;
  lp_click: string;
  target_reach: string;
  block_count: string;
  block_rate: string;
  voice_registration: string;
  voice_appointment: string;
}

const INITIAL_FORM: FormData = {
  date: "",
  channel_name: "",
  scenario_type: "",
  video1_click: "",
  video2_click: "",
  video3_click: "",
  video4_click: "",
  video5_click: "",
  lp_click: "",
  target_reach: "",
  block_count: "",
  block_rate: "",
  voice_registration: "",
  voice_appointment: "",
};

export default function DailyFunnelInputPage() {
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
        date: form.date || null,
        video1_click: form.video1_click ? Number(form.video1_click) : 0,
        video2_click: form.video2_click ? Number(form.video2_click) : 0,
        video3_click: form.video3_click ? Number(form.video3_click) : 0,
        video4_click: form.video4_click ? Number(form.video4_click) : 0,
        video5_click: form.video5_click ? Number(form.video5_click) : 0,
        lp_click: form.lp_click ? Number(form.lp_click) : 0,
        target_reach: form.target_reach ? Number(form.target_reach) : 0,
        block_count: form.block_count ? Number(form.block_count) : 0,
        block_rate: form.block_rate ? Number(form.block_rate) : 0,
        voice_registration: form.voice_registration ? Number(form.voice_registration) : 0,
        voice_appointment: form.voice_appointment ? Number(form.voice_appointment) : 0,
      };

      const res = await fetch("/api/daily-funnel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const result = await res.json();

      if (!res.ok) {
        setMessage({ type: "error", text: result.error || "保存に失敗しました" });
        return;
      }

      setMessage({ type: "success", text: "ファネル詳細を保存しました" });
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
            <h1 className="text-xl font-bold text-gray-900 mt-1">ファネル詳細入力（日次）</h1>
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
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  日付<span className="text-red-500">*</span>
                </label>
                <input type="date" name="date" value={form.date} onChange={handleChange} required
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">チャネル</label>
                <select name="channel_name" value={form.channel_name} onChange={handleChange}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                  {CHANNEL_OPTIONS.map((o) => <option key={o} value={o}>{o || "-- 選択 --"}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">シナリオタイプ</label>
                <select name="scenario_type" value={form.scenario_type} onChange={handleChange}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                  {SCENARIO_OPTIONS.map((o) => <option key={o} value={o}>{o || "-- 選択 --"}</option>)}
                </select>
              </div>
            </div>
          </section>

          {/* 動画クリック */}
          <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
            <h2 className="text-base font-semibold text-gray-900 mb-4">動画クリック</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">動画1クリック</label>
                <input type="number" name="video1_click" value={form.video1_click} onChange={handleChange}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">動画2クリック</label>
                <input type="number" name="video2_click" value={form.video2_click} onChange={handleChange}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">動画3クリック</label>
                <input type="number" name="video3_click" value={form.video3_click} onChange={handleChange}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">動画4クリック</label>
                <input type="number" name="video4_click" value={form.video4_click} onChange={handleChange}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">動画5クリック</label>
                <input type="number" name="video5_click" value={form.video5_click} onChange={handleChange}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">LPクリック</label>
                <input type="number" name="lp_click" value={form.lp_click} onChange={handleChange}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
              </div>
            </div>
          </section>

          {/* リーチ */}
          <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
            <h2 className="text-base font-semibold text-gray-900 mb-4">リーチ</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">ターゲットリーチ</label>
                <input type="number" name="target_reach" value={form.target_reach} onChange={handleChange}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">ブロック数</label>
                <input type="number" name="block_count" value={form.block_count} onChange={handleChange}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">ブロック率</label>
                <input type="number" name="block_rate" value={form.block_rate} onChange={handleChange}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
              </div>
            </div>
          </section>

          {/* 音声 */}
          <section className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
            <h2 className="text-base font-semibold text-gray-900 mb-4">音声</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">音声登録数</label>
                <input type="number" name="voice_registration" value={form.voice_registration} onChange={handleChange}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">音声アポ数</label>
                <input type="number" name="voice_appointment" value={form.voice_appointment} onChange={handleChange}
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

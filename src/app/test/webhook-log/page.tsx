"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface WebhookEntry {
  id: string;
  received_at: string;
  raw_data: Record<string, unknown>;
}

export default function WebhookLogPage() {
  const [logs, setLogs] = useState<WebhookEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/test/lpro-webhook/logs");
      const data = await res.json();
      setLogs(data);
    } catch {
      console.error("ログ取得失敗");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  return (
    <div className="min-h-screen bg-[#0f1221] text-white p-6">
      <div className="max-w-5xl mx-auto">
        {/* ヘッダー */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">Webhook受信ログ</h1>
            <p className="text-sm text-gray-400 mt-1">
              Lpro → LINE登録完了時のWebhookデータ
            </p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={fetchLogs}
              className="px-4 py-2 bg-[#4f8ff7] hover:bg-[#3a7ae0] rounded-lg text-sm font-medium transition"
            >
              更新
            </button>
            <Link
              href="/dashboard"
              className="px-4 py-2 bg-[#1e2235] border border-[#2a2f45] hover:bg-[#252a40] rounded-lg text-sm transition"
            >
              ダッシュボードへ
            </Link>
          </div>
        </div>

        {/* テーブル */}
        <div className="bg-[#1a1f3a] border border-[#2a2f45] rounded-xl overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-gray-400">読み込み中...</div>
          ) : logs.length === 0 ? (
            <div className="p-8 text-center text-gray-400">
              受信データがありません
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#2a2f45] text-gray-400 text-left">
                  <th className="px-4 py-3 w-12">#</th>
                  <th className="px-4 py-3">受信日時</th>
                  <th className="px-4 py-3">データ概要</th>
                  <th className="px-4 py-3 w-20">操作</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log, i) => (
                  <tr
                    key={log.id}
                    className="border-b border-[#2a2f45] hover:bg-[#1e2540] transition"
                  >
                    <td className="px-4 py-3 text-gray-500">{i + 1}</td>
                    <td className="px-4 py-3 text-gray-300 whitespace-nowrap">
                      {new Date(log.received_at).toLocaleString("ja-JP")}
                    </td>
                    <td className="px-4 py-3">
                      {expanded === log.id ? (
                        <pre className="text-xs text-gray-300 bg-[#0f1221] rounded-lg p-3 overflow-x-auto whitespace-pre-wrap">
                          {JSON.stringify(log.raw_data, null, 2)}
                        </pre>
                      ) : (
                        <span className="text-gray-400 truncate block max-w-md">
                          {JSON.stringify(log.raw_data).slice(0, 100)}
                          {JSON.stringify(log.raw_data).length > 100 && "..."}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() =>
                          setExpanded(expanded === log.id ? null : log.id)
                        }
                        className="text-[#4f8ff7] hover:text-[#3a7ae0] text-xs"
                      >
                        {expanded === log.id ? "閉じる" : "詳細"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* 件数 */}
        {!loading && logs.length > 0 && (
          <p className="text-xs text-gray-500 mt-3 text-right">
            全 {logs.length} 件
          </p>
        )}
      </div>
    </div>
  );
}

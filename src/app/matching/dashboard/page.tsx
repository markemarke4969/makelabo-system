"use client";

import { useState, useEffect, useCallback } from "react";
import { MATCHING_TYPES, PRODUCTS } from "@/lib/matching-diagnosis";

interface Consultation {
  id: string;
  preferred_date: string;
  preferred_time: string;
  contact_method: string;
  status: string;
  closer_notes: string | null;
}

interface Diagnosis {
  id: string;
  name: string | null;
  birthday: string | null;
  type_id: string;
  scores: Record<string, number>;
  top_products: string[];
  consultation_status: string;
  assigned_closer: string | null;
  created_at: string;
  matching_consultations: Consultation[];
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending: { label: "未予約", color: "text-gray-400 bg-gray-500/10 border-gray-500/20" },
  booked: { label: "予約済", color: "text-blue-400 bg-blue-500/10 border-blue-500/20" },
  done: { label: "対応済", color: "text-green-400 bg-green-500/10 border-green-500/20" },
  cancelled: { label: "キャンセル", color: "text-red-400 bg-red-500/10 border-red-500/20" },
};

const CLOSERS = ["霧雨", "未割当"];

export default function MatchingDashboard() {
  const [diagnoses, setDiagnoses] = useState<Diagnosis[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    const params = new URLSearchParams();
    if (filterStatus) params.set("status", filterStatus);
    params.set("limit", "100");
    const resp = await fetch(`/api/matching/diagnoses?${params}`);
    if (resp.ok) {
      setDiagnoses(await resp.json());
    }
    setLoading(false);
  }, [filterStatus]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const getType = (typeId: string) =>
    MATCHING_TYPES.find((t) => t.id === typeId);
  const getProduct = (pid: string) =>
    PRODUCTS.find((p) => p.id === pid);

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
  };

  const formatConsultationDate = (date: string, time: string) => {
    const d = new Date(date + "T00:00:00");
    const weekdays = ["日", "月", "火", "水", "木", "金", "土"];
    return `${d.getMonth() + 1}/${d.getDate()}（${weekdays[d.getDay()]}）${time}`;
  };

  const selected = diagnoses.find((d) => d.id === selectedId);

  // 集計
  const totalCount = diagnoses.length;
  const bookedCount = diagnoses.filter((d) => d.consultation_status === "booked").length;
  const doneCount = diagnoses.filter((d) => d.consultation_status === "done").length;

  return (
    <div className="min-h-screen bg-slate-950 text-gray-100">
      {/* ヘッダー */}
      <div className="border-b border-white/10 px-6 py-4">
        <h1 className="text-xl font-bold text-white">
          副業マッチング診断 管理画面
        </h1>
        <p className="text-sm text-gray-400 mt-1">
          クローザー用ダッシュボード
        </p>
      </div>

      <div className="px-6 py-6">
        {/* 集計カード */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          {[
            { label: "診断数", value: totalCount, color: "text-white" },
            { label: "予約済", value: bookedCount, color: "text-blue-400" },
            { label: "対応済", value: doneCount, color: "text-green-400" },
          ].map((stat) => (
            <div
              key={stat.label}
              className="rounded-xl bg-white/5 border border-white/10 p-4 text-center"
            >
              <p className="text-xs text-gray-400 mb-1">{stat.label}</p>
              <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
            </div>
          ))}
        </div>

        {/* フィルター */}
        <div className="flex gap-2 mb-4 overflow-x-auto">
          {[
            { value: "", label: "すべて" },
            { value: "pending", label: "未予約" },
            { value: "booked", label: "予約済" },
            { value: "done", label: "対応済" },
          ].map((f) => (
            <button
              key={f.value}
              onClick={() => setFilterStatus(f.value)}
              className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${
                filterStatus === f.value
                  ? "bg-blue-500 text-white"
                  : "bg-white/5 border border-white/10 text-gray-400 hover:text-white"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="text-center py-20">
            <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-gray-400">読み込み中...</p>
          </div>
        ) : diagnoses.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-gray-500">まだ診断データがありません</p>
          </div>
        ) : (
          <div className="flex gap-6">
            {/* 一覧 */}
            <div className="flex-1 space-y-2">
              {diagnoses.map((d) => {
                const type = getType(d.type_id);
                const status = STATUS_LABELS[d.consultation_status] || STATUS_LABELS.pending;
                const consultation = d.matching_consultations?.[0];

                return (
                  <button
                    key={d.id}
                    onClick={() => setSelectedId(d.id)}
                    className={`w-full text-left p-4 rounded-xl border transition-all ${
                      selectedId === d.id
                        ? "bg-blue-500/10 border-blue-500/30"
                        : "bg-white/5 border-white/10 hover:bg-white/8"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">{type?.emoji}</span>
                        <span className="font-bold text-white text-sm">
                          {d.name || "名前なし"}
                        </span>
                      </div>
                      <span
                        className={`px-2 py-0.5 rounded-full text-xs font-medium border ${status.color}`}
                      >
                        {status.label}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-gray-400">
                      <span>{type?.name}</span>
                      <span>|</span>
                      <span>{formatDate(d.created_at)}</span>
                      {consultation && (
                        <>
                          <span>|</span>
                          <span className="text-blue-400">
                            面談: {formatConsultationDate(consultation.preferred_date, consultation.preferred_time)}
                          </span>
                        </>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* 詳細パネル */}
            {selected && (
              <div className="w-96 flex-shrink-0 rounded-xl bg-white/5 border border-white/10 p-6 sticky top-6 self-start">
                <div className="text-center mb-5">
                  <span className="text-4xl">{getType(selected.type_id)?.emoji}</span>
                  <h2 className="text-lg font-bold text-white mt-2">
                    {selected.name || "名前なし"}
                  </h2>
                  <p className="text-sm text-gray-400">
                    {getType(selected.type_id)?.name}
                  </p>
                  {selected.birthday && (
                    <p className="text-xs text-gray-500 mt-1">
                      生年月日: {selected.birthday}
                    </p>
                  )}
                </div>

                {/* おすすめ商材 */}
                <div className="mb-4">
                  <p className="text-xs font-medium text-gray-400 mb-2">
                    おすすめ商材
                  </p>
                  <div className="space-y-1">
                    {selected.top_products.map((pid, i) => {
                      const product = getProduct(pid);
                      return product ? (
                        <div
                          key={pid}
                          className="flex items-center gap-2 text-sm"
                        >
                          <span className="text-blue-400 font-bold">
                            {i + 1}.
                          </span>
                          <span className="text-gray-200">{product.name}</span>
                        </div>
                      ) : null;
                    })}
                  </div>
                </div>

                {/* スコア */}
                <div className="mb-4">
                  <p className="text-xs font-medium text-gray-400 mb-2">
                    適性スコア
                  </p>
                  <div className="space-y-1.5">
                    {Object.entries(selected.scores)
                      .sort(([, a], [, b]) => b - a)
                      .map(([pid, score]) => {
                        const product = getProduct(pid);
                        const maxS = Math.max(...Object.values(selected.scores));
                        return (
                          <div key={pid}>
                            <div className="flex justify-between text-xs mb-0.5">
                              <span className="text-gray-300">
                                {product?.name || pid}
                              </span>
                              <span className="text-gray-500">{score}</span>
                            </div>
                            <div className="h-1.5 bg-white/10 rounded-full">
                              <div
                                className="h-full rounded-full bg-blue-500"
                                style={{
                                  width: `${(score / maxS) * 100}%`,
                                }}
                              />
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>

                {/* 面談予約情報 */}
                {selected.matching_consultations?.[0] && (
                  <div className="mb-4 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
                    <p className="text-xs font-medium text-blue-400 mb-1">
                      面談予約
                    </p>
                    <p className="text-sm text-white font-medium">
                      {formatConsultationDate(
                        selected.matching_consultations[0].preferred_date,
                        selected.matching_consultations[0].preferred_time,
                      )}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">
                      方法:{" "}
                      {selected.matching_consultations[0].contact_method === "phone"
                        ? "電話"
                        : selected.matching_consultations[0].contact_method === "zoom"
                          ? "Zoom"
                          : "LINE通話"}
                    </p>
                  </div>
                )}

                {/* クローザー割り当て */}
                <div>
                  <p className="text-xs font-medium text-gray-400 mb-2">
                    対応者
                  </p>
                  <select
                    value={selected.assigned_closer || ""}
                    onChange={async (e) => {
                      const closer = e.target.value || null;
                      // UIを即時更新
                      setDiagnoses((prev) =>
                        prev.map((d) =>
                          d.id === selected.id
                            ? { ...d, assigned_closer: closer }
                            : d,
                        ),
                      );
                      // DB更新（API経由ではなく直接fetchでPATCH相当）
                      await fetch("/api/matching/diagnoses", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          _action: "assign_closer",
                          diagnosisId: selected.id,
                          closer,
                        }),
                      });
                    }}
                    className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/15 text-white text-sm focus:outline-none focus:border-blue-500/50"
                  >
                    <option value="" className="bg-slate-800">
                      未割当
                    </option>
                    {CLOSERS.filter((c) => c !== "未割当").map((c) => (
                      <option key={c} value={c} className="bg-slate-800">
                        {c}
                      </option>
                    ))}
                  </select>
                </div>

                {/* ステータス変更 */}
                <div className="mt-3">
                  <p className="text-xs font-medium text-gray-400 mb-2">
                    ステータス
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {Object.entries(STATUS_LABELS).map(([key, { label }]) => (
                      <button
                        key={key}
                        onClick={async () => {
                          setDiagnoses((prev) =>
                            prev.map((d) =>
                              d.id === selected.id
                                ? { ...d, consultation_status: key }
                                : d,
                            ),
                          );
                          await fetch("/api/matching/diagnoses", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              _action: "update_status",
                              diagnosisId: selected.id,
                              status: key,
                            }),
                          });
                        }}
                        className={`py-2 rounded-lg text-xs font-medium transition-all ${
                          selected.consultation_status === key
                            ? "bg-blue-500 text-white"
                            : "bg-white/5 border border-white/10 text-gray-400 hover:text-white"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

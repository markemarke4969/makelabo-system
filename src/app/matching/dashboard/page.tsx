"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { MATCHING_TYPES } from "@/lib/matching-diagnosis";
import { fetchClosers, type Closer } from "@/lib/matching-closers";
import DetailPanel, {
  type Diagnosis,
  type ClosingDraft,
  type SurveyInfoResp,
} from "./_components/DetailPanel";

const EMPTY_CLOSING_DRAFT: ClosingDraft = {
  meetingDate: "",
  meetingTime: "",
  closingAmount: "",
  closingProduct: "",
  closerMemo: "",
};

function diagnosisToDraft(d: Diagnosis): ClosingDraft {
  return {
    meetingDate: d.meeting_date ?? "",
    meetingTime: d.meeting_time ?? "",
    closingAmount:
      d.closing_amount === null || d.closing_amount === undefined
        ? ""
        : String(d.closing_amount),
    closingProduct: d.closing_product ?? "",
    closerMemo: d.closer_memo ?? "",
  };
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending: { label: "未対応", color: "text-gray-400 bg-gray-500/10 border-gray-500/20" },
  booked: { label: "商談中", color: "text-blue-400 bg-blue-500/10 border-blue-500/20" },
  closed: { label: "成約", color: "text-green-400 bg-green-500/10 border-green-500/20" },
  lost: { label: "失注", color: "text-red-400 bg-red-500/10 border-red-500/20" },
  on_hold: { label: "保留", color: "text-amber-400 bg-amber-500/10 border-amber-500/20" },
  done: { label: "対応済", color: "text-green-400 bg-green-500/10 border-green-500/20" },
  cancelled: { label: "キャンセル", color: "text-gray-500 bg-gray-700/20 border-gray-600/30" },
};

const STATUS_FILTERS: { value: string; label: string }[] = [
  { value: "", label: "すべて" },
  { value: "pending", label: "未対応" },
  { value: "booked", label: "商談中" },
  { value: "closed", label: "成約" },
  { value: "lost", label: "失注" },
  { value: "on_hold", label: "保留" },
];

function formatListDate(iso: string) {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function formatConsultationDate(date: string, time: string) {
  const d = new Date(date + "T00:00:00");
  const weekdays = ["日", "月", "火", "水", "木", "金", "土"];
  return `${d.getMonth() + 1}/${d.getDate()}（${weekdays[d.getDay()]}）${time}`;
}

// 期間判定:本日 / 今週(月曜始まり)
function isToday(iso: string): boolean {
  const d = new Date(iso);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

function startOfWeek(now: Date): Date {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay(); // 0=日 1=月 ... 6=土
  const diff = day === 0 ? -6 : 1 - day; // 月曜始まり
  d.setDate(d.getDate() + diff);
  return d;
}

function isThisWeek(iso: string): boolean {
  const d = new Date(iso);
  const now = new Date();
  const ws = startOfWeek(now);
  const we = new Date(ws);
  we.setDate(we.getDate() + 7);
  return d >= ws && d < we;
}

function isLastWeek(iso: string): boolean {
  const d = new Date(iso);
  const now = new Date();
  const ws = startOfWeek(now);
  const lws = new Date(ws);
  lws.setDate(lws.getDate() - 7);
  return d >= lws && d < ws;
}

export default function MatchingDashboard() {
  const [diagnoses, setDiagnoses] = useState<Diagnosis[]>([]);
  const [closers, setClosers] = useState<Closer[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [surveyInfo, setSurveyInfo] = useState<SurveyInfoResp | null>(null);
  const [surveyLoading, setSurveyLoading] = useState(false);
  const [closingDraft, setClosingDraft] = useState<ClosingDraft>(EMPTY_CLOSING_DRAFT);
  const [closingSaving, setClosingSaving] = useState(false);
  const [toast, setToast] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

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

  // クローザー一覧:初回マウント時のみ
  useEffect(() => {
    (async () => {
      const list = await fetchClosers();
      setClosers(list);
    })();
  }, []);

  // 詳細パネル展開時のみ電話番号 lazy fetch
  useEffect(() => {
    if (!selectedId) {
      setSurveyInfo(null);
      return;
    }
    let cancelled = false;
    setSurveyInfo(null);
    setSurveyLoading(true);
    (async () => {
      try {
        const resp = await fetch(
          `/api/matching/diagnoses/${selectedId}/survey-info`,
        );
        const json = (await resp.json()) as SurveyInfoResp;
        if (!cancelled) setSurveyInfo(json);
      } catch (e) {
        if (!cancelled)
          setSurveyInfo({
            status: "error",
            message: e instanceof Error ? e.message : "fetch failed",
          });
      } finally {
        if (!cancelled) setSurveyLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  // 詳細パネル切替時に編集中ドラフトを selected の値で初期化
  useEffect(() => {
    if (!selectedId) {
      setClosingDraft(EMPTY_CLOSING_DRAFT);
      return;
    }
    const target = diagnoses.find((d) => d.id === selectedId);
    if (target) {
      setClosingDraft(diagnosisToDraft(target));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  // トースト自動消去
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2800);
    return () => clearTimeout(t);
  }, [toast]);

  const getType = (typeId: string) =>
    MATCHING_TYPES.find((t) => t.id === typeId);

  const selected = diagnoses.find((d) => d.id === selectedId);

  // KPI 集計(5 枚)
  const kpis = useMemo(() => {
    const totalCount = diagnoses.length;
    const todayCount = diagnoses.filter((d) => isToday(d.created_at)).length;
    const thisWeekCount = diagnoses.filter((d) => isThisWeek(d.created_at)).length;
    const lastWeekCount = diagnoses.filter((d) => isLastWeek(d.created_at)).length;
    const weekDiff = thisWeekCount - lastWeekCount;
    const bookedCount = diagnoses.filter(
      (d) => d.consultation_status === "booked",
    ).length;
    const closedCount = diagnoses.filter(
      (d) =>
        d.consultation_status === "closed" ||
        d.consultation_status === "done",
    ).length;
    return {
      totalCount,
      todayCount,
      thisWeekCount,
      bookedCount,
      closedCount,
      weekDiff,
    };
  }, [diagnoses]);

  // ── ハンドラ(楽観的 UI 更新 + DB PATCH) ──────────────
  const handleAssignCloser = useCallback(
    async (closer: string | null) => {
      if (!selected) return;
      setDiagnoses((prev) =>
        prev.map((d) =>
          d.id === selected.id ? { ...d, assigned_closer: closer } : d,
        ),
      );
      await fetch("/api/matching/diagnoses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          _action: "assign_closer",
          diagnosisId: selected.id,
          closer,
        }),
      });
    },
    [selected],
  );

  const handleUpdateStatus = useCallback(
    async (status: string) => {
      if (!selected) return;
      setDiagnoses((prev) =>
        prev.map((d) =>
          d.id === selected.id ? { ...d, consultation_status: status } : d,
        ),
      );
      await fetch("/api/matching/diagnoses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          _action: "update_status",
          diagnosisId: selected.id,
          status,
        }),
      });
    },
    [selected],
  );

  const handleSaveClosing = useCallback(async () => {
    if (!selected) return;
    setClosingSaving(true);
    try {
      const resp = await fetch("/api/matching/diagnoses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          _action: "update_closing",
          diagnosisId: selected.id,
          status: selected.consultation_status,
          meetingDate: closingDraft.meetingDate || null,
          meetingTime: closingDraft.meetingTime || null,
          closingAmount: closingDraft.closingAmount || null,
          closingProduct: closingDraft.closingProduct || null,
          closerMemo: closingDraft.closerMemo || null,
        }),
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        setToast({
          kind: "err",
          text: `保存失敗: ${err.error ?? resp.status}`,
        });
        return;
      }
      const amountNum = closingDraft.closingAmount
        ? Number(closingDraft.closingAmount)
        : null;
      setDiagnoses((prev) =>
        prev.map((d) =>
          d.id === selected.id
            ? {
                ...d,
                meeting_date: closingDraft.meetingDate || null,
                meeting_time: closingDraft.meetingTime || null,
                closing_amount:
                  amountNum !== null && Number.isFinite(amountNum)
                    ? amountNum
                    : null,
                closing_product: closingDraft.closingProduct || null,
                closer_memo: closingDraft.closerMemo || null,
              }
            : d,
        ),
      );
      setToast({ kind: "ok", text: "保存しました" });
      fetchData();
    } catch (e) {
      setToast({
        kind: "err",
        text: `保存エラー: ${e instanceof Error ? e.message : String(e)}`,
      });
    } finally {
      setClosingSaving(false);
    }
  }, [selected, closingDraft, fetchData]);

  return (
    <div className="min-h-screen bg-slate-950 text-gray-100">
      {/* ヘッダー */}
      <div className="border-b border-white/10 px-4 md:px-6 py-4">
        <h1 className="text-xl font-bold text-white">
          副業マッチング診断 管理画面
        </h1>
        <p className="text-sm text-gray-400 mt-1">クローザー用ダッシュボード</p>
      </div>

      <div className="px-4 md:px-6 py-6">
        {/* KPI 5 枚(モバイル 2 列 / md 以上 5 列) */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 md:gap-4 mb-6">
          {[
            {
              label: "診断数",
              value: kpis.totalCount,
              sub: null,
              color: "text-white",
            },
            {
              label: "本日 新規",
              value: kpis.todayCount,
              sub: null,
              color: "text-cyan-300",
            },
            {
              label: "今週 新規",
              value: kpis.thisWeekCount,
              sub:
                kpis.weekDiff === 0
                  ? "→ 0"
                  : kpis.weekDiff > 0
                    ? `↑ +${kpis.weekDiff}`
                    : `↓ ${kpis.weekDiff}`,
              color: "text-cyan-200",
            },
            {
              label: "商談中",
              value: kpis.bookedCount,
              sub: null,
              color: "text-blue-400",
            },
            {
              label: "成約",
              value: kpis.closedCount,
              sub: null,
              color: "text-green-400",
            },
          ].map((stat) => (
            <div
              key={stat.label}
              className="rounded-xl bg-white/5 border border-white/10 p-4 text-center"
            >
              <p className="text-xs text-gray-400 mb-1">{stat.label}</p>
              <p className={`text-3xl font-bold ${stat.color}`}>{stat.value}</p>
              {stat.sub !== null && (
                <p className="text-xs text-gray-500 mt-1">
                  前週比 {stat.sub}
                </p>
              )}
            </div>
          ))}
        </div>

        {/* フィルター */}
        <div className="flex gap-2 mb-4 overflow-x-auto">
          {STATUS_FILTERS.map((f) => (
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
            <div className="flex-1 min-w-0 space-y-2">
              {diagnoses.map((d) => {
                const type = getType(d.type_id);
                const status =
                  STATUS_LABELS[d.consultation_status] ||
                  STATUS_LABELS.pending;
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
                    <div className="flex items-center justify-between mb-2 gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-lg">{type?.emoji}</span>
                        <span className="font-bold text-white text-sm truncate">
                          {d.name || "名前なし"}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border ${status.color}`}
                        >
                          <span className="text-[8px]">●</span>
                          {status.label}
                        </span>
                        {/* 面談ステータスバッジ枠(PR#3-E で実値化) */}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-gray-400 flex-wrap">
                      <span>{type?.name}</span>
                      <span className="opacity-50">|</span>
                      <span>{formatListDate(d.created_at)}</span>
                      {consultation && (
                        <>
                          <span className="opacity-50">|</span>
                          <span className="text-blue-400">
                            面談:{" "}
                            {formatConsultationDate(
                              consultation.preferred_date,
                              consultation.preferred_time,
                            )}
                          </span>
                        </>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* 詳細パネル(デスクトップのみ sticky 右) */}
            {selected && (
              <div className="hidden md:block w-[28rem] lg:w-[32rem] flex-shrink-0 rounded-xl bg-white/5 border border-white/10 sticky top-6 self-start max-h-[calc(100vh-3rem)] overflow-y-auto">
                <DetailPanel
                  key={selected.id}
                  selected={selected}
                  surveyInfo={surveyInfo}
                  surveyLoading={surveyLoading}
                  closingDraft={closingDraft}
                  setClosingDraft={setClosingDraft}
                  closingSaving={closingSaving}
                  closers={closers}
                  onAssignCloser={handleAssignCloser}
                  onUpdateStatus={handleUpdateStatus}
                  onSaveClosing={handleSaveClosing}
                />
              </div>
            )}
          </div>
        )}
      </div>

      {/* スマホ:ボトムシート(md 未満のみ) */}
      {selected && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-black/60"
          onClick={() => setSelectedId(null)}
        >
          <div
            className="fixed inset-x-0 bottom-0 h-[90vh] bg-slate-900 rounded-t-2xl overflow-y-auto border-t border-white/10"
            style={{
              overscrollBehavior: "contain",
              touchAction: "pan-y",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 z-10 flex justify-center py-2 bg-slate-900 border-b border-white/10">
              <span className="block w-10 h-1 rounded-full bg-white/20" />
            </div>
            <DetailPanel
              key={selected.id}
              selected={selected}
              surveyInfo={surveyInfo}
              surveyLoading={surveyLoading}
              closingDraft={closingDraft}
              setClosingDraft={setClosingDraft}
              closingSaving={closingSaving}
              closers={closers}
              onAssignCloser={handleAssignCloser}
              onUpdateStatus={handleUpdateStatus}
              onSaveClosing={handleSaveClosing}
              isMobile
              onClose={() => setSelectedId(null)}
            />
          </div>
        </div>
      )}

      {/* トースト */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 px-4 py-3 rounded-lg shadow-lg text-sm font-medium z-50 ${
            toast.kind === "ok"
              ? "bg-green-500 text-white"
              : "bg-red-500 text-white"
          }`}
        >
          {toast.text}
        </div>
      )}
    </div>
  );
}

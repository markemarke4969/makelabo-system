"use client";

import { useState, useEffect, useCallback } from "react";
import {
  MATCHING_TYPES,
  MATCHING_QUESTIONS,
} from "@/lib/matching-diagnosis";

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
  answers: string[] | null;
  gender: string | null;
  age_group: string | null;
  family_status: string | null;
  consultation_status: string;
  assigned_closer: string | null;
  created_at: string;
  ai_strength_section: string | null;
  ai_animal_section: string | null;
  ai_risk_section: string | null;
  ai_generation_status: "pending" | "ready" | "failed" | null;
  ai_retry_count: number | null;
  // PR#3-B 成約管理 5 列
  meeting_date: string | null;
  meeting_time: string | null;
  closing_amount: number | null;
  closing_product: string | null;
  closer_memo: string | null;
  matching_consultations: Consultation[];
}

interface ClosingDraft {
  meetingDate: string;
  meetingTime: string;
  closingAmount: string;
  closingProduct: string;
  closerMemo: string;
}

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

function formatAmountWithComma(raw: string): string {
  if (!raw) return "";
  const n = Number(raw.replace(/,/g, ""));
  if (!Number.isFinite(n)) return raw;
  return n.toLocaleString("ja-JP");
}

type SurveyInfoResp =
  | { status: "found"; phone: string; answered_at: string | null }
  | { status: "not_responded" }
  | { status: "not_found_survey" }
  | { status: "no_follower" }
  | { status: "error"; message: string };

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending: { label: "未対応", color: "text-gray-400 bg-gray-500/10 border-gray-500/20" },
  booked: { label: "商談中", color: "text-blue-400 bg-blue-500/10 border-blue-500/20" },
  closed: { label: "成約", color: "text-green-400 bg-green-500/10 border-green-500/20" },
  lost: { label: "失注", color: "text-red-400 bg-red-500/10 border-red-500/20" },
  on_hold: { label: "保留", color: "text-amber-400 bg-amber-500/10 border-amber-500/20" },
  // 後方互換(旧 'done' データが残っていた場合の表示用。新規 UI のステータス変更ボタンには含めない)
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

// ステータス変更ボタン群(キャンセルは PR#3-A スコープ外で非表示)
const STATUS_BUTTONS: { value: string; label: string }[] = [
  { value: "pending", label: "未対応" },
  { value: "booked", label: "商談中" },
  { value: "closed", label: "成約" },
  { value: "lost", label: "失注" },
  { value: "on_hold", label: "保留" },
];

const GENDER_LABELS: Record<string, string> = {
  male: "男性",
  female: "女性",
};

const FAMILY_LABELS: Record<string, string> = {
  single: "独身",
  married_no_kids: "既婚(子供なし)",
  married_with_kids: "既婚(子供あり)",
  single_with_kids: "シングル(子供あり)",
};

const CLOSERS = ["霧雨", "未割当"];

export default function MatchingDashboard() {
  const [diagnoses, setDiagnoses] = useState<Diagnosis[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [surveyInfo, setSurveyInfo] = useState<SurveyInfoResp | null>(null);
  const [surveyLoading, setSurveyLoading] = useState(false);
  const [closingDraft, setClosingDraft] =
    useState<ClosingDraft>(EMPTY_CLOSING_DRAFT);
  const [closingSaving, setClosingSaving] = useState(false);
  const [toast, setToast] = useState<{
    kind: "ok" | "err";
    text: string;
  } | null>(null);
  const [amountFocused, setAmountFocused] = useState(false);

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
  // (diagnoses の他列が optimistic update されても入力中の draft を上書きしないよう
  //  依存配列は selectedId のみ。fetch 後の再選択時は最新値で開く)
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

  // トーストの自動消去
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2800);
    return () => clearTimeout(t);
  }, [toast]);

  const getType = (typeId: string) =>
    MATCHING_TYPES.find((t) => t.id === typeId);

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

  // 集計(新ステータス体系。'closed' を成約として扱う)
  const totalCount = diagnoses.length;
  const bookedCount = diagnoses.filter((d) => d.consultation_status === "booked").length;
  const closedCount = diagnoses.filter(
    (d) => d.consultation_status === "closed" || d.consultation_status === "done",
  ).length;

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
            { label: "商談中", value: bookedCount, color: "text-blue-400" },
            { label: "成約", value: closedCount, color: "text-green-400" },
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
              <div className="w-[28rem] md:w-[32rem] flex-shrink-0 rounded-xl bg-white/5 border border-white/10 p-6 sticky top-6 self-start max-h-[calc(100vh-3rem)] overflow-y-auto">
                <div className="text-center mb-5">
                  <span className="text-4xl">{getType(selected.type_id)?.emoji}</span>
                  <h2 className="text-lg font-bold text-white mt-2">
                    {selected.name || "名前なし"}
                  </h2>
                  <p className="text-sm text-gray-400">
                    {getType(selected.type_id)?.name}
                  </p>
                </div>

                {/* 電話番号 */}
                <div className="mb-4 p-3 rounded-lg bg-white/5 border border-white/10">
                  <p className="text-xs font-medium text-gray-400 mb-1">電話番号</p>
                  {surveyLoading || surveyInfo === null ? (
                    <p className="text-sm text-gray-500">取得中...</p>
                  ) : surveyInfo.status === "found" ? (
                    <p className="text-base text-white font-mono tracking-wider">
                      {surveyInfo.phone}
                    </p>
                  ) : surveyInfo.status === "not_responded" ? (
                    <p className="text-sm text-amber-400">
                      アンケート未回答(LINE 友だち追加済・電話番号入力待ち)
                    </p>
                  ) : surveyInfo.status === "not_found_survey" ? (
                    <p className="text-sm text-gray-500">
                      アンケート未設定(line 管理画面で survey 作成後に表示)
                    </p>
                  ) : surveyInfo.status === "no_follower" ? (
                    <p className="text-sm text-gray-500">
                      LINE 友だち追加なし(中継 URL 未経由 or 未登録)
                    </p>
                  ) : (
                    <p className="text-sm text-red-400">
                      取得エラー: {surveyInfo.message}
                    </p>
                  )}
                </div>

                {/* 基本情報 */}
                <details open className="mb-4 group">
                  <summary className="cursor-pointer text-xs font-medium text-gray-400 mb-2 hover:text-white">
                    基本情報
                  </summary>
                  <dl className="text-sm space-y-1 mt-2">
                    <div className="flex gap-2">
                      <dt className="text-gray-500 w-24 flex-shrink-0">氏名</dt>
                      <dd className="text-gray-200">{selected.name || "—"}</dd>
                    </div>
                    <div className="flex gap-2">
                      <dt className="text-gray-500 w-24 flex-shrink-0">生年月日</dt>
                      <dd className="text-gray-200">{selected.birthday || "—"}</dd>
                    </div>
                    <div className="flex gap-2">
                      <dt className="text-gray-500 w-24 flex-shrink-0">性別</dt>
                      <dd className="text-gray-200">
                        {selected.gender ? GENDER_LABELS[selected.gender] ?? selected.gender : "—"}
                      </dd>
                    </div>
                    <div className="flex gap-2">
                      <dt className="text-gray-500 w-24 flex-shrink-0">年代</dt>
                      <dd className="text-gray-200">{selected.age_group || "—"}</dd>
                    </div>
                    <div className="flex gap-2">
                      <dt className="text-gray-500 w-24 flex-shrink-0">家族構成</dt>
                      <dd className="text-gray-200">
                        {selected.family_status
                          ? FAMILY_LABELS[selected.family_status] ?? selected.family_status
                          : "—"}
                      </dd>
                    </div>
                  </dl>
                </details>

                {/* AI セクション(3 ブロック) */}
                <div className="mb-4">
                  <p className="text-xs font-medium text-gray-400 mb-2">AI 生成セクション</p>
                  {selected.ai_generation_status === "ready" ? (
                    <div className="space-y-2">
                      {[
                        { label: "強み", body: selected.ai_strength_section },
                        { label: "動物占い", body: selected.ai_animal_section },
                        { label: "リスク", body: selected.ai_risk_section },
                      ].map((s) => (
                        <details
                          key={s.label}
                          open
                          className="rounded-lg bg-white/5 border border-white/10"
                        >
                          <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-blue-300 hover:text-blue-200">
                            {s.label}
                          </summary>
                          <div className="px-3 pb-3 pt-1 text-sm text-gray-200 whitespace-pre-wrap leading-relaxed">
                            {s.body || "(空)"}
                          </div>
                        </details>
                      ))}
                    </div>
                  ) : selected.ai_generation_status === "failed" ? (
                    <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-sm text-red-300">
                      AI 生成失敗(再試行 {selected.ai_retry_count ?? 0}/5 回到達・自動再試行打ち切り)
                    </div>
                  ) : (
                    <div className="p-3 rounded-lg bg-white/5 border border-white/10 text-sm text-gray-400">
                      AI 生成中(再試行 {selected.ai_retry_count ?? 0}/5 回目)
                    </div>
                  )}
                </div>

                {/* 12 問回答 */}
                <details className="mb-4 group">
                  <summary className="cursor-pointer text-xs font-medium text-gray-400 mb-2 hover:text-white">
                    12 問回答
                  </summary>
                  <dl className="mt-2 space-y-2">
                    {MATCHING_QUESTIONS.map((q, i) => {
                      const ans = selected.answers?.[i];
                      const label =
                        ans !== undefined
                          ? q.options.find((o) => o.value === ans)?.label ?? `(${ans})`
                          : "未回答";
                      return (
                        <div
                          key={q.id}
                          className="border-l-2 border-white/10 pl-3"
                        >
                          <dt className="text-xs text-gray-500">
                            Q{q.id}. {q.question}
                          </dt>
                          <dd className="text-sm text-gray-200 mt-0.5">→ {label}</dd>
                        </div>
                      );
                    })}
                  </dl>
                </details>

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
                  <div className="grid grid-cols-3 gap-2">
                    {STATUS_BUTTONS.map(({ value, label }) => (
                      <button
                        key={value}
                        onClick={async () => {
                          setDiagnoses((prev) =>
                            prev.map((d) =>
                              d.id === selected.id
                                ? { ...d, consultation_status: value }
                                : d,
                            ),
                          );
                          await fetch("/api/matching/diagnoses", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              _action: "update_status",
                              diagnosisId: selected.id,
                              status: value,
                            }),
                          });
                        }}
                        className={`py-2 rounded-lg text-xs font-medium transition-all ${
                          selected.consultation_status === value
                            ? "bg-blue-500 text-white"
                            : "bg-white/5 border border-white/10 text-gray-400 hover:text-white"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 成約管理(PR#3-B) */}
                <div className="mt-5 pt-5 border-t border-white/10">
                  <p className="text-sm font-semibold text-white mb-3">
                    成約管理
                  </p>

                  {selected.consultation_status === "closed" &&
                    (!closingDraft.meetingDate ||
                      !closingDraft.closingAmount) && (
                      <div className="mb-3 p-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-xs text-amber-300">
                        成約 時は「面談予約日」「成約金額」の入力を推奨します(必須ではありません)
                      </div>
                    )}

                  <div className="grid grid-cols-2 gap-3 mb-3">
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">
                        面談予約日
                      </label>
                      <input
                        type="date"
                        value={closingDraft.meetingDate}
                        onChange={(e) =>
                          setClosingDraft((p) => ({
                            ...p,
                            meetingDate: e.target.value,
                          }))
                        }
                        className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/15 text-white text-sm focus:outline-none focus:border-blue-500/50"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">
                        面談時間
                      </label>
                      <input
                        type="time"
                        value={closingDraft.meetingTime}
                        onChange={(e) =>
                          setClosingDraft((p) => ({
                            ...p,
                            meetingTime: e.target.value,
                          }))
                        }
                        className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/15 text-white text-sm focus:outline-none focus:border-blue-500/50"
                      />
                    </div>
                  </div>

                  <div className="mb-3">
                    <label className="block text-xs text-gray-400 mb-1">
                      面談商品
                    </label>
                    <input
                      type="text"
                      value={closingDraft.closingProduct}
                      onChange={(e) =>
                        setClosingDraft((p) => ({
                          ...p,
                          closingProduct: e.target.value,
                        }))
                      }
                      placeholder="例: 仕組み構築型 リーダー向け 自動売買"
                      className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/15 text-white text-sm focus:outline-none focus:border-blue-500/50"
                    />
                  </div>

                  <div className="mb-3">
                    <label className="block text-xs text-gray-400 mb-1">
                      成約金額
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">
                        ¥
                      </span>
                      <input
                        type={amountFocused ? "number" : "text"}
                        min={0}
                        inputMode="numeric"
                        value={
                          amountFocused
                            ? closingDraft.closingAmount
                            : formatAmountWithComma(closingDraft.closingAmount)
                        }
                        onFocus={() => setAmountFocused(true)}
                        onBlur={() => setAmountFocused(false)}
                        onChange={(e) => {
                          const v = e.target.value.replace(/[^0-9]/g, "");
                          setClosingDraft((p) => ({
                            ...p,
                            closingAmount: v,
                          }));
                        }}
                        placeholder="0"
                        className="w-full pl-7 pr-3 py-2 rounded-lg bg-white/5 border border-white/15 text-white text-sm focus:outline-none focus:border-blue-500/50"
                      />
                    </div>
                  </div>

                  <details open className="mb-3">
                    <summary className="cursor-pointer text-xs text-gray-400 mb-1 hover:text-white">
                      備考
                    </summary>
                    <textarea
                      rows={5}
                      value={closingDraft.closerMemo}
                      onChange={(e) =>
                        setClosingDraft((p) => ({
                          ...p,
                          closerMemo: e.target.value,
                        }))
                      }
                      placeholder="クローザー商談メモ・顧客背景・特記事項など"
                      className="w-full mt-1 px-3 py-2 rounded-lg bg-white/5 border border-white/15 text-white text-sm focus:outline-none focus:border-blue-500/50 max-h-72 resize-y"
                    />
                  </details>

                  <button
                    disabled={closingSaving}
                    onClick={async () => {
                      setClosingSaving(true);
                      try {
                        const resp = await fetch(
                          "/api/matching/diagnoses",
                          {
                            method: "POST",
                            headers: {
                              "Content-Type": "application/json",
                            },
                            body: JSON.stringify({
                              _action: "update_closing",
                              diagnosisId: selected.id,
                              status: selected.consultation_status,
                              meetingDate:
                                closingDraft.meetingDate || null,
                              meetingTime:
                                closingDraft.meetingTime || null,
                              closingAmount:
                                closingDraft.closingAmount || null,
                              closingProduct:
                                closingDraft.closingProduct || null,
                              closerMemo: closingDraft.closerMemo || null,
                            }),
                          },
                        );
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
                        // 楽観的 UI 更新: 一覧側の対応行も即時更新
                        setDiagnoses((prev) =>
                          prev.map((d) =>
                            d.id === selected.id
                              ? {
                                  ...d,
                                  meeting_date:
                                    closingDraft.meetingDate || null,
                                  meeting_time:
                                    closingDraft.meetingTime || null,
                                  closing_amount: Number.isFinite(
                                    amountNum,
                                  )
                                    ? amountNum
                                    : null,
                                  closing_product:
                                    closingDraft.closingProduct || null,
                                  closer_memo:
                                    closingDraft.closerMemo || null,
                                }
                              : d,
                          ),
                        );
                        setToast({ kind: "ok", text: "保存しました" });
                        // 念のためサーバ再 fetch(他端末からの更新も反映)
                        fetchData();
                      } catch (e) {
                        setToast({
                          kind: "err",
                          text: `保存エラー: ${
                            e instanceof Error ? e.message : String(e)
                          }`,
                        });
                      } finally {
                        setClosingSaving(false);
                      }
                    }}
                    className="w-full py-2.5 rounded-lg bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white text-sm font-medium transition-all"
                  >
                    {closingSaving ? "保存中..." : "💾 成約管理を保存"}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

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

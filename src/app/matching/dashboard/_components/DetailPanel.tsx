"use client";

import { useState } from "react";
import {
  MATCHING_TYPES,
  MATCHING_QUESTIONS,
} from "@/lib/matching-diagnosis";
import type { Closer } from "@/lib/matching-closers";

// ──────────────────────────────────────────────────────────────
// 型定義(page.tsx と共有。ここでは Props 用に再宣言して結合度を下げる)
// ──────────────────────────────────────────────────────────────

export interface Consultation {
  id: string;
  preferred_date: string;
  preferred_time: string;
  contact_method: string;
  status: string;
  closer_notes: string | null;
}

export interface Diagnosis {
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
  meeting_date: string | null;
  meeting_time: string | null;
  closing_amount: number | null;
  closing_product: string | null;
  closer_memo: string | null;
  matching_consultations: Consultation[];
}

export interface ClosingDraft {
  meetingDate: string;
  meetingTime: string;
  closingAmount: string;
  closingProduct: string;
  closerMemo: string;
}

export type SurveyInfoResp =
  | { status: "found"; phone: string; answered_at: string | null }
  | { status: "not_responded" }
  | { status: "not_found_survey" }
  | { status: "no_follower" }
  | { status: "error"; message: string };

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

function formatAmountWithComma(raw: string): string {
  if (!raw) return "";
  const n = Number(raw.replace(/,/g, ""));
  if (!Number.isFinite(n)) return raw;
  return n.toLocaleString("ja-JP");
}

function formatConsultationDate(date: string, time: string) {
  const d = new Date(date + "T00:00:00");
  const weekdays = ["日", "月", "火", "水", "木", "金", "土"];
  return `${d.getMonth() + 1}/${d.getDate()}（${weekdays[d.getDay()]}）${time}`;
}

// ──────────────────────────────────────────────────────────────
// Props
// ──────────────────────────────────────────────────────────────

export interface DetailPanelProps {
  selected: Diagnosis;
  surveyInfo: SurveyInfoResp | null;
  surveyLoading: boolean;
  closingDraft: ClosingDraft;
  setClosingDraft: React.Dispatch<React.SetStateAction<ClosingDraft>>;
  closingSaving: boolean;
  closers: Closer[];
  onAssignCloser: (closer: string | null) => Promise<void>;
  onUpdateStatus: (status: string) => Promise<void>;
  onSaveClosing: () => Promise<void>;
  onClose?: () => void;
  isMobile?: boolean;
}

// ──────────────────────────────────────────────────────────────
// DetailPanel
// ──────────────────────────────────────────────────────────────

export default function DetailPanel({
  selected,
  surveyInfo,
  surveyLoading,
  closingDraft,
  setClosingDraft,
  closingSaving,
  closers,
  onAssignCloser,
  onUpdateStatus,
  onSaveClosing,
  onClose,
  isMobile,
}: DetailPanelProps) {
  // 選択 diagnosis 切替で「商談者情報」タブに戻すのは、
  // 親が key={selected.id} で再マウントさせることで実現する(useState 初期値で復元)。
  const [activeTab, setActiveTab] = useState<"info" | "closing">("info");
  const [amountFocused, setAmountFocused] = useState(false);

  const type = MATCHING_TYPES.find((t) => t.id === selected.type_id);

  return (
    <div className="p-6">
      {/* ヘッダー */}
      <div className="flex items-start justify-between mb-4">
        <div className="text-center flex-1">
          <span className="text-4xl">{type?.emoji}</span>
          <h2 className="text-lg font-bold text-white mt-2">
            {selected.name || "名前なし"}
          </h2>
          <p className="text-sm text-gray-400">{type?.name}</p>
        </div>
        {isMobile && onClose && (
          <button
            onClick={onClose}
            aria-label="閉じる"
            className="ml-2 px-2 py-1 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 text-lg"
          >
            ✕
          </button>
        )}
      </div>

      {/* タブナビ */}
      <div
        role="tablist"
        className="flex gap-1 mb-4 p-1 rounded-lg bg-white/5 border border-white/10"
      >
        {[
          { value: "info" as const, label: "商談者情報" },
          { value: "closing" as const, label: "成約管理" },
        ].map((tab) => (
          <button
            key={tab.value}
            role="tab"
            aria-selected={activeTab === tab.value}
            onClick={() => setActiveTab(tab.value)}
            className={`flex-1 py-2 rounded-md text-sm font-medium transition-all ${
              activeTab === tab.value
                ? "bg-blue-500 text-white"
                : "text-gray-400 hover:text-white"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── 商談者情報タブ ─────────────────────── */}
      {activeTab === "info" && (
        <div>
          {/* 電話番号(最上段) */}
          <div className="mb-4 p-3 rounded-lg bg-white/5 border border-white/10">
            <p className="text-xs font-medium text-gray-400 mb-1">📞 電話番号</p>
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

          {/* AI サマリ(常時表示・PR#3-D で実値化、当面は未生成案内) */}
          <div className="mb-4 p-3 rounded-lg bg-blue-500/5 border border-blue-500/20">
            <p className="text-xs font-medium text-blue-300 mb-1">
              ✨ AI サマリ
            </p>
            <p className="text-sm text-gray-400 leading-relaxed">
              サマリ未生成(PR#3-D で実装予定)。下の 3 ブロックを展開してご確認ください。
            </p>
          </div>

          {/* AI 3 ブロック(全部 details 閉) */}
          <div className="mb-4">
            <p className="text-xs font-medium text-gray-400 mb-2">
              AI 生成セクション
            </p>
            {selected.ai_generation_status === "ready" ? (
              <div className="space-y-2">
                {[
                  { label: "強み", body: selected.ai_strength_section },
                  { label: "動物占い", body: selected.ai_animal_section },
                  { label: "リスク", body: selected.ai_risk_section },
                ].map((s) => (
                  <details
                    key={s.label}
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

          {/* 基本情報(details 閉) */}
          <details className="mb-4 group">
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
                  {selected.gender
                    ? GENDER_LABELS[selected.gender] ?? selected.gender
                    : "—"}
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
                    ? FAMILY_LABELS[selected.family_status] ??
                      selected.family_status
                    : "—"}
                </dd>
              </div>
            </dl>
          </details>

          {/* 12 問回答(details 閉) */}
          <details className="mb-4 group">
            <summary className="cursor-pointer text-xs font-medium text-gray-400 mb-2 hover:text-white">
              12 問回答
            </summary>
            <dl className="mt-2 space-y-2">
              {MATCHING_QUESTIONS.map((q, i) => {
                const ans = selected.answers?.[i];
                const label =
                  ans !== undefined
                    ? q.options.find((o) => o.value === ans)?.label ??
                      `(${ans})`
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

          {/* 面談予約情報(顧客側予約フォーム由来) */}
          {selected.matching_consultations?.[0] && (
            <div className="mb-2 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
              <p className="text-xs font-medium text-blue-400 mb-1">
                顧客側 面談予約
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
        </div>
      )}

      {/* ── 成約管理タブ ─────────────────────── */}
      {activeTab === "closing" && (
        <div>
          {/* 担当クローザー */}
          <div className="mb-4">
            <p className="text-xs font-medium text-gray-400 mb-2">担当クローザー</p>
            <select
              value={selected.assigned_closer || ""}
              onChange={async (e) => {
                const closer = e.target.value || null;
                await onAssignCloser(closer);
              }}
              className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/15 text-white text-sm focus:outline-none focus:border-blue-500/50"
            >
              <option value="" className="bg-slate-800">
                未割当
              </option>
              {closers
                .filter((c) => c.name !== "未割当")
                .map((c) => (
                  <option key={c.id} value={c.name} className="bg-slate-800">
                    {c.name}
                    {c.company ? `(${c.company})` : ""}
                  </option>
                ))}
            </select>
          </div>

          {/* 面談ステータス枠(PR#3-E で実値化) */}
          <div className="mb-4 p-3 rounded-lg bg-white/5 border border-white/10">
            <p className="text-xs font-medium text-gray-400 mb-2">
              面談ステータス
            </p>
            <p className="text-xs text-gray-500">
              (PR#3-E で実装予定:予約済 / 実施済 / リスケ / バックレ / NS連絡 / 持ち帰り の 6 値チップ)
            </p>
          </div>

          {/* 成約状況(既存ステータス変更) */}
          <div className="mb-4">
            <p className="text-xs font-medium text-gray-400 mb-2">成約状況</p>
            <div className="grid grid-cols-3 gap-2">
              {STATUS_BUTTONS.map(({ value, label }) => (
                <button
                  key={value}
                  onClick={async () => {
                    await onUpdateStatus(value);
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

          {/* 商談履歴ログ枠(PR#3-E で実値化) */}
          <div className="mb-4 p-3 rounded-lg bg-white/5 border border-white/10">
            <p className="text-xs font-medium text-gray-400 mb-2">
              商談履歴ログ
            </p>
            <p className="text-xs text-gray-500">
              (PR#3-E で実装予定:時系列タイムライン + 「+ ログを追加」)
            </p>
          </div>

          {/* PR#3-B 既存成約管理入力 */}
          <div className="pt-4 border-t border-white/10">
            <p className="text-sm font-semibold text-white mb-3">
              成約管理(PR#3-B)
            </p>

            {selected.consultation_status === "closed" &&
              (!closingDraft.meetingDate || !closingDraft.closingAmount) && (
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
              onClick={onSaveClosing}
              className="w-full py-2.5 rounded-lg bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white text-sm font-medium transition-all"
            >
              {closingSaving ? "保存中..." : "💾 成約管理を保存"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

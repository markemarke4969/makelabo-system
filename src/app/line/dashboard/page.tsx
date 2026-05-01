"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";
import {
  DeliveryCondition,
  ConditionRow,
  ConditionField,
  ConditionOp,
  ConditionConnector,
  FIELD_LABELS,
  OP_LABELS,
  operatorsForField,
  inputKindForRow,
  emptyDeliveryCondition,
  isSupportedField,
  evalCondition,
  FollowerLite,
} from "@/lib/delivery-conditions";

// ============================================================
// 型定義
// ============================================================
interface Follower {
  id: string;
  line_user_id: string;
  display_name: string | null;
  picture_url: string | null;
  status: string;
  followed_at: string;
  unfollowed_at: string | null;
  created_at: string;
  account_id?: string;
  memo?: string | null;
  labels?: string[];
  is_test?: boolean;
}

interface Message {
  id: string;
  line_user_id: string;
  direction: string;
  message_type: string;
  message_text: string | null;
  raw_event: Record<string, unknown>;
  sent_at: string;
  is_read?: boolean;
}

interface LineAccount {
  id: string;
  channel_id: string;
  account_name: string | null;
  basic_id: string | null;
  is_active: boolean;
  group_name?: string | null; // 段階5(案B)Step 12 で廃止予定、Step 12 適用後は API GET で undefined となる
  project_id?: string | null;
  scenario_id?: string | null; // 段階5(案B)で追加。Step 02〜04 適用後に値が入る
  role?: "main" | "distribute" | "standby" | "banned" | null;
  order_index?: number | null;
  greeting_message?: string | null;
  newsletter_from_email?: string | null;
  newsletter_from_name?: string | null;
}

// 段階5(案B)PR-1:scenario 単位移行のための型(後続 PR で group_name 系を順次置換)
// 構造は src/app/line/projects/page.tsx の Scenario 型と整合
interface Scenario {
  id: string;
  project_id: string;
  code: string | null;
  name: string;
  distribute_enabled: boolean | null;
  distribute_count: number | null;
  reserve_count: number | null;
  ban_sync_enabled: boolean | null;
  sort_order: number | null;
}

interface Label {
  id: string;
  name: string;
  color: string;
  created_at: string;
  assigned_users: string[]; // line_user_id[]
}

interface TemplateMessage {
  id?: string;
  msg_order: number;
  msg_type: string;
  payload: Record<string, unknown>;
  body: string | null;
}

interface Template {
  id: string;
  name: string;
  group_name: string | null;
  messages: TemplateMessage[];
  created_at: string;
  // 旧互換
  title?: string;
  body?: string;
}

interface StepSequence {
  id: string;
  account_id: string;
  name: string;
  status: string;
  created_at: string;
  messages: StepMessage[];
  kind?: "step" | "schedule" | null;
  scheduled_at?: string | null;
  sent_at?: string | null;
  target_condition?: DeliveryCondition | null;
}

interface StepMessage {
  id: string;
  sequence_id: string;
  step_order: number;
  delay_minutes: number;
  media: string;
  title: string;
  body: string | null;
  status: string;
  msg_type?: string | null;
  payload?: Record<string, unknown> | null;
  timing_mode?: "immediate" | "absolute" | "relative" | null;
  delivery_days?: number | null;
  delivery_time?: string | null;
}

interface InflowRoute {
  id: string;
  account_id: string;
  name: string;
  code: string;
  url: string | null;
  description: string | null;
  is_active: boolean;
  created_at: string;
  follower_count?: number;
  group_id?: string | null;
}

interface InflowGroup {
  id: string;
  account_id: string | null;
  project_id: string | null;
  name: string;
  color: string;
  sort_order: number;
  route_count?: number;
  follower_count?: number;
}

// メインビュー
type MainView = "accounts" | "account-detail" | "settings";
// アカウント詳細内のサブビュー
type AccountSubView = "followers" | "chat" | "step" | "schedule" | "sent" | "friend-page" | "labels" | "templates" | "inflow" | "actions" | "custom-fields" | "reminders" | "newsletter" | "reengagement" | "surveys" | "reg-forms" | "reports" | "rich-menu";

// アクションルール
type ActionTriggerType = "follow" | "label_added" | "message_received" | "sequence_completed";
type ActionActionType = "start_sequence" | "label_add" | "label_remove" | "move_sequence" | "webhook" | "cross_account_label";
interface ActionRuleCondition {
  type: "label_in" | "inflow_route_in" | "days_after_follow";
  label_ids?: string[];
  route_ids?: string[];
  days?: number;
}
interface ActionRule {
  id: string;
  account_id: string;
  name: string;
  status: string;
  trigger_type: ActionTriggerType;
  trigger_config: Record<string, unknown>;
  conditions: ActionRuleCondition[];
  action_type: ActionActionType;
  action_config: Record<string, unknown>;
  created_at: string;
}

// 段階5(案B)PR-1:アカウントの scenario_id から表示名を引くヘルパー(後続 PR で group_name 表示の置換に使用)
// scenario_id が NULL/undefined、または scenarios 配列に該当 id が無い場合は "シナリオ未設定" を返す。
function getScenarioNameForAccount(
  acc: { scenario_id?: string | null },
  scenarios: Scenario[],
): string {
  if (!acc.scenario_id) return "シナリオ未設定";
  const found = scenarios.find((s) => s.id === acc.scenario_id);
  return found ? found.name : "シナリオ未設定";
}

const DEFAULT_GREETING_MESSAGE = "{display_name}さん、友達追加ありがとうございます！";

// 商談ステータス定義
const DEAL_STATUSES = [
  { value: "", label: "未設定", color: "#9CA3AF", bgClass: "bg-gray-100 text-gray-600" },
  { value: "未対応", label: "未対応", color: "#EF4444", bgClass: "bg-red-100 text-red-700" },
  { value: "商談中", label: "商談中", color: "#F59E0B", bgClass: "bg-yellow-100 text-yellow-700" },
  { value: "成約", label: "成約", color: "#10B981", bgClass: "bg-green-100 text-green-700" },
  { value: "失注", label: "失注", color: "#6B7280", bgClass: "bg-gray-200 text-gray-600" },
  { value: "保留", label: "保留", color: "#8B5CF6", bgClass: "bg-purple-100 text-purple-700" },
] as const;
const DEAL_STATUS_LABEL_PREFIX = "商談:";

// ============================================================
// 絵文字データ
// ============================================================
const EMOJI_CATEGORIES: { name: string; emojis: string[] }[] = [
  { name: "顔", emojis: ["😀","😃","😄","😁","😆","😅","🤣","😂","🙂","😊","😇","🥰","😍","😘","😗","😋","😛","😜","🤪","😝","🤑","🤗","🤭","🤫","🤔","🤐","🤨","😐","😑","😶","😏","😒","🙄","😬","🤥","😌","😔","😪","🤤","😴","😷","🤒","🤕","🤢","🤮","🥵","🥶","🥴","😵","🤯","🤠","🥳","😎","🤓","🧐","😕","😟","🙁","😮","😯","😲","😳","🥺","😦","😧","😨","😰","😥","😢","😭","😱","😖","😣","😞","😓","😩","😫","🥱","😤","😡","😠","🤬","😈","👿"] },
  { name: "手", emojis: ["👋","🤚","🖐","✋","🖖","👌","🤌","🤏","✌️","🤞","🤟","🤘","🤙","👈","👉","👆","🖕","👇","☝️","👍","👎","✊","👊","🤛","🤜","👏","🙌","👐","🤲","🤝","🙏"] },
  { name: "ハート", emojis: ["❤️","🧡","💛","💚","💙","💜","🖤","🤍","🤎","💔","❣️","💕","💞","💓","💗","💖","💘","💝","💟","♥️","🩷","🩵","🩶"] },
  { name: "記号", emojis: ["⭐","🌟","✨","💫","🔥","💯","✅","❌","⭕","❗","❓","💤","💬","👀","🎉","🎊","🎵","🎶","📌","📎","💡","📝","📅","🏠","🚀","⚡","🌈","☀️","🌙","⛅"] },
  { name: "食べ物", emojis: ["🍎","🍊","🍋","🍌","🍉","🍇","🍓","🫐","🍈","🍒","🍑","🥭","🍍","🥥","🥝","🍅","🥑","🍔","🍕","🍣","🍱","🍜","🍝","🍩","🍪","🎂","🍰","☕","🍵","🧋","🍺","🍻","🥂","🍷"] },
];

// LINE公式スタンプ（packageId, stickerId のペア）
// https://developers.line.biz/en/docs/messaging-api/sticker-list/
const LINE_STICKER_PACKS: { name: string; packageId: number; stickers: number[] }[] = [
  { name: "ブラウン&コニー", packageId: 11537, stickers: [52002734,52002735,52002736,52002737,52002738,52002739,52002740,52002741,52002742,52002743,52002744,52002745,52002746,52002747,52002748,52002749,52002750,52002751,52002752,52002753,52002754,52002755,52002756,52002757,52002758,52002759,52002760,52002761,52002762,52002763,52002764,52002765,52002766,52002767,52002768,52002769,52002770,52002771,52002772,52002773] },
  { name: "ムーン", packageId: 11538, stickers: [51626494,51626495,51626496,51626497,51626498,51626499,51626500,51626501,51626502,51626503,51626504,51626505,51626506,51626507,51626508,51626509,51626510,51626511,51626512,51626513,51626514,51626515,51626516,51626517,51626518,51626519,51626520,51626521,51626522,51626523,51626524,51626525,51626526,51626527,51626528,51626529,51626530,51626531,51626532,51626533] },
  { name: "ジェームズ", packageId: 11539, stickers: [52114110,52114111,52114112,52114113,52114114,52114115,52114116,52114117,52114118,52114119,52114120,52114121,52114122,52114123,52114124,52114125,52114126,52114127,52114128,52114129,52114130,52114131,52114132,52114133,52114134,52114135,52114136,52114137,52114138,52114139,52114140,52114141,52114142,52114143,52114144,52114145,52114146,52114147,52114148,52114149] },
];

// ============================================================
// アイコンコンポーネント
// ============================================================
const Icons = {
  back: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
  ),
  chevronRight: (
    <svg className="w-4 h-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
  ),
  search: (
    <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
  ),
  user: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
  ),
  users: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
  ),
  chat: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
  ),
  send: (
    <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" /></svg>
  ),
  image: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
  ),
  video: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
  ),
  template: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
  ),
  emoji: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
  ),
  sticker: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" /></svg>
  ),
  settings: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
  ),
  step: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" /></svg>
  ),
  schedule: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
  ),
  friendAdd: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" /></svg>
  ),
  label: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" /></svg>
  ),
  download: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
  ),
  plus: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
  ),
  sort: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12" /></svg>
  ),
  folder: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" /></svg>
  ),
  edit: (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
  ),
  close: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
  ),
  document: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
  ),
  menu: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
  ),
};

const LINE_ICON = (
  <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63h2.386c.346 0 .627.285.627.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.06-.023.136-.033.194-.033.195 0 .375.104.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63.346 0 .628.285.628.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.282.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314" /></svg>
);

// ============================================================
// LIFF 中継URL カード(案B 実装、2026-04-30)
// ============================================================
// 案件単位で LIFF ID が異なるため、/api/liff/config?project=<code> で
// 動的取得して LIFF URL を組み立てる。
// 取得失敗時は env(NEXT_PUBLIC_LIFF_ID)に fallback。
// ============================================================
function LiffRelayCard({ projectCode }: { projectCode: string }) {
  const [liffId, setLiffId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/liff/config?project=${encodeURIComponent(projectCode)}`)
      .then((r) => r.json())
      .then((d: { liffId?: string | null }) => {
        if (!cancelled) setLiffId(d.liffId ?? null);
      })
      .catch(() => {
        if (!cancelled) setLiffId(null);
      });
    return () => {
      cancelled = true;
    };
  }, [projectCode]);

  const effectiveLiffId = liffId ?? process.env.NEXT_PUBLIC_LIFF_ID ?? null;
  if (!effectiveLiffId) return null;
  const liffUrl = `https://liff.line.me/${effectiveLiffId}?project=${projectCode}`;

  return (
    <div className="bg-gradient-to-r from-green-50 to-blue-50 rounded-lg border border-green-200 p-4 md:p-6">
      <div className="flex items-start justify-between gap-3 mb-2">
        <h3 className="text-sm font-bold text-gray-800 flex items-center gap-2">
          <span className="inline-block w-2 h-2 rounded-full bg-green-500" />
          BAN対策: LIFF中継URL
        </h3>
        <button
          onClick={async () => {
            if (!confirm("メイン → 予備 の同期を今すぐ実行しますか?")) return;
            try {
              const res = await fetch("/api/cron/line-sync-main-to-backup", {
                method: "POST",
                credentials: "include",
              });
              const data = await res.json();
              if (res.ok && data.ok) {
                alert(
                  `同期完了\n対象: ${data.total}件\n成功: ${data.success} / 一部スキップ: ${data.partial} / 失敗: ${data.failed}`,
                );
              } else if (res.status === 409) {
                alert(data.error ?? "他の同期が実行中です");
              } else {
                alert(`同期失敗: ${data.error ?? res.status}`);
              }
            } catch (e) {
              alert(`同期リクエストに失敗: ${(e as Error).message}`);
            }
          }}
          className="flex-shrink-0 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded transition"
        >
          今すぐ同期
        </button>
      </div>
      <p className="text-[11px] text-gray-600 mb-3">
        このURLを全配信メッセージに埋め込むことで、BAN時に自動で新アカウントへ誘導されます。
      </p>
      <div className="flex items-center gap-2 bg-white rounded-md border border-gray-200 px-3 py-2">
        <code className="flex-1 text-xs font-mono text-gray-700 truncate">{liffUrl}</code>
        <button
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(liffUrl);
              alert("コピーしました");
            } catch {
              alert("コピーに失敗しました");
            }
          }}
          className="flex-shrink-0 px-3 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-medium rounded transition"
        >
          コピー
        </button>
      </div>
    </div>
  );
}

// ============================================================
// メイン
// ============================================================
export default function LineDashboard() {
  const router = useRouter();

  // 案件情報
  const [project, setProject] = useState<{ id: string; name: string; color: string; code: string | null } | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  // 現在のユーザー情報
  const [currentUser, setCurrentUser] = useState<{ id: string; is_closer: boolean; is_admin: boolean; closer_name: string | null } | null>(null);
  // グループのクローザー表示設定
  // クローザー一覧（担当クローザー選択用）
  const [closerUsers, setCloserUsers] = useState<Array<{ id: string; name: string | null; closer_name: string | null }>>([]);

  // 案件チェック + ユーザー情報取得
  useEffect(() => {
    const stored = sessionStorage.getItem("line_project");
    if (!stored) {
      router.push("/line/projects");
      return;
    }
    try {
      setProject(JSON.parse(stored));
      setAuthChecked(true);
    } catch {
      router.push("/line/projects");
      return;
    }
    // 現在のユーザーのメタデータを取得
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      const meta = (data.user?.user_metadata ?? {}) as Record<string, unknown>;
      setCurrentUser({
        id: data.user?.id ?? "",
        is_closer: !!(meta.is_closer),
        is_admin: !!(meta.is_admin),
        closer_name: (meta.closer_name as string | null) ?? null,
      });
    });
  }, [router]);

  // ビュー状態
  const [mainView, setMainView] = useState<MainView>("accounts");
  const [accountSubView, setAccountSubView] = useState<AccountSubView>("chat");

  // データ
  const [followers, setFollowers] = useState<Follower[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [selectedUser, setSelectedUser] = useState<Follower | null>(null);
  const [selectedAccount, setSelectedAccount] = useState<LineAccount | null>(null);
  const [accounts, setAccounts] = useState<LineAccount[]>([]);

  // UI状態
  const [loading, setLoading] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [sending, setSending] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [followerPage, setFollowerPage] = useState(1);
  const FOLLOWERS_PER_PAGE = 50;
  const [chatSearch, setChatSearch] = useState("");
  const [memoText, setMemoText] = useState("");
  const [showAddAccount, setShowAddAccount] = useState(false);

  // アカウント一括登録（スプレッドシート形式）
  // 段階5(案B)PR-5:scenario_id を追加(段階5 移行期は group_name と二重持ち、PR-6 で group_name 撤去予定)
  // 値の意味:"" = プレースホルダー(未選択)、"__null__" = シナリオ未設定(送信時 null)、それ以外 = scenario.id
  interface BulkRow {
    account_name: string;
    channel_id: string;
    channel_secret: string;
    channel_access_token: string;
    basic_id: string;
    group_name: string;
    group_is_new: boolean;
    scenario_id: string;
    role: "main" | "standby";
    testing: boolean;
    testResult: { ok: boolean; text: string } | null;
    saving: boolean;
    saveResult: { ok: boolean; text: string } | null;
  }
  const emptyBulkRow = (): BulkRow => ({
    account_name: "",
    channel_id: "",
    channel_secret: "",
    channel_access_token: "",
    basic_id: "",
    group_name: "",
    group_is_new: false,
    scenario_id: "",
    role: "main",
    testing: false,
    testResult: null,
    saving: false,
    saveResult: null,
  });
  const [showWizard, setShowWizard] = useState(false);
  const [bulkProjectId, setBulkProjectId] = useState<string>("");
  const [bulkRows, setBulkRows] = useState<BulkRow[]>([]);
  const [bulkRunning, setBulkRunning] = useState(false);
  const [bulkGroups, setBulkGroups] = useState<string[]>([]);

  // ウィザードが開いていて案件が選ばれているときはグループ一覧を取得
  useEffect(() => {
    if (!showWizard || !bulkProjectId) { setBulkGroups([]); return; }
    (async () => {
      try {
        const res = await fetch(`/api/line/account-groups?project_id=${bulkProjectId}`);
        if (res.ok) {
          const data: Array<{ group_name: string }> = await res.json();
          setBulkGroups(Array.from(new Set(data.map((d) => d.group_name))).sort());
        } else {
          setBulkGroups([]);
        }
      } catch {
        setBulkGroups([]);
      }
    })();
  }, [showWizard, bulkProjectId]);

  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
  const [needsAction, setNeedsAction] = useState<Set<string>>(new Set());
  const [soundEnabled, setSoundEnabled] = useState(true);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [labels, setLabels] = useState<Label[]>([]);
  const [showAddLabel, setShowAddLabel] = useState(false);
  const [newLabelName, setNewLabelName] = useState("");
  const [expandedLabelId, setExpandedLabelId] = useState<string | null>(null);
  const [labelUserPage, setLabelUserPage] = useState(1);
  const [labelUserSearch, setLabelUserSearch] = useState("");
  const LABEL_USERS_PER_PAGE = 30;
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Feature 1: Name editing
  const [editingName, setEditingName] = useState(false);
  const [editNameValue, setEditNameValue] = useState("");

  // Feature 2: Label selection in chat sidebar
  const [showLabelPicker, setShowLabelPicker] = useState(false);
  // 同一案件内の別アカウントの同一UserIDにもラベルを付与/解除するか
  const [crossAccountLabel, setCrossAccountLabel] = useState(false);

  // Feature 3: Memo save feedback
  const [memoSaving, setMemoSaving] = useState(false);
  const [memoSaveMsg, setMemoSaveMsg] = useState<string | null>(null);

  // Feature 4: Image & video file inputs
  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  // Feature 5: Templates
  const [templates, setTemplates] = useState<Template[]>([]);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const [templateForm, setTemplateForm] = useState<{ name: string; messages: BroadcastMessage[] }>({ name: "", messages: [] });
  // Custom Fields
  interface CustomField { id: string; field_key: string; field_label: string; field_type: string; options: unknown; sort_order: number; }
  const [customFields, setCustomFields] = useState<CustomField[]>([]);
  const [showCustomFieldModal, setShowCustomFieldModal] = useState(false);
  const [customFieldForm, setCustomFieldForm] = useState({ field_key: "", field_label: "", field_type: "text" });
  // Reminders
  interface Reminder { id: string; name: string; status: string; base_date_field: string; messages: ReminderMessage[]; created_at: string; }
  interface ReminderMessage { id: string; msg_order: number; offset_days: number; offset_time: string; msg_type: string; payload: Record<string, unknown>; body: string | null; }
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [showReminderModal, setShowReminderModal] = useState(false);
  const [reminderForm, setReminderForm] = useState({ name: "", base_date_field: "custom", messages: [] as { offset_days: number; offset_time: string; body: string }[] });

  // Newsletter
  interface Newsletter { id: string; name: string; subject: string; body_html: string; body_text: string; status: string; scheduled_at: string | null; sent_count: number; created_at: string; }
  const [newsletters, setNewsletters] = useState<Newsletter[]>([]);
  const [showNewsletterModal, setShowNewsletterModal] = useState(false);
  const [newsletterForm, setNewsletterForm] = useState({ name: "", subject: "", body_text: "" });

  // Lpro同期ログ
  const [syncLogs, setSyncLogs] = useState<Array<{ id: string; synced_at: string; total_rows: number; updated_count: number; created_count: number; skipped_count: number; error_count: number; duration_ms: number }>>([]);

  // 掘り起こし配信
  interface ReengagementBroadcast { id: string; name: string; status: string; target_condition: DeliveryCondition | null; sent_at: string | null; sent_count: number; created_at: string; messages: Array<{ id: string; msg_type: string; payload: Record<string, unknown>; body: string | null }> }
  const [reengagements, setReengagements] = useState<ReengagementBroadcast[]>([]);
  const [showReengagementModal, setShowReengagementModal] = useState(false);
  const [reengagementForm, setReengagementForm] = useState<{ name: string; condition: "all" | "filtered"; targetCondition: DeliveryCondition; messages: BroadcastMessage[] }>({ name: "", condition: "all", targetCondition: emptyDeliveryCondition, messages: [] });
  const [reengagementPreview, setReengagementPreview] = useState<Follower[] | null>(null);
  const [reengagementSending, setReengagementSending] = useState(false);

  // リッチメニュー
  interface RichMenuArea { actionType: "none" | "uri" | "message" | "postback"; uri: string; text: string; data: string; label: string }
  interface RichMenu {
    id: string;
    line_account_id: string;
    name: string;
    line_rich_menu_id: string | null;
    image_url: string | null;
    size_type: "large" | "compact";
    chat_bar_text: string;
    selected: boolean;
    is_default: boolean;
    template_type: string;
    areas: RichMenuArea[];
    status: string;
    deployed_at: string | null;
    created_at: string;
  }
  const [richMenus, setRichMenus] = useState<RichMenu[]>([]);
  const emptyRichMenu: Omit<RichMenu, "id" | "line_account_id" | "line_rich_menu_id" | "status" | "deployed_at" | "created_at"> = {
    name: "",
    image_url: null,
    size_type: "large",
    chat_bar_text: "メニュー",
    selected: true,
    is_default: false,
    template_type: "L1",
    areas: [],
  };
  const [richMenuForm, setRichMenuForm] = useState<typeof emptyRichMenu>(emptyRichMenu);
  const [editingRichMenuId, setEditingRichMenuId] = useState<string | null>(null);
  const [showRichMenuEditor, setShowRichMenuEditor] = useState(false);
  const [richMenuDeploying, setRichMenuDeploying] = useState(false);

  // アンケート
  interface SurveyDef { id: string; name: string; status: string; description: string | null; response_count: number; questions: Array<{ id: string; question_text: string; question_type: string; options: Array<{ label: string; value: string }>; is_required: boolean; save_to_field_id: string | null; label_mapping: Record<string, string> }>; created_at: string }
  const [surveys, setSurveys] = useState<SurveyDef[]>([]);
  const [showSurveyModal, setShowSurveyModal] = useState(false);
  const [surveyForm, setSurveyForm] = useState({ name: "", description: "", questions: [{ question_text: "", question_type: "text" as string, options: [] as Array<{ label: string; value: string }>, is_required: true, save_to_field_id: "" }] });

  // SMS
  const [showSmsModal, setShowSmsModal] = useState(false);
  const [smsBalance, setSmsBalance] = useState(0);
  const [smsForm, setSmsForm] = useState({ phone_number: "", message_text: "" });
  const [smsChargeAmount, setSmsChargeAmount] = useState(100);

  // 登録フォーム
  interface RegFormDef { id: string; name: string; status: string; description: string | null; submission_count: number; fields: Array<{ id: string; field_label: string; field_type: string; options: Array<{ label: string; value: string }>; is_required: boolean; placeholder: string | null; save_to_field_id: string | null }>; created_at: string }
  const [regForms, setRegForms] = useState<RegFormDef[]>([]);
  const [showRegFormModal, setShowRegFormModal] = useState(false);

  // レポート
  interface MonthlyReport { id: string; report_month: string; report_data: { month: string; delivery: { total: number }; new_followers: { total: number; by_inflow: Array<{ name: string; count: number }>; daily?: Array<{ date: string; total: number; routes: Array<{ name: string; count: number }> }> }; closer_stats: Record<string, { total: number; seiyaku: number; shicchu: number }>; label_stats: Array<{ name: string; count: number }> }; status: string; sent_at: string | null; created_at: string }
  const [reports, setReports] = useState<MonthlyReport[]>([]);
  const [reportGenerating, setReportGenerating] = useState(false);
  const [regFormForm, setRegFormForm] = useState({ name: "", description: "", fields: [{ field_label: "メールアドレス", field_type: "email" as string, options: [] as Array<{ label: string; value: string }>, is_required: true, placeholder: "example@email.com", save_to_field_id: "" }] });

  // Feature 6: Mobile responsive
  const [showMobileSidebar, setShowMobileSidebar] = useState(false);
  const [showMobileChat, setShowMobileChat] = useState(false);
  const [showMobileProfile, setShowMobileProfile] = useState(false);

  // Feature 7: Emoji popup
  const [showEmojiPopup, setShowEmojiPopup] = useState(false);
  const [emojiCategory, setEmojiCategory] = useState(0);
  // Sticker popup
  const [showStickerPopup, setShowStickerPopup] = useState(false);
  const [stickerPackIdx, setStickerPackIdx] = useState(0);
  const [sendingSticker, setSendingSticker] = useState(false);
  const stickerPopupRef = useRef<HTMLDivElement>(null);

  // Step sequences
  const [stepSequences, setStepSequences] = useState<StepSequence[]>([]);
  const [showStepModal, setShowStepModal] = useState(false);
  const [editingSequence, setEditingSequence] = useState<StepSequence | null>(null);
  const [stepForm, setStepForm] = useState({ name: "" });
  const [showStepMsgModal, setShowStepMsgModal] = useState(false);
  const [stepMsgForm, setStepMsgForm] = useState({ sequence_id: "", step_order: 1, delay_minutes: 0, media: "LINE", title: "", body: "", timing_mode: "immediate" as "immediate" | "absolute" | "relative", delivery_days: 0, delivery_time: "09:00", rel_days: 0, rel_hours: 0, rel_minutes: 0 });
  const [editingStepMsg, setEditingStepMsg] = useState<StepMessage | null>(null);

  // Inflow routes
  const [inflowRoutes, setInflowRoutes] = useState<InflowRoute[]>([]);
  const [showInflowModal, setShowInflowModal] = useState(false);
  const [inflowForm, setInflowForm] = useState({ name: "", code: "", url: "", description: "", group_id: "" });
  const [inflowSaveMsg, setInflowSaveMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [inflowSaving, setInflowSaving] = useState(false);
  const [inflowRoutesLastFetched, setInflowRoutesLastFetched] = useState<Date | null>(null);
  const [editingInflow, setEditingInflow] = useState<InflowRoute | null>(null);

  // Inflow groups（登録経路グループ）
  const [inflowGroups, setInflowGroups] = useState<InflowGroup[]>([]);
  const [showInflowGroupModal, setShowInflowGroupModal] = useState(false);
  const [inflowGroupForm, setInflowGroupForm] = useState({ name: "", color: "#3B82F6" });
  const [editingInflowGroup, setEditingInflowGroup] = useState<InflowGroup | null>(null);

  // Action rules
  const [actionRules, setActionRules] = useState<ActionRule[]>([]);
  const [showActionModal, setShowActionModal] = useState(false);
  const [editingActionRule, setEditingActionRule] = useState<ActionRule | null>(null);
  const [actionForm, setActionForm] = useState<{
    name: string;
    status: string;
    trigger_type: ActionTriggerType;
    trigger_config: Record<string, unknown>;
    conditions: ActionRuleCondition[];
    action_type: ActionActionType;
    action_config: Record<string, unknown>;
  }>({
    name: "",
    status: "active",
    trigger_type: "follow",
    trigger_config: {},
    conditions: [],
    action_type: "start_sequence",
    action_config: {},
  });

  // ステップ／予約配信作成ページ
  type BroadcastMsgType = "text" | "image" | "button" | "carousel" | "audio" | "video" | "sticker" | "branch";
  type TimingMode = "immediate" | "datetime" | "daysAfter";
  interface BranchRule {
    label_ids: string[];
    body: string;
  }
  interface BroadcastMessage {
    msgType: BroadcastMsgType;
    body: string;
    imageUrl: string;
    imagemapLinkType: "none" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8";
    imagemapAltText: string;
    imagemapBaseHeight: number;
    imagemapActions: { area: string; actionType: "uri" | "message"; uri: string; text: string }[];
    videoUrl: string;
    videoPreviewUrl: string;
    audioUrl: string;
    audioDuration: number;
    stickerPackageId: string;
    stickerId: string;
    buttonTitle: string;
    buttonImageUrl: string;
    buttonText: string;
    buttonActions: { label: string; uri: string; actionType: "uri" | "postback" | "message"; data: string; text: string }[];
    carouselColumns: { title: string; text: string; imageUrl: string; uri: string; label: string; actionType: "uri" | "postback" | "message"; data: string; actionText: string }[];
    branches?: BranchRule[];
    defaultBody?: string;
  }
  interface BroadcastForm {
    name: string;
    condition: "all" | "filtered";
    targetCondition: DeliveryCondition;
    messages: BroadcastMessage[];
    customSender: string;
    timingMode: TimingMode;
    timingDate: string;
    timingDays: number;
    timingHours: number;
    timingMinutes: number;
    existingReaderAction: string;
    postAction: string;
    urlDomain: string;
    status: "active" | "paused";
    testTargetId: string;
  }
  const emptyMessage = (): BroadcastMessage => ({
    msgType: "text",
    body: "",
    imageUrl: "",
    imagemapLinkType: "none",
    imagemapAltText: "画像メッセージ",
    imagemapBaseHeight: 1040,
    imagemapActions: [],
    videoUrl: "",
    videoPreviewUrl: "",
    audioUrl: "",
    audioDuration: 60,
    stickerPackageId: "11537",
    stickerId: "52002734",
    buttonTitle: "",
    buttonImageUrl: "",
    buttonText: "",
    buttonActions: [{ label: "詳細を見る", uri: "", actionType: "uri" as const, data: "", text: "" }],
    carouselColumns: [
      { title: "タイトル1", text: "説明1", imageUrl: "", uri: "", label: "詳細", actionType: "uri" as const, data: "", actionText: "" },
      { title: "タイトル2", text: "説明2", imageUrl: "", uri: "", label: "詳細", actionType: "uri" as const, data: "", actionText: "" },
    ],
  });
  const emptyBroadcast: BroadcastForm = {
    name: "",
    condition: "all",
    targetCondition: emptyDeliveryCondition,
    messages: [emptyMessage()],
    customSender: "",
    timingMode: "immediate",
    timingDate: "",
    timingDays: 0,
    timingHours: 0,
    timingMinutes: 0,
    existingReaderAction: "配信時間前の読者：配信予約　配信時間後の読者：配信しない",
    postAction: "実行しない",
    urlDomain: "デフォルト",
    status: "active",
    testTargetId: "",
  };
  // ユーザー詳細モーダル
  const [showUserDetail, setShowUserDetail] = useState(false);
  const [userDetailTarget, setUserDetailTarget] = useState<Follower | null>(null);
  const [userDetailForm, setUserDetailForm] = useState({ display_name: "", memo: "", is_test: false });

  // 友だち詳細モーダル（チャット画面からの閲覧用 - 読み取り専用 + カスタム値/ラベル/流入経路/送信履歴）
  const [showFriendDetailModal, setShowFriendDetailModal] = useState(false);
  interface FriendCustomValue { field_id: string; value: string | null; field_key: string; field_label: string; }
  const [friendCustomValues, setFriendCustomValues] = useState<FriendCustomValue[]>([]);
  const [friendInflowRouteName, setFriendInflowRouteName] = useState<string | null>(null);

  // チャット右パネル: テンプレート送信
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [sendingTemplate, setSendingTemplate] = useState(false);

  // テスト配信先アカウント（is_test=true のフォロワー）
  const [testFollowers, setTestFollowers] = useState<Follower[]>([]);

  // 全案件一覧（所属変更セレクト用）
  const [allProjects, setAllProjects] = useState<{ id: string; name: string; color: string }[]>([]);

  // 段階5(案B)PR-1:全 project にぶら下がる scenarios を flat 化して保持
  // /api/line/projects の response に各 project.scenarios として埋め込まれている(段階5 hotfix 9ea0e4e で対応済)。
  // 後続 PR(PR-2 以降)で group_name → scenario_id 表示置換に使用する。本 PR では setter を呼ぶだけで既存 UI は不変。
  const [scenarios, setScenarios] = useState<Scenario[]>([]);

  const [showStepCreator, setShowStepCreator] = useState(false);
  const [stepCreatorForm, setStepCreatorForm] = useState<BroadcastForm>(emptyBroadcast);
  // 編集中のシーケンスID（nullなら新規作成）
  const [editingSequenceId, setEditingSequenceId] = useState<string | null>(null);
  const [showScheduleCreator, setShowScheduleCreator] = useState(false);
  const [scheduleCreatorForm, setScheduleCreatorForm] = useState<BroadcastForm>(emptyBroadcast);

  // 対象者確認モーダル
  const [audiencePreview, setAudiencePreview] = useState<{
    open: boolean;
    loading: boolean;
    total: number;
    matched: number;
    sample: { id: string; line_user_id: string; display_name: string | null }[];
    unsupported: string[];
    error: string | null;
  }>({ open: false, loading: false, total: 0, matched: 0, sample: [], unsupported: [], error: null });

  const [form, setForm] = useState({
    account_name: "",
    channel_id: "",
    basic_id: "",
    channel_secret: "",
    channel_access_token: "",
    // 段階5(案B)PR-2:group_name は他ブロック(グループ管理 UI / 旧ウィザード等)で
    // 引き続き参照されるため state に残す。フォーム送信は scenario_id を主に使用。
    // PR-4 以降で group_name 関連ブロックを削除した後、本フィールドも撤去する。
    group_name: "",
    // 段階5(案B)PR-2:アカウント編集フォームのシナリオ選択用。
    // "" = 未選択(プレースホルダー、新規時は validation で弾く)
    // "__null__" = シナリオ未設定(送信時に null に変換)
    // それ以外 = scenario.id(UUID)
    scenario_id: "",
    project_id: "",
    role: "main" as "main" | "distribute" | "standby",
    order_index: 0,
    greeting_message: DEFAULT_GREETING_MESSAGE,
    newsletter_from_email: "",
    newsletter_from_name: "",
  });
  const [editingId, setEditingId] = useState<string | null>(null);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const emojiPopupRef = useRef<HTMLDivElement>(null);
  const labelPickerRef = useRef<HTMLDivElement>(null);

  // Close popups on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (showEmojiPopup && emojiPopupRef.current && !emojiPopupRef.current.contains(e.target as Node)) {
        setShowEmojiPopup(false);
      }
      if (showLabelPicker && labelPickerRef.current && !labelPickerRef.current.contains(e.target as Node)) {
        setShowLabelPicker(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showEmojiPopup, showLabelPicker]);

  // 友だち詳細モーダル: 開いたときにカスタム値と流入経路名を取得
  useEffect(() => {
    if (!showFriendDetailModal || !selectedUser) {
      setFriendCustomValues([]);
      setFriendInflowRouteName(null);
      return;
    }
    (async () => {
      try {
        const r = await fetch(`/api/line/custom-fields?follower_id=${selectedUser.id}`);
        if (r.ok) {
          const rows = (await r.json()) as Array<{
            field_id: string;
            value: string | null;
            line_custom_fields?: { field_key?: string; field_label?: string } | null;
          }>;
          setFriendCustomValues(
            rows.map((r0) => ({
              field_id: r0.field_id,
              value: r0.value,
              field_key: r0.line_custom_fields?.field_key ?? "",
              field_label: r0.line_custom_fields?.field_label ?? "",
            })),
          );
        } else {
          setFriendCustomValues([]);
        }
      } catch {
        setFriendCustomValues([]);
      }
      try {
        const routeId = (selectedUser as unknown as { inflow_route_id?: string | null }).inflow_route_id ?? null;
        if (routeId && selectedAccount?.id) {
          const r = await fetch(`/api/line/inflow-routes?account_id=${selectedAccount.id}`);
          if (r.ok) {
            const list = (await r.json()) as Array<{ id: string; name: string }>;
            const hit = list.find((x) => x.id === routeId);
            setFriendInflowRouteName(hit?.name ?? null);
          } else {
            setFriendInflowRouteName(null);
          }
        } else {
          setFriendInflowRouteName(null);
        }
      } catch {
        setFriendInflowRouteName(null);
      }
    })();
  }, [showFriendDetailModal, selectedUser, selectedAccount?.id]);

  // ============================================================
  // API
  // ============================================================
  const fetchFollowers = useCallback(async () => {
    // 案件未ロード時は全件を誤って取らない
    if (!project?.id) { setFollowers([]); return; }
    setLoading(true);
    try {
      // 個別アカウント選択中はそのアカウントのフォロワーのみ。未選択時は案件単位で取得。
      const closerFlag =
        currentUser?.is_closer && !currentUser?.is_admin
          ? `&closer_visible_only=1&project_id=${project.id}`
          : "";
      const url = selectedAccount?.id
        ? `/api/line/followers?account_id=${selectedAccount.id}${closerFlag}`
        : `/api/line/followers?project_id=${project.id}${closerFlag ? "&closer_visible_only=1" : ""}`;
      const res = await fetch(url);
      setFollowers(await res.json());
    } catch { /* */ } finally { setLoading(false); }
  }, [project?.id, selectedAccount?.id, currentUser?.is_closer, currentUser?.is_admin]);

  const fetchMessages = useCallback(async (userId?: string) => {
    try {
      const url = userId ? `/api/line/messages?user_id=${userId}` : "/api/line/messages";
      const res = await fetch(url);
      setMessages(await res.json());
    } catch { /* */ }
  }, []);

  const fetchAccounts = useCallback(async () => {
    // 案件未ロード時は全件を誤って取らない
    if (!project?.id) { setAccounts([]); return; }
    try {
      const res = await fetch(`/api/line/accounts?project_id=${project.id}`);
      setAccounts(await res.json());
    } catch { /* */ }
  }, [project?.id]);

  const fetchCloserUsers = useCallback(async () => {
    try {
      const res = await fetch("/api/line/users");
      if (res.ok) {
        const users = await res.json();
        setCloserUsers(
          users
            .filter((u: { is_closer: boolean }) => u.is_closer)
            .map((u: { id: string; name: string | null; closer_name: string | null }) => ({
              id: u.id,
              name: u.name,
              closer_name: u.closer_name,
            }))
        );
      }
    } catch { /* */ }
  }, []);

  const fetchReports = useCallback(async () => {
    if (!project?.id) return;
    try {
      const res = await fetch(`/api/line/reports?project_id=${project.id}`);
      if (res.ok) setReports(await res.json());
    } catch { /* */ }
  }, [project?.id]);

  const fetchRegForms = useCallback(async () => {
    if (!selectedAccount?.id) return;
    try {
      const res = await fetch(`/api/line/registration-forms?account_id=${selectedAccount.id}`);
      if (res.ok) setRegForms(await res.json());
    } catch { /* */ }
  }, [selectedAccount?.id]);

  const fetchSmsBalance = useCallback(async () => {
    if (!project?.id) return;
    try {
      const res = await fetch(`/api/line/sms?project_id=${project.id}&type=balance`);
      if (res.ok) {
        const data = await res.json();
        setSmsBalance(data.balance ?? 0);
      }
    } catch { /* */ }
  }, [project?.id]);

  const fetchSurveys = useCallback(async () => {
    if (!selectedAccount?.id) return;
    try {
      const res = await fetch(`/api/line/surveys?account_id=${selectedAccount.id}`);
      if (res.ok) setSurveys(await res.json());
    } catch { /* */ }
  }, [selectedAccount?.id]);

  const fetchRichMenus = useCallback(async () => {
    if (!selectedAccount?.id) { setRichMenus([]); return; }
    try {
      const res = await fetch(`/api/line/rich-menus?account_id=${selectedAccount.id}`);
      if (res.ok) setRichMenus(await res.json());
    } catch { /* */ }
  }, [selectedAccount?.id]);

  const fetchReengagements = useCallback(async () => {
    if (!selectedAccount?.id) return;
    try {
      const res = await fetch(`/api/line/reengagement?account_id=${selectedAccount.id}`);
      if (res.ok) setReengagements(await res.json());
    } catch { /* */ }
  }, [selectedAccount?.id]);

  // 全案件取得（所属変更セレクト用）
  const fetchAllProjects = useCallback(async () => {
    try {
      const res = await fetch("/api/line/projects");
      if (res.ok) setAllProjects(await res.json());
    } catch { /* */ }
  }, []);

  // ステップ配信一覧取得
  const fetchStepSequences = useCallback(async () => {
    if (!selectedAccount) return;
    try {
      const res = await fetch(`/api/line/step-sequences?account_id=${selectedAccount.id}`);
      if (res.ok) setStepSequences(await res.json());
    } catch { /* */ }
  }, [selectedAccount?.id]);

  // 流入経路一覧取得（案件単位）
  const fetchInflowRoutes = useCallback(async () => {
    if (!project?.id) {
      setInflowRoutes([]);
      return;
    }
    try {
      // キャッシュを回避して確実に最新を取得
      const res = await fetch(
        `/api/line/inflow-routes?project_id=${project.id}&_t=${Date.now()}`,
        { cache: "no-store" },
      );
      if (res.ok) {
        const json = (await res.json()) as InflowRoute[];
        console.log("[fetchInflowRoutes] got", json.length, "routes for project", project.id);
        setInflowRoutes(json);
        setInflowRoutesLastFetched(new Date());
      } else {
        const data = await res.json().catch(() => ({}));
        console.error("[fetchInflowRoutes] HTTP", res.status, data);
        setInflowRoutes([]);
      }
    } catch (e) {
      console.error("[fetchInflowRoutes] network error", e);
    }
  }, [project?.id]);

  // 流入経路グループ一覧取得
  const fetchInflowGroups = useCallback(async () => {
    if (!project?.id) return;
    try {
      const res = await fetch(`/api/line/inflow-groups?project_id=${project.id}`);
      if (res.ok) setInflowGroups(await res.json());
    } catch { /* */ }
  }, [project?.id]);

  // テスト配信先アカウント取得
  const fetchTestFollowers = useCallback(async () => {
    if (!selectedAccount) return;
    try {
      const res = await fetch(`/api/line/followers?test_only=1&account_id=${selectedAccount.id}`);
      if (res.ok) setTestFollowers(await res.json());
    } catch { /* */ }
  }, [selectedAccount?.id]);

  // アクションルール一覧取得
  const fetchActionRules = useCallback(async () => {
    if (!selectedAccount) { setActionRules([]); return; }
    try {
      const res = await fetch(`/api/line/action-rules?account_id=${selectedAccount.id}`);
      if (res.ok) setActionRules(await res.json());
    } catch { /* */ }
  }, [selectedAccount?.id]);

  // ラベル一覧取得（アカウント単位）
  const fetchLabels = useCallback(async () => {
    if (!selectedAccount) { setLabels([]); return; }
    try {
      const res = await fetch(`/api/line/labels?account_id=${selectedAccount.id}`);
      if (res.ok) {
        const data = await res.json();
        setLabels(
          (data as Array<{ id: string; name: string; color: string; sort_order: number; created_at: string; assigned_users: string[] }>).map((l) => ({
            id: l.id,
            name: l.name,
            color: l.color,
            created_at: l.created_at,
            assigned_users: l.assigned_users ?? [],
          })),
        );
      }
    } catch { /* */ }
  }, [selectedAccount?.id]);

  const fetchTemplates = useCallback(async () => {
    if (!selectedAccount) { setTemplates([]); return; }
    try {
      const res = await fetch(`/api/line/templates?account_id=${selectedAccount.id}`);
      if (res.ok) {
        const data = await res.json();
        setTemplates(data as Template[]);
      }
    } catch { /* */ }
  }, [selectedAccount?.id]);

  const fetchCustomFields = useCallback(async () => {
    if (!selectedAccount) { setCustomFields([]); return; }
    try {
      const res = await fetch(`/api/line/custom-fields?account_id=${selectedAccount.id}`);
      if (res.ok) setCustomFields(await res.json());
    } catch { /* */ }
  }, [selectedAccount?.id]);

  const fetchReminders = useCallback(async () => {
    if (!selectedAccount) { setReminders([]); return; }
    try {
      const res = await fetch(`/api/line/reminders?account_id=${selectedAccount.id}`);
      if (res.ok) setReminders(await res.json());
    } catch { /* */ }
  }, [selectedAccount?.id]);

  const fetchNewsletters = useCallback(async () => {
    if (!selectedAccount) { setNewsletters([]); return; }
    try {
      const res = await fetch(`/api/line/newsletter?account_id=${selectedAccount.id}`);
      if (res.ok) setNewsletters(await res.json());
    } catch { /* */ }
  }, [selectedAccount?.id]);

  // 未読件数を計算（全メッセージから取得）
  const fetchUnreadCounts = useCallback(async () => {
    try {
      const url = selectedAccount?.id
        ? `/api/line/messages/unread-counts?account_id=${selectedAccount.id}`
        : "/api/line/messages/unread-counts";
      const res = await fetch(url);
      setUnreadCounts(await res.json());
    } catch { /* */ }
  }, [selectedAccount?.id]);

  // 既読にする
  const markAsRead = async (lineUserId: string) => {
    try {
      await fetch("/api/line/messages", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ line_user_id: lineUserId }),
      });
      // メッセージを再取得して is_read を更新
      await fetchMessages(lineUserId);
      // 未読カウントを更新
      setUnreadCounts((prev) => {
        const next = { ...prev };
        delete next[lineUserId];
        return next;
      });
    } catch {
      alert("既読処理に失敗しました");
    }
  };

  // 要対応トグル
  const toggleNeedsAction = (lineUserId: string) => {
    setNeedsAction((prev) => {
      const next = new Set(prev);
      if (next.has(lineUserId)) next.delete(lineUserId);
      else next.add(lineUserId);
      return next;
    });
  };

  // 通常表示用のシナリオ別バケツ(本番 + BAN済み。サブ(standby)は別管理)
  // BAN済みアカウントは過去の友だち・チャット履歴閲覧のため表示を残す
  // 段階5(案B)PR-4:group_name ベースから scenario_id ベースに置換。
  // - キー:getScenarioNameForAccount(acc, scenarios)(scenario_id NULL 時は「シナリオ未設定」)
  // - closer_visible フィルタは廃止(closer 用の可視制御は将来 scenario 単位で再実装する想定)
  const sortedGroupedAccounts = accounts
    .filter((acc) => !acc.role || acc.role === "main" || acc.role === "distribute" || acc.role === "banned")
    // main を先、banned を後に並べる
    .sort((a, b) => {
      const rank = (r?: string | null) => (r === "banned" ? 1 : 0);
      return rank(a.role) - rank(b.role);
    })
    .reduce<Record<string, LineAccount[]>>((groups, acc) => {
      const key = getScenarioNameForAccount(acc, scenarios);
      if (!groups[key]) groups[key] = [];
      groups[key].push(acc);
      return groups;
    }, {});

  // 選択削除
  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = (ids: string[]) => {
    if (ids.every((id) => selectedIds.has(id))) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(ids));
    }
  };

  const deleteSelected = async () => {
    if (selectedIds.size === 0) return;
    const names = followers.filter((f) => selectedIds.has(f.id)).map((f) => f.display_name ?? f.line_user_id.slice(0, 10)).join(", ");
    if (!confirm(`${selectedIds.size}件を削除しますか？\n\n${names}\n\n※メッセージ履歴も削除されます`)) return;
    const res = await fetch("/api/line/followers", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: Array.from(selectedIds) }),
    });
    if (res.ok) {
      setSelectedIds(new Set());
      setSelectedUser(null);
      fetchFollowers();
    } else {
      alert("削除に失敗しました");
    }
  };

  const deleteFollower = async (id: string, label: string) => {
    if (!confirm(`${label} を削除しますか？\n\n※メッセージ履歴も削除されます`)) return;
    const res = await fetch("/api/line/followers", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [id] }),
    });
    if (res.ok) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      setSelectedUser(null);
      setShowUserDetail(false);
      fetchFollowers();
    } else {
      alert("削除に失敗しました");
    }
  };

  // ラベル管理
  const LABEL_COLORS = ["#3B82F6", "#EF4444", "#10B981", "#F59E0B", "#8B5CF6", "#EC4899", "#06B6D4", "#F97316"];

  const createLabel = async () => {
    if (!newLabelName.trim() || !selectedAccount) return;
    try {
      const res = await fetch("/api/line/labels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          account_id: selectedAccount.id,
          name: newLabelName.trim(),
          color: LABEL_COLORS[labels.length % LABEL_COLORS.length],
          sort_order: labels.length,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(`ラベル作成失敗: ${data.error ?? res.status}`);
        return;
      }
      setNewLabelName("");
      setShowAddLabel(false);
      await fetchLabels();
    } catch (e) {
      alert(`ラベル作成失敗: ${(e as Error).message}`);
    }
  };

  const deleteLabel = async (id: string) => {
    if (!confirm("このラベルを削除しますか？")) return;
    try {
      const res = await fetch("/api/line/labels", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(`削除失敗: ${data.error ?? res.status}`);
        return;
      }
      await fetchLabels();
    } catch (e) {
      alert(`削除失敗: ${(e as Error).message}`);
    }
  };

  const toggleLabelUser = async (labelId: string, lineUserId: string) => {
    if (!selectedAccount) return;
    const current = labels.find((l) => l.id === labelId);
    const assigned = !(current?.assigned_users ?? []).includes(lineUserId);
    // 楽観更新
    setLabels((prev) =>
      prev.map((l) => {
        if (l.id !== labelId) return l;
        const has = l.assigned_users.includes(lineUserId);
        return {
          ...l,
          assigned_users: has
            ? l.assigned_users.filter((u) => u !== lineUserId)
            : [lineUserId, ...l.assigned_users],
        };
      })
    );
    try {
      const res = await fetch("/api/line/labels/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label_id: labelId,
          line_user_id: lineUserId,
          account_id: selectedAccount.id,
          assigned,
          cross_account: crossAccountLabel,
        }),
      });
      if (!res.ok) {
        // 失敗時はロールバック
        await fetchLabels();
      }
    } catch {
      await fetchLabels();
    }
  };

  // アクションルール CRUD
  const openNewActionRule = () => {
    setEditingActionRule(null);
    setActionForm({
      name: "",
      status: "active",
      trigger_type: "follow",
      trigger_config: {},
      conditions: [],
      action_type: "start_sequence",
      action_config: {},
    });
    setShowActionModal(true);
  };

  const openEditActionRule = (rule: ActionRule) => {
    setEditingActionRule(rule);
    setActionForm({
      name: rule.name,
      status: rule.status,
      trigger_type: rule.trigger_type,
      trigger_config: rule.trigger_config ?? {},
      conditions: Array.isArray(rule.conditions) ? rule.conditions : [],
      action_type: rule.action_type,
      action_config: rule.action_config ?? {},
    });
    setShowActionModal(true);
  };

  const saveActionRule = async () => {
    if (!selectedAccount) return;
    if (!actionForm.name.trim()) { alert("ルール名を入力してください"); return; }
    try {
      if (editingActionRule) {
        const res = await fetch("/api/line/action-rules", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: editingActionRule.id, ...actionForm }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          alert(`更新失敗: ${data.error ?? res.status}`);
          return;
        }
      } else {
        const res = await fetch("/api/line/action-rules", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ account_id: selectedAccount.id, ...actionForm }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          alert(`作成失敗: ${data.error ?? res.status}`);
          return;
        }
      }
      setShowActionModal(false);
      await fetchActionRules();
    } catch (e) {
      alert(`保存失敗: ${(e as Error).message}`);
    }
  };

  const deleteActionRule = async (id: string) => {
    if (!confirm("このアクションルールを削除しますか？")) return;
    try {
      const res = await fetch("/api/line/action-rules", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(`削除失敗: ${data.error ?? res.status}`);
        return;
      }
      await fetchActionRules();
    } catch (e) {
      alert(`削除失敗: ${(e as Error).message}`);
    }
  };

  const toggleActionRuleStatus = async (rule: ActionRule) => {
    const next = rule.status === "active" ? "paused" : "active";
    try {
      const res = await fetch("/api/line/action-rules", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: rule.id, status: next }),
      });
      if (res.ok) await fetchActionRules();
    } catch { /* */ }
  };

  // Feature 1: Save display name
  const saveDisplayName = async () => {
    if (!selectedUser || !editNameValue.trim()) {
      setEditingName(false);
      return;
    }
    try {
      const res = await fetch("/api/line/followers", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: selectedUser.id, display_name: editNameValue.trim() }),
      });
      if (res.ok) {
        const updatedName = editNameValue.trim();
        setSelectedUser((prev) => prev ? { ...prev, display_name: updatedName } : null);
        setFollowers((prev) =>
          prev.map((f) => f.id === selectedUser.id ? { ...f, display_name: updatedName } : f)
        );
      } else {
        alert("名前の更新に失敗しました");
      }
    } catch {
      alert("名前の更新に失敗しました");
    }
    setEditingName(false);
  };

  // Feature 3: Save memo
  const saveMemo = async () => {
    if (!selectedUser) return;
    setMemoSaving(true);
    setMemoSaveMsg(null);
    try {
      const res = await fetch("/api/line/followers", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: selectedUser.id, memo: memoText }),
      });
      if (res.ok) {
        setSelectedUser((prev) => prev ? { ...prev, memo: memoText } : null);
        setFollowers((prev) =>
          prev.map((f) => f.id === selectedUser.id ? { ...f, memo: memoText } : f)
        );
        setMemoSaveMsg("保存しました");
        setTimeout(() => setMemoSaveMsg(null), 2000);
      } else {
        setMemoSaveMsg("保存に失敗しました");
      }
    } catch {
      setMemoSaveMsg("保存に失敗しました");
    } finally {
      setMemoSaving(false);
    }
  };

  // Feature 4: File attachment handlers
  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    alert(`画像「${file.name}」が選択されました。\n画像送信機能は近日公開予定です。`);
    e.target.value = "";
  };

  const handleVideoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    alert(`動画「${file.name}」が選択されました。\n動画送信機能は近日公開予定です。`);
    e.target.value = "";
  };

  // Feature 5: Template CRUD (DB永続化)
  const saveTemplate = async () => {
    if (!templateForm.name.trim() || !selectedAccount) return;
    const messages = templateForm.messages.map((m, i) => ({
      msg_order: i + 1,
      msg_type: m.msgType,
      payload: m,
      body: m.body || null,
    }));
    if (editingTemplate) {
      await fetch("/api/line/templates", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editingTemplate.id, name: templateForm.name.trim(), messages }),
      });
    } else {
      await fetch("/api/line/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ account_id: selectedAccount.id, name: templateForm.name.trim(), messages }),
      });
    }
    setTemplateForm({ name: "", messages: [emptyMessage()] });
    setEditingTemplate(null);
    setShowTemplateModal(false);
    fetchTemplates();
  };

  const deleteTemplate = async (id: string) => {
    if (!confirm("このテンプレートを削除しますか？")) return;
    await fetch("/api/line/templates", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    fetchTemplates();
  };

  const startEditTemplate = (tpl: Template) => {
    setEditingTemplate(tpl);
    const msgs: BroadcastMessage[] = (tpl.messages ?? []).map((m) => {
      if (m.payload && typeof m.payload === "object") {
        return { ...emptyMessage(), ...(m.payload as Partial<BroadcastMessage>) };
      }
      return { ...emptyMessage(), body: m.body ?? "" };
    });
    setTemplateForm({ name: tpl.name || tpl.title || "", messages: msgs.length > 0 ? msgs : [emptyMessage()] });
    setShowTemplateModal(true);
  };

  // Feature 7: Insert emoji
  const insertEmoji = (emoji: string) => {
    setChatInput((prev) => prev + emoji);
  };

  // Send LINE sticker
  const sendSticker = async (packageId: number, stickerId: number) => {
    if (!selectedUser || sendingSticker) return;
    setSendingSticker(true);
    try {
      const res = await fetch("/api/line/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          line_user_id: selectedUser.line_user_id,
          account_id: selectedAccount?.id ?? selectedUser.account_id,
          type: "sticker",
          packageId,
          stickerId,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error ?? "スタンプ送信失敗");
      } else {
        fetchMessages(selectedUser.line_user_id);
        setShowStickerPopup(false);
      }
    } catch {
      alert("スタンプ送信エラー");
    } finally {
      setSendingSticker(false);
    }
  };

  // Helper: get labels assigned to a user
  const getUserLabels = (lineUserId: string) => {
    return labels.filter((l) => l.assigned_users.includes(lineUserId));
  };

  // 商談ステータスをラベルから取得
  const getDealStatus = (lineUserId: string): string => {
    const userLabels = getUserLabels(lineUserId);
    const statusLabel = userLabels.find((l) => l.name.startsWith(DEAL_STATUS_LABEL_PREFIX));
    return statusLabel ? statusLabel.name.replace(DEAL_STATUS_LABEL_PREFIX, "") : "";
  };

  // 商談ステータス変更（ラベル自動付与/削除）
  const changeDealStatus = async (lineUserId: string, newStatus: string) => {
    if (!selectedAccount) return;
    const userLabels = getUserLabels(lineUserId);

    // 既存の商談ステータスラベルを削除
    for (const label of userLabels) {
      if (label.name.startsWith(DEAL_STATUS_LABEL_PREFIX)) {
        await toggleLabelUser(label.id, lineUserId);
      }
    }

    if (!newStatus) return; // 「未設定」なら削除のみ

    // 新しいステータスラベルを付与（なければ作成）
    const labelName = `${DEAL_STATUS_LABEL_PREFIX}${newStatus}`;
    let targetLabel = labels.find((l) => l.name === labelName);

    if (!targetLabel) {
      const statusDef = DEAL_STATUSES.find((s) => s.value === newStatus);
      const res = await fetch("/api/line/labels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          account_id: selectedAccount.id,
          name: labelName,
          color: statusDef?.color ?? "#3B82F6",
          sort_order: 1000,
        }),
      });
      if (res.ok) {
        await fetchLabels();
        // 再取得後のラベルを探す
        const updatedRes = await fetch(`/api/line/labels?account_id=${selectedAccount.id}`);
        if (updatedRes.ok) {
          const updatedLabels = await updatedRes.json();
          targetLabel = updatedLabels.find((l: { name: string }) => l.name === labelName);
        }
      }
    }

    if (targetLabel) {
      // まだ付与されていない場合のみ付与
      if (!targetLabel.assigned_users.includes(lineUserId)) {
        await toggleLabelUser(targetLabel.id, lineUserId);
      }
    }
  };

  const resetForm = () => {
    // 段階5(案B)PR-2:scenario_id 初期値は ""(未選択プレースホルダー)
    setForm({ account_name: "", channel_id: "", basic_id: "", channel_secret: "", channel_access_token: "", group_name: "", scenario_id: "", project_id: "", role: "main", order_index: 0, greeting_message: DEFAULT_GREETING_MESSAGE, newsletter_from_email: "", newsletter_from_name: "" });
    setEditingId(null);
    setSaveMsg(null);
  };

  const startEdit = (acc: LineAccount & { channel_secret?: string; channel_access_token?: string; greeting_message?: string | null }) => {
    setForm({
      account_name: acc.account_name ?? "",
      channel_id: acc.channel_id,
      basic_id: acc.basic_id ?? "",
      channel_secret: acc.channel_secret ?? "",
      channel_access_token: acc.channel_access_token ?? "",
      group_name: acc.group_name ?? "",
      // 段階5(案B)PR-2:既存値が null/undefined → "シナリオ未設定" 選択状態(__null__)で開始
      scenario_id: acc.scenario_id ?? "__null__",
      project_id: acc.project_id ?? "",
      role: acc.role === "standby" ? "standby" : acc.role === "distribute" ? "distribute" : "main",
      order_index: acc.order_index ?? 0,
      greeting_message: acc.greeting_message && acc.greeting_message.trim() !== "" ? acc.greeting_message : DEFAULT_GREETING_MESSAGE,
      newsletter_from_email: acc.newsletter_from_email ?? "",
      newsletter_from_name: acc.newsletter_from_name ?? "",
    });
    setEditingId(acc.id);
    setSaveMsg(null);
    setShowAddAccount(true);
  };

  // ワンクリックで役割切替（本番↔サブ）
  // 分散本番 (distribute) は複雑なので、このトグルでは触らない。
  // 編集フォームから明示的に選択する運用に統一。
  const toggleAccountRole = async (acc: LineAccount) => {
    if (acc.role === "distribute") {
      alert(
        "このアカウントは分散本番 (distribute) です。\n役割を変更したい場合は、編集フォームから選択してください。",
      );
      return;
    }
    const newRole: "main" | "standby" = acc.role === "main" ? "standby" : "main";
    const res = await fetch("/api/line/accounts", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: acc.id, role: newRole }),
    });
    if (res.ok) {
      fetchAccounts();
    } else {
      const data = await res.json().catch(() => ({}));
      alert(`役割切替失敗: ${data.error ?? res.status}`);
    }
  };

  // 案件から外す
  const detachAccountFromProject = async (acc: LineAccount) => {
    if (!confirm(`「${acc.account_name ?? acc.channel_id}」を現在の案件から外しますか？\n（アカウント自体は残ります）`)) return;
    const res = await fetch("/api/line/accounts", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: acc.id, detach: true }),
    });
    if (res.ok) {
      fetchAccounts();
    } else {
      const data = await res.json().catch(() => ({}));
      alert(`処理失敗: ${data.error ?? res.status}`);
    }
  };

  // アカウントを完全削除
  const deleteAccountHard = async (acc: LineAccount) => {
    if (!confirm(`「${acc.account_name ?? acc.channel_id}」を完全に削除しますか？\n\n⚠️ 紐付く友だち・メッセージ履歴も全て削除されます。取り消せません。`)) return;
    if (!confirm(`本当に削除しますか？\n「${acc.account_name ?? acc.channel_id}」と全ての関連データが失われます。`)) return;
    const res = await fetch("/api/line/accounts", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: acc.id }),
    });
    if (res.ok) {
      fetchAccounts();
    } else {
      const data = await res.json().catch(() => ({}));
      alert(`削除失敗: ${data.error ?? res.status}`);
    }
  };

  const saveAccount = async () => {
    // 新規登録時のみ secret/token を必須にする。編集時は空欄なら既存値を維持
    if (!editingId) {
      // 段階5(案B)PR-2:scenario_id 必須(空 = プレースホルダー未選択)
      // "__null__"(シナリオ未設定)は明示選択なので許容
      if (!form.scenario_id) {
        setSaveMsg({ ok: false, text: "シナリオを選択してください" });
        return;
      }
      if (!form.channel_id || !form.channel_secret || !form.channel_access_token) {
        setSaveMsg({ ok: false, text: "チャネルID・シークレット・アクセストークンは必須です" });
        return;
      }
    } else {
      if (!form.channel_id) {
        setSaveMsg({ ok: false, text: "チャネルIDは必須です" });
        return;
      }
    }
    setSaving(true);
    setSaveMsg(null);
    // 段階5(案B)PR-2:scenario_id を送信用に正規化("__null__" → null、"" → null)
    const scenarioIdForBody: string | null =
      form.scenario_id === "__null__" || !form.scenario_id ? null : form.scenario_id;
    try {
      const res = await fetch("/api/line/accounts", {
        method: editingId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          editingId
            ? { id: editingId, ...form, scenario_id: scenarioIdForBody }
            : { ...form, project_id: form.project_id || project?.id || null, scenario_id: scenarioIdForBody },
        ),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "保存失敗");
      setSaveMsg({ ok: true, text: editingId ? "更新しました" : "登録しました" });
      resetForm();
      setShowAddAccount(false);
      fetchAccounts();
    } catch (e) {
      setSaveMsg({ ok: false, text: e instanceof Error ? e.message : "エラー" });
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    fetchFollowers();
    fetchAccounts();
    fetchUnreadCounts();
    fetchAllProjects();
    fetchCloserUsers();
    fetchSmsBalance();
    fetchReports();
  }, [fetchFollowers, fetchAccounts, fetchUnreadCounts, fetchAllProjects, fetchCloserUsers, fetchSmsBalance, fetchReports]);

  // 段階5(案B)PR-1:scenarios を独立 fetch で取得(既存 fetchAllProjects に手を入れない方針)
  // /api/line/projects は各 project に scenarios 配列を埋め込んで返す(段階5 hotfix 9ea0e4e で対応済)。
  // テーブル不在(Step 01 未適用)の環境では各 project.scenarios=[] が返るので空配列で継続される。
  // 失敗時は空配列のまま(既存 UI への影響ゼロ)。
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/line/projects");
        if (!res.ok) return;
        const data = (await res.json()) as Array<{ scenarios?: Scenario[] }>;
        if (cancelled) return;
        const flat = (Array.isArray(data) ? data : []).flatMap((p) => p.scenarios ?? []);
        setScenarios(flat);
      } catch {
        /* 失敗時は空配列のまま */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (selectedAccount) {
      fetchStepSequences();
      fetchTestFollowers();
      fetchLabels();
      fetchActionRules();
      fetchTemplates();
      fetchCustomFields();
      fetchReminders();
      fetchNewsletters();
      fetchReengagements();
      fetchSurveys();
      fetchRegForms();
      fetchRichMenus();
    }
  }, [selectedAccount, fetchStepSequences, fetchTestFollowers, fetchLabels, fetchActionRules, fetchTemplates, fetchCustomFields, fetchReminders, fetchNewsletters, fetchReengagements, fetchSurveys, fetchRegForms, fetchRichMenus]);

  useEffect(() => {
    if (project?.id) {
      fetchInflowRoutes();
      fetchInflowGroups();
    }
  }, [project?.id, fetchInflowRoutes, fetchInflowGroups]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // 通知音のON/OFF をlocalStorageから復元
  useEffect(() => {
    const stored = localStorage.getItem("line_sound_enabled");
    if (stored !== null) setSoundEnabled(stored === "true");
  }, []);

  // Supabaseリアルタイム購読: 新着メッセージ
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("line-messages-realtime")
      .on(
        "postgres_changes" as "system",
        { event: "INSERT", schema: "public", table: "line_messages" } as Record<string, unknown>,
        (payload: { new: { line_user_id: string; direction: string; message_text?: string; line_account_id?: string } }) => {
          const newMsg = payload.new;
          if (newMsg.direction !== "incoming") return;

          // 未読カウント更新
          setUnreadCounts((prev) => ({
            ...prev,
            [newMsg.line_user_id]: (prev[newMsg.line_user_id] || 0) + 1,
          }));

          // 現在開いているチャットのメッセージなら自動追加
          if (selectedUser && newMsg.line_user_id === selectedUser.line_user_id) {
            fetchMessages(selectedUser.line_user_id);
          }

          // ブラウザ通知
          if (typeof Notification !== "undefined" && Notification.permission === "granted") {
            const senderName = followers.find((f) => f.line_user_id === newMsg.line_user_id)?.display_name ?? "不明";
            new Notification("LINE 新着メッセージ", {
              body: `${senderName}: ${newMsg.message_text ?? "(メディア)"}`,
              icon: "/favicon.ico",
            });
          }

          // 通知音
          if (soundEnabled && audioRef.current) {
            audioRef.current.currentTime = 0;
            audioRef.current.play().catch(() => {});
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedUser?.line_user_id, soundEnabled, fetchMessages]);

  // ブラウザ通知の許可リクエスト（初回）
  useEffect(() => {
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  const sendMessage = async () => {
    if (!chatInput.trim() || !selectedUser) return;
    setSending(true);
    try {
      const res = await fetch("/api/line/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          line_user_id: selectedUser.line_user_id,
          account_id: selectedAccount?.id ?? selectedUser.account_id,
          message: chatInput.trim(),
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error ?? "送信失敗");
        return;
      }
      setChatInput("");
      setShowEmojiPopup(false);
      fetchMessages(selectedUser.line_user_id);
    } catch {
      alert("送信エラー");
    } finally {
      setSending(false);
    }
  };

  const openAccount = (acc: LineAccount) => {
    setSelectedAccount(acc);
    setMainView("account-detail");
    setAccountSubView("chat");
    setSelectedUser(null);
  };

  // ステップ／予約配信: 保存処理（新規 or 既存シーケンス編集）
  const saveBroadcast = async (kind: "step" | "schedule", form: BroadcastForm) => {
    if (!form.name.trim() || !selectedAccount) {
      alert("管理名称を入力してください");
      return false;
    }
    if (!form.messages || form.messages.length === 0) {
      alert("メッセージが1通もありません");
      return false;
    }

    // 予約配信: 「今すぐ」か「日時指定」のいずれか必須
    let scheduledAtIso: string | null = null;
    const sendImmediate = kind === "schedule" && form.timingMode === "immediate";
    if (kind === "schedule") {
      if (form.timingMode === "immediate") {
        // 「今すぐ」: scheduled_at は現在時刻に設定し、作成後に send-now で即時配信
        scheduledAtIso = new Date().toISOString();
      } else if (form.timingMode === "datetime" && form.timingDate) {
        const dt = new Date(form.timingDate);
        if (isNaN(dt.getTime())) {
          alert("送信日時の形式が不正です");
          return false;
        }
        scheduledAtIso = dt.toISOString();
      } else {
        alert("予約配信は「今すぐ」または送信日時を指定してください");
        return false;
      }
    }

    const cleanName = form.name.trim();
    try {
      const targetConditionPayload =
        form.condition === "filtered" ? form.targetCondition : { ...emptyDeliveryCondition, mode: "all" as const };

      let sequenceId: string;
      if (editingSequenceId) {
        // 既存シーケンスを更新 + 既存メッセージを全削除
        const putRes = await fetch("/api/line/step-sequences", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: editingSequenceId,
            name: cleanName,
            status: form.status,
            kind,
            scheduled_at: scheduledAtIso,
            target_condition: targetConditionPayload,
          }),
        });
        if (!putRes.ok) {
          const data = await putRes.json().catch(() => ({}));
          alert(`シーケンス更新失敗: ${data.error ?? putRes.status}`);
          return false;
        }
        sequenceId = editingSequenceId;
        const existing = stepSequences.find((s) => s.id === editingSequenceId);
        if (existing?.messages?.length) {
          await Promise.all(
            existing.messages.map((m) =>
              fetch("/api/line/step-messages", {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id: m.id }),
              }),
            ),
          );
        }
      } else {
        // 新規シーケンス作成
        const seqRes = await fetch("/api/line/step-sequences", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            account_id: selectedAccount.id,
            name: cleanName,
            kind,
            scheduled_at: scheduledAtIso,
            target_condition: targetConditionPayload,
          }),
        });
        if (!seqRes.ok) {
          const data = await seqRes.json().catch(() => ({}));
          alert(
            `シーケンス作成失敗: ${data.error ?? seqRes.status}\n\n` +
              `DBエラーの可能性があります。\n` +
              `Supabase SQL Editor で supabase-schema-line-step.sql を実行してください。`,
          );
          return false;
        }
        const created = await seqRes.json();
        sequenceId = created.id;
      }

      // タイミングモードに応じたdelay計算
      let timingMode: "immediate" | "absolute" | "relative" = "immediate";
      let baseDelay = 0;
      let deliveryDays: number | null = null;
      let deliveryTime: string | null = null;

      if (form.timingMode === "immediate") {
        timingMode = "immediate";
        baseDelay = 0;
      } else if (form.timingMode === "daysAfter") {
        timingMode = "relative";
        baseDelay = form.timingDays * 1440 + form.timingHours * 60 + form.timingMinutes;
      } else if (form.timingMode === "datetime" && kind === "step") {
        // ステップ配信でdatetime選択の場合はabsoluteモード（N日後のHH:MM）
        timingMode = "absolute";
        deliveryDays = form.timingDays;
        deliveryTime = `${String(form.timingHours).padStart(2, "0")}:${String(form.timingMinutes).padStart(2, "0")}`;
        baseDelay = form.timingDays * 1440;
      } else {
        baseDelay = form.timingDays * 1440 + form.timingHours * 60 + form.timingMinutes;
      }

      for (let i = 0; i < form.messages.length; i++) {
        const msg = form.messages[i];
        const msgRes = await fetch("/api/line/step-messages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sequence_id: sequenceId,
            step_order: i + 1,
            delay_minutes: baseDelay,
            media: "LINE",
            title: i === 0 ? form.name.trim() : `${form.name.trim()} (${i + 1}通目)`,
            body: msg.body,
            msg_type: msg.msgType,
            payload: msg,
            status: form.status,
            timing_mode: timingMode,
            delivery_days: deliveryDays,
            delivery_time: deliveryTime,
          }),
        });
        if (!msgRes.ok) {
          const data = await msgRes.json().catch(() => ({}));
          alert(`メッセージ${i + 1}作成失敗: ${data.error ?? msgRes.status}`);
          return false;
        }
      }
      // 予約配信 + 「今すぐ」: 作成後に send-now で即時配信
      if (sendImmediate) {
        const sendRes = await fetch("/api/line/step-sequences/send-now", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: sequenceId }),
        });
        const sendData = await sendRes.json().catch(() => ({}));
        if (sendRes.ok) {
          alert(`送信完了: ${sendData.sent ?? 0}件成功 / ${sendData.failed ?? 0}件失敗`);
        } else {
          alert(`作成は成功しましたが送信に失敗しました: ${sendData.error ?? sendRes.status}`);
        }
      }
      await fetchStepSequences();
      return true;
    } catch (e) {
      alert(`保存エラー: ${(e as Error).message}`);
      return false;
    }
  };

  // 既存シーケンスを編集画面で開く（共通ロジック）
  const buildFormFromSequence = (seq: StepSequence): BroadcastForm => {
    const rawMessages = seq.messages ?? [];
    const messages: BroadcastMessage[] = rawMessages
      .slice()
      .sort((a, b) => a.step_order - b.step_order)
      .map((m) => {
        const payload = m.payload;
        if (payload && typeof payload === "object") {
          return { ...emptyMessage(), ...(payload as Partial<BroadcastMessage>) };
        }
        return { ...emptyMessage(), body: m.body ?? "" };
      });
    const firstDelay = rawMessages[0]?.delay_minutes ?? 0;
    // datetime-local 用に "YYYY-MM-DDTHH:mm" 形式へ変換（UTC→ローカル）
    const timingDate = seq.scheduled_at
      ? (() => {
          const d = new Date(seq.scheduled_at);
          const pad = (n: number) => String(n).padStart(2, "0");
          return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
        })()
      : "";
    const restoredCondition: DeliveryCondition =
      seq.target_condition && typeof seq.target_condition === "object" && Array.isArray(seq.target_condition.rows)
        ? seq.target_condition
        : emptyDeliveryCondition;
    return {
      ...emptyBroadcast,
      name: seq.name.replace(/^\[予約\]\s*/, ""),
      condition: restoredCondition.mode === "filtered" ? "filtered" : "all",
      targetCondition: restoredCondition,
      messages: messages.length > 0 ? messages : [emptyMessage()],
      timingMode:
        seq.kind === "schedule"
          ? "datetime"
          : firstDelay === 0
            ? "immediate"
            : "daysAfter",
      timingDate,
      timingDays: Math.floor(firstDelay / 1440),
      timingHours: Math.floor((firstDelay % 1440) / 60),
      timingMinutes: firstDelay % 60,
      status: seq.status === "paused" ? "paused" : "active",
    };
  };

  const openEditStep = (seq: StepSequence) => {
    setStepCreatorForm(buildFormFromSequence(seq));
    setEditingSequenceId(seq.id);
    setShowStepCreator(true);
  };

  const openEditSchedule = (seq: StepSequence) => {
    setScheduleCreatorForm(buildFormFromSequence(seq));
    setEditingSequenceId(seq.id);
    setShowScheduleCreator(true);
  };

  const openChat = (f: Follower) => {
    setSelectedUser(f);
    setMemoText(f.memo ?? "");
    setEditingName(false);
    setShowLabelPicker(false);
    setMemoSaveMsg(null);
    fetchMessages(f.line_user_id);
    // 自動既読はしない: ユーザーが「既読」ボタンを押したタイミングで解除する
    // On mobile, show chat fullscreen
    setShowMobileChat(true);
  };

  const downloadCSV = (type: "followers" | "messages") => {
    const params = new URLSearchParams({ type });
    if (selectedAccount?.id) {
      params.set("account_id", selectedAccount.id);
    }
    if (type === "messages" && selectedUser) {
      params.set("user_id", selectedUser.line_user_id);
    }
    window.open(`/api/line/export?${params}`, "_blank");
  };

  // ============================================================
  // ヘルパー
  // ============================================================
  const fmtTime = (d: string) => new Date(d).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });
  const fmtShort = (d: string) => {
    const date = new Date(d);
    const today = new Date();
    if (date.toDateString() === today.toDateString()) return fmtTime(d);
    return date.toLocaleDateString("ja-JP", { month: "short", day: "numeric" });
  };
  const fmtFull = (d: string) => new Date(d).toLocaleDateString("ja-JP", { year: "numeric", month: "long", day: "numeric" });


  // チャット一覧用: 最新メッセージで並び替え（仮：followed_atの新しい順）
  const sortedFollowers = [...followers].sort((a, b) =>
    new Date(b.followed_at).getTime() - new Date(a.followed_at).getTime()
  );

  const filteredChatFollowers = sortedFollowers.filter((f) => {
    if (!chatSearch) return true;
    return f.display_name?.toLowerCase().includes(chatSearch.toLowerCase()) ||
      f.line_user_id.includes(chatSearch);
  });

  const filteredFollowers = followers.filter((f) => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;
    return (
      (f.display_name?.toLowerCase().includes(q) ?? false) ||
      f.line_user_id.toLowerCase().includes(q)
    );
  });

  // 対象者確認モーダルを開く
  const openAudiencePreview = async (form: BroadcastForm) => {
    if (!selectedAccount) return;
    setAudiencePreview({ open: true, loading: true, total: 0, matched: 0, sample: [], unsupported: [], error: null });
    try {
      const res = await fetch("/api/line/audience-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          account_id: selectedAccount.id,
          condition:
            form.condition === "filtered"
              ? form.targetCondition
              : { ...emptyDeliveryCondition, mode: "all" },
          labels: labels.map((l) => ({ id: l.id, assigned_users: l.assigned_users })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAudiencePreview((s) => ({ ...s, loading: false, error: data.error ?? `エラー: ${res.status}` }));
        return;
      }
      setAudiencePreview({
        open: true,
        loading: false,
        total: data.total ?? 0,
        matched: data.matched ?? 0,
        sample: data.sample ?? [],
        unsupported: data.unsupported_fields ?? [],
        error: null,
      });
    } catch (e) {
      setAudiencePreview((s) => ({ ...s, loading: false, error: (e as Error).message }));
    }
  };

  // 配信条件セクション（ラジオ + 条件行 + AND/OR追加 + 対象者確認）
  const renderDeliveryConditionSection = (
    form: BroadcastForm,
    setForm: (f: BroadcastForm) => void,
    titleLabel: string,
  ) => {
    const cond = form.targetCondition;
    const setCond = (next: DeliveryCondition) => setForm({ ...form, targetCondition: next });
    const disabled = form.condition !== "filtered";

    const updateRow = (idx: number, patch: Partial<ConditionRow>) => {
      const nextRows = cond.rows.map((r, i) => (i === idx ? { ...r, ...patch } : r));
      // フィールドを変えたら op が非対応なら先頭に戻す
      if (patch.field) {
        const validOps = operatorsForField(patch.field);
        if (!validOps.includes(nextRows[idx].op)) nextRows[idx].op = validOps[0];
        nextRows[idx].value = "";
      }
      setCond({ ...cond, rows: nextRows });
    };
    const addRow = (connector: ConditionConnector) => {
      setCond({
        ...cond,
        rows: [...cond.rows, { field: "line_display_name", op: "eq", value: "" }],
        connectors: [...cond.connectors, connector],
      });
    };
    const removeRow = (idx: number) => {
      if (cond.rows.length <= 1) return;
      const nextRows = cond.rows.filter((_, i) => i !== idx);
      const nextConnectors = cond.connectors.filter((_, i) => i !== Math.max(0, idx - 1));
      setCond({ ...cond, rows: nextRows, connectors: nextConnectors });
    };

    // 全フィールド（対応済みを先頭、未対応は末尾）
    const allFields: ConditionField[] = [
      "line_display_name",
      "inflow_route",
      "followed_at_date",
      "followed_at_datetime",
      "followed_at_range_from",
      "followed_at_range_to",
      "label",
      "label_has",
      "label_not_has",
      "name",
      "email",
      "phone",
      "address",
      "gender",
      "age",
      "job",
      "custom_free_text",
      "scenario",
      "broadcast",
    ];

    return (
      <div className="px-5 py-4 border-b border-gray-200">
        <h3 className="text-xs font-bold text-gray-700 mb-3">配信条件</h3>
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input
              type="radio"
              name={`${titleLabel}-condition`}
              checked={form.condition === "all"}
              onChange={() => setForm({ ...form, condition: "all" })}
              className="accent-blue-600"
            />
            シナリオ登録者全員に配信（条件を指定しない）
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input
              type="radio"
              name={`${titleLabel}-condition`}
              checked={form.condition === "filtered"}
              onChange={() => setForm({ ...form, condition: "filtered", targetCondition: { ...cond, mode: "filtered" } })}
              className="accent-blue-600"
            />
            条件に該当する登録者に配信（条件を指定する）
          </label>

          {/* 条件行 */}
          <div className={`mt-3 space-y-2 ${disabled ? "opacity-50 pointer-events-none" : ""}`}>
            {cond.rows.map((row, idx) => {
              const kind = inputKindForRow(row);
              const ops = operatorsForField(row.field);
              return (
                <div key={idx} className="space-y-1">
                  {idx > 0 && (
                    <div className="text-[10px] font-bold text-gray-500">
                      {cond.connectors[idx - 1] ?? "AND"}
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <select
                      value={row.field}
                      onChange={(e) => updateRow(idx, { field: e.target.value as ConditionField })}
                      className="flex-1 border border-gray-300 rounded-md px-2 py-1.5 text-xs bg-white"
                    >
                      {allFields.map((f) => (
                        <option key={f} value={f}>
                          {FIELD_LABELS[f]}
                          {!isSupportedField(f) ? " (未対応)" : ""}
                        </option>
                      ))}
                    </select>
                    <select
                      value={row.op}
                      onChange={(e) => updateRow(idx, { op: e.target.value as ConditionOp })}
                      className="w-44 border border-gray-300 rounded-md px-2 py-1.5 text-xs bg-white"
                    >
                      {ops.map((o) => (
                        <option key={o} value={o}>
                          {OP_LABELS[o]}
                        </option>
                      ))}
                    </select>
                    {kind === "none" ? (
                      <div className="flex-1 text-xs text-gray-400 px-2">（値の入力不要）</div>
                    ) : kind === "select" && row.field === "inflow_route" ? (
                      <select
                        value={row.value}
                        onChange={(e) => updateRow(idx, { value: e.target.value })}
                        className="flex-1 border border-gray-300 rounded-md px-2 py-1.5 text-xs bg-white"
                      >
                        <option value="">-- 選択してください --</option>
                        {inflowRoutes.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.name}
                          </option>
                        ))}
                      </select>
                    ) : kind === "select" && (row.field === "label" || row.field === "label_has" || row.field === "label_not_has") ? (
                      <select
                        value={row.value}
                        onChange={(e) => updateRow(idx, { value: e.target.value })}
                        className="flex-1 border border-gray-300 rounded-md px-2 py-1.5 text-xs bg-white"
                      >
                        <option value="">-- ラベルを選択 --</option>
                        {labels.map((l) => (
                          <option key={l.id} value={l.id}>
                            {l.name}
                          </option>
                        ))}
                      </select>
                    ) : kind === "date" ? (
                      <input
                        type="date"
                        value={row.value}
                        onChange={(e) => updateRow(idx, { value: e.target.value })}
                        className="flex-1 border border-gray-300 rounded-md px-2 py-1.5 text-xs"
                      />
                    ) : kind === "datetime-local" ? (
                      <input
                        type="datetime-local"
                        value={row.value}
                        onChange={(e) => updateRow(idx, { value: e.target.value })}
                        className="flex-1 border border-gray-300 rounded-md px-2 py-1.5 text-xs"
                      />
                    ) : (
                      <input
                        type="text"
                        value={row.value}
                        onChange={(e) => updateRow(idx, { value: e.target.value })}
                        placeholder="値を入力"
                        className="flex-1 border border-gray-300 rounded-md px-2 py-1.5 text-xs"
                      />
                    )}
                    <button
                      type="button"
                      onClick={() => removeRow(idx)}
                      disabled={cond.rows.length <= 1}
                      className="w-8 h-8 border border-gray-300 rounded-md text-gray-500 hover:bg-gray-100 disabled:opacity-30"
                      title="この条件を削除"
                    >
                      −
                    </button>
                  </div>
                </div>
              );
            })}
            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => addRow("AND")}
                className="px-3 py-1.5 border border-blue-400 text-blue-600 hover:bg-blue-50 text-xs font-medium rounded-md"
              >
                AND条件追加
              </button>
              <button
                type="button"
                onClick={() => addRow("OR")}
                className="px-3 py-1.5 border border-blue-400 text-blue-600 hover:bg-blue-50 text-xs font-medium rounded-md"
              >
                OR条件追加
              </button>
            </div>
          </div>

          <button
            type="button"
            onClick={() => openAudiencePreview(form)}
            className="mt-3 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-medium rounded-md transition"
          >
            対象者確認
          </button>
          <p className="text-[10px] text-gray-400 mt-1">
            ※「(未対応)」のフィールドは現時点でフィルタに反映されません（無視されます）。
          </p>
        </div>
      </div>
    );
  };

  // 配信作成フォーム（ステップ配信・予約配信で共用）
  const renderBroadcastCreator = (
    form: BroadcastForm,
    setForm: (f: BroadcastForm) => void,
    onCancel: () => void,
    onSave: () => void,
    titleLabel: string,
    kind: "step" | "schedule",
  ) => {
    const msgTabs: { key: BroadcastMsgType; label: string }[] = [
      { key: "text", label: "テキスト" },
      { key: "image", label: "画像" },
      { key: "button", label: "ボタン" },
      { key: "carousel", label: "カルーセル" },
      { key: "audio", label: "音声" },
      { key: "video", label: "動画" },
      { key: "sticker", label: "スタンプ" },
      { key: "branch", label: "条件分岐" },
    ];
    const updateMsg = (mi: number, patch: Partial<BroadcastMessage>) => {
      const next = [...form.messages];
      next[mi] = { ...next[mi], ...patch };
      setForm({ ...form, messages: next });
    };
    const addMessage = () => {
      setForm({ ...form, messages: [...form.messages, emptyMessage()] });
    };
    const removeMessage = (mi: number) => {
      if (form.messages.length <= 1) return;
      setForm({ ...form, messages: form.messages.filter((_, j) => j !== mi) });
    };
    return (
      <div className="bg-gray-50 rounded-lg border border-gray-200 overflow-hidden">
        <div className="bg-white px-5 py-3 border-b border-gray-200">
          <h2 className="text-sm font-bold text-gray-800">{titleLabel}</h2>
        </div>
        {/* 管理名称 */}
        <div className="bg-white border-b border-gray-200 px-5 py-4">
          <div className="flex items-center gap-4">
            <label className="text-xs text-gray-600 font-medium w-24 flex-shrink-0">管理名称</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="flex-1 border border-gray-200 rounded-md px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
            />
          </div>
        </div>
        {/* 配信条件 */}
        {renderDeliveryConditionSection(form, setForm, titleLabel)}
        {/* 配信メッセージ */}
        <div className="px-5 py-4 border-b border-gray-200">
          <h3 className="text-xs font-bold text-gray-700 mb-3">配信メッセージ</h3>
          <div className="flex items-center gap-4 mb-3">
            <label className="text-xs text-gray-600 w-24 flex-shrink-0">カスタム送信者</label>
            <select
              value={form.customSender}
              onChange={(e) => setForm({ ...form, customSender: e.target.value })}
              className="flex-1 border border-gray-200 rounded-md px-3 py-2 text-sm bg-white"
            >
              <option value="">利用しない（デフォルト送信者で送信）</option>
            </select>
          </div>
          {/* メッセージごとに繰り返し表示 */}
          {form.messages.map((msg, mi) => (
            <div key={mi} className="mb-4">
              <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-4">
                <div className="bg-white border border-gray-200 rounded-md">
                  <div className="px-3 pt-2 flex items-center justify-between">
                    <span className="text-xs text-gray-500">メッセージ{mi + 1}</span>
                    {form.messages.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeMessage(mi)}
                        className="text-[10px] text-red-500 hover:text-red-700"
                      >
                        このメッセージを削除
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-1 border-b border-gray-200 px-3 overflow-x-auto">
                    {msgTabs.map((t) => (
                      <button
                        key={t.key}
                        type="button"
                        onClick={() => updateMsg(mi, { msgType: t.key })}
                        className={`px-2 py-2 text-xs font-medium border-b-2 transition whitespace-nowrap ${
                          msg.msgType === t.key
                            ? "border-blue-500 text-blue-600"
                            : "border-transparent text-gray-500 hover:text-gray-700"
                        }`}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                  <div className="p-3">
                    {msg.msgType === "text" && (
                      <div>
                        <label className="text-xs text-gray-600 mb-1 flex items-center gap-1">
                          本文 <span className="text-[10px] text-red-500 bg-red-50 px-1 rounded">必須</span>
                        </label>
                        <textarea
                          value={msg.body}
                          onChange={(e) => updateMsg(mi, { body: e.target.value })}
                          rows={6}
                          placeholder="テキストを入力"
                          className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm resize-none focus:border-blue-400 focus:outline-none"
                        />
                        <div className="text-[10px] text-gray-400 mt-1 space-y-1">
                          <div>
                            <p className="mb-1">① 標準置き換え文字（クリックで挿入）:</p>
                            <div className="flex flex-wrap gap-1">
                              {["{display_name}","{label_names}","{inflow_route_name}","{followed_at}","{days_since_follow}","{today}"].map((v) => (
                                <button key={v} type="button" onClick={() => updateMsg(mi, { body: (msg.body ?? "") + v })} className="px-1.5 py-0.5 bg-gray-100 hover:bg-blue-100 text-gray-600 hover:text-blue-700 rounded border border-gray-200 text-[10px] font-mono">
                                  {v}
                                </button>
                              ))}
                            </div>
                          </div>
                          {customFields.length > 0 && (
                            <div>
                              <p className="mb-1">② 独自置き換え文字（カスタムフィールド）:</p>
                              <div className="flex flex-wrap gap-1">
                                {customFields.map((cf) => {
                                  const v = `{field:${cf.field_key}}`;
                                  return (
                                    <button
                                      key={cf.id}
                                      type="button"
                                      onClick={() => updateMsg(mi, { body: (msg.body ?? "") + v })}
                                      title={cf.field_label}
                                      className="px-1.5 py-0.5 bg-purple-50 hover:bg-purple-100 text-purple-700 rounded border border-purple-200 text-[10px] font-mono"
                                    >
                                      {v}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                          {customFields.length === 0 && (
                            <p className="text-gray-300 italic">
                              独自変数を使うには「独自置き換え文字管理」でフィールドを登録してください
                            </p>
                          )}
                        </div>
                      </div>
                    )}
                    {msg.msgType === "image" && (() => {
                      const LINK_TEMPLATES: ReadonlyArray<{
                        value: BroadcastMessage["imagemapLinkType"];
                        label: string;
                        areas: ReadonlyArray<{ x: number; y: number; w: number; h: number; label: string }>;
                      }> = [
                        { value: "none", label: "リンクなし", areas: [] },
                        { value: "1", label: "リンク1", areas: [{ x:0, y:0, w:100, h:100, label:"A" }] },
                        { value: "2", label: "リンク2", areas: [{ x:0, y:0, w:50, h:100, label:"A" }, { x:50, y:0, w:50, h:100, label:"B" }] },
                        { value: "3", label: "リンク3", areas: [{ x:0, y:0, w:100, h:50, label:"A" }, { x:0, y:50, w:100, h:50, label:"B" }] },
                        { value: "4", label: "リンク4", areas: [{ x:0, y:0, w:100, h:33, label:"A" }, { x:0, y:33, w:100, h:34, label:"B" }, { x:0, y:67, w:100, h:33, label:"C" }] },
                        { value: "5", label: "リンク5", areas: [{ x:0, y:0, w:50, h:50, label:"A" }, { x:50, y:0, w:50, h:50, label:"B" }, { x:0, y:50, w:50, h:50, label:"C" }, { x:50, y:50, w:50, h:50, label:"D" }] },
                        { value: "6", label: "リンク6", areas: [{ x:0, y:0, w:100, h:50, label:"A" }, { x:0, y:50, w:50, h:50, label:"B" }, { x:50, y:50, w:50, h:50, label:"C" }] },
                        { value: "7", label: "リンク7", areas: [{ x:0, y:0, w:33, h:50, label:"A" }, { x:33, y:0, w:34, h:50, label:"B" }, { x:67, y:0, w:33, h:50, label:"C" }, { x:0, y:50, w:33, h:50, label:"D" }, { x:33, y:50, w:34, h:50, label:"E" }, { x:67, y:50, w:33, h:50, label:"F" }] },
                        { value: "8", label: "リンク8", areas: [{ x:0, y:0, w:100, h:25, label:"A" }, { x:0, y:25, w:100, h:50, label:"B" }, { x:0, y:75, w:100, h:25, label:"C" }] },
                      ];
                      return (
                      <div className="space-y-5">
                        {/* 画像ファイル */}
                        <div>
                          <div className="flex items-center gap-2 mb-2">
                            <label className="text-sm text-gray-700 font-medium">画像ファイル</label>
                            <span className="text-[10px] text-white bg-red-500 px-1.5 py-0.5 rounded">必須</span>
                          </div>
                          <div className="flex items-center gap-3">
                            <label className="cursor-pointer px-3 py-1.5 bg-gray-100 hover:bg-gray-200 border border-gray-300 rounded-md text-xs text-gray-700 transition">
                              ファイルを選択
                              <input
                                type="file"
                                accept="image/jpeg,image/png,image/webp"
                                className="hidden"
                                onChange={async (e) => {
                                  const file = e.target.files?.[0];
                                  if (!file) return;
                                  const fd = new FormData();
                                  fd.append("file", file);
                                  try {
                                    const res = await fetch("/api/line/upload-image", { method: "POST", body: fd });
                                    const data = await res.json();
                                    if (res.ok && data.url) {
                                      // 画像の実寸を取得して imagemapBaseHeight に反映
                                      const img = new Image();
                                      img.onload = () => {
                                        const h = img.naturalWidth > 0
                                          ? Math.max(1, Math.min(1040, Math.round((img.naturalHeight / img.naturalWidth) * 1040)))
                                          : 1040;
                                        updateMsg(mi, { imageUrl: data.url, imagemapBaseHeight: h });
                                      };
                                      img.onerror = () => updateMsg(mi, { imageUrl: data.url });
                                      img.src = data.url;
                                    } else {
                                      alert(data.error ?? "アップロードに失敗しました");
                                    }
                                  } catch (err) {
                                    alert(`アップロードエラー: ${(err as Error).message}`);
                                  } finally {
                                    e.target.value = "";
                                  }
                                }}
                              />
                            </label>
                            <span className="text-xs text-gray-500">
                              {msg.imageUrl ? "アップロード済み" : "選択されていません"}
                            </span>
                            {msg.imageUrl && (
                              <button
                                type="button"
                                onClick={() => updateMsg(mi, { imageUrl: "" })}
                                className="text-xs text-red-500 hover:text-red-700"
                              >
                                クリア
                              </button>
                            )}
                          </div>
                          <p className="text-[11px] text-gray-500 mt-1">幅1040pxの画像サイズを推奨します。</p>
                          <div className="mt-2">
                            <label className="text-[10px] text-gray-400 block mb-0.5">または画像URLを直接入力</label>
                            <input
                              type="url"
                              value={msg.imageUrl}
                              onChange={(e) => updateMsg(mi, { imageUrl: e.target.value })}
                              onBlur={(e) => {
                                const url = e.target.value.trim();
                                if (!url) return;
                                const img = new Image();
                                img.onload = () => {
                                  if (img.naturalWidth <= 0) return;
                                  const h = Math.max(1, Math.min(1040, Math.round((img.naturalHeight / img.naturalWidth) * 1040)));
                                  updateMsg(mi, { imagemapBaseHeight: h });
                                };
                                img.src = url;
                              }}
                              placeholder="https://example.com/image.jpg"
                              className="w-full border border-gray-200 rounded-md px-3 py-1.5 text-xs focus:border-blue-400 focus:outline-none"
                            />
                          </div>
                        </div>

                        {/* リンクの種類 */}
                        <div>
                          <div className="flex items-center gap-2 mb-3">
                            <label className="text-sm text-gray-700 font-medium">リンクの種類</label>
                            <span className="text-[10px] text-white bg-red-500 px-1.5 py-0.5 rounded">必須</span>
                          </div>
                          <div className="grid grid-cols-3 sm:grid-cols-6 gap-x-3 gap-y-4">
                            {LINK_TEMPLATES.map((tpl) => {
                              const isActive = msg.imagemapLinkType === tpl.value;
                              return (
                                <label
                                  key={tpl.value}
                                  className="flex flex-col items-start cursor-pointer group"
                                >
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const nextActions = tpl.areas.map((a) => {
                                        const existing = msg.imagemapActions.find((x) => x.area === a.label);
                                        return existing ?? { area: a.label, actionType: "uri" as const, uri: "", text: "" };
                                      });
                                      updateMsg(mi, {
                                        imagemapLinkType: tpl.value,
                                        imagemapActions: nextActions,
                                      });
                                    }}
                                    className={`w-full aspect-square bg-white border-2 ${isActive ? "border-[#06C755]" : "border-gray-200 group-hover:border-gray-300"} rounded-sm relative overflow-hidden transition`}
                                  >
                                    {tpl.areas.length === 0 ? null : (
                                      tpl.areas.map((a) => (
                                        <div
                                          key={a.label}
                                          className="absolute flex items-center justify-center text-4xl font-bold text-[#06C755] border-2 border-[#06C755]"
                                          style={{
                                            left: `${a.x}%`,
                                            top: `${a.y}%`,
                                            width: `${a.w}%`,
                                            height: `${a.h}%`,
                                          }}
                                        >
                                          {a.label}
                                        </div>
                                      ))
                                    )}
                                  </button>
                                  <div className="flex items-center gap-1.5 mt-1.5">
                                    <input
                                      type="radio"
                                      name={`imagemap-link-${mi}`}
                                      checked={isActive}
                                      onChange={() => {
                                        const nextActions = tpl.areas.map((a) => {
                                          const existing = msg.imagemapActions.find((x) => x.area === a.label);
                                          return existing ?? { area: a.label, actionType: "uri" as const, uri: "", text: "" };
                                        });
                                        updateMsg(mi, {
                                          imagemapLinkType: tpl.value,
                                          imagemapActions: nextActions,
                                        });
                                      }}
                                      className="accent-[#06C755]"
                                    />
                                    <span className="text-xs text-gray-700">{tpl.label}</span>
                                  </div>
                                </label>
                              );
                            })}
                          </div>
                        </div>

                        {/* アクション */}
                        {msg.imagemapLinkType !== "none" && msg.imagemapActions.length > 0 && (
                          <div>
                            <div className="text-sm text-gray-700 font-medium mb-2">アクション</div>
                            <div className="space-y-3">
                              {msg.imagemapActions.map((act, ai) => (
                                <div key={ai} className="border border-gray-300 rounded-md">
                                  <div className="px-3 py-2 bg-gray-50 border-b border-gray-300 text-sm text-gray-700">
                                    エリア{act.area}
                                  </div>
                                  <div className="p-3 space-y-2">
                                    <div className="flex items-center gap-2">
                                      <label className="text-xs text-gray-700">動作</label>
                                      <span className="text-[10px] text-white bg-red-500 px-1.5 py-0.5 rounded">必須</span>
                                    </div>
                                    <select
                                      value={act.actionType === "uri" && !act.uri && !act.text ? "none" : act.actionType}
                                      onChange={(e) => {
                                        const v = e.target.value;
                                        const next = [...msg.imagemapActions];
                                        if (v === "none") {
                                          next[ai] = { ...next[ai], actionType: "uri", uri: "", text: "" };
                                        } else {
                                          next[ai] = { ...next[ai], actionType: v as "uri" | "message" };
                                        }
                                        updateMsg(mi, { imagemapActions: next });
                                      }}
                                      className="w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm bg-white"
                                    >
                                      <option value="none">何もしない</option>
                                      <option value="uri">URLを開く</option>
                                      <option value="message">メッセージ送信</option>
                                    </select>
                                    {act.actionType === "uri" && (
                                      <input
                                        type="url"
                                        value={act.uri}
                                        onChange={(e) => {
                                          const next = [...msg.imagemapActions];
                                          next[ai] = { ...next[ai], uri: e.target.value };
                                          updateMsg(mi, { imagemapActions: next });
                                        }}
                                        placeholder="https://example.com"
                                        className="w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm"
                                      />
                                    )}
                                    {act.actionType === "message" && (
                                      <input
                                        type="text"
                                        value={act.text}
                                        onChange={(e) => {
                                          const next = [...msg.imagemapActions];
                                          next[ai] = { ...next[ai], text: e.target.value };
                                          updateMsg(mi, { imagemapActions: next });
                                        }}
                                        placeholder="送信するメッセージ"
                                        className="w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm"
                                      />
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* 通知欄に表示するテキスト */}
                        {msg.imagemapLinkType !== "none" && (
                          <div>
                            <label className="text-sm text-gray-700 font-medium block mb-2">通知欄に表示するテキスト</label>
                            <textarea
                              value={msg.imagemapAltText}
                              onChange={(e) => updateMsg(mi, { imagemapAltText: e.target.value.slice(0, 400) })}
                              rows={2}
                              placeholder="スマートフォンから閲覧してください。"
                              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm resize-none focus:border-blue-400 focus:outline-none"
                            />
                            <p className="text-[10px] text-gray-400 mt-1">{msg.imagemapAltText.length}/400 文字</p>
                          </div>
                        )}
                      </div>
                      );
                    })()}
                    {msg.msgType === "video" && (
                      <div className="space-y-2">
                        <label className="text-xs text-gray-600">動画URL (originalContentUrl) <span className="text-[10px] text-red-500">必須</span></label>
                        <input
                          type="url"
                          value={msg.videoUrl}
                          onChange={(e) => updateMsg(mi, { videoUrl: e.target.value })}
                          placeholder="https://example.com/video.mp4"
                          className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:border-blue-400 focus:outline-none"
                        />
                        <label className="text-xs text-gray-600">プレビュー画像URL (JPEG/PNG) <span className="text-[10px] text-red-500">必須</span></label>
                        <input
                          type="url"
                          value={msg.videoPreviewUrl}
                          onChange={(e) => updateMsg(mi, { videoPreviewUrl: e.target.value })}
                          placeholder="https://example.com/preview.jpg"
                          className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:border-blue-400 focus:outline-none"
                        />
                        <p className="text-[10px] text-gray-400">MP4、最大200MB、HTTPS必須。</p>
                      </div>
                    )}
                    {msg.msgType === "audio" && (
                      <div className="space-y-2">
                        <div>
                          <label className="text-xs text-gray-600">音声URL (m4a) <span className="text-[10px] text-red-500">必須</span></label>
                          <input
                            type="url"
                            value={msg.audioUrl}
                            onChange={(e) => updateMsg(mi, { audioUrl: e.target.value })}
                            placeholder="https://example.com/audio.m4a"
                            className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:border-blue-400 focus:outline-none"
                          />
                        </div>
                        <div>
                          <label className="text-xs text-gray-600">再生時間（秒）</label>
                          <input
                            type="number"
                            value={msg.audioDuration}
                            onChange={(e) => updateMsg(mi, { audioDuration: Number(e.target.value) })}
                            className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:border-blue-400 focus:outline-none"
                          />
                        </div>
                        <p className="text-[10px] text-gray-400">M4A形式、最大200MB、HTTPS必須。</p>
                      </div>
                    )}
                    {msg.msgType === "sticker" && (
                      <div className="space-y-2">
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-xs text-gray-600">packageId</label>
                            <input
                              type="text"
                              value={msg.stickerPackageId}
                              onChange={(e) => updateMsg(mi, { stickerPackageId: e.target.value })}
                              className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:border-blue-400 focus:outline-none"
                            />
                          </div>
                          <div>
                            <label className="text-xs text-gray-600">stickerId</label>
                            <input
                              type="text"
                              value={msg.stickerId}
                              onChange={(e) => updateMsg(mi, { stickerId: e.target.value })}
                              className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:border-blue-400 focus:outline-none"
                            />
                          </div>
                        </div>
                        <p className="text-[10px] text-gray-400">
                          一覧: <a className="text-blue-500 underline" href="https://developers.line.biz/en/docs/messaging-api/sticker-list/" target="_blank" rel="noreferrer">LINE sticker list</a>
                        </p>
                      </div>
                    )}
                    {msg.msgType === "branch" && (
                      <div className="space-y-3">
                        <p className="text-[11px] text-gray-500">ラベル付与状況に応じて配信本文を切り替えます。上から順に評価し、最初にマッチした本文を送信します。</p>
                        {(msg.branches ?? []).map((br, bi) => (
                          <div key={bi} className="border border-gray-200 rounded-md p-2 space-y-1.5 bg-gray-50">
                            <div className="flex items-center justify-between">
                              <span className="text-[11px] font-medium text-gray-700">分岐 {bi + 1}</span>
                              <button type="button" onClick={() => {
                                const next = [...(msg.branches ?? [])];
                                next.splice(bi, 1);
                                updateMsg(mi, { branches: next });
                              }} className="text-[10px] text-red-500 hover:text-red-700">削除</button>
                            </div>
                            <div>
                              <label className="text-[10px] text-gray-500">対象ラベル（いずれかを持っていれば該当）</label>
                              <select
                                multiple
                                value={br.label_ids}
                                onChange={(e) => {
                                  const ids = Array.from(e.target.selectedOptions).map((o) => o.value);
                                  const next = [...(msg.branches ?? [])];
                                  next[bi] = { ...next[bi], label_ids: ids };
                                  updateMsg(mi, { branches: next });
                                }}
                                className="w-full border border-gray-200 rounded-md px-2 py-1 text-xs bg-white"
                              >
                                {labels.map((l) => (
                                  <option key={l.id} value={l.id}>{l.name}</option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className="text-[10px] text-gray-500">本文</label>
                              <textarea
                                value={br.body}
                                onChange={(e) => {
                                  const next = [...(msg.branches ?? [])];
                                  next[bi] = { ...next[bi], body: e.target.value };
                                  updateMsg(mi, { branches: next });
                                }}
                                rows={3}
                                placeholder="このラベル向け本文"
                                className="w-full border border-gray-200 rounded-md px-2 py-1.5 text-xs resize-none"
                              />
                            </div>
                          </div>
                        ))}
                        <button type="button" onClick={() => {
                          const next = [...(msg.branches ?? []), { label_ids: [], body: "" }];
                          updateMsg(mi, { branches: next });
                        }} className="text-[11px] text-blue-600 hover:text-blue-700">＋ 分岐を追加</button>
                        <div className="border border-gray-200 rounded-md p-2 bg-white">
                          <label className="text-[10px] text-gray-500">どれにも当てはまらない場合の本文（デフォルト）</label>
                          <textarea
                            value={msg.defaultBody ?? ""}
                            onChange={(e) => updateMsg(mi, { defaultBody: e.target.value })}
                            rows={3}
                            placeholder="デフォルト本文"
                            className="w-full border border-gray-200 rounded-md px-2 py-1.5 text-xs resize-none mt-1"
                          />
                        </div>
                      </div>
                    )}
                    {msg.msgType === "button" && (
                      <div className="space-y-2">
                        <label className="text-xs text-gray-600">タイトル（任意・最大40文字）</label>
                        <input
                          type="text"
                          value={msg.buttonTitle}
                          onChange={(e) => updateMsg(mi, { buttonTitle: e.target.value })}
                          placeholder="ボタンのタイトル"
                          maxLength={40}
                          className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:border-blue-400 focus:outline-none"
                        />
                        <label className="text-xs text-gray-600">画像URL（任意・HTTPS）</label>
                        <input
                          type="url"
                          value={msg.buttonImageUrl}
                          onChange={(e) => updateMsg(mi, { buttonImageUrl: e.target.value })}
                          placeholder="https://example.com/image.jpg"
                          className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm focus:border-blue-400 focus:outline-none"
                        />
                        <label className="text-xs text-gray-600">メッセージ本文 <span className="text-[10px] text-red-500">必須</span></label>
                        <textarea
                          value={msg.buttonText}
                          onChange={(e) => updateMsg(mi, { buttonText: e.target.value })}
                          rows={2}
                          placeholder="ボタンメッセージの本文"
                          className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm resize-none focus:border-blue-400 focus:outline-none"
                        />
                        <div className="text-xs text-gray-600 pt-1">ボタン（最大4つ）</div>
                        {msg.buttonActions.map((act, i) => (
                          <div key={i} className="space-y-1 border border-gray-100 rounded-md p-2">
                            <div className="flex gap-2 items-center">
                              <select
                                value={act.actionType || "uri"}
                                onChange={(e) => {
                                  const next = [...msg.buttonActions];
                                  next[i] = { ...next[i], actionType: e.target.value as "uri" | "postback" | "message" };
                                  updateMsg(mi, { buttonActions: next });
                                }}
                                className="border border-gray-200 rounded-md px-2 py-1.5 text-xs bg-white"
                              >
                                <option value="uri">URLを開く</option>
                                <option value="postback">Postback</option>
                                <option value="message">メッセージ送信</option>
                              </select>
                              <input
                                type="text"
                                value={act.label}
                                onChange={(e) => {
                                  const next = [...msg.buttonActions];
                                  next[i] = { ...next[i], label: e.target.value };
                                  updateMsg(mi, { buttonActions: next });
                                }}
                                placeholder="ラベル"
                                className="flex-1 border border-gray-200 rounded-md px-2 py-1.5 text-xs"
                              />
                              <button
                                type="button"
                                onClick={() => updateMsg(mi, { buttonActions: msg.buttonActions.filter((_, j) => j !== i) })}
                                className="px-2 text-xs text-red-500 hover:text-red-700"
                              >
                                削除
                              </button>
                            </div>
                            {(act.actionType || "uri") === "uri" && (
                              <input
                                type="url"
                                value={act.uri}
                                onChange={(e) => {
                                  const next = [...msg.buttonActions];
                                  next[i] = { ...next[i], uri: e.target.value };
                                  updateMsg(mi, { buttonActions: next });
                                }}
                                placeholder="https://example.com"
                                className="w-full border border-gray-200 rounded-md px-2 py-1.5 text-xs"
                              />
                            )}
                            {(act.actionType || "uri") === "postback" && (
                              <div className="space-y-1">
                                <input
                                  type="text"
                                  value={act.data}
                                  onChange={(e) => {
                                    const next = [...msg.buttonActions];
                                    next[i] = { ...next[i], data: e.target.value };
                                    updateMsg(mi, { buttonActions: next });
                                  }}
                                  placeholder="Postbackデータ（自動処理用キー）"
                                  className="w-full border border-gray-200 rounded-md px-2 py-1.5 text-xs"
                                />
                                <input
                                  type="text"
                                  value={act.text}
                                  onChange={(e) => {
                                    const next = [...msg.buttonActions];
                                    next[i] = { ...next[i], text: e.target.value };
                                    updateMsg(mi, { buttonActions: next });
                                  }}
                                  placeholder="表示テキスト（任意）"
                                  className="w-full border border-gray-200 rounded-md px-2 py-1.5 text-xs"
                                />
                              </div>
                            )}
                            {(act.actionType || "uri") === "message" && (
                              <input
                                type="text"
                                value={act.text}
                                onChange={(e) => {
                                  const next = [...msg.buttonActions];
                                  next[i] = { ...next[i], text: e.target.value };
                                  updateMsg(mi, { buttonActions: next });
                                }}
                                placeholder="送信するメッセージテキスト"
                                className="w-full border border-gray-200 rounded-md px-2 py-1.5 text-xs"
                              />
                            )}
                          </div>
                        ))}
                        {msg.buttonActions.length < 4 && (
                          <button
                            type="button"
                            onClick={() => updateMsg(mi, { buttonActions: [...msg.buttonActions, { label: "", uri: "", actionType: "uri" as const, data: "", text: "" }] })}
                            className="text-xs text-blue-600 hover:text-blue-800"
                          >
                            + ボタンを追加
                          </button>
                        )}
                      </div>
                    )}
                    {msg.msgType === "carousel" && (
                      <div className="space-y-3">
                        {msg.carouselColumns.map((col, i) => (
                          <div key={i} className="border border-gray-200 rounded-md p-2 space-y-1.5">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-medium text-gray-600">カラム{i + 1}</span>
                              {msg.carouselColumns.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => updateMsg(mi, { carouselColumns: msg.carouselColumns.filter((_, j) => j !== i) })}
                                  className="text-[10px] text-red-500"
                                >
                                  削除
                                </button>
                              )}
                            </div>
                            <input
                              type="text"
                              value={col.title}
                              onChange={(e) => {
                                const next = [...msg.carouselColumns];
                                next[i] = { ...next[i], title: e.target.value };
                                updateMsg(mi, { carouselColumns: next });
                              }}
                              placeholder="タイトル"
                              className="w-full border border-gray-200 rounded-md px-2 py-1 text-xs"
                            />
                            <textarea
                              value={col.text}
                              onChange={(e) => {
                                const next = [...msg.carouselColumns];
                                next[i] = { ...next[i], text: e.target.value };
                                updateMsg(mi, { carouselColumns: next });
                              }}
                              rows={2}
                              placeholder="説明文"
                              className="w-full border border-gray-200 rounded-md px-2 py-1 text-xs resize-none"
                            />
                            <input
                              type="url"
                              value={col.imageUrl}
                              onChange={(e) => {
                                const next = [...msg.carouselColumns];
                                next[i] = { ...next[i], imageUrl: e.target.value };
                                updateMsg(mi, { carouselColumns: next });
                              }}
                              placeholder="画像URL（任意）"
                              className="w-full border border-gray-200 rounded-md px-2 py-1 text-xs"
                            />
                            <div className="space-y-1.5">
                              <div className="flex gap-1.5 items-center">
                                <select
                                  value={col.actionType || "uri"}
                                  onChange={(e) => {
                                    const next = [...msg.carouselColumns];
                                    next[i] = { ...next[i], actionType: e.target.value as "uri" | "postback" | "message" };
                                    updateMsg(mi, { carouselColumns: next });
                                  }}
                                  className="border border-gray-200 rounded-md px-1.5 py-1 text-xs bg-white"
                                >
                                  <option value="uri">URL</option>
                                  <option value="postback">Postback</option>
                                  <option value="message">メッセージ</option>
                                </select>
                                <input
                                  type="text"
                                  value={col.label}
                                  onChange={(e) => {
                                    const next = [...msg.carouselColumns];
                                    next[i] = { ...next[i], label: e.target.value };
                                    updateMsg(mi, { carouselColumns: next });
                                  }}
                                  placeholder="ボタン名"
                                  className="flex-1 border border-gray-200 rounded-md px-2 py-1 text-xs"
                                />
                              </div>
                              {(col.actionType || "uri") === "uri" && (
                                <input
                                  type="url"
                                  value={col.uri}
                                  onChange={(e) => {
                                    const next = [...msg.carouselColumns];
                                    next[i] = { ...next[i], uri: e.target.value };
                                    updateMsg(mi, { carouselColumns: next });
                                  }}
                                  placeholder="ボタンURL"
                                  className="w-full border border-gray-200 rounded-md px-2 py-1 text-xs"
                                />
                              )}
                              {(col.actionType || "uri") === "postback" && (
                                <>
                                  <input
                                    type="text"
                                    value={col.data || ""}
                                    onChange={(e) => {
                                      const next = [...msg.carouselColumns];
                                      next[i] = { ...next[i], data: e.target.value };
                                      updateMsg(mi, { carouselColumns: next });
                                    }}
                                    placeholder="Postbackデータ"
                                    className="w-full border border-gray-200 rounded-md px-2 py-1 text-xs"
                                  />
                                  <input
                                    type="text"
                                    value={col.actionText || ""}
                                    onChange={(e) => {
                                      const next = [...msg.carouselColumns];
                                      next[i] = { ...next[i], actionText: e.target.value };
                                      updateMsg(mi, { carouselColumns: next });
                                    }}
                                    placeholder="表示テキスト（任意）"
                                    className="w-full border border-gray-200 rounded-md px-2 py-1 text-xs"
                                  />
                                </>
                              )}
                              {(col.actionType || "uri") === "message" && (
                                <input
                                  type="text"
                                  value={col.actionText || ""}
                                  onChange={(e) => {
                                    const next = [...msg.carouselColumns];
                                    next[i] = { ...next[i], actionText: e.target.value };
                                    updateMsg(mi, { carouselColumns: next });
                                  }}
                                  placeholder="送信するメッセージ"
                                  className="w-full border border-gray-200 rounded-md px-2 py-1 text-xs"
                                />
                              )}
                            </div>
                          </div>
                        ))}
                        {msg.carouselColumns.length < 10 && (
                          <button
                            type="button"
                            onClick={() => updateMsg(mi, { carouselColumns: [...msg.carouselColumns, { title: "", text: "", imageUrl: "", uri: "", label: "詳細", actionType: "uri" as const, data: "", actionText: "" }] })}
                            className="text-xs text-blue-600 hover:text-blue-800"
                          >
                            + カラムを追加（最大10）
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* LINE風プレビュー */}
                <div className="bg-[#8CABD8] rounded-lg p-3 flex flex-col gap-2 min-h-[320px]">
                  <div className="text-[10px] text-white/80 text-center font-medium">プレビュー</div>
                  <div className="flex items-start gap-2">
                    <div className="w-8 h-8 rounded-full bg-white/80 flex items-center justify-center flex-shrink-0 text-[10px] text-gray-500">L</div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[10px] text-white/90 mb-0.5">{selectedAccount?.account_name ?? "LINE公式"}</div>
                      {msg.msgType === "text" && (
                        <div className="inline-block max-w-full bg-white rounded-2xl rounded-tl-sm px-3 py-2 text-xs text-gray-800 whitespace-pre-wrap break-words shadow-sm">
                          {msg.body || <span className="text-gray-400">テキストを入力するとここにプレビューされます</span>}
                        </div>
                      )}
                      {msg.msgType === "image" && (
                        msg.imageUrl ? (
                          <div className="inline-block relative">
                            <img src={msg.imageUrl} alt="preview" className="max-w-full rounded-lg shadow-sm" />
                            {msg.imagemapLinkType !== "none" && (() => {
                              const areaDefs: Record<string, Array<{x:number;y:number;w:number;h:number;label:string}>> = {
                                "1": [{ x:0, y:0, w:100, h:100, label:"A" }],
                                "2": [{ x:0, y:0, w:50, h:100, label:"A" }, { x:50, y:0, w:50, h:100, label:"B" }],
                                "3": [{ x:0, y:0, w:100, h:50, label:"A" }, { x:0, y:50, w:100, h:50, label:"B" }],
                                "4": [{ x:0, y:0, w:100, h:33, label:"A" }, { x:0, y:33, w:100, h:34, label:"B" }, { x:0, y:67, w:100, h:33, label:"C" }],
                                "5": [{ x:0, y:0, w:50, h:50, label:"A" }, { x:50, y:0, w:50, h:50, label:"B" }, { x:0, y:50, w:50, h:50, label:"C" }, { x:50, y:50, w:50, h:50, label:"D" }],
                                "6": [{ x:0, y:0, w:100, h:50, label:"A" }, { x:0, y:50, w:50, h:50, label:"B" }, { x:50, y:50, w:50, h:50, label:"C" }],
                                "7": [{ x:0, y:0, w:33, h:50, label:"A" }, { x:33, y:0, w:34, h:50, label:"B" }, { x:67, y:0, w:33, h:50, label:"C" }, { x:0, y:50, w:33, h:50, label:"D" }, { x:33, y:50, w:34, h:50, label:"E" }, { x:67, y:50, w:33, h:50, label:"F" }],
                                "8": [{ x:0, y:0, w:100, h:25, label:"A" }, { x:0, y:25, w:100, h:50, label:"B" }, { x:0, y:75, w:100, h:25, label:"C" }],
                              };
                              const areas = areaDefs[msg.imagemapLinkType] ?? [];
                              return areas.map((a) => (
                                <div
                                  key={a.label}
                                  className="absolute border border-[#06C755] bg-[#06C755]/10 flex items-center justify-center text-[#06C755] font-bold text-xs pointer-events-none"
                                  style={{
                                    left: `${a.x}%`,
                                    top: `${a.y}%`,
                                    width: `${a.w}%`,
                                    height: `${a.h}%`,
                                  }}
                                >
                                  {a.label}
                                </div>
                              ));
                            })()}
                          </div>
                        ) : (
                          <div className="inline-block bg-white rounded-lg p-6 text-[10px] text-gray-400 shadow-sm">画像URL未入力</div>
                        )
                      )}
                      {msg.msgType === "video" && (
                        msg.videoPreviewUrl ? (
                          <div className="relative inline-block">
                            <img src={msg.videoPreviewUrl} alt="video" className="max-w-full rounded-lg shadow-sm" />
                            <div className="absolute inset-0 flex items-center justify-center">
                              <div className="w-10 h-10 bg-black/60 rounded-full flex items-center justify-center text-white">▶</div>
                            </div>
                          </div>
                        ) : (
                          <div className="inline-block bg-white rounded-lg p-6 text-[10px] text-gray-400 shadow-sm">動画プレビュー画像URL未入力</div>
                        )
                      )}
                      {msg.msgType === "audio" && (
                        <div className="inline-block bg-white rounded-2xl px-3 py-2 text-xs shadow-sm">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-full bg-[#06C755] flex items-center justify-center text-white">▶</div>
                            <span className="text-gray-500">{(msg.audioDuration / 1000).toFixed(1)}秒</span>
                          </div>
                        </div>
                      )}
                      {msg.msgType === "sticker" && msg.stickerPackageId && msg.stickerId && (
                        <img
                          src={`https://stickershop.line-scdn.net/stickershop/v1/sticker/${msg.stickerId}/android/sticker.png`}
                          alt="sticker"
                          className="w-24 h-24 object-contain"
                        />
                      )}
                      {msg.msgType === "button" && (
                        <div className="inline-block bg-white rounded-lg overflow-hidden shadow-sm w-full max-w-[220px]">
                          {msg.buttonImageUrl && <img src={msg.buttonImageUrl} alt="" className="w-full h-24 object-cover" />}
                          {msg.buttonTitle && <div className="px-3 pt-2 text-xs font-bold text-gray-800">{msg.buttonTitle}</div>}
                          <div className="p-3 text-xs text-gray-800 whitespace-pre-wrap break-words">
                            {msg.buttonText || <span className="text-gray-400">本文を入力</span>}
                          </div>
                          <div className="border-t border-gray-100">
                            {msg.buttonActions.map((a, i) => (
                              <div key={i} className="px-3 py-2 text-xs text-[#06C755] border-b border-gray-100 last:border-b-0 text-center flex items-center justify-center gap-1">
                                {(a.actionType || "uri") === "postback" && <span className="text-[8px] bg-orange-100 text-orange-600 px-1 rounded">PB</span>}
                                {(a.actionType || "uri") === "message" && <span className="text-[8px] bg-blue-100 text-blue-600 px-1 rounded">MSG</span>}
                                {a.label || "ボタン"}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {msg.msgType === "carousel" && (
                        <div className="flex gap-2 overflow-x-auto pb-2">
                          {msg.carouselColumns.map((c, i) => (
                            <div key={i} className="flex-shrink-0 w-36 bg-white rounded-lg overflow-hidden shadow-sm">
                              {c.imageUrl && <img src={c.imageUrl} alt="" className="w-full h-20 object-cover" />}
                              <div className="p-2">
                                <div className="text-xs font-bold text-gray-800 truncate">{c.title || "タイトル"}</div>
                                <div className="text-[10px] text-gray-500 line-clamp-2">{c.text || "説明"}</div>
                              </div>
                              <div className="border-t border-gray-100 px-2 py-1.5 text-[10px] text-[#06C755] text-center">
                                {c.label || "詳細"}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      {msg.msgType === "branch" && (
                        <div className="space-y-1">
                          <div className="text-[10px] text-gray-400">条件分岐（配信時に評価）</div>
                          {(msg.branches ?? []).map((br, i) => (
                            <div key={i} className="border-l-2 border-blue-300 pl-2 text-[11px] text-gray-600">
                              <div className="text-blue-600">if ラベル: {br.label_ids.length}件</div>
                              <div className="whitespace-pre-wrap">{br.body || "（未入力）"}</div>
                            </div>
                          ))}
                          {msg.defaultBody && (
                            <div className="border-l-2 border-gray-300 pl-2 text-[11px] text-gray-600">
                              <div className="text-gray-500">default</div>
                              <div className="whitespace-pre-wrap">{msg.defaultBody}</div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
          <div className="flex gap-2 mt-1">
            <button
              type="button"
              onClick={addMessage}
              className="px-3 py-1.5 text-xs text-green-600 border border-green-600 rounded-md hover:bg-green-50"
            >
              + 追加（{form.messages.length + 1}通目）
            </button>
          </div>
        </div>
        {/* 送信のタイミング */}
        <div className="px-5 py-4 border-b border-gray-200">
          <h3 className="text-xs font-bold text-gray-700 mb-3">
            送信のタイミング <span className="text-[10px] text-red-500 bg-red-50 px-1 rounded">必須</span>
          </h3>
          <div className="space-y-2">
            <label
              className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer"
              title={kind === "step" ? "友達登録した瞬間に送信されます" : undefined}
            >
              <input
                type="radio"
                name={`${titleLabel}-timing`}
                checked={form.timingMode === "immediate"}
                onChange={() => setForm({ ...form, timingMode: "immediate" })}
                className="accent-blue-600"
              />
              {kind === "step" ? "シナリオ登録直後" : "今すぐ"}
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input
                type="radio"
                name={`${titleLabel}-timing`}
                checked={form.timingMode === "datetime"}
                onChange={() => setForm({ ...form, timingMode: "datetime" })}
                className="accent-blue-600"
              />
              送信日時を指定
              {form.timingMode === "datetime" && (
                <input
                  type="datetime-local"
                  value={form.timingDate}
                  onChange={(e) => setForm({ ...form, timingDate: e.target.value })}
                  className="ml-2 border border-gray-200 rounded-md px-2 py-1 text-xs"
                />
              )}
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input
                type="radio"
                name={`${titleLabel}-timing`}
                checked={form.timingMode === "daysAfter"}
                onChange={() => setForm({ ...form, timingMode: "daysAfter" })}
                className="accent-blue-600"
              />
              登録N日後の指定時刻に送信
              {form.timingMode === "daysAfter" && (
                <span className="ml-2 flex items-center gap-1 text-xs">
                  （登録
                  <input
                    type="number"
                    min={0}
                    value={form.timingDays}
                    onChange={(e) => setForm({ ...form, timingDays: Number(e.target.value) })}
                    className="w-12 border border-gray-200 rounded px-1 py-0.5 text-xs"
                  />
                  日後の
                  <input
                    type="number"
                    min={0}
                    max={23}
                    value={form.timingHours}
                    onChange={(e) => setForm({ ...form, timingHours: Number(e.target.value) })}
                    className="w-12 border border-gray-200 rounded px-1 py-0.5 text-xs"
                  />
                  時
                  <input
                    type="number"
                    min={0}
                    max={59}
                    value={form.timingMinutes}
                    onChange={(e) => setForm({ ...form, timingMinutes: Number(e.target.value) })}
                    className="w-12 border border-gray-200 rounded px-1 py-0.5 text-xs"
                  />
                  分）
                </span>
              )}
            </label>
          </div>
        </div>
        {/* 追加オプション */}
        <div className="px-5 py-4 border-b border-gray-200 space-y-3 text-sm">
          <div className="flex items-center gap-4">
            <label className="text-xs text-gray-600 w-36 flex-shrink-0">既存読者への送信</label>
            <select
              value={form.existingReaderAction}
              onChange={(e) => setForm({ ...form, existingReaderAction: e.target.value })}
              className="flex-1 border border-gray-200 rounded-md px-3 py-2 text-sm bg-white"
            >
              <option>配信時間前の読者：配信予約　配信時間後の読者：配信しない</option>
              <option>配信時間前の読者：配信予約　配信時間後の読者：即時配信</option>
            </select>
          </div>
          <div className="flex items-center gap-4">
            <label className="text-xs text-gray-600 w-36 flex-shrink-0">送信後に実行するアクション</label>
            <select
              value={form.postAction}
              onChange={(e) => setForm({ ...form, postAction: e.target.value })}
              className="flex-1 border border-gray-200 rounded-md px-3 py-2 text-sm bg-white"
            >
              <option>実行しない</option>
            </select>
          </div>
          <div className="flex items-center gap-4">
            <label className="text-xs text-gray-600 w-36 flex-shrink-0">URL置換ドメイン</label>
            <select
              value={form.urlDomain}
              onChange={(e) => setForm({ ...form, urlDomain: e.target.value })}
              className="flex-1 border border-gray-200 rounded-md px-3 py-2 text-sm bg-white"
            >
              <option>デフォルト</option>
            </select>
          </div>
          <div className="flex items-center gap-4">
            <label className="text-xs text-gray-600 w-36 flex-shrink-0">テスト送信</label>
            <div className="flex-1 flex items-center gap-2">
              <select
                value={form.testTargetId}
                onChange={(e) => setForm({ ...form, testTargetId: e.target.value })}
                className="flex-1 border border-gray-200 rounded-md px-3 py-2 text-sm bg-white"
              >
                <option value="">
                  {testFollowers.length === 0
                    ? "テストアカウントが登録されていません（友だち一覧からテストアカウントに追加）"
                    : "テスト送信先アカウントを選択してください"}
                </option>
                {testFollowers.map((f) => (
                  <option key={f.id} value={f.line_user_id}>
                    {f.display_name ?? "名前なし"}（{f.line_user_id.slice(0, 10)}...）
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={!form.testTargetId}
                onClick={async () => {
                  try {
                    const firstMsg = form.messages[0];
                    const isTextOnly = firstMsg?.msgType === "text";
                    const payload = isTextOnly
                      ? { line_user_id: form.testTargetId, account_id: selectedAccount?.id, message: firstMsg?.body ?? "" }
                      : { line_user_id: form.testTargetId, account_id: selectedAccount?.id, messages: form.messages };
                    const res = await fetch("/api/line/send", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify(payload),
                    });
                    if (res.ok) {
                      alert("テスト送信しました");
                    } else {
                      const data = await res.json().catch(() => ({}));
                      alert(`テスト送信失敗: ${data.error ?? res.status}`);
                    }
                  } catch (e) {
                    alert(`送信エラー: ${(e as Error).message}`);
                  }
                }}
                className="px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-xs font-medium rounded-md"
              >
                送信
              </button>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <label className="text-xs text-gray-600 w-36 flex-shrink-0">ステータス</label>
            <select
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value as "active" | "paused" })}
              className="flex-1 border border-gray-200 rounded-md px-3 py-2 text-sm bg-white"
            >
              <option value="active">稼働中</option>
              <option value="paused">一時停止</option>
            </select>
          </div>
        </div>
        {/* アクションボタン */}
        <div className="px-5 py-4 bg-white flex gap-2">
          <button
            type="button"
            onClick={onSave}
            className="px-6 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-md transition"
          >
            保存
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="px-5 py-2 bg-gray-100 hover:bg-gray-200 text-gray-600 text-sm rounded-md transition"
          >
            キャンセル
          </button>
        </div>
      </div>
    );
  };

  const StatusBadge = ({ status }: { status: string }) => {
    const styles: Record<string, string> = {
      following: "bg-green-100 text-green-700",
      unfollowed: "bg-gray-100 text-gray-500",
      blocked: "bg-red-100 text-red-600",
    };
    const labelsMap: Record<string, string> = {
      following: "友だち", unfollowed: "解除", blocked: "ブロック",
    };
    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${styles[status] ?? styles.unfollowed}`}>
        {labelsMap[status] ?? status}
      </span>
    );
  };

  // ============================================================
  // サイドバーメニュー定義
  // ============================================================
  const accountDetailMenu: { key: AccountSubView; label: string; icon: React.ReactNode }[] = [
    { key: "chat", label: "LINE チャット", icon: Icons.chat },
    { key: "followers", label: "LINE 友だち", icon: Icons.users },
    { key: "step", label: "ステップ配信", icon: Icons.step },
    { key: "schedule", label: "予約配信", icon: Icons.schedule },
    { key: "sent", label: "送信済み", icon: Icons.download },
    { key: "rich-menu", label: "リッチメニュー", icon: Icons.template },
    { key: "labels", label: "ラベル管理", icon: Icons.label },
    { key: "actions", label: "アクション管理", icon: Icons.settings },
    { key: "templates", label: "テンプレート管理", icon: Icons.document },
    { key: "custom-fields", label: "独自置き換え文字", icon: Icons.settings },
    { key: "surveys", label: "アンケート", icon: Icons.document },
    { key: "reg-forms", label: "登録フォーム", icon: Icons.friendAdd },
    { key: "reengagement", label: "掘り起こし配信", icon: Icons.send },
    { key: "reminders", label: "リマインダ配信", icon: Icons.schedule },
    { key: "newsletter", label: "メルマガ", icon: Icons.document },
    { key: "inflow", label: "流入経路", icon: Icons.friendAdd },
    { key: "reports", label: "レポート", icon: Icons.download },
  ];

  // ============================================================
  // レンダリング
  // ============================================================
  return (
    !authChecked ? <div className="min-h-screen bg-[#1e2744] flex items-center justify-center"><div className="text-white/50 text-sm">読み込み中...</div></div> : <div className="min-h-screen h-screen bg-[#f5f6fa] text-gray-800 flex overflow-hidden">

      {/* Hidden file inputs for image/video */}
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleImageSelect}
      />
      <input
        ref={videoInputRef}
        type="file"
        accept="video/*"
        className="hidden"
        onChange={handleVideoSelect}
      />

      {/* ===== Mobile overlay for sidebar ===== */}
      {showMobileSidebar && (
        <div className="fixed inset-0 bg-black/40 z-40 md:hidden" onClick={() => setShowMobileSidebar(false)} />
      )}

      {/* ===== 左サイドバー ===== */}
      <aside className={`${showMobileSidebar ? "translate-x-0" : "-translate-x-full"} md:translate-x-0 fixed md:relative z-50 md:z-auto w-52 bg-[#1e2744] text-white flex flex-col flex-shrink-0 h-full transition-transform duration-200`}>
        {/* ロゴ + 案件名 */}
        <div className="px-4 py-3 border-b border-white/10">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: project?.color || "#06C755" }}>
              <span className="text-white text-xs font-bold">{project?.name?.charAt(0) || "L"}</span>
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-bold text-sm text-white truncate">{project?.name || "LINE ハーネス"}</div>
              <div className="text-[10px] text-white/40">LINE Harness</div>
            </div>
            {/* Mobile close button */}
            <button onClick={() => setShowMobileSidebar(false)} className="md:hidden text-white/50 hover:text-white">
              {Icons.close}
            </button>
          </div>
          <button
            onClick={() => router.push("/line/projects")}
            className="mt-2 w-full px-2 py-1 text-[11px] text-white/50 hover:text-white hover:bg-white/10 rounded-md transition text-center border border-white/10"
          >
            案件を切り替える
          </button>
        </div>

        <nav className="flex-1 py-2 overflow-y-auto">
          {/* メインビューがaccountsまたはsettings */}
          {mainView !== "account-detail" ? (
            <>
              <div className="px-3 pt-2 pb-1">
                <span className="text-[10px] uppercase tracking-wider text-white/40 font-medium">シナリオ管理</span>
              </div>
              <button
                onClick={() => { setMainView("accounts"); setSelectedAccount(null); setSelectedUser(null); setShowMobileSidebar(false); }}
                className={`w-full flex items-center gap-2.5 px-4 py-2 text-[13px] transition-colors ${mainView === "accounts" ? "bg-white/10 text-white border-l-[3px] border-[#06C755]" : "text-white/60 hover:text-white hover:bg-white/5"}`}
              >
                {Icons.users}
                配信アカウント
              </button>

              <div className="px-3 pt-4 pb-1">
                <span className="text-[10px] uppercase tracking-wider text-white/40 font-medium">ツール</span>
              </div>
              <button onClick={() => downloadCSV("followers")} className="w-full flex items-center gap-2.5 px-4 py-2 text-[13px] text-white/60 hover:text-white hover:bg-white/5 transition-colors">
                {Icons.download}
                友だちCSV
              </button>
              <button onClick={() => downloadCSV("messages")} className="w-full flex items-center gap-2.5 px-4 py-2 text-[13px] text-white/60 hover:text-white hover:bg-white/5 transition-colors">
                {Icons.download}
                履歴CSV
              </button>

              <div className="px-3 pt-4 pb-1">
                <span className="text-[10px] uppercase tracking-wider text-white/40 font-medium">設定</span>
              </div>
              <button
                onClick={() => { setMainView("settings"); setShowMobileSidebar(false); }}
                className={`w-full flex items-center gap-2.5 px-4 py-2 text-[13px] transition-colors ${mainView === "settings" ? "bg-white/10 text-white border-l-[3px] border-[#06C755]" : "text-white/60 hover:text-white hover:bg-white/5"}`}
              >
                {Icons.settings}
                アカウント管理
              </button>
            </>
          ) : (
            /* アカウント詳細時のサイドバー */
            <>
              <button
                onClick={() => { setMainView("accounts"); setSelectedAccount(null); setSelectedUser(null); setShowMobileSidebar(false); }}
                className="w-full flex items-center gap-2 px-4 py-2.5 text-[13px] text-white/50 hover:text-white hover:bg-white/5 transition-colors border-b border-white/10"
              >
                {Icons.back}
                アカウント一覧に戻る
              </button>

              {/* 選択中アカウント名 */}
              <div className="px-4 py-3 border-b border-white/10">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-[#06C755] flex items-center justify-center flex-shrink-0">
                    <span className="text-white text-[10px] font-bold">L</span>
                  </div>
                  <span className="text-xs font-medium text-white truncate">{selectedAccount?.account_name ?? "アカウント"}</span>
                </div>
              </div>

              {accountDetailMenu.map((item) => (
                <button
                  key={item.key}
                  onClick={() => { setAccountSubView(item.key); setSelectedUser(null); setShowMobileSidebar(false); }}
                  className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-[13px] transition-colors ${accountSubView === item.key ? "bg-[#4f8ff7] text-white" : "text-white/60 hover:text-white hover:bg-white/5"}`}
                >
                  {item.icon}
                  {item.label}
                </button>
              ))}

              <div className="px-3 pt-4 pb-1">
                <span className="text-[10px] uppercase tracking-wider text-white/40 font-medium">その他</span>
              </div>
              <button
                onClick={() => { setMainView("settings"); setShowMobileSidebar(false); }}
                className="w-full flex items-center gap-2.5 px-4 py-2 text-[13px] text-white/60 hover:text-white hover:bg-white/5 transition-colors"
              >
                {Icons.settings}
                アカウント設定
              </button>
            </>
          )}
        </nav>

        <div className="px-4 py-2.5 border-t border-white/10 text-[10px] text-white/30">
          LINE Harness v1.0
        </div>
      </aside>

      {/* ===== メインエリア ===== */}
      <div className="flex-1 flex flex-col min-w-0">

        {/* Mobile top bar with hamburger */}
        <div className="md:hidden bg-[#1e2744] text-white px-3 py-2 flex items-center gap-3 flex-shrink-0">
          <button onClick={() => setShowMobileSidebar(true)} className="p-1">
            {Icons.menu}
          </button>
          <span className="text-sm font-medium truncate">{project?.name || "LINE ハーネス"}</span>
        </div>

        {/* ============================================================ */}
        {/* アカウント一覧 */}
        {/* ============================================================ */}
        {mainView === "accounts" && (
          <>
            <header className="bg-white border-b border-gray-200 px-4 md:px-6 py-3 flex items-center justify-between flex-shrink-0">
              <h1 className="text-base font-bold text-gray-800">アカウント一覧</h1>
              <button
                onClick={() => {
                  setBulkProjectId(project?.id ?? "");
                  setBulkRows(Array.from({ length: 10 }, () => emptyBulkRow()));
                  setShowWizard(true);
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-md transition"
              >
                {Icons.plus}
                新規登録
              </button>
            </header>

            <main className="flex-1 overflow-y-auto p-4 md:p-6">
              {/* アカウント追加モーダル */}
              {showAddAccount && (
                <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
                  <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
                    <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
                      <h3 className="font-bold text-gray-800">{editingId ? "アカウント編集" : "新規アカウント追加"}</h3>
                      <button onClick={() => { setShowAddAccount(false); resetForm(); }} className="text-gray-400 hover:text-gray-600">{Icons.close}</button>
                    </div>
                    <div className="p-5 space-y-3">
                      <div>
                        <label className="text-xs text-gray-500 block mb-1 font-medium">アカウント名</label>
                        <input type="text" value={form.account_name} onChange={(e) => setForm({ ...form, account_name: e.target.value })} placeholder="ハピネスサロン音声相談LINE" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400" />
                      </div>
                      {/* 段階5(案B)PR-2:「グループ」自由入力 → 「シナリオ」選択プルダウン */}
                      <div>
                        <label className="text-xs text-gray-500 block mb-1 font-medium">シナリオ <span className="text-red-500">*</span></label>
                        {(() => {
                          const targetProjectId = form.project_id || project?.id || null;
                          const visibleScenarios = targetProjectId
                            ? scenarios.filter((s) => s.project_id === targetProjectId)
                            : scenarios;
                          const isLoading = scenarios.length === 0;
                          return (
                            <select
                              value={form.scenario_id}
                              disabled={isLoading}
                              onChange={(e) => setForm({ ...form, scenario_id: e.target.value })}
                              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400 disabled:bg-gray-100 disabled:cursor-not-allowed"
                            >
                              {isLoading ? (
                                <option value="">未取得中...</option>
                              ) : (
                                <>
                                  <option value="">-- シナリオを選択 --</option>
                                  {visibleScenarios.map((s) => (
                                    <option key={s.id} value={s.id}>{s.name}</option>
                                  ))}
                                  <option value="__null__">シナリオ未設定</option>
                                </>
                              )}
                            </select>
                          );
                        })()}
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 block mb-1 font-medium">チャネルID <span className="text-red-500">*</span></label>
                        <input type="text" value={form.channel_id} onChange={(e) => setForm({ ...form, channel_id: e.target.value })} placeholder="2009751642" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400" />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 block mb-1 font-medium">Basic ID</label>
                        <input type="text" value={form.basic_id} onChange={(e) => setForm({ ...form, basic_id: e.target.value })} placeholder="576ergby (@除く)" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400" />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 block mb-1 font-medium">チャネルシークレット <span className="text-red-500">*</span></label>
                        <input type="password" value={form.channel_secret} onChange={(e) => setForm({ ...form, channel_secret: e.target.value })} placeholder="LINE Developersからコピー" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400" />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 block mb-1 font-medium">チャネルアクセストークン <span className="text-red-500">*</span></label>
                        <input type="password" value={form.channel_access_token} onChange={(e) => setForm({ ...form, channel_access_token: e.target.value })} placeholder="発行済みトークン" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400" />
                      </div>
                      {saveMsg && (
                        <div className={`px-4 py-2.5 rounded-lg text-sm ${saveMsg.ok ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-600 border border-red-200"}`}>
                          {saveMsg.text}
                        </div>
                      )}
                    </div>
                    <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-200">
                      <button onClick={() => { setShowAddAccount(false); resetForm(); }} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition">キャンセル</button>
                      <button onClick={saveAccount} disabled={saving} className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition">
                        {saving ? "保存中..." : editingId ? "更新" : "登録"}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* ============================================================ */}
              {/* アカウント一括登録（スプレッドシート形式） */}
              {/* ============================================================ */}
              {showWizard && (() => {
                const closeWizard = () => { setShowWizard(false); setBulkRows([]); };

                const updateRow = (i: number, patch: Partial<BulkRow>) => {
                  setBulkRows((prev) => {
                    const next = [...prev];
                    next[i] = { ...next[i], ...patch };
                    return next;
                  });
                };

                const addRow = () => setBulkRows((prev) => [...prev, emptyBulkRow()]);
                const removeRow = (i: number) => setBulkRows((prev) => prev.filter((_, j) => j !== i));

                const isRowFilled = (r: BulkRow) =>
                  r.channel_id.trim() && r.channel_secret.trim() && r.channel_access_token.trim() && r.group_name.trim();

                const testRow = async (i: number) => {
                  const row = bulkRows[i];
                  if (!row.channel_access_token.trim()) {
                    updateRow(i, { testResult: { ok: false, text: "トークン未入力" } });
                    return;
                  }
                  updateRow(i, { testing: true, testResult: null });
                  try {
                    const res = await fetch("/api/line/accounts/validate-token", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ channel_access_token: row.channel_access_token.trim() }),
                    });
                    const data = await res.json();
                    if (res.ok && data.ok) {
                      const patch: Partial<BulkRow> = {
                        testing: false,
                        testResult: { ok: true, text: `✓ ${data.displayName ?? "OK"}${data.basicId ? ` @${data.basicId}` : ""}` },
                      };
                      if (!row.account_name.trim() && data.displayName) patch.account_name = data.displayName;
                      if (!row.basic_id.trim() && data.basicId) patch.basic_id = data.basicId;
                      updateRow(i, patch);
                    } else {
                      updateRow(i, {
                        testing: false,
                        testResult: { ok: false, text: `✗ HTTP ${data.status ?? "?"}: ${data.hint ?? data.detail ?? "失敗"}` },
                      });
                    }
                  } catch (e) {
                    updateRow(i, { testing: false, testResult: { ok: false, text: `通信エラー: ${(e as Error).message}` } });
                  }
                };

                const runBulkRegister = async () => {
                  if (!bulkProjectId) { alert("案件を選択してください"); return; }
                  const targets = bulkRows.map((r, i) => ({ row: r, index: i })).filter(({ row }) => isRowFilled(row));
                  if (targets.length === 0) {
                    alert("入力された行がありません（チャネルID/シークレット/トークン/グループの全て入力が必要）");
                    return;
                  }
                  setBulkRunning(true);
                  // 全行の saveResult をクリア
                  setBulkRows((prev) => prev.map((r) => ({ ...r, saveResult: null, saving: false })));

                  // 登録前に必要な新規グループを line_account_groups に作成（重複排除）
                  const knownGroups = new Set(bulkGroups);
                  const newGroupNames = new Set<string>();
                  for (const { row } of targets) {
                    const g = row.group_name.trim();
                    if (g && !knownGroups.has(g)) newGroupNames.add(g);
                  }
                  for (const g of newGroupNames) {
                    try {
                      await fetch("/api/line/account-groups", {
                        method: "PUT",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ project_id: bulkProjectId, group_name: g, closer_visible: false }),
                      });
                      knownGroups.add(g);
                    } catch (e) {
                      console.error("group upsert failed:", g, e);
                    }
                  }
                  // ローカルのグループ一覧を最新化
                  if (newGroupNames.size > 0) setBulkGroups(Array.from(knownGroups).sort());

                  for (const { row, index } of targets) {
                    setBulkRows((prev) => {
                      const next = [...prev];
                      next[index] = { ...next[index], saving: true, saveResult: null };
                      return next;
                    });
                    try {
                      const res = await fetch("/api/line/accounts", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          project_id: bulkProjectId,
                          group_name: row.group_name.trim(),
                          role: row.role,
                          account_name: row.account_name.trim() || null,
                          channel_id: row.channel_id.trim(),
                          channel_secret: row.channel_secret.trim(),
                          channel_access_token: row.channel_access_token.trim(),
                          basic_id: row.basic_id.trim() || null,
                        }),
                      });
                      const data = await res.json();
                      if (res.ok) {
                        setBulkRows((prev) => {
                          const next = [...prev];
                          next[index] = { ...next[index], saving: false, saveResult: { ok: true, text: "登録成功" } };
                          return next;
                        });
                      } else {
                        setBulkRows((prev) => {
                          const next = [...prev];
                          next[index] = { ...next[index], saving: false, saveResult: { ok: false, text: data.error ?? `HTTP ${res.status}` } };
                          return next;
                        });
                      }
                    } catch (e) {
                      setBulkRows((prev) => {
                        const next = [...prev];
                        next[index] = { ...next[index], saving: false, saveResult: { ok: false, text: (e as Error).message } };
                        return next;
                      });
                    }
                  }

                  setBulkRunning(false);
                  await fetchAccounts();
                };

                const filledCount = bulkRows.filter(isRowFilled).length;

                return (
                  <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-[1400px] max-h-[95vh] overflow-hidden flex flex-col">
                      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
                        <h3 className="font-bold text-gray-800">LINEアカウント 一括登録</h3>
                        <button onClick={closeWizard} className="text-gray-400 hover:text-gray-600">{Icons.close}</button>
                      </div>

                      {/* ヘッダー設定 */}
                      <div className="px-5 py-3 border-b border-gray-200 bg-gray-50 flex items-center gap-4 flex-wrap">
                        <div className="flex items-center gap-2">
                          <label className="text-xs text-gray-600 font-medium">案件</label>
                          <span className="text-[10px] text-white bg-red-500 px-1.5 py-0.5 rounded">全行共通</span>
                          <select
                            value={bulkProjectId}
                            onChange={(e) => setBulkProjectId(e.target.value)}
                            className="border border-gray-300 rounded-md px-2 py-1 text-sm bg-white"
                          >
                            <option value="">選択してください</option>
                            {allProjects.map((p) => (
                              <option key={p.id} value={p.id}>{p.name}</option>
                            ))}
                          </select>
                        </div>
                        <div className="flex-1" />
                        <span className="text-xs text-gray-500">{filledCount} 行が入力済み</span>
                        <button
                          onClick={addRow}
                          className="px-3 py-1 text-xs bg-white border border-gray-300 hover:bg-gray-50 rounded-md"
                        >
                          ＋ 行を追加
                        </button>
                      </div>

                      {/* テーブル */}
                      <div className="flex-1 overflow-auto">
                        <table className="w-full text-xs border-collapse">
                          <thead className="sticky top-0 bg-gray-100 z-10">
                            <tr className="border-b border-gray-300 text-gray-600">
                              <th className="px-2 py-2 font-medium border-r border-gray-300 w-10 text-center">#</th>
                              <th className="px-2 py-2 font-medium border-r border-gray-300 min-w-[140px] text-left">アカウント名</th>
                              <th className="px-2 py-2 font-medium border-r border-gray-300 min-w-[130px] text-left">チャネルID <span className="text-red-500">*</span></th>
                              <th className="px-2 py-2 font-medium border-r border-gray-300 min-w-[180px] text-left">チャネルシークレット <span className="text-red-500">*</span></th>
                              <th className="px-2 py-2 font-medium border-r border-gray-300 min-w-[220px] text-left">アクセストークン <span className="text-red-500">*</span></th>
                              <th className="px-2 py-2 font-medium border-r border-gray-300 min-w-[110px] text-left">Basic ID</th>
                              <th className="px-2 py-2 font-medium border-r border-gray-300 min-w-[130px] text-left">グループ <span className="text-red-500">*</span></th>
                              <th className="px-2 py-2 font-medium border-r border-gray-300 min-w-[90px] text-left">ロール</th>
                              <th className="px-2 py-2 font-medium border-r border-gray-300 min-w-[140px] text-left">テスト</th>
                              <th className="px-2 py-2 font-medium w-12 text-center">削除</th>
                            </tr>
                          </thead>
                          <tbody>
                            {bulkRows.map((row, i) => {
                              const filled = isRowFilled(row);
                              const rowBg = row.saveResult?.ok
                                ? "bg-green-50"
                                : row.saveResult && !row.saveResult.ok
                                  ? "bg-red-50"
                                  : "bg-white hover:bg-blue-50/30";
                              return (
                                <tr key={i} className={`border-b border-gray-200 ${rowBg}`}>
                                  <td className="px-2 py-1.5 border-r border-gray-200 text-center text-gray-400">{i + 1}</td>
                                  <td className="px-1 py-1 border-r border-gray-200">
                                    <input
                                      type="text"
                                      value={row.account_name}
                                      onChange={(e) => updateRow(i, { account_name: e.target.value })}
                                      placeholder="（任意）"
                                      className="w-full px-2 py-1 border border-gray-200 rounded text-xs focus:border-blue-400 focus:outline-none"
                                    />
                                  </td>
                                  <td className="px-1 py-1 border-r border-gray-200">
                                    <input
                                      type="text"
                                      value={row.channel_id}
                                      onChange={(e) => updateRow(i, { channel_id: e.target.value })}
                                      placeholder="2009XXXXXX"
                                      className="w-full px-2 py-1 border border-gray-200 rounded text-xs font-mono focus:border-blue-400 focus:outline-none"
                                    />
                                  </td>
                                  <td className="px-1 py-1 border-r border-gray-200">
                                    <input
                                      type="text"
                                      value={row.channel_secret}
                                      onChange={(e) => updateRow(i, { channel_secret: e.target.value })}
                                      placeholder="32桁の英数字"
                                      className="w-full px-2 py-1 border border-gray-200 rounded text-xs font-mono focus:border-blue-400 focus:outline-none"
                                    />
                                  </td>
                                  <td className="px-1 py-1 border-r border-gray-200">
                                    <input
                                      type="text"
                                      value={row.channel_access_token}
                                      onChange={(e) => updateRow(i, { channel_access_token: e.target.value })}
                                      placeholder="長期トークン"
                                      className="w-full px-2 py-1 border border-gray-200 rounded text-xs font-mono focus:border-blue-400 focus:outline-none"
                                    />
                                  </td>
                                  <td className="px-1 py-1 border-r border-gray-200">
                                    <input
                                      type="text"
                                      value={row.basic_id}
                                      onChange={(e) => updateRow(i, { basic_id: e.target.value.replace(/^@/, "") })}
                                      placeholder="@除く"
                                      className="w-full px-2 py-1 border border-gray-200 rounded text-xs font-mono focus:border-blue-400 focus:outline-none"
                                    />
                                  </td>
                                  <td className="px-1 py-1 border-r border-gray-200">
                                    {bulkGroups.length === 0 ? (
                                      <input
                                        type="text"
                                        value={row.group_name}
                                        onChange={(e) => updateRow(i, { group_name: e.target.value, group_is_new: true })}
                                        placeholder="新規グループ名"
                                        className="w-full px-2 py-1 border border-gray-200 rounded text-xs focus:border-blue-400 focus:outline-none"
                                      />
                                    ) : (
                                      <>
                                        <select
                                          value={row.group_is_new ? "__new__" : row.group_name}
                                          onChange={(e) => {
                                            if (e.target.value === "__new__") {
                                              updateRow(i, { group_name: "", group_is_new: true });
                                            } else {
                                              updateRow(i, { group_name: e.target.value, group_is_new: false });
                                            }
                                          }}
                                          className="w-full px-1 py-1 border border-gray-200 rounded text-xs bg-white focus:border-blue-400 focus:outline-none"
                                        >
                                          <option value="">選択してください</option>
                                          {bulkGroups.map((g) => (
                                            <option key={g} value={g}>{g}</option>
                                          ))}
                                          <option value="__new__">＋ 新規グループを作成</option>
                                        </select>
                                        {row.group_is_new && (
                                          <input
                                            type="text"
                                            value={row.group_name}
                                            onChange={(e) => updateRow(i, { group_name: e.target.value })}
                                            placeholder="新規グループ名"
                                            className="w-full px-2 py-1 mt-1 border border-blue-400 rounded text-xs focus:outline-none"
                                            autoFocus
                                          />
                                        )}
                                      </>
                                    )}
                                  </td>
                                  <td className="px-1 py-1 border-r border-gray-200">
                                    <select
                                      value={row.role}
                                      onChange={(e) => updateRow(i, { role: e.target.value as "main" | "standby" })}
                                      className="w-full px-1 py-1 border border-gray-200 rounded text-xs bg-white focus:border-blue-400 focus:outline-none"
                                    >
                                      <option value="main">メイン</option>
                                      <option value="standby">予備</option>
                                    </select>
                                  </td>
                                  <td className="px-1 py-1 border-r border-gray-200">
                                    <div className="flex items-center gap-1">
                                      <button
                                        type="button"
                                        disabled={row.testing || !row.channel_access_token.trim()}
                                        onClick={() => testRow(i)}
                                        className="px-2 py-1 text-[11px] bg-gray-100 hover:bg-gray-200 rounded border border-gray-300 disabled:opacity-50"
                                      >
                                        {row.testing ? "..." : "テスト"}
                                      </button>
                                      {row.testResult && (
                                        <span
                                          className={`text-[10px] truncate max-w-[80px] ${row.testResult.ok ? "text-green-600" : "text-red-600"}`}
                                          title={row.testResult.text}
                                        >
                                          {row.testResult.text}
                                        </span>
                                      )}
                                    </div>
                                    {row.saveResult && (
                                      <div className={`text-[10px] mt-0.5 ${row.saveResult.ok ? "text-green-700" : "text-red-600"}`} title={row.saveResult.text}>
                                        {row.saveResult.ok ? "✅" : "❌"} {row.saveResult.text}
                                      </div>
                                    )}
                                    {row.saving && <div className="text-[10px] text-blue-600 mt-0.5">登録中...</div>}
                                    {!filled && !row.saveResult && (
                                      <div className="text-[10px] text-gray-400 mt-0.5">未入力の行はスキップ</div>
                                    )}
                                  </td>
                                  <td className="px-1 py-1 text-center">
                                    <button
                                      type="button"
                                      onClick={() => removeRow(i)}
                                      className="text-red-500 hover:text-red-700 text-xs"
                                      title="行を削除"
                                    >
                                      ✕
                                    </button>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>

                      {/* フッター */}
                      <div className="px-5 py-3 border-t border-gray-200 bg-gray-50 flex items-center justify-between gap-2">
                        <div className="text-[11px] text-gray-500">
                          登録後は LINE Developers の Webhook URL に
                          <code className="mx-1 px-1 bg-white border border-gray-300 rounded">https://app-pink-tau-37.vercel.app/api/line/webhook</code>
                          を設定してください
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={closeWizard}
                            disabled={bulkRunning}
                            className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-md"
                          >
                            閉じる
                          </button>
                          <button
                            onClick={runBulkRegister}
                            disabled={bulkRunning || !bulkProjectId || filledCount === 0}
                            className="px-5 py-2 bg-[#06C755] hover:bg-[#05a648] disabled:opacity-50 text-white text-sm font-medium rounded-md"
                          >
                            {bulkRunning ? "登録中..." : `一括登録 (${filledCount}件)`}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {loading ? (
                <div className="text-center text-gray-400 py-20">読み込み中...</div>
              ) : accounts.length === 0 ? (
                <div className="bg-white rounded-lg border border-gray-200 p-16 text-center text-gray-400">
                  <p className="text-lg mb-2">LINEアカウントが登録されていません</p>
                  <p className="text-sm">「LINEアカウント登録」からアカウントを登録してください。</p>
                </div>
              ) : (
                <div className="space-y-5 max-w-5xl">
                  {/* シナリオ未設定以外の scenario バケツ */}
                  {Object.entries(sortedGroupedAccounts)
                    .filter(([scenarioName]) => scenarioName !== "シナリオ未設定")
                    .map(([scenarioName, groupAccs]) => (
                    <div key={scenarioName} className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                      <div className="px-5 py-3 bg-gray-50 border-b border-gray-200">
                        <h3 className="text-sm font-bold text-gray-700">{scenarioName}</h3>
                      </div>
                      {groupAccs.map((acc, i) => {
                        const isBanned = acc.role === "banned";
                        return (
                        <div
                          key={acc.id}
                          onClick={() => openAccount(acc)}
                          className={`flex items-center justify-between px-5 py-3.5 hover:bg-blue-50/50 cursor-pointer transition-colors ${i < groupAccs.length - 1 ? "border-b border-gray-100" : ""} ${isBanned ? "bg-red-50/30 opacity-80" : ""}`}
                        >
                          <div className="flex items-center gap-3">
                            <div className={`w-9 h-9 rounded-full flex items-center justify-center ${isBanned ? "bg-gray-400 grayscale" : "bg-[#06C755]"}`}>{LINE_ICON}</div>
                            <div>
                              <div className="text-sm font-medium text-gray-800 flex items-center gap-2">
                                {acc.account_name ?? "未設定"}
                                {isBanned && (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-100 text-red-600 font-semibold">BAN</span>
                                )}
                              </div>
                              {acc.basic_id && <div className="text-xs text-gray-400">@{acc.basic_id}</div>}
                            </div>
                          </div>
                          <div className="flex items-center gap-4">
                            {isBanned ? (
                              <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-600">BAN済</span>
                            ) : (
                              <span className={`text-xs px-2 py-0.5 rounded-full ${acc.is_active ? "bg-green-100 text-green-600" : "bg-gray-100 text-gray-400"}`}>
                                {acc.is_active ? "有効" : "無効"}
                              </span>
                            )}
                            {Icons.chevronRight}
                          </div>
                        </div>
                        );
                      })}
                    </div>
                  ))}

                  {/* シナリオ未設定バケツ(scenario_id NULL のアカウント) */}
                  <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                    <div className="px-5 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                      <h3 className="text-sm font-bold text-gray-700">シナリオ未設定</h3>
                      <span className="text-[10px] text-gray-400">アカウント編集からシナリオを選択してください</span>
                    </div>
                    {sortedGroupedAccounts["シナリオ未設定"] && sortedGroupedAccounts["シナリオ未設定"].length > 0 ? (
                      sortedGroupedAccounts["シナリオ未設定"].map((acc, i) => {
                        const isBanned = acc.role === "banned";
                        return (
                        <div
                          key={acc.id}
                          onClick={() => openAccount(acc)}
                          className={`flex items-center justify-between px-5 py-3.5 hover:bg-blue-50/50 cursor-pointer transition-colors ${i < sortedGroupedAccounts["シナリオ未設定"].length - 1 ? "border-b border-gray-100" : ""} ${isBanned ? "bg-red-50/30 opacity-80" : ""}`}
                        >
                          <div className="flex items-center gap-3">
                            <div className={`w-9 h-9 rounded-full flex items-center justify-center ${isBanned ? "bg-gray-400 grayscale" : "bg-[#06C755]"}`}>{LINE_ICON}</div>
                            <div>
                              <div className="text-sm font-medium text-gray-800 flex items-center gap-2">
                                {acc.account_name ?? "未設定"}
                                {isBanned && (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-100 text-red-600 font-semibold">BAN</span>
                                )}
                              </div>
                              {acc.basic_id && <div className="text-xs text-gray-400">@{acc.basic_id}</div>}
                            </div>
                          </div>
                          <div className="flex items-center gap-4">
                            {isBanned ? (
                              <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-600">BAN済</span>
                            ) : (
                              <span className={`text-xs px-2 py-0.5 rounded-full ${acc.is_active ? "bg-green-100 text-green-600" : "bg-gray-100 text-gray-400"}`}>
                                {acc.is_active ? "有効" : "無効"}
                              </span>
                            )}
                            {Icons.chevronRight}
                          </div>
                        </div>
                        );
                      })
                    ) : (
                      <div className="px-5 py-4 text-center text-gray-400 text-xs">アカウントなし</div>
                    )}
                  </div>
                </div>
              )}
            </main>
          </>
        )}

        {/* ============================================================ */}
        {/* アカウント詳細: チャット一覧 */}
        {/* ============================================================ */}
        {mainView === "account-detail" && accountSubView === "chat" && (
          <div className="flex-1 flex min-h-0">
            {/* --- チャットリスト（左） --- */}
            <div className={`${showMobileChat ? "hidden" : "flex"} md:flex w-full md:w-72 bg-white border-r border-gray-200 flex-col flex-shrink-0`}>
              <div className="px-3 py-3 border-b border-gray-200">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-bold text-gray-700">LINE チャット</span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        const next = !soundEnabled;
                        setSoundEnabled(next);
                        localStorage.setItem("line_sound_enabled", String(next));
                      }}
                      className={`text-xs px-1.5 py-0.5 rounded transition ${soundEnabled ? "text-blue-600 bg-blue-50" : "text-gray-400 bg-gray-100"}`}
                      title={soundEnabled ? "通知音 ON" : "通知音 OFF"}
                    >
                      {soundEnabled ? "\uD83D\uDD14" : "\uD83D\uDD15"}
                    </button>
                    <button onClick={() => { fetchFollowers(); fetchUnreadCounts(); }} className="text-xs text-blue-600 hover:text-blue-800">更新</button>
                  </div>
                </div>
                <div className="relative">
                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2">{Icons.search}</span>
                  <input
                    type="text"
                    value={chatSearch}
                    onChange={(e) => setChatSearch(e.target.value)}
                    placeholder="名前で検索"
                    className="w-full pl-8 pr-3 py-1.5 border border-gray-200 rounded-md text-xs bg-gray-50 focus:bg-white focus:border-blue-400 focus:outline-none"
                  />
                </div>
              </div>
              <div className="flex-1 overflow-y-auto">
                {filteredChatFollowers.length === 0 ? (
                  <div className="p-4 text-center text-xs text-gray-400">チャット履歴なし</div>
                ) : (
                  filteredChatFollowers.map((f) => (
                    <button
                      key={f.id}
                      onClick={() => openChat(f)}
                      className={`w-full flex items-center gap-2.5 px-3 py-3 text-left border-b border-gray-100 hover:bg-gray-50 transition-colors ${selectedUser?.id === f.id ? "bg-blue-50 border-l-[3px] border-l-blue-500" : ""}`}
                    >
                      {f.picture_url ? (
                        <img src={f.picture_url} alt="" className="w-10 h-10 rounded-full object-cover flex-shrink-0" />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0 text-gray-400">{Icons.user}</div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-gray-800 truncate">{f.display_name ?? "名前なし"}</span>
                          {needsAction.has(f.line_user_id) && (
                            <span className="flex-shrink-0 inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-white border-2 border-red-500 rounded-full">
                              <span className="w-2 h-2 bg-red-500 rounded-full" />
                              <span className="text-[9px] font-bold text-red-600 leading-none">要対応</span>
                            </span>
                          )}
                          <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
                            {(unreadCounts[f.line_user_id] ?? 0) > 0 && (
                              <span className="min-w-[18px] h-[18px] px-1 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                                {unreadCounts[f.line_user_id]}
                              </span>
                            )}
                            <span className="text-[10px] text-gray-400">{fmtShort(f.followed_at)}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="text-xs text-gray-400 truncate">
                            {f.status === "following" ? "友だち" : f.status === "blocked" ? "ブロック中" : "解除済み"}
                          </span>
                          {(() => {
                            const ds = getDealStatus(f.line_user_id);
                            if (!ds) return null;
                            const def = DEAL_STATUSES.find((s) => s.value === ds);
                            return def ? (
                              <span className={`px-1.5 py-0.5 text-[9px] font-medium rounded ${def.bgClass}`}>
                                {def.label}
                              </span>
                            ) : null;
                          })()}
                        </div>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>

            {/* --- チャットメイン（中央） --- */}
            {selectedUser ? (
              <>
                <div className={`${!showMobileChat ? "hidden" : "flex"} md:flex flex-1 flex-col min-w-0`}>
                  {/* チャットヘッダー */}
                  <div className="bg-white border-b border-gray-200 px-3 md:px-4 py-2.5 flex items-center gap-3 flex-shrink-0">
                    {/* Mobile back button */}
                    <button
                      onClick={() => { setShowMobileChat(false); setShowMobileProfile(false); }}
                      className="md:hidden p-1 text-gray-500 hover:text-gray-700"
                    >
                      {Icons.back}
                    </button>
                    <span className="text-sm text-gray-500 truncate">{selectedUser.display_name ?? "チャット内容"}</span>
                    <div className="flex items-center gap-2 md:gap-3 ml-auto flex-shrink-0">
                      {(unreadCounts[selectedUser.line_user_id] ?? 0) > 0 && (
                        <span className="text-xs text-red-500 font-medium hidden sm:inline">
                          未読 {unreadCounts[selectedUser.line_user_id]} 件
                        </span>
                      )}
                      <button
                        onClick={() => markAsRead(selectedUser.line_user_id)}
                        disabled={(unreadCounts[selectedUser.line_user_id] ?? 0) === 0}
                        className={`px-2 md:px-3 py-1 text-xs font-medium rounded-md transition ${
                          (unreadCounts[selectedUser.line_user_id] ?? 0) > 0
                            ? "bg-blue-600 hover:bg-blue-700 text-white"
                            : "bg-gray-100 text-gray-400 cursor-not-allowed"
                        }`}
                      >
                        既読
                      </button>
                      <button
                        onClick={() => toggleNeedsAction(selectedUser.line_user_id)}
                        className={`px-2 md:px-3 py-1 text-xs font-medium rounded-md border-2 transition ${
                          needsAction.has(selectedUser.line_user_id)
                            ? "bg-red-50 text-red-600 border-red-500 hover:bg-red-100"
                            : "bg-white text-red-500 border-red-400 hover:bg-red-50"
                        }`}
                      >
                        {needsAction.has(selectedUser.line_user_id) ? "解除" : "要対応"}
                      </button>
                      {/* Mobile profile toggle */}
                      <button
                        onClick={() => setShowMobileProfile(!showMobileProfile)}
                        className="md:hidden p-1 text-gray-500 hover:text-blue-600"
                      >
                        {Icons.user}
                      </button>
                      <span className="text-xs text-gray-400 hidden md:inline">{messages.length} 件</span>
                    </div>
                  </div>

                  {/* メッセージ（LINE風） */}
                  <div className="flex-1 overflow-y-auto bg-[#8cabd9]">
                    <div className="max-w-2xl mx-auto px-4 py-4 space-y-2">
                      {messages.length === 0 ? (
                        <div className="text-center text-white/70 text-sm pt-20">メッセージがありません</div>
                      ) : (
                        messages.map((m, i) => {
                          const showDate = i === 0 || new Date(m.sent_at).toDateString() !== new Date(messages[i - 1].sent_at).toDateString();
                          return (
                            <div key={m.id}>
                              {showDate && (
                                <div className="text-center my-3">
                                  <span className="bg-black/20 text-white text-[11px] px-3 py-0.5 rounded-full">
                                    {fmtFull(m.sent_at)}
                                  </span>
                                </div>
                              )}
                              <div className={`flex ${m.direction === "outgoing" ? "justify-end" : "justify-start"} items-end gap-1.5`}>
                                {m.direction === "incoming" && (
                                  selectedUser.picture_url ? (
                                    <img src={selectedUser.picture_url} alt="" className="w-8 h-8 rounded-full object-cover flex-shrink-0 mb-0.5" />
                                  ) : (
                                    <div className="w-8 h-8 rounded-full bg-gray-300 flex items-center justify-center flex-shrink-0 mb-0.5 text-gray-500">
                                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                                    </div>
                                  )
                                )}
                                {m.direction === "outgoing" && (
                                  <span className="text-[10px] text-white/60 mb-0.5">{fmtTime(m.sent_at)}</span>
                                )}
                                {(() => {
                                  const ev = m.raw_event as Record<string, unknown> | null;
                                  const msg = (ev?.message ?? {}) as Record<string, unknown>;
                                  const bubbleCls = `max-w-[75%] rounded-2xl text-[13px] shadow-sm leading-relaxed ${
                                    m.direction === "outgoing"
                                      ? "bg-[#06C755] text-white rounded-br-md"
                                      : "bg-white text-gray-800 rounded-bl-md"
                                  }`;

                                  // スタンプ
                                  if (m.message_type === "sticker") {
                                    const stickerId = msg.stickerId as string | undefined;
                                    return (
                                      <div className={`${bubbleCls} p-2`}>
                                        {stickerId ? (
                                          <img
                                            src={`https://stickershop.line-scdn.net/stickershop/v1/sticker/${stickerId}/android/sticker.png`}
                                            alt="スタンプ"
                                            className="w-24 h-24 object-contain"
                                            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; (e.target as HTMLImageElement).parentElement!.textContent = "[スタンプ]"; }}
                                          />
                                        ) : (
                                          <span className="text-gray-400">[スタンプ]</span>
                                        )}
                                      </div>
                                    );
                                  }

                                  // 画像
                                  if (m.message_type === "image") {
                                    return (
                                      <div className={`${bubbleCls} p-2`}>
                                        <div className="flex items-center gap-1.5 text-xs opacity-70">
                                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                                          画像
                                        </div>
                                      </div>
                                    );
                                  }

                                  // 動画
                                  if (m.message_type === "video") {
                                    return (
                                      <div className={`${bubbleCls} p-2`}>
                                        <div className="flex items-center gap-1.5 text-xs opacity-70">
                                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                                          動画
                                        </div>
                                      </div>
                                    );
                                  }

                                  // 音声
                                  if (m.message_type === "audio") {
                                    return (
                                      <div className={`${bubbleCls} p-2`}>
                                        <div className="flex items-center gap-1.5 text-xs opacity-70">
                                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" /></svg>
                                          音声
                                        </div>
                                      </div>
                                    );
                                  }

                                  // 位置情報
                                  if (m.message_type === "location") {
                                    const title = (msg.title as string) ?? "";
                                    const address = (msg.address as string) ?? "";
                                    return (
                                      <div className={`${bubbleCls} px-3.5 py-2`}>
                                        <div className="flex items-center gap-1.5 text-xs opacity-70 mb-1">
                                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                                          位置情報
                                        </div>
                                        {title && <div className="font-medium text-xs">{title}</div>}
                                        {address && <div className="text-xs opacity-70">{address}</div>}
                                      </div>
                                    );
                                  }

                                  // テキスト（絵文字処理付き）
                                  const text = m.message_text ?? `[${m.message_type}]`;
                                  const emojis = (msg.emojis ?? []) as Array<{ index: number; length: number; productId: string; emojiId: string }>;

                                  if (emojis.length > 0 && m.message_text) {
                                    // LINE絵文字を画像に置き換え
                                    const parts: React.ReactNode[] = [];
                                    let lastIndex = 0;
                                    for (const emoji of emojis) {
                                      if (emoji.index > lastIndex) {
                                        parts.push(m.message_text.slice(lastIndex, emoji.index));
                                      }
                                      parts.push(
                                        <img
                                          key={`${emoji.productId}-${emoji.emojiId}-${emoji.index}`}
                                          src={`https://stickershop.line-scdn.net/sticonshop/v1/sticon/${emoji.productId}/android/${emoji.emojiId}.png`}
                                          alt="emoji"
                                          className="inline-block w-5 h-5 align-text-bottom"
                                        />
                                      );
                                      lastIndex = emoji.index + emoji.length;
                                    }
                                    if (lastIndex < m.message_text.length) {
                                      parts.push(m.message_text.slice(lastIndex));
                                    }
                                    return <div className={`${bubbleCls} px-3.5 py-2`}>{parts}</div>;
                                  }

                                  return <div className={`${bubbleCls} px-3.5 py-2`}>{text}</div>;
                                })()}
                                {m.direction === "incoming" && (
                                  <span className="text-[10px] text-white/60 mb-0.5">{fmtTime(m.sent_at)}</span>
                                )}
                              </div>
                            </div>
                          );
                        })
                      )}
                      <div ref={chatEndRef} />
                    </div>
                  </div>

                  {/* 送信ツールバー + 入力 */}
                  <div className="bg-white border-t border-gray-200 flex-shrink-0">
                    {/* ツールボタン */}
                    <div className="flex items-center gap-1 px-3 py-1.5 border-b border-gray-100 relative">
                      <button onClick={() => imageInputRef.current?.click()} className="p-1.5 hover:bg-gray-100 rounded-md text-gray-500 transition" title="画像添付">{Icons.image}</button>
                      <button onClick={() => videoInputRef.current?.click()} className="p-1.5 hover:bg-gray-100 rounded-md text-gray-500 transition" title="動画添付">{Icons.video}</button>

                      {/* Emoji popup trigger */}
                      <div className="relative" ref={emojiPopupRef}>
                        <button
                          onClick={() => { setShowEmojiPopup(!showEmojiPopup); setShowStickerPopup(false); }}
                          className={`p-1.5 hover:bg-gray-100 rounded-md transition ${showEmojiPopup ? "bg-blue-50 text-blue-600" : "text-gray-500"}`}
                          title="絵文字"
                        >
                          {Icons.emoji}
                        </button>
                        {showEmojiPopup && (
                          <div className="absolute bottom-full right-0 md:left-0 md:right-auto mb-1 w-72 bg-white rounded-lg shadow-xl border border-gray-200 z-30">
                            {/* Category tabs */}
                            <div className="flex border-b border-gray-100 px-1 pt-1 gap-0.5 overflow-x-auto">
                              {EMOJI_CATEGORIES.map((cat, idx) => (
                                <button
                                  key={cat.name}
                                  onClick={() => setEmojiCategory(idx)}
                                  className={`px-2.5 py-1.5 text-xs rounded-t-md whitespace-nowrap transition ${
                                    emojiCategory === idx ? "bg-blue-50 text-blue-600 font-medium" : "text-gray-500 hover:bg-gray-50"
                                  }`}
                                >
                                  {cat.name}
                                </button>
                              ))}
                            </div>
                            {/* Emoji grid */}
                            <div className="p-2 grid grid-cols-8 gap-0.5 max-h-48 overflow-y-auto">
                              {EMOJI_CATEGORIES[emojiCategory].emojis.map((emoji, idx) => (
                                <button
                                  key={idx}
                                  onClick={() => insertEmoji(emoji)}
                                  className="w-8 h-8 flex items-center justify-center text-lg hover:bg-gray-100 rounded transition"
                                >
                                  {emoji}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Sticker popup trigger */}
                      <div className="relative" ref={stickerPopupRef}>
                        <button
                          onClick={() => { setShowStickerPopup(!showStickerPopup); setShowEmojiPopup(false); }}
                          className={`p-1.5 hover:bg-gray-100 rounded-md transition ${showStickerPopup ? "bg-blue-50 text-blue-600" : "text-gray-500"}`}
                          title="スタンプ"
                        >
                          {Icons.sticker}
                        </button>
                        {showStickerPopup && (
                          <div className="absolute bottom-full right-0 mb-1 w-80 bg-white rounded-lg shadow-xl border border-gray-200 z-30">
                            {/* Pack tabs */}
                            <div className="flex border-b border-gray-100 px-1 pt-1 gap-0.5 overflow-x-auto">
                              {LINE_STICKER_PACKS.map((pack, idx) => (
                                <button
                                  key={pack.packageId}
                                  onClick={() => setStickerPackIdx(idx)}
                                  className={`px-2.5 py-1.5 text-xs rounded-t-md whitespace-nowrap transition ${
                                    stickerPackIdx === idx ? "bg-blue-50 text-blue-600 font-medium" : "text-gray-500 hover:bg-gray-50"
                                  }`}
                                >
                                  {pack.name}
                                </button>
                              ))}
                            </div>
                            {/* Sticker grid */}
                            <div className="p-2 grid grid-cols-4 gap-1 max-h-56 overflow-y-auto">
                              {LINE_STICKER_PACKS[stickerPackIdx].stickers.map((stickerId) => (
                                <button
                                  key={stickerId}
                                  onClick={() => sendSticker(LINE_STICKER_PACKS[stickerPackIdx].packageId, stickerId)}
                                  disabled={sendingSticker}
                                  className="w-full aspect-square flex items-center justify-center hover:bg-gray-100 rounded-lg transition disabled:opacity-50"
                                >
                                  <img
                                    src={`https://stickershop.line-scdn.net/stickershop/v1/sticker/${stickerId}/android/sticker.png`}
                                    alt={`sticker-${stickerId}`}
                                    className="w-14 h-14 object-contain"
                                    loading="lazy"
                                  />
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                    {/* メッセージ入力 */}
                    <div className="flex items-center gap-2 px-3 py-2.5">
                      <input
                        type="text"
                        value={chatInput}
                        onChange={(e) => setChatInput(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) sendMessage(); }}
                        placeholder="メッセージを入力..."
                        className="flex-1 border border-gray-200 rounded-full px-4 py-2 text-sm bg-gray-50 focus:bg-white focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400 transition"
                      />
                      <button
                        onClick={sendMessage}
                        disabled={sending || !chatInput.trim()}
                        className="w-9 h-9 bg-[#06C755] hover:bg-[#05a648] disabled:opacity-40 rounded-full flex items-center justify-center transition flex-shrink-0"
                      >
                        {sending ? (
                          <svg className="w-4 h-4 text-white animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                        ) : Icons.send}
                      </button>
                    </div>
                  </div>
                </div>

                {/* --- 右サイドパネル: プロフィール・メモ・ラベル --- */}
                <div className={`${showMobileProfile ? "fixed inset-0 z-40 md:relative md:inset-auto" : "hidden md:flex"} md:flex w-full md:w-72 bg-white border-l border-gray-200 flex-col flex-shrink-0 overflow-y-auto`}>
                  {/* Mobile close for profile panel */}
                  <div className="md:hidden flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-gray-50">
                    <span className="text-sm font-bold text-gray-700">プロフィール</span>
                    <button onClick={() => setShowMobileProfile(false)} className="text-gray-400 hover:text-gray-600">{Icons.close}</button>
                  </div>

                  {/* プロフィール */}
                  <div className="px-4 py-5 text-center border-b border-gray-200">
                    {selectedUser.picture_url ? (
                      <img src={selectedUser.picture_url} alt="" className="w-20 h-20 rounded-full object-cover mx-auto mb-3" />
                    ) : (
                      <div className="w-20 h-20 rounded-full bg-gray-200 flex items-center justify-center mx-auto mb-3 text-gray-400">
                        <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                      </div>
                    )}
                    {/* Feature 1: Inline name editing */}
                    <div className="flex flex-col items-center gap-1.5">
                      {editingName ? (
                        <div className="flex flex-col items-center gap-2">
                          <input
                            type="text"
                            value={editNameValue}
                            onChange={(e) => setEditNameValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && !e.nativeEvent.isComposing) saveDisplayName();
                              if (e.key === "Escape") setEditingName(false);
                            }}
                            autoFocus
                            className="text-base font-bold text-gray-800 text-center border border-blue-400 rounded-md px-2 py-0.5 focus:outline-none focus:ring-1 focus:ring-blue-400 w-40"
                          />
                          <div className="flex gap-2">
                            <button
                              onClick={() => setEditingName(false)}
                              className="px-3 py-1 text-xs text-gray-500 hover:bg-gray-100 rounded-md transition"
                            >
                              キャンセル
                            </button>
                            <button
                              onClick={saveDisplayName}
                              className="px-3 py-1 text-xs bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-md transition"
                            >
                              保存
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <h3 className="text-base font-bold text-gray-800">{selectedUser.display_name ?? "名前なし"}</h3>
                          <button
                            onClick={() => {
                              setEditNameValue(selectedUser.display_name ?? "");
                              setEditingName(true);
                            }}
                            className="text-gray-400 hover:text-blue-500 transition"
                          >
                            {Icons.edit}
                          </button>
                        </div>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 mt-1 font-mono">{selectedUser.line_user_id.slice(0, 16)}...</p>
                  </div>

                  {/* アクションボタン */}
                  <div className="flex gap-2 px-4 py-3 border-b border-gray-200">
                    <button
                      onClick={() => setShowFriendDetailModal(true)}
                      className="flex-1 py-1.5 bg-blue-500 hover:bg-blue-600 text-white text-xs font-medium rounded-md transition"
                    >
                      友だち詳細
                    </button>
                  </div>

                  {/* ステータス */}
                  <div className="px-4 py-3 border-b border-gray-200">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-gray-500">ステータス</span>
                      <StatusBadge status={selectedUser.status} />
                    </div>
                    <div className="flex items-center justify-between text-xs mt-2">
                      <span className="text-gray-500">友だち追加日</span>
                      <span className="text-gray-700">{fmtShort(selectedUser.followed_at)}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs mt-2">
                      <span className="text-gray-500">登録日</span>
                      <span className="text-gray-700">{fmtShort(selectedUser.created_at)}</span>
                    </div>
                  </div>

                  {/* Feature 2: ラベル with picker */}
                  <div className="px-4 py-3 border-b border-gray-200 relative">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-medium text-gray-500">ラベル</span>
                      <div className="relative" ref={labelPickerRef}>
                        <button
                          onClick={() => setShowLabelPicker(!showLabelPicker)}
                          className="text-[10px] text-blue-600 hover:text-blue-800"
                        >
                          + 追加
                        </button>
                        {showLabelPicker && (
                          <div className="absolute right-0 top-full mt-1 w-60 bg-white rounded-lg shadow-xl border border-gray-200 z-30 max-h-72 overflow-y-auto">
                            <div className="px-3 py-2 border-b border-gray-100 text-xs font-medium text-gray-500">ラベルを選択</div>
                            <label className="flex items-start gap-2 px-3 py-2 border-b border-gray-100 text-[11px] text-gray-600 cursor-pointer hover:bg-gray-50">
                              <input
                                type="checkbox"
                                checked={crossAccountLabel}
                                onChange={(e) => setCrossAccountLabel(e.target.checked)}
                                className="mt-0.5 accent-blue-600"
                              />
                              <span className="leading-tight">
                                同一案件の別アカウントでも<br />同名ラベルを同時に付与/解除
                              </span>
                            </label>
                            {labels.length === 0 ? (
                              <div className="px-3 py-4 text-center text-xs text-gray-400">
                                ラベルがありません。<br />「ラベル管理」から作成してください。
                              </div>
                            ) : (
                              labels.map((label) => {
                                const isAssigned = label.assigned_users.includes(selectedUser.line_user_id);
                                return (
                                  <button
                                    key={label.id}
                                    onClick={() => toggleLabelUser(label.id, selectedUser.line_user_id)}
                                    className={`w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-gray-50 transition ${isAssigned ? "bg-blue-50/50" : ""}`}
                                  >
                                    <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: label.color }} />
                                    <span className="text-xs text-gray-700 flex-1 truncate">{label.name}</span>
                                    {isAssigned && (
                                      <svg className="w-3.5 h-3.5 text-blue-600 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                                    )}
                                  </button>
                                );
                              })
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {getUserLabels(selectedUser.line_user_id).length > 0 ? (
                        getUserLabels(selectedUser.line_user_id).map((label) => (
                          <span
                            key={label.id}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] text-white"
                            style={{ backgroundColor: label.color }}
                          >
                            {label.name}
                            <button
                              onClick={() => toggleLabelUser(label.id, selectedUser.line_user_id)}
                              className="hover:bg-white/20 rounded-full p-0.5 transition"
                            >
                              <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                          </span>
                        ))
                      ) : (
                        <span className="text-xs text-gray-400">ラベルなし</span>
                      )}
                    </div>
                  </div>

                  {/* 担当クローザー */}
                  <div className="px-4 py-3 border-b border-gray-200">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-medium text-gray-500">担当クローザー</span>
                    </div>
                    <select
                      value={(selectedUser as Follower & { closer_id?: string }).closer_id ?? ""}
                      onChange={async (e) => {
                        const closerId = e.target.value || null;
                        try {
                          await fetch("/api/line/followers", {
                            method: "PATCH",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ id: selectedUser.id, closer_id: closerId }),
                          });
                          setSelectedUser((prev) => prev ? { ...prev, closer_id: closerId } as typeof prev : null);
                          setFollowers((prev) =>
                            prev.map((f) => f.id === selectedUser.id ? { ...f, closer_id: closerId } as typeof f : f)
                          );
                        } catch { /* */ }
                      }}
                      className="w-full border border-gray-200 rounded-md px-2 py-1.5 text-xs text-gray-700 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
                    >
                      <option value="">未割り当て</option>
                      {closerUsers.map((u) => (
                        <option key={u.id} value={u.id}>{u.name ?? u.closer_name ?? u.id.slice(0, 8)}</option>
                      ))}
                    </select>
                  </div>

                  {/* 商談ステータス */}
                  <div className="px-4 py-3 border-b border-gray-200">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-medium text-gray-500">商談ステータス</span>
                    </div>
                    <select
                      value={getDealStatus(selectedUser.line_user_id)}
                      onChange={(e) => changeDealStatus(selectedUser.line_user_id, e.target.value)}
                      className="w-full border border-gray-200 rounded-md px-2 py-1.5 text-xs text-gray-700 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
                    >
                      {DEAL_STATUSES.map((s) => (
                        <option key={s.value} value={s.value}>{s.label}</option>
                      ))}
                    </select>
                  </div>

                  {/* Feature 3: メモ with save */}
                  <div className="px-4 py-3 border-b border-gray-200">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-medium text-gray-500">メモ</span>
                      <div className="flex items-center gap-2">
                        {memoSaveMsg && (
                          <span className={`text-[10px] ${memoSaveMsg === "保存しました" ? "text-green-600" : "text-red-500"}`}>
                            {memoSaveMsg}
                          </span>
                        )}
                        <button
                          onClick={saveMemo}
                          disabled={memoSaving}
                          className="text-[10px] text-blue-600 hover:text-blue-800 disabled:opacity-50"
                        >
                          {memoSaving ? "保存中..." : "保存"}
                        </button>
                      </div>
                    </div>
                    <textarea
                      value={memoText}
                      onChange={(e) => setMemoText(e.target.value)}
                      placeholder="メモを入力..."
                      rows={4}
                      className="w-full border border-gray-200 rounded-md px-2.5 py-2 text-xs resize-none focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
                    />
                  </div>

                  {/* テンプレート送信 */}
                  <div className="px-4 py-3">
                    <span className="text-xs font-medium text-gray-500 block mb-2">LINE テンプレートを送る</span>
                    <div className="flex gap-2">
                      <select
                        value={selectedTemplateId}
                        onChange={(e) => setSelectedTemplateId(e.target.value)}
                        className="flex-1 border border-gray-200 rounded-md px-2 py-1.5 text-xs bg-white focus:border-blue-400 focus:outline-none"
                      >
                        <option value="">
                          {templates.length === 0 ? "テンプレートがありません" : "テンプレートを選択"}
                        </option>
                        {templates.map((tpl) => (
                          <option key={tpl.id} value={tpl.id}>
                            {tpl.name || tpl.title || "（名称未設定）"}
                          </option>
                        ))}
                      </select>
                      <button
                        disabled={!selectedTemplateId || sendingTemplate}
                        onClick={async () => {
                          if (!selectedTemplateId || !selectedUser) return;
                          const tpl = templates.find((t) => t.id === selectedTemplateId);
                          if (!tpl) return;
                          const payloadList = (tpl.messages ?? [])
                            .map((m) => {
                              // payload が空の場合は msg_type/body から最小限を合成
                              const p = (m.payload as Record<string, unknown> | null) ?? {};
                              if (p && Object.keys(p).length > 0) return p;
                              return { msgType: m.msg_type || "text", body: m.body ?? "" };
                            })
                            .filter((p) => p && (p.msgType || p.body));
                          if (payloadList.length === 0) {
                            alert("このテンプレートには送信可能なメッセージがありません");
                            return;
                          }
                          setSendingTemplate(true);
                          try {
                            const res = await fetch("/api/line/send", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({
                                line_user_id: selectedUser.line_user_id,
                                account_id: selectedAccount?.id,
                                messages: payloadList,
                              }),
                            });
                            if (!res.ok) {
                              const data = await res.json().catch(() => ({}));
                              alert(`送信失敗: ${data.error ?? res.status}`);
                              return;
                            }
                            setSelectedTemplateId("");
                            fetchMessages(selectedUser.line_user_id);
                          } catch (e) {
                            alert(`送信エラー: ${(e as Error).message}`);
                          } finally {
                            setSendingTemplate(false);
                          }
                        }}
                        className="px-3 py-1.5 bg-[#06C755] hover:bg-[#05a648] disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-medium rounded-md transition"
                      >
                        {sendingTemplate ? "送信中..." : "送信"}
                      </button>
                    </div>
                    {templates.length === 0 && (
                      <p className="text-[10px] text-gray-400 mt-1.5">
                        左メニューの「テンプレート管理」から作成してください
                      </p>
                    )}
                  </div>
                </div>
              </>
            ) : (
              /* チャット未選択 */
              <div className={`${showMobileChat ? "hidden" : "hidden"} md:flex flex-1 items-center justify-center bg-gray-50`}>
                <div className="text-center text-gray-400">
                  <div className="w-16 h-16 rounded-full bg-gray-200 flex items-center justify-center mx-auto mb-3">
                    {Icons.chat}
                  </div>
                  <p className="text-sm">左のリストからユーザーを選択してください</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ============================================================ */}
        {/* アカウント詳細: 読者一覧 */}
        {/* ============================================================ */}
        {mainView === "account-detail" && accountSubView === "followers" && (
          <>
            <header className="bg-white border-b border-gray-200 px-4 md:px-6 py-3 flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-3">
                <h1 className="text-base font-bold text-gray-800">LINE 友だち</h1>
                <span className="text-sm text-gray-400">{filteredFollowers.length} 件</span>
                {selectedIds.size > 0 && (
                  <button
                    onClick={deleteSelected}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white text-xs font-medium rounded-md transition"
                  >
                    選択削除（{selectedIds.size}件）
                  </button>
                )}
              </div>
              <div className="relative w-40 md:w-64">
                <span className="absolute left-3 top-1/2 -translate-y-1/2">{Icons.search}</span>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => { setSearchQuery(e.target.value); setFollowerPage(1); }}
                  placeholder="名前で検索..."
                  className="w-full pl-9 pr-4 py-1.5 border border-gray-200 rounded-lg text-sm bg-white focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
                />
              </div>
            </header>
            <main className="flex-1 overflow-y-auto p-4 md:p-6">
              <div className="bg-white rounded-lg border border-gray-200 overflow-hidden max-w-5xl overflow-x-auto">
                {filteredFollowers.length === 0 ? (
                  <div className="p-16 text-center text-gray-400">友だちがいません</div>
                ) : (() => {
                  const totalPages = Math.ceil(filteredFollowers.length / FOLLOWERS_PER_PAGE);
                  const currentPage = Math.min(followerPage, totalPages);
                  const pagedFollowers = filteredFollowers.slice((currentPage - 1) * FOLLOWERS_PER_PAGE, currentPage * FOLLOWERS_PER_PAGE);

                  // ページネーション番号の生成
                  const getPageNumbers = (): (number | "...")[] => {
                    const pages: (number | "...")[] = [];
                    if (totalPages <= 7) {
                      for (let i = 1; i <= totalPages; i++) pages.push(i);
                    } else {
                      pages.push(1);
                      if (currentPage > 3) pages.push("...");
                      const start = Math.max(2, currentPage - 1);
                      const end = Math.min(totalPages - 1, currentPage + 1);
                      for (let i = start; i <= end; i++) pages.push(i);
                      if (currentPage < totalPages - 2) pages.push("...");
                      pages.push(totalPages);
                    }
                    return pages;
                  };

                  return (
                    <>
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-gray-200 text-gray-500 text-left bg-gray-50">
                            <th className="px-3 py-3 w-10">
                              <input
                                type="checkbox"
                                checked={pagedFollowers.length > 0 && pagedFollowers.every((f) => selectedIds.has(f.id))}
                                onChange={() => toggleSelectAll(pagedFollowers.map((f) => f.id))}
                                className="accent-blue-600 w-4 h-4 cursor-pointer"
                              />
                            </th>
                            <th className="px-5 py-3 font-medium">ユーザー</th>
                            <th className="px-5 py-3 font-medium hidden md:table-cell">ステータス</th>
                            <th className="px-5 py-3 font-medium hidden md:table-cell">友だち追加日</th>
                            <th className="px-5 py-3 font-medium">操作</th>
                          </tr>
                        </thead>
                        <tbody>
                          {pagedFollowers.map((f) => (
                            <tr key={f.id} className={`border-b border-gray-100 hover:bg-gray-50 transition ${selectedIds.has(f.id) ? "bg-blue-50/50" : ""}`}>
                              <td className="px-3 py-3">
                                <input
                                  type="checkbox"
                                  checked={selectedIds.has(f.id)}
                                  onChange={() => toggleSelect(f.id)}
                                  className="accent-blue-600 w-4 h-4 cursor-pointer"
                                />
                              </td>
                              <td className="px-5 py-3">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setUserDetailTarget(f);
                                    setUserDetailForm({
                                      display_name: f.display_name ?? "",
                                      memo: f.memo ?? "",
                                      is_test: !!f.is_test,
                                    });
                                    setShowUserDetail(true);
                                  }}
                                  className="flex items-center gap-3 text-left hover:opacity-80 cursor-pointer group"
                                >
                                  {f.picture_url ? (
                                    <img src={f.picture_url} alt="" className="w-9 h-9 rounded-full object-cover" />
                                  ) : (
                                    <div className="w-9 h-9 rounded-full bg-gray-200 flex items-center justify-center text-gray-400">{Icons.user}</div>
                                  )}
                                  <div>
                                    <div className="font-medium text-gray-800 group-hover:text-blue-600 group-hover:underline">
                                      {f.display_name ?? "名前なし"}
                                      {f.is_test && <span className="ml-1.5 px-1.5 py-0.5 text-[10px] bg-purple-100 text-purple-700 rounded">TEST</span>}
                                    </div>
                                    <div className="text-xs text-gray-400 font-mono">{f.line_user_id.slice(0, 12)}...</div>
                                  </div>
                                </button>
                              </td>
                              <td className="px-5 py-3 hidden md:table-cell"><StatusBadge status={f.status} /></td>
                              <td className="px-5 py-3 text-gray-500 hidden md:table-cell">{fmtShort(f.followed_at)}</td>
                              <td className="px-5 py-3">
                                <div className="flex items-center gap-2">
                                  <button
                                    onClick={() => { setAccountSubView("chat"); openChat(f); }}
                                    className="px-3 py-1 bg-[#06C755] hover:bg-[#05a648] text-white text-xs font-medium rounded-md transition"
                                  >
                                    チャット
                                  </button>
                                  <button
                                    onClick={() => deleteFollower(f.id, f.display_name ?? f.line_user_id.slice(0, 10))}
                                    className="px-3 py-1 bg-red-500 hover:bg-red-600 text-white text-xs font-medium rounded-md transition"
                                  >
                                    削除
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>

                      {/* ページネーション */}
                      {totalPages > 1 && (
                        <div className="flex justify-end items-center gap-1 px-5 py-3 border-t border-gray-200">
                          {getPageNumbers().map((p, idx) =>
                            p === "..." ? (
                              <span key={`dots-${idx}`} className="px-2 py-1 text-xs text-gray-400 select-none">...</span>
                            ) : p === currentPage ? (
                              <span
                                key={p}
                                className="px-2.5 py-1 text-xs font-bold text-blue-600 border-b-2 border-blue-600 select-none"
                              >
                                {p}
                              </span>
                            ) : (
                              <button
                                key={p}
                                onClick={() => setFollowerPage(p)}
                                className="px-2.5 py-1 text-xs text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded transition"
                              >
                                {p}
                              </button>
                            )
                          )}
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            </main>
          </>
        )}

        {/* ============================================================ */}
        {/* アカウント詳細: ステップ配信 */}
        {/* ============================================================ */}
        {mainView === "account-detail" && accountSubView === "step" && (
          <>
            <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center flex-shrink-0">
              <h1 className="text-base font-bold text-gray-800">ステップ配信</h1>
            </header>
            <main className="flex-1 overflow-y-auto p-6">
              {/* 左上の新規追加 / アクション追加ボタン */}
              {!showStepCreator && (
                <div className="max-w-5xl mb-4 flex gap-2">
                  <button
                    onClick={() => { setStepCreatorForm(emptyBroadcast); setEditingSequenceId(null); setShowStepCreator(true); }}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-md transition"
                  >
                    {Icons.plus} 新規追加
                  </button>
                  <button
                    onClick={() => { setAccountSubView("actions"); openNewActionRule(); }}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white text-xs font-medium rounded-md transition"
                    title="ラベル付与・シーケンス移動・Webhook等のアクションを追加"
                  >
                    {Icons.plus} アクション追加
                  </button>
                  <button
                    onClick={() => setShowSmsModal(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-500 hover:bg-orange-600 text-white text-xs font-medium rounded-md transition"
                  >
                    {Icons.plus} SMS追加
                  </button>
                </div>
              )}
              {showStepCreator && (
                <div className="max-w-5xl mb-6">
                  {renderBroadcastCreator(
                    stepCreatorForm,
                    setStepCreatorForm,
                    () => { setShowStepCreator(false); setEditingSequenceId(null); },
                    async () => {
                      const ok = await saveBroadcast("step", stepCreatorForm);
                      if (ok) { setShowStepCreator(false); setStepCreatorForm(emptyBroadcast); setEditingSequenceId(null); }
                    },
                    editingSequenceId ? "ステップ配信編集" : "新規ステップ配信作成",
                    "step",
                  )}
                </div>
              )}
              {/* シーケンス作成/編集モーダル */}
              {showStepModal && (
                <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
                  <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4">
                    <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
                      <h3 className="font-bold text-gray-800">{editingSequence ? "シーケンス編集" : "新規シーケンス"}</h3>
                      <button onClick={() => setShowStepModal(false)} className="text-gray-400 hover:text-gray-600">{Icons.close}</button>
                    </div>
                    <div className="p-5">
                      <label className="text-xs text-gray-500 block mb-1.5 font-medium">シーケンス名</label>
                      <input type="text" value={stepForm.name} onChange={(e) => setStepForm({ name: e.target.value })} placeholder="例: 登録直後シーケンス" autoFocus className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400" />
                    </div>
                    <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-200">
                      <button onClick={() => setShowStepModal(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition">キャンセル</button>
                      <button
                        onClick={async () => {
                          if (!stepForm.name.trim() || !selectedAccount) return;
                          const method = editingSequence ? "PUT" : "POST";
                          const body = editingSequence
                            ? { id: editingSequence.id, name: stepForm.name.trim() }
                            : { account_id: selectedAccount.id, name: stepForm.name.trim() };
                          const res = await fetch("/api/line/step-sequences", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
                          if (res.ok) { setShowStepModal(false); fetchStepSequences(); }
                        }}
                        disabled={!stepForm.name.trim()}
                        className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition"
                      >
                        {editingSequence ? "更新" : "作成"}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* ステップメッセージ追加モーダル */}
              {showStepMsgModal && (
                <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
                  <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4">
                    <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
                      <h3 className="font-bold text-gray-800">{editingStepMsg ? "ステップ編集" : "ステップ追加"}</h3>
                      <button onClick={() => setShowStepMsgModal(false)} className="text-gray-400 hover:text-gray-600">{Icons.close}</button>
                    </div>
                    <div className="p-5 space-y-3">
                      <div className="grid grid-cols-4 gap-3">
                        <div>
                          <label className="text-xs text-gray-500 block mb-1 font-medium">媒体</label>
                          <select value={stepMsgForm.media} onChange={(e) => setStepMsgForm({ ...stepMsgForm, media: e.target.value })} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:border-blue-400 focus:outline-none">
                            <option value="LINE">LINE</option>
                            <option value="email">メール</option>
                            <option value="sms">SMS</option>
                            <option value="action">アクション</option>
                          </select>
                        </div>
                        <div className="col-span-2">
                          <label className="text-xs text-gray-500 block mb-1 font-medium">送信タイミング</label>
                          <div className="space-y-2">
                            <select
                              value={stepMsgForm.timing_mode}
                              onChange={(e) => {
                                const mode = e.target.value as "immediate" | "absolute" | "relative";
                                const updated = { ...stepMsgForm, timing_mode: mode };
                                if (mode === "immediate") updated.delay_minutes = 0;
                                setStepMsgForm(updated);
                              }}
                              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:border-blue-400 focus:outline-none"
                            >
                              <option value="immediate">シナリオ登録直後</option>
                              <option value="absolute">N日後の指定時刻</option>
                              <option value="relative">N日N時間N分後</option>
                            </select>
                            {stepMsgForm.timing_mode === "absolute" && (
                              <div className="flex items-center gap-2">
                                <input type="number" min={0} value={stepMsgForm.delivery_days} onChange={(e) => setStepMsgForm({ ...stepMsgForm, delivery_days: Number(e.target.value) })} className="w-20 border border-gray-200 rounded-lg px-2 py-1.5 text-sm" />
                                <span className="text-xs text-gray-500">日後の</span>
                                <input type="time" value={stepMsgForm.delivery_time} onChange={(e) => setStepMsgForm({ ...stepMsgForm, delivery_time: e.target.value })} className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm" />
                              </div>
                            )}
                            {stepMsgForm.timing_mode === "relative" && (
                              <div className="flex items-center gap-1.5">
                                <input type="number" min={0} value={stepMsgForm.rel_days} onChange={(e) => setStepMsgForm({ ...stepMsgForm, rel_days: Number(e.target.value) })} className="w-16 border border-gray-200 rounded-lg px-2 py-1.5 text-sm" />
                                <span className="text-xs text-gray-500">日</span>
                                <input type="number" min={0} max={23} value={stepMsgForm.rel_hours} onChange={(e) => setStepMsgForm({ ...stepMsgForm, rel_hours: Number(e.target.value) })} className="w-16 border border-gray-200 rounded-lg px-2 py-1.5 text-sm" />
                                <span className="text-xs text-gray-500">時間</span>
                                <input type="number" min={0} max={59} value={stepMsgForm.rel_minutes} onChange={(e) => setStepMsgForm({ ...stepMsgForm, rel_minutes: Number(e.target.value) })} className="w-16 border border-gray-200 rounded-lg px-2 py-1.5 text-sm" />
                                <span className="text-xs text-gray-500">分後</span>
                              </div>
                            )}
                          </div>
                        </div>
                        <div>
                          <label className="text-xs text-gray-500 block mb-1 font-medium">順番</label>
                          <input type="number" min={1} value={stepMsgForm.step_order} onChange={(e) => setStepMsgForm({ ...stepMsgForm, step_order: Number(e.target.value) })} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:border-blue-400 focus:outline-none" />
                        </div>
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 block mb-1 font-medium">管理名称</label>
                        <input type="text" value={stepMsgForm.title} onChange={(e) => setStepMsgForm({ ...stepMsgForm, title: e.target.value })} placeholder="例: 登録直後のLINEメッセージ" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400" />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 block mb-1 font-medium">本文</label>
                        <textarea value={stepMsgForm.body} onChange={(e) => setStepMsgForm({ ...stepMsgForm, body: e.target.value })} rows={5} placeholder="メッセージ内容" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400" />
                      </div>
                    </div>
                    <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-200">
                      <button onClick={() => setShowStepMsgModal(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition">キャンセル</button>
                      <button
                        onClick={async () => {
                          if (!stepMsgForm.title.trim()) return;
                          // timing_modeに応じてdelay_minutesを計算
                          let computedDelay = stepMsgForm.delay_minutes;
                          if (stepMsgForm.timing_mode === "immediate") {
                            computedDelay = 0;
                          } else if (stepMsgForm.timing_mode === "relative") {
                            computedDelay = (stepMsgForm.rel_days * 1440) + (stepMsgForm.rel_hours * 60) + stepMsgForm.rel_minutes;
                          } else if (stepMsgForm.timing_mode === "absolute") {
                            // absolute: delay_minutesにdays*1440を入れ、delivery_timeをpayloadに保存
                            computedDelay = stepMsgForm.delivery_days * 1440;
                          }
                          const method = editingStepMsg ? "PUT" : "POST";
                          const payload = {
                            ...stepMsgForm,
                            delay_minutes: computedDelay,
                            timing_mode: stepMsgForm.timing_mode,
                            delivery_days: stepMsgForm.delivery_days,
                            delivery_time: stepMsgForm.delivery_time,
                          };
                          const body = editingStepMsg
                            ? { id: editingStepMsg.id, ...payload }
                            : payload;
                          const res = await fetch("/api/line/step-messages", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
                          if (res.ok) { setShowStepMsgModal(false); fetchStepSequences(); }
                        }}
                        disabled={!stepMsgForm.title.trim()}
                        className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition"
                      >
                        {editingStepMsg ? "更新" : "追加"}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              <div className="max-w-6xl">
                {stepSequences.filter((s) => (s.kind ?? "step") === "step").length === 0 ? (
                  <div className="bg-white rounded-lg border border-gray-200 p-16 text-center text-gray-400">
                    <p className="text-lg mb-2">ステップ配信がありません</p>
                    <p className="text-sm">「新規追加」から作成してください</p>
                  </div>
                ) : (
                  <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-200 text-gray-500 text-left bg-gray-50">
                          <th className="px-5 py-3 font-medium w-20">媒体</th>
                          <th className="px-5 py-3 font-medium">管理名称</th>
                          <th className="px-5 py-3 font-medium w-28 text-right">ステップ数</th>
                          <th className="px-5 py-3 font-medium w-28">ステータス</th>
                          <th className="px-5 py-3 font-medium w-48"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {stepSequences.filter((s) => (s.kind ?? "step") === "step").map((seq) => (
                          <tr
                            key={seq.id}
                            onClick={() => openEditStep(seq)}
                            className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer"
                          >
                            <td className="px-5 py-3">
                              <span className="px-2 py-0.5 text-xs rounded font-medium bg-[#06C755]/10 text-[#06C755]">LINE</span>
                            </td>
                            <td className="px-5 py-3 text-gray-800">{seq.name}</td>
                            <td className="px-5 py-3 text-gray-500 text-right">{seq.messages?.length ?? 0}通</td>
                            <td className="px-5 py-3">
                              <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${
                                seq.status === "active" ? "bg-green-100 text-green-700" : seq.status === "paused" ? "bg-yellow-100 text-yellow-700" : "bg-gray-100 text-gray-500"
                              }`}>
                                {seq.status === "active" ? "稼働中" : seq.status === "paused" ? "一時停止" : "下書き"}
                              </span>
                            </td>
                            <td className="px-5 py-3" onClick={(e) => e.stopPropagation()}>
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  onClick={async () => {
                                    const newStatus = seq.status === "active" ? "paused" : "active";
                                    await fetch("/api/line/step-sequences", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: seq.id, status: newStatus }) });
                                    fetchStepSequences();
                                  }}
                                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition ${seq.status === "active" ? "bg-yellow-100 text-yellow-700 hover:bg-yellow-200" : "bg-green-100 text-green-700 hover:bg-green-200"}`}
                                >
                                  {seq.status === "active" ? "一時停止" : "稼働開始"}
                                </button>
                                <button
                                  onClick={async () => {
                                    if (!confirm(`「${seq.name}」を削除しますか？`)) return;
                                    await fetch("/api/line/step-sequences", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: seq.id }) });
                                    fetchStepSequences();
                                  }}
                                  className="px-2 py-1 text-xs text-red-500 hover:bg-red-50 rounded-md transition"
                                >
                                  削除
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </main>
          </>
        )}

        {/* ============================================================ */}
        {/* アカウント詳細: 予約配信 */}
        {/* ============================================================ */}
        {mainView === "account-detail" && accountSubView === "schedule" && (
          <>
            <header className="bg-white border-b border-gray-200 px-6 py-3 flex-shrink-0">
              <h1 className="text-base font-bold text-gray-800">予約配信</h1>
            </header>
            <main className="flex-1 overflow-y-auto p-6">
              {!showScheduleCreator && (
                <div className="max-w-5xl mb-4 flex gap-2 flex-wrap">
                  <button
                    onClick={() => { setScheduleCreatorForm({ ...emptyBroadcast, timingMode: "datetime" }); setShowScheduleCreator(true); }}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-md transition"
                    title="新しい予約配信を作成"
                  >
                    {Icons.plus} 新規追加
                  </button>
                  <button
                    onClick={() => { setAccountSubView("actions"); openNewActionRule(); }}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white text-xs font-medium rounded-md transition"
                    title="ラベル付与・シーケンス移動・Webhook等のアクションを追加"
                  >
                    {Icons.plus} アクション追加
                  </button>
                  <button
                    onClick={() => setShowSmsModal(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-500 hover:bg-orange-600 text-white text-xs font-medium rounded-md transition"
                    title="SMS送信・クレジットチャージ"
                  >
                    {Icons.plus} SMS追加
                  </button>
                </div>
              )}
              {showScheduleCreator && (
                <div className="max-w-5xl mb-6">
                  {renderBroadcastCreator(
                    scheduleCreatorForm,
                    setScheduleCreatorForm,
                    () => setShowScheduleCreator(false),
                    async () => {
                      const ok = await saveBroadcast("schedule", scheduleCreatorForm);
                      if (ok) { setShowScheduleCreator(false); setScheduleCreatorForm(emptyBroadcast); }
                    },
                    "新規予約配信作成",
                    "schedule",
                  )}
                </div>
              )}
              {!showScheduleCreator && (
                <div className="max-w-6xl">
                  {stepSequences.filter((s) => s.kind === "schedule" && !s.sent_at).length === 0 ? (
                    <div className="bg-white rounded-lg border border-gray-200 p-16 text-center text-gray-400">
                      <p className="text-lg mb-2">予約中の配信がありません</p>
                      <p className="text-sm">「新規追加」から作成してください（送信済みは左メニューの「送信済み」から確認できます）</p>
                    </div>
                  ) : (
                    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-gray-200 text-gray-500 text-left bg-gray-50">
                            <th className="px-5 py-3 font-medium w-20">媒体</th>
                            <th className="px-5 py-3 font-medium">管理名称</th>
                            <th className="px-5 py-3 font-medium w-44">送信日時</th>
                            <th className="px-5 py-3 font-medium w-28">ステータス</th>
                            <th className="px-5 py-3 font-medium w-64"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {stepSequences
                            .filter((s) => s.kind === "schedule" && !s.sent_at)
                            .sort((a, b) => {
                              const at = a.scheduled_at ? new Date(a.scheduled_at).getTime() : 0;
                              const bt = b.scheduled_at ? new Date(b.scheduled_at).getTime() : 0;
                              return bt - at;
                            })
                            .map((seq) => {
                              const scheduled = seq.scheduled_at
                                ? new Date(seq.scheduled_at).toLocaleString("ja-JP", {
                                    year: "numeric",
                                    month: "2-digit",
                                    day: "2-digit",
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  })
                                : "日時未設定";
                              const isOverdue =
                                !!seq.scheduled_at &&
                                new Date(seq.scheduled_at).getTime() < Date.now();
                              return (
                                <tr
                                  key={seq.id}
                                  onClick={() => openEditSchedule(seq)}
                                  className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer"
                                >
                                  <td className="px-5 py-3">
                                    <span className="px-2 py-0.5 text-xs rounded font-medium bg-[#06C755]/10 text-[#06C755]">LINE</span>
                                  </td>
                                  <td className="px-5 py-3 text-gray-800">{seq.name}</td>
                                  <td className="px-5 py-3 text-gray-500">{scheduled}</td>
                                  <td className="px-5 py-3">
                                    {seq.status === "paused" ? (
                                      <span className="px-2 py-0.5 text-xs rounded-full font-medium bg-yellow-100 text-yellow-700">一時停止</span>
                                    ) : isOverdue ? (
                                      <span className="px-2 py-0.5 text-xs rounded-full font-medium bg-orange-100 text-orange-700">送信待ち</span>
                                    ) : (
                                      <span className="px-2 py-0.5 text-xs rounded-full font-medium bg-green-100 text-green-700">予約中</span>
                                    )}
                                  </td>
                                  <td className="px-5 py-3" onClick={(e) => e.stopPropagation()}>
                                    <div className="flex items-center justify-end gap-2">
                                      <button
                                        onClick={async () => {
                                          if (!confirm(`「${seq.name}」を今すぐ送信しますか？`)) return;
                                          const res = await fetch("/api/line/step-sequences/send-now", {
                                            method: "POST",
                                            headers: { "Content-Type": "application/json" },
                                            body: JSON.stringify({ id: seq.id }),
                                          });
                                          const data = await res.json().catch(() => ({}));
                                          if (res.ok) {
                                            alert(`送信完了: ${data.sent ?? 0}件成功 / ${data.failed ?? 0}件失敗`);
                                            fetchStepSequences();
                                          } else {
                                            alert(`送信失敗: ${data.error ?? res.status}`);
                                          }
                                        }}
                                        className="px-2.5 py-1 text-xs font-medium rounded-md bg-blue-600 hover:bg-blue-700 text-white transition"
                                      >
                                        今すぐ送信
                                      </button>
                                      <button
                                        onClick={async () => {
                                          const newStatus = seq.status === "active" ? "paused" : "active";
                                          await fetch("/api/line/step-sequences", {
                                            method: "PUT",
                                            headers: { "Content-Type": "application/json" },
                                            body: JSON.stringify({ id: seq.id, status: newStatus }),
                                          });
                                          fetchStepSequences();
                                        }}
                                        className={`px-2.5 py-1 text-xs font-medium rounded-md transition ${seq.status === "active" ? "bg-yellow-100 text-yellow-700 hover:bg-yellow-200" : "bg-green-100 text-green-700 hover:bg-green-200"}`}
                                      >
                                        {seq.status === "active" ? "一時停止" : "再開"}
                                      </button>
                                      <button
                                        onClick={async () => {
                                          if (!confirm(`「${seq.name}」を削除しますか？`)) return;
                                          await fetch("/api/line/step-sequences", {
                                            method: "DELETE",
                                            headers: { "Content-Type": "application/json" },
                                            body: JSON.stringify({ id: seq.id }),
                                          });
                                          fetchStepSequences();
                                        }}
                                        className="px-2 py-1 text-xs text-red-500 hover:bg-red-50 rounded-md transition"
                                      >
                                        削除
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </main>
          </>
        )}

        {/* ============================================================ */}
        {/* アカウント詳細: 送信済み（予約配信） */}
        {/* ============================================================ */}
        {mainView === "account-detail" && accountSubView === "sent" && (
          <>
            <header className="bg-white border-b border-gray-200 px-6 py-3 flex-shrink-0">
              <h1 className="text-base font-bold text-gray-800">送信済み</h1>
            </header>
            <main className="flex-1 overflow-y-auto p-6">
              {showScheduleCreator && (
                <div className="max-w-5xl mb-6">
                  {renderBroadcastCreator(
                    scheduleCreatorForm,
                    setScheduleCreatorForm,
                    () => setShowScheduleCreator(false),
                    async () => {
                      const ok = await saveBroadcast("schedule", scheduleCreatorForm);
                      if (ok) { setShowScheduleCreator(false); setScheduleCreatorForm(emptyBroadcast); }
                    },
                    "送信済み配信の内容",
                    "schedule",
                  )}
                </div>
              )}
              <div className={`max-w-6xl ${showScheduleCreator ? "hidden" : ""}`}>
                {stepSequences.filter((s) => s.kind === "schedule" && !!s.sent_at).length === 0 ? (
                  <div className="bg-white rounded-lg border border-gray-200 p-16 text-center text-gray-400">
                    <p className="text-lg mb-2">送信済みの配信がありません</p>
                    <p className="text-sm">予約配信を送信すると、ここに履歴が残ります</p>
                  </div>
                ) : (
                  <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-200 text-gray-500 text-left bg-gray-50">
                          <th className="px-5 py-3 font-medium w-20">媒体</th>
                          <th className="px-5 py-3 font-medium">管理名称</th>
                          <th className="px-5 py-3 font-medium w-44">送信日時</th>
                          <th className="px-5 py-3 font-medium w-28">ステータス</th>
                          <th className="px-5 py-3 font-medium w-24"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {stepSequences
                          .filter((s) => s.kind === "schedule" && !!s.sent_at)
                          .sort((a, b) => {
                            const at = a.sent_at ? new Date(a.sent_at).getTime() : 0;
                            const bt = b.sent_at ? new Date(b.sent_at).getTime() : 0;
                            return bt - at;
                          })
                          .map((seq) => {
                            const sentStr = seq.sent_at
                              ? new Date(seq.sent_at).toLocaleString("ja-JP", {
                                  year: "numeric",
                                  month: "2-digit",
                                  day: "2-digit",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })
                              : "";
                            return (
                              <tr
                                key={seq.id}
                                onClick={() => openEditSchedule(seq)}
                                className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer"
                              >
                                <td className="px-5 py-3">
                                  <span className="px-2 py-0.5 text-xs rounded font-medium bg-[#06C755]/10 text-[#06C755]">LINE</span>
                                </td>
                                <td className="px-5 py-3 text-gray-800">{seq.name}</td>
                                <td className="px-5 py-3 text-gray-500">{sentStr}</td>
                                <td className="px-5 py-3">
                                  <span className="px-2 py-0.5 text-xs rounded-full font-medium bg-gray-200 text-gray-600">送信済み</span>
                                </td>
                                <td className="px-5 py-3" onClick={(e) => e.stopPropagation()}>
                                  <div className="flex items-center justify-end gap-2">
                                    <button
                                      onClick={async () => {
                                        if (!confirm(`「${seq.name}」を削除しますか？履歴が消えます。`)) return;
                                        await fetch("/api/line/step-sequences", {
                                          method: "DELETE",
                                          headers: { "Content-Type": "application/json" },
                                          body: JSON.stringify({ id: seq.id }),
                                        });
                                        fetchStepSequences();
                                      }}
                                      className="px-2 py-1 text-xs text-red-500 hover:bg-red-50 rounded-md transition"
                                    >
                                      削除
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </main>
          </>
        )}

        {/* ============================================================ */}
        {/* アカウント詳細: リッチメニュー */}
        {/* ============================================================ */}
        {mainView === "account-detail" && accountSubView === "rich-menu" && (() => {
          const RICH_MENU_TEMPLATES: ReadonlyArray<{
            value: string;
            label: string;
            sizeType: "large" | "compact";
            areas: ReadonlyArray<{ x: number; y: number; w: number; h: number; label: string }>;
          }> = [
            { value: "L1", label: "L-1 フル", sizeType: "large", areas: [{ x:0,y:0,w:100,h:100,label:"A" }] },
            { value: "L2", label: "L-2 縦2分割", sizeType: "large", areas: [{ x:0,y:0,w:50,h:100,label:"A" }, { x:50,y:0,w:50,h:100,label:"B" }] },
            { value: "L3", label: "L-3 横2分割", sizeType: "large", areas: [{ x:0,y:0,w:100,h:50,label:"A" }, { x:0,y:50,w:100,h:50,label:"B" }] },
            { value: "L4", label: "L-4 2×2", sizeType: "large", areas: [{ x:0,y:0,w:50,h:50,label:"A" }, { x:50,y:0,w:50,h:50,label:"B" }, { x:0,y:50,w:50,h:50,label:"C" }, { x:50,y:50,w:50,h:50,label:"D" }] },
            { value: "L5", label: "L-5 縦3分割", sizeType: "large", areas: [{ x:0,y:0,w:33,h:100,label:"A" }, { x:33,y:0,w:34,h:100,label:"B" }, { x:67,y:0,w:33,h:100,label:"C" }] },
            { value: "L6", label: "L-6 3×2", sizeType: "large", areas: [{ x:0,y:0,w:33,h:50,label:"A" }, { x:33,y:0,w:34,h:50,label:"B" }, { x:67,y:0,w:33,h:50,label:"C" }, { x:0,y:50,w:33,h:50,label:"D" }, { x:33,y:50,w:34,h:50,label:"E" }, { x:67,y:50,w:33,h:50,label:"F" }] },
            { value: "L7", label: "L-7 上1+下2", sizeType: "large", areas: [{ x:0,y:0,w:100,h:50,label:"A" }, { x:0,y:50,w:50,h:50,label:"B" }, { x:50,y:50,w:50,h:50,label:"C" }] },
            { value: "L8", label: "L-8 上2+下1", sizeType: "large", areas: [{ x:0,y:0,w:50,h:50,label:"A" }, { x:50,y:0,w:50,h:50,label:"B" }, { x:0,y:50,w:100,h:50,label:"C" }] },
            { value: "C1", label: "小-1 フル", sizeType: "compact", areas: [{ x:0,y:0,w:100,h:100,label:"A" }] },
            { value: "C2", label: "小-2 縦2分割", sizeType: "compact", areas: [{ x:0,y:0,w:50,h:100,label:"A" }, { x:50,y:0,w:50,h:100,label:"B" }] },
            { value: "C3", label: "小-3 縦3分割", sizeType: "compact", areas: [{ x:0,y:0,w:33,h:100,label:"A" }, { x:33,y:0,w:34,h:100,label:"B" }, { x:67,y:0,w:33,h:100,label:"C" }] },
          ];

          const openRichMenuEditor = (menu: RichMenu | null) => {
            if (menu) {
              setEditingRichMenuId(menu.id);
              setRichMenuForm({
                name: menu.name,
                image_url: menu.image_url,
                size_type: menu.size_type,
                chat_bar_text: menu.chat_bar_text,
                selected: menu.selected,
                is_default: menu.is_default,
                template_type: menu.template_type,
                areas: menu.areas,
              });
            } else {
              setEditingRichMenuId(null);
              setRichMenuForm(emptyRichMenu);
            }
            setShowRichMenuEditor(true);
          };

          const selectedTemplate = RICH_MENU_TEMPLATES.find((t) => t.value === richMenuForm.template_type) ?? RICH_MENU_TEMPLATES[0];

          const saveRichMenu = async () => {
            if (!selectedAccount) return;
            if (!richMenuForm.name.trim()) { alert("管理名称を入力してください"); return; }
            if (!richMenuForm.image_url) { alert("画像をアップロードしてください"); return; }
            try {
              if (editingRichMenuId) {
                const res = await fetch("/api/line/rich-menus", {
                  method: "PUT",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ id: editingRichMenuId, ...richMenuForm }),
                });
                if (!res.ok) { const d = await res.json().catch(() => ({})); alert(`保存失敗: ${d.error ?? res.status}`); return; }
              } else {
                const res = await fetch("/api/line/rich-menus", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ line_account_id: selectedAccount.id, ...richMenuForm }),
                });
                if (!res.ok) { const d = await res.json().catch(() => ({})); alert(`作成失敗: ${d.error ?? res.status}`); return; }
              }
              await fetchRichMenus();
              setShowRichMenuEditor(false);
            } catch (e) {
              alert(`エラー: ${(e as Error).message}`);
            }
          };

          const deployRichMenu = async (menu: RichMenu) => {
            if (!confirm(`「${menu.name}」を LINE に適用しますか？\n※既存のリッチメニューは置き換えられます`)) return;
            setRichMenuDeploying(true);
            try {
              const res = await fetch("/api/line/rich-menus/deploy", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id: menu.id }),
              });
              const data = await res.json();
              if (res.ok) {
                alert(`適用完了: richMenuId=${data.line_rich_menu_id}`);
                await fetchRichMenus();
              } else {
                alert(`適用失敗: ${data.error ?? res.status}`);
              }
            } catch (e) {
              alert(`適用エラー: ${(e as Error).message}`);
            } finally {
              setRichMenuDeploying(false);
            }
          };

          return (
          <>
            <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between flex-shrink-0">
              <h1 className="text-base font-bold text-gray-800">リッチメニュー</h1>
              {!showRichMenuEditor && (
                <button
                  onClick={() => openRichMenuEditor(null)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-md transition"
                >
                  {Icons.plus} 新規作成
                </button>
              )}
            </header>
            <main className="flex-1 overflow-y-auto p-6">
              {showRichMenuEditor ? (
                <div className="max-w-4xl bg-white border border-gray-200 rounded-lg p-6 space-y-5">
                  <div className="flex items-center justify-between">
                    <h2 className="text-sm font-bold text-gray-800">
                      {editingRichMenuId ? "リッチメニュー編集" : "新規リッチメニュー"}
                    </h2>
                    <button onClick={() => setShowRichMenuEditor(false)} className="text-gray-400 hover:text-gray-600">
                      {Icons.close}
                    </button>
                  </div>

                  {/* 管理名称 */}
                  <div>
                    <label className="text-sm text-gray-700 font-medium block mb-1.5">管理名称 <span className="text-[10px] text-white bg-red-500 px-1.5 py-0.5 rounded">必須</span></label>
                    <input
                      type="text"
                      value={richMenuForm.name}
                      onChange={(e) => setRichMenuForm({ ...richMenuForm, name: e.target.value })}
                      placeholder="例: 通常メニュー"
                      className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                    />
                  </div>

                  {/* サイズ */}
                  <div>
                    <label className="text-sm text-gray-700 font-medium block mb-1.5">サイズ</label>
                    <div className="flex gap-3">
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="radio"
                          name="rm-size"
                          checked={richMenuForm.size_type === "large"}
                          onChange={() => setRichMenuForm({ ...richMenuForm, size_type: "large", template_type: "L1", areas: [] })}
                          className="accent-[#06C755]"
                        />
                        <span className="text-sm">大 (2500×1686)</span>
                      </label>
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="radio"
                          name="rm-size"
                          checked={richMenuForm.size_type === "compact"}
                          onChange={() => setRichMenuForm({ ...richMenuForm, size_type: "compact", template_type: "C1", areas: [] })}
                          className="accent-[#06C755]"
                        />
                        <span className="text-sm">小 (2500×843)</span>
                      </label>
                    </div>
                  </div>

                  {/* 画像 */}
                  <div>
                    <label className="text-sm text-gray-700 font-medium block mb-1.5">画像ファイル <span className="text-[10px] text-white bg-red-500 px-1.5 py-0.5 rounded">必須</span></label>
                    <div className="flex items-center gap-3">
                      <label className="cursor-pointer px-3 py-1.5 bg-gray-100 hover:bg-gray-200 border border-gray-300 rounded-md text-xs text-gray-700 transition">
                        ファイルを選択
                        <input
                          type="file"
                          accept="image/jpeg,image/png"
                          className="hidden"
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            const fd = new FormData();
                            fd.append("file", file);
                            try {
                              const res = await fetch("/api/line/upload-image", { method: "POST", body: fd });
                              const data = await res.json();
                              if (res.ok && data.url) {
                                setRichMenuForm({ ...richMenuForm, image_url: data.url });
                              } else {
                                alert(data.error ?? "アップロード失敗");
                              }
                            } catch (err) {
                              alert(`アップロードエラー: ${(err as Error).message}`);
                            } finally {
                              e.target.value = "";
                            }
                          }}
                        />
                      </label>
                      <span className="text-xs text-gray-500">{richMenuForm.image_url ? "アップロード済み" : "選択されていません"}</span>
                    </div>
                    <p className="text-[11px] text-gray-500 mt-1">
                      推奨: {richMenuForm.size_type === "large" ? "2500×1686px" : "2500×843px"} / JPEG or PNG / 1MB以下
                    </p>
                    {richMenuForm.image_url && (
                      <div className="mt-2 relative inline-block max-w-md">
                        <img src={richMenuForm.image_url} alt="preview" className="w-full rounded border border-gray-200" />
                        {selectedTemplate.areas.map((a) => (
                          <div
                            key={a.label}
                            className="absolute border-2 border-[#06C755] bg-[#06C755]/10 flex items-center justify-center text-[#06C755] font-bold text-lg pointer-events-none"
                            style={{ left: `${a.x}%`, top: `${a.y}%`, width: `${a.w}%`, height: `${a.h}%` }}
                          >
                            {a.label}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* レイアウト */}
                  <div>
                    <label className="text-sm text-gray-700 font-medium block mb-2">レイアウト</label>
                    <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
                      {RICH_MENU_TEMPLATES.filter((t) => t.sizeType === richMenuForm.size_type).map((tpl) => {
                        const isActive = richMenuForm.template_type === tpl.value;
                        return (
                          <label key={tpl.value} className="flex flex-col items-start cursor-pointer group">
                            <button
                              type="button"
                              onClick={() => {
                                const nextAreas = tpl.areas.map((a) => {
                                  const existing = richMenuForm.areas.find((x) => x.label === a.label);
                                  return existing ?? { label: a.label, actionType: "none" as const, uri: "", text: "", data: "" };
                                });
                                setRichMenuForm({ ...richMenuForm, template_type: tpl.value, areas: nextAreas });
                              }}
                              className={`w-full aspect-[3/2] bg-white border-2 ${isActive ? "border-[#06C755]" : "border-gray-200 group-hover:border-gray-300"} rounded-sm relative overflow-hidden transition`}
                            >
                              {tpl.areas.map((a) => (
                                <div
                                  key={a.label}
                                  className="absolute flex items-center justify-center text-xl font-bold text-[#06C755] border border-[#06C755]"
                                  style={{ left: `${a.x}%`, top: `${a.y}%`, width: `${a.w}%`, height: `${a.h}%` }}
                                >
                                  {a.label}
                                </div>
                              ))}
                            </button>
                            <div className="flex items-center gap-1.5 mt-1.5">
                              <input
                                type="radio"
                                name={`rm-tpl`}
                                checked={isActive}
                                onChange={() => {
                                  const nextAreas = tpl.areas.map((a) => {
                                    const existing = richMenuForm.areas.find((x) => x.label === a.label);
                                    return existing ?? { label: a.label, actionType: "none" as const, uri: "", text: "", data: "" };
                                  });
                                  setRichMenuForm({ ...richMenuForm, template_type: tpl.value, areas: nextAreas });
                                }}
                                className="accent-[#06C755]"
                              />
                              <span className="text-xs">{tpl.label}</span>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  {/* エリアごとのアクション */}
                  {richMenuForm.areas.length > 0 && (
                    <div>
                      <label className="text-sm text-gray-700 font-medium block mb-2">アクション</label>
                      <div className="space-y-2">
                        {richMenuForm.areas.map((area, ai) => (
                          <div key={ai} className="border border-gray-300 rounded-md">
                            <div className="px-3 py-2 bg-gray-50 border-b border-gray-300 text-sm text-gray-700">エリア{area.label}</div>
                            <div className="p-3 space-y-2">
                              <select
                                value={area.actionType}
                                onChange={(e) => {
                                  const next = [...richMenuForm.areas];
                                  next[ai] = { ...next[ai], actionType: e.target.value as RichMenuArea["actionType"] };
                                  setRichMenuForm({ ...richMenuForm, areas: next });
                                }}
                                className="w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm bg-white"
                              >
                                <option value="none">何もしない</option>
                                <option value="uri">URLを開く</option>
                                <option value="message">メッセージを送信</option>
                                <option value="postback">Postback（アクション実行）</option>
                              </select>
                              {area.actionType !== "none" && (
                                <input
                                  type="text"
                                  value={area.label ?? ""}
                                  onChange={(e) => {
                                    const next = [...richMenuForm.areas];
                                    next[ai] = { ...next[ai], label: e.target.value };
                                    setRichMenuForm({ ...richMenuForm, areas: next });
                                  }}
                                  placeholder={`表示ラベル（初期値: 「エリア${area.label}」のキー）`}
                                  className="w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm"
                                />
                              )}
                              {area.actionType === "uri" && (
                                <input
                                  type="url"
                                  value={area.uri}
                                  onChange={(e) => {
                                    const next = [...richMenuForm.areas];
                                    next[ai] = { ...next[ai], uri: e.target.value };
                                    setRichMenuForm({ ...richMenuForm, areas: next });
                                  }}
                                  placeholder="https://example.com"
                                  className="w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm"
                                />
                              )}
                              {area.actionType === "message" && (
                                <input
                                  type="text"
                                  value={area.text}
                                  onChange={(e) => {
                                    const next = [...richMenuForm.areas];
                                    next[ai] = { ...next[ai], text: e.target.value };
                                    setRichMenuForm({ ...richMenuForm, areas: next });
                                  }}
                                  placeholder="タップ時に送信するメッセージ"
                                  className="w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm"
                                />
                              )}
                              {area.actionType === "postback" && (
                                <input
                                  type="text"
                                  value={area.data}
                                  onChange={(e) => {
                                    const next = [...richMenuForm.areas];
                                    next[ai] = { ...next[ai], data: e.target.value };
                                    setRichMenuForm({ ...richMenuForm, areas: next });
                                  }}
                                  placeholder="postback データ（例: action=open_survey）"
                                  className="w-full border border-gray-300 rounded-md px-3 py-1.5 text-sm"
                                />
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* チャットバーテキスト / 初期表示 / デフォルト */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm text-gray-700 font-medium block mb-1.5">メニュー開閉ボタンのテキスト</label>
                      <input
                        type="text"
                        value={richMenuForm.chat_bar_text}
                        onChange={(e) => setRichMenuForm({ ...richMenuForm, chat_bar_text: e.target.value.slice(0, 14) })}
                        maxLength={14}
                        className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                      />
                      <p className="text-[10px] text-gray-400 mt-1">最大14文字</p>
                    </div>
                    <div className="flex items-end gap-4">
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input type="checkbox" checked={richMenuForm.selected} onChange={(e) => setRichMenuForm({ ...richMenuForm, selected: e.target.checked })} className="accent-[#06C755]" />
                        <span className="text-sm">初期表示する</span>
                      </label>
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input type="checkbox" checked={richMenuForm.is_default} onChange={(e) => setRichMenuForm({ ...richMenuForm, is_default: e.target.checked })} className="accent-[#06C755]" />
                        <span className="text-sm">デフォルトに設定</span>
                      </label>
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 pt-2 border-t border-gray-200">
                    <button onClick={() => setShowRichMenuEditor(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-md">キャンセル</button>
                    <button onClick={saveRichMenu} className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-md">
                      {editingRichMenuId ? "更新" : "作成"}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="max-w-6xl">
                  {richMenus.length === 0 ? (
                    <div className="bg-white rounded-lg border border-gray-200 p-16 text-center text-gray-400">
                      <p className="text-lg mb-2">リッチメニューがありません</p>
                      <p className="text-sm">「新規作成」から作ってください</p>
                    </div>
                  ) : (
                    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-gray-200 text-gray-500 text-left bg-gray-50">
                            <th className="px-5 py-3 font-medium">管理名称</th>
                            <th className="px-5 py-3 font-medium w-24">サイズ</th>
                            <th className="px-5 py-3 font-medium w-28">レイアウト</th>
                            <th className="px-5 py-3 font-medium w-28">ステータス</th>
                            <th className="px-5 py-3 font-medium w-20">デフォ</th>
                            <th className="px-5 py-3 font-medium w-56"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {richMenus.map((rm) => (
                            <tr key={rm.id} className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer" onClick={() => openRichMenuEditor(rm)}>
                              <td className="px-5 py-3 text-gray-800">{rm.name}</td>
                              <td className="px-5 py-3 text-gray-500 text-xs">{rm.size_type === "large" ? "大" : "小"}</td>
                              <td className="px-5 py-3 text-gray-500 text-xs font-mono">{rm.template_type}</td>
                              <td className="px-5 py-3">
                                <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${rm.status === "deployed" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                                  {rm.status === "deployed" ? "適用済" : "下書き"}
                                </span>
                              </td>
                              <td className="px-5 py-3">
                                {rm.is_default && <span className="px-2 py-0.5 text-[10px] bg-blue-100 text-blue-700 rounded">DEFAULT</span>}
                              </td>
                              <td className="px-5 py-3" onClick={(e) => e.stopPropagation()}>
                                <div className="flex items-center justify-end gap-2">
                                  <button
                                    disabled={richMenuDeploying}
                                    onClick={() => deployRichMenu(rm)}
                                    className="px-2.5 py-1 text-xs font-medium rounded-md bg-[#06C755] hover:bg-[#05a648] text-white disabled:opacity-50"
                                  >
                                    {rm.status === "deployed" ? "再適用" : "LINEに適用"}
                                  </button>
                                  <button
                                    onClick={async () => {
                                      if (!confirm(`「${rm.name}」を削除しますか？`)) return;
                                      await fetch("/api/line/rich-menus", {
                                        method: "DELETE",
                                        headers: { "Content-Type": "application/json" },
                                        body: JSON.stringify({ id: rm.id }),
                                      });
                                      fetchRichMenus();
                                    }}
                                    className="px-2 py-1 text-xs text-red-500 hover:bg-red-50 rounded-md"
                                  >
                                    削除
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </main>
          </>
          );
        })()}

        {/* ============================================================ */}
        {/* アカウント詳細: 友だち追加ページ */}
        {/* ============================================================ */}
        {mainView === "account-detail" && accountSubView === "friend-page" && (
          <>
            <header className="bg-white border-b border-gray-200 px-6 py-3 flex-shrink-0">
              <h1 className="text-base font-bold text-gray-800">友だち追加ページ</h1>
            </header>
            <main className="flex-1 overflow-y-auto p-6">
              {selectedAccount?.basic_id ? (
                <div className="bg-white rounded-lg border border-gray-200 p-6 max-w-md">
                  <div className="text-center">
                    <div className="bg-white rounded-xl p-3 inline-block border border-gray-200 mb-4">
                      <img
                        src={`https://qr-official.line.me/gs/M_${selectedAccount.basic_id}_GW.png`}
                        alt="QRコード"
                        className="w-48 h-48"
                      />
                    </div>
                    <p className="text-sm font-medium text-gray-800 mb-1">{selectedAccount.account_name}</p>
                    <p className="text-xs text-gray-400 mb-3">@{selectedAccount.basic_id}</p>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <input
                          readOnly
                          value={`https://line.me/R/ti/p/@${selectedAccount.basic_id}`}
                          className="flex-1 border border-gray-200 rounded-md px-3 py-1.5 text-xs font-mono text-blue-600 bg-gray-50"
                        />
                        <button
                          onClick={() => navigator.clipboard.writeText(`https://line.me/R/ti/p/@${selectedAccount.basic_id}`)}
                          className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded-md transition"
                        >
                          コピー
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-white rounded-lg border border-gray-200 p-10 text-center text-gray-400 max-w-md">
                  <p>Basic IDが未設定です。アカウント設定から設定してください。</p>
                </div>
              )}
            </main>
          </>
        )}

        {/* ============================================================ */}
        {/* アカウント詳細: ラベル管理 */}
        {/* ============================================================ */}
        {mainView === "account-detail" && accountSubView === "labels" && (
          <>
            <header className="bg-white border-b border-gray-200 px-4 md:px-6 py-3 flex-shrink-0">
              <h1 className="text-base font-bold text-gray-800">ラベル管理</h1>
            </header>
            <main className="flex-1 overflow-y-auto p-4 md:p-6">
              <div className="flex items-center gap-2 flex-wrap mb-4">
                <button
                  onClick={() => { setNewLabelName(""); setShowAddLabel(true); }}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-md transition"
                >
                  {Icons.plus}
                  追加
                </button>
                <button className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-medium rounded-md transition">
                  {Icons.folder}
                  グループ管理
                </button>
                <button className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-500 hover:bg-orange-600 text-white text-xs font-medium rounded-md transition">
                  {Icons.sort}
                  並び替え
                </button>
              </div>
              {/* ラベル追加モーダル */}
              {showAddLabel && (
                <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
                  <div className="bg-white rounded-xl shadow-xl w-full max-w-sm mx-4">
                    <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
                      <h3 className="font-bold text-gray-800">ラベルを追加</h3>
                      <button onClick={() => setShowAddLabel(false)} className="text-gray-400 hover:text-gray-600">{Icons.close}</button>
                    </div>
                    <div className="p-5">
                      <label className="text-xs text-gray-500 block mb-1.5 font-medium">ラベル名</label>
                      <input
                        type="text"
                        value={newLabelName}
                        onChange={(e) => setNewLabelName(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) createLabel(); }}
                        placeholder="例: VIP顧客、要フォロー、成約済み"
                        autoFocus
                        className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
                      />
                    </div>
                    <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-200">
                      <button onClick={() => setShowAddLabel(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition">キャンセル</button>
                      <button
                        onClick={createLabel}
                        disabled={!newLabelName.trim()}
                        className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition"
                      >
                        作成
                      </button>
                    </div>
                  </div>
                </div>
              )}

              <div className="max-w-5xl">
                {labels.length === 0 ? (
                  <div className="bg-white rounded-lg border border-gray-200 p-16 text-center text-gray-400">
                    <p className="text-lg mb-2">ラベルがありません</p>
                    <p className="text-sm">「+ 追加」ボタンからラベルを作成してください</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {labels.map((label) => {
                      const isExpanded = expandedLabelId === label.id;
                      const assignedFollowers = followers.filter((f) =>
                        label.assigned_users.includes(f.line_user_id)
                      ).sort((a, b) => new Date(b.followed_at).getTime() - new Date(a.followed_at).getTime());

                      return (
                        <div key={label.id} className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                          {/* ラベル行 */}
                          <div className="flex items-center justify-between px-5 py-3.5">
                            <div className="flex items-center gap-3">
                              <span
                                className="w-4 h-4 rounded-full flex-shrink-0"
                                style={{ backgroundColor: label.color }}
                              />
                              <span className="text-sm font-medium text-gray-800">{label.name}</span>
                              <span className="text-xs text-gray-400">{label.assigned_users.length} 人</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => { setExpandedLabelId(isExpanded ? null : label.id); setLabelUserPage(1); setLabelUserSearch(""); }}
                                className={`px-3 py-1.5 text-xs font-medium rounded-md transition ${
                                  isExpanded
                                    ? "bg-blue-100 text-blue-700 hover:bg-blue-200"
                                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                                }`}
                              >
                                付与者 {label.assigned_users.length > 0 && `(${label.assigned_users.length})`}
                                <span className="ml-1">{isExpanded ? "▲" : "▼"}</span>
                              </button>
                              <button
                                onClick={() => deleteLabel(label.id)}
                                className="px-2 py-1.5 text-xs text-red-400 hover:text-red-600 hover:bg-red-50 rounded-md transition"
                              >
                                削除
                              </button>
                            </div>
                          </div>

                          {/* 付与者リスト（展開時） */}
                          {isExpanded && (() => {
                            const searchedFollowers = labelUserSearch
                              ? assignedFollowers.filter((f) => f.display_name?.toLowerCase().includes(labelUserSearch.toLowerCase()) || f.line_user_id.includes(labelUserSearch))
                              : assignedFollowers;
                            const totalLabelPages = Math.ceil(searchedFollowers.length / LABEL_USERS_PER_PAGE);
                            const currentLabelPage = Math.min(labelUserPage, Math.max(1, totalLabelPages));
                            const pagedLabelFollowers = searchedFollowers.slice((currentLabelPage - 1) * LABEL_USERS_PER_PAGE, currentLabelPage * LABEL_USERS_PER_PAGE);

                            const getLabelPageNumbers = (): (number | "...")[] => {
                              const pages: (number | "...")[] = [];
                              if (totalLabelPages <= 7) {
                                for (let i = 1; i <= totalLabelPages; i++) pages.push(i);
                              } else {
                                pages.push(1);
                                if (currentLabelPage > 3) pages.push("...");
                                const start = Math.max(2, currentLabelPage - 1);
                                const end = Math.min(totalLabelPages - 1, currentLabelPage + 1);
                                for (let i = start; i <= end; i++) pages.push(i);
                                if (currentLabelPage < totalLabelPages - 2) pages.push("...");
                                pages.push(totalLabelPages);
                              }
                              return pages;
                            };

                            return (
                            <div className="border-t border-gray-200">
                              <div className="px-5 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between gap-3">
                                <span className="text-xs font-medium text-gray-500 flex-shrink-0">
                                  付与済み: {assignedFollowers.length} 人
                                </span>
                                <div className="relative flex-1 max-w-xs">
                                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2">{Icons.search}</span>
                                  <input
                                    type="text"
                                    value={labelUserSearch}
                                    onChange={(e) => { setLabelUserSearch(e.target.value); setLabelUserPage(1); }}
                                    placeholder="名前で検索"
                                    className="w-full pl-8 pr-3 py-1.5 border border-gray-200 rounded-md text-xs bg-white focus:border-blue-400 focus:outline-none"
                                  />
                                </div>
                              </div>

                              {searchedFollowers.length === 0 ? (
                                <div className="px-5 py-6 text-center text-sm text-gray-400">
                                  {labelUserSearch ? "該当するユーザーが見つかりません" : "このラベルが付与されたユーザーはいません"}
                                </div>
                              ) : (
                                <>
                                  <div className="divide-y divide-gray-100">
                                    {pagedLabelFollowers.map((f) => (
                                      <div key={f.id} className="flex items-center justify-between px-5 py-2.5 hover:bg-gray-50">
                                        <div className="flex items-center gap-3">
                                          {f.picture_url ? (
                                            <img src={f.picture_url} alt="" className="w-8 h-8 rounded-full object-cover" />
                                          ) : (
                                            <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-gray-400">
                                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                                            </div>
                                          )}
                                          <div>
                                            <span className="text-sm text-gray-800">{f.display_name ?? "名前なし"}</span>
                                            <span className="text-xs text-gray-400 ml-2">{fmtShort(f.followed_at)}</span>
                                          </div>
                                        </div>
                                        <button
                                          onClick={() => toggleLabelUser(label.id, f.line_user_id)}
                                          className="text-xs text-red-400 hover:text-red-600 hover:bg-red-50 px-2 py-1 rounded transition"
                                        >
                                          解除
                                        </button>
                                      </div>
                                    ))}
                                  </div>
                                  {totalLabelPages > 1 && (
                                    <div className="flex justify-end items-center gap-1 px-5 py-2.5 border-t border-gray-200">
                                      {getLabelPageNumbers().map((p, idx) =>
                                        p === "..." ? (
                                          <span key={`dots-${idx}`} className="px-2 py-1 text-xs text-gray-400 select-none">...</span>
                                        ) : p === currentLabelPage ? (
                                          <span key={p} className="px-2.5 py-1 text-xs font-bold text-blue-600 border-b-2 border-blue-600 select-none">{p}</span>
                                        ) : (
                                          <button key={p} onClick={() => setLabelUserPage(p)} className="px-2.5 py-1 text-xs text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded transition">{p}</button>
                                        )
                                      )}
                                    </div>
                                  )}
                                </>
                              )}

                              {/* 未付与のフォロワーを追加するセクション */}
                              {followers.filter((f) => !label.assigned_users.includes(f.line_user_id)).length > 0 && (
                                <>
                                  <div className="px-5 py-2.5 bg-gray-50 border-t border-gray-200">
                                    <span className="text-xs font-medium text-gray-500">未付与のユーザー</span>
                                  </div>
                                  <div className="divide-y divide-gray-100 max-h-60 overflow-y-auto">
                                    {followers
                                      .filter((f) => !label.assigned_users.includes(f.line_user_id))
                                      .map((f) => (
                                        <div key={f.id} className="flex items-center justify-between px-5 py-2.5 hover:bg-gray-50">
                                          <div className="flex items-center gap-3">
                                            {f.picture_url ? (
                                              <img src={f.picture_url} alt="" className="w-8 h-8 rounded-full object-cover" />
                                            ) : (
                                              <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-gray-400">
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                                              </div>
                                            )}
                                            <span className="text-sm text-gray-600">{f.display_name ?? "名前なし"}</span>
                                          </div>
                                          <button
                                            onClick={() => toggleLabelUser(label.id, f.line_user_id)}
                                            className="text-xs text-blue-600 hover:text-blue-800 hover:bg-blue-50 px-2 py-1 rounded transition"
                                          >
                                            + 付与
                                          </button>
                                        </div>
                                      ))}
                                  </div>
                                </>
                              )}
                            </div>
                            );
                          })()}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </main>
          </>
        )}

        {/* ============================================================ */}
        {/* アカウント詳細: アクション管理 */}
        {/* ============================================================ */}
        {mainView === "account-detail" && accountSubView === "actions" && (
          <>
            <header className="bg-white border-b border-gray-200 px-4 md:px-6 py-3 flex-shrink-0">
              <h1 className="text-base font-bold text-gray-800">アクション管理</h1>
            </header>
            <main className="flex-1 overflow-y-auto p-4 md:p-6">
              <div className="mb-4">
                <button
                  onClick={openNewActionRule}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-md transition"
                >
                  {Icons.plus}
                  新規追加
                </button>
              </div>
              <div className="max-w-5xl space-y-3">
                {actionRules.length === 0 ? (
                  <div className="bg-white rounded-lg border border-gray-200 p-16 text-center text-gray-400">
                    <p className="text-lg mb-2">アクションルールがありません</p>
                    <p className="text-sm">「+ 新規ルール」からトリガー → アクションを設定してください</p>
                  </div>
                ) : (
                  actionRules.map((rule) => {
                    const triggerLabel: Record<ActionTriggerType, string> = {
                      follow: "友だち追加時",
                      label_added: "ラベル追加時",
                      message_received: "メッセージ受信時",
                      sequence_completed: "シナリオ完了時",
                    };
                    const actionLabel: Record<ActionActionType, string> = {
                      start_sequence: "シナリオ配信開始",
                      label_add: "ラベル追加",
                      label_remove: "ラベル削除",
                      move_sequence: "別シナリオへ移動",
                      webhook: "Webhook送信",
                      cross_account_label: "別アカウントにラベル付与",
                    };
                    return (
                      <div key={rule.id} className="bg-white rounded-lg border border-gray-200 p-4">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-2">
                              <span className="text-sm font-bold text-gray-800 truncate">{rule.name}</span>
                              <span
                                className={`text-[10px] px-2 py-0.5 rounded-full ${
                                  rule.status === "active"
                                    ? "bg-green-100 text-green-700"
                                    : "bg-gray-100 text-gray-500"
                                }`}
                              >
                                {rule.status === "active" ? "有効" : "停止"}
                              </span>
                            </div>
                            <div className="text-xs text-gray-600 flex flex-wrap gap-x-4 gap-y-1">
                              <span><span className="text-gray-400">トリガー: </span>{triggerLabel[rule.trigger_type]}</span>
                              <span><span className="text-gray-400">アクション: </span>{actionLabel[rule.action_type]}</span>
                              {rule.conditions.length > 0 && (
                                <span><span className="text-gray-400">条件: </span>{rule.conditions.length}件</span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <button
                              onClick={() => toggleActionRuleStatus(rule)}
                              className="px-2 py-1 text-xs text-gray-600 hover:bg-gray-100 rounded transition"
                            >
                              {rule.status === "active" ? "停止" : "有効化"}
                            </button>
                            <button
                              onClick={() => openEditActionRule(rule)}
                              className="px-2 py-1 text-xs text-blue-600 hover:bg-blue-50 rounded transition"
                            >
                              編集
                            </button>
                            <button
                              onClick={() => deleteActionRule(rule.id)}
                              className="px-2 py-1 text-xs text-red-400 hover:bg-red-50 rounded transition"
                            >
                              削除
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* アクションルール作成/編集モーダル */}
              {showActionModal && (
                <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
                  <div className="bg-white rounded-xl shadow-xl w-full max-w-xl max-h-[90vh] overflow-y-auto">
                    <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 sticky top-0 bg-white">
                      <h3 className="font-bold text-gray-800">
                        {editingActionRule ? "アクションルールを編集" : "アクションルールを作成"}
                      </h3>
                      <button onClick={() => setShowActionModal(false)} className="text-gray-400 hover:text-gray-600">{Icons.close}</button>
                    </div>
                    <div className="p-5 space-y-4">
                      {/* ルール名 */}
                      <div>
                        <label className="text-xs text-gray-500 block mb-1.5 font-medium">ルール名</label>
                        <input
                          type="text"
                          value={actionForm.name}
                          onChange={(e) => setActionForm({ ...actionForm, name: e.target.value })}
                          placeholder="例: 初回フォロワーにシナリオA配信"
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
                        />
                      </div>

                      {/* トリガー */}
                      <div>
                        <label className="text-xs text-gray-500 block mb-1.5 font-medium">トリガー</label>
                        <select
                          value={actionForm.trigger_type}
                          onChange={(e) => setActionForm({ ...actionForm, trigger_type: e.target.value as ActionTriggerType, trigger_config: {} })}
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
                        >
                          <option value="follow">友だち追加時</option>
                          <option value="label_added">ラベル追加時</option>
                          <option value="message_received">メッセージ受信時</option>
                          <option value="sequence_completed">シナリオ完了時</option>
                        </select>

                        {actionForm.trigger_type === "label_added" && (
                          <div className="mt-2">
                            <label className="text-[10px] text-gray-400 block mb-1">対象ラベル（空欄なら任意）</label>
                            <select
                              value={(actionForm.trigger_config.label_id as string) ?? ""}
                              onChange={(e) =>
                                setActionForm({
                                  ...actionForm,
                                  trigger_config: e.target.value ? { label_id: e.target.value } : {},
                                })
                              }
                              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                            >
                              <option value="">（任意ラベル）</option>
                              {labels.map((l) => (
                                <option key={l.id} value={l.id}>{l.name}</option>
                              ))}
                            </select>
                          </div>
                        )}

                        {actionForm.trigger_type === "message_received" && (
                          <div className="mt-2">
                            <label className="text-[10px] text-gray-400 block mb-1">キーワード（空欄なら全受信）</label>
                            <input
                              type="text"
                              value={(actionForm.trigger_config.keyword as string) ?? ""}
                              onChange={(e) =>
                                setActionForm({
                                  ...actionForm,
                                  trigger_config: e.target.value ? { keyword: e.target.value } : {},
                                })
                              }
                              placeholder="例: 予約"
                              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                            />
                          </div>
                        )}

                        {actionForm.trigger_type === "sequence_completed" && (
                          <div className="mt-2">
                            <label className="text-[10px] text-gray-400 block mb-1">対象シナリオ（空欄なら任意）</label>
                            <select
                              value={(actionForm.trigger_config.sequence_id as string) ?? ""}
                              onChange={(e) =>
                                setActionForm({
                                  ...actionForm,
                                  trigger_config: e.target.value ? { sequence_id: e.target.value } : {},
                                })
                              }
                              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                            >
                              <option value="">（任意シナリオ）</option>
                              {stepSequences.map((s) => (
                                <option key={s.id} value={s.id}>{s.name}</option>
                              ))}
                            </select>
                          </div>
                        )}
                      </div>

                      {/* 条件 */}
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <label className="text-xs text-gray-500 font-medium">条件（AND評価）</label>
                          <div className="flex gap-1">
                            <button
                              type="button"
                              onClick={() =>
                                setActionForm({
                                  ...actionForm,
                                  conditions: [...actionForm.conditions, { type: "label_in", label_ids: [] }],
                                })
                              }
                              className="text-[10px] px-2 py-0.5 bg-gray-100 hover:bg-gray-200 rounded"
                            >
                              + ラベル
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setActionForm({
                                  ...actionForm,
                                  conditions: [...actionForm.conditions, { type: "inflow_route_in", route_ids: [] }],
                                })
                              }
                              className="text-[10px] px-2 py-0.5 bg-gray-100 hover:bg-gray-200 rounded"
                            >
                              + 流入経路
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setActionForm({
                                  ...actionForm,
                                  conditions: [...actionForm.conditions, { type: "days_after_follow", days: 1 }],
                                })
                              }
                              className="text-[10px] px-2 py-0.5 bg-gray-100 hover:bg-gray-200 rounded"
                            >
                              + 登録後N日
                            </button>
                          </div>
                        </div>
                        <div className="space-y-2">
                          {actionForm.conditions.length === 0 && (
                            <div className="text-[11px] text-gray-400 px-2">条件なし（トリガー発火時に即実行）</div>
                          )}
                          {actionForm.conditions.map((c, idx) => (
                            <div key={idx} className="flex items-start gap-2 border border-gray-200 rounded-lg p-2">
                              <div className="flex-1">
                                {c.type === "label_in" && (
                                  <div>
                                    <div className="text-[10px] text-gray-400 mb-1">次のいずれかのラベルが付与されている</div>
                                    <select
                                      multiple
                                      value={c.label_ids ?? []}
                                      onChange={(e) => {
                                        const vals = Array.from(e.target.selectedOptions).map((o) => o.value);
                                        const nextConds = [...actionForm.conditions];
                                        nextConds[idx] = { ...c, label_ids: vals };
                                        setActionForm({ ...actionForm, conditions: nextConds });
                                      }}
                                      className="w-full border border-gray-200 rounded px-2 py-1 text-xs"
                                      size={Math.min(4, Math.max(2, labels.length))}
                                    >
                                      {labels.map((l) => (
                                        <option key={l.id} value={l.id}>{l.name}</option>
                                      ))}
                                    </select>
                                  </div>
                                )}
                                {c.type === "inflow_route_in" && (
                                  <div>
                                    <div className="text-[10px] text-gray-400 mb-1">次のいずれかの流入経路から登録</div>
                                    <select
                                      multiple
                                      value={c.route_ids ?? []}
                                      onChange={(e) => {
                                        const vals = Array.from(e.target.selectedOptions).map((o) => o.value);
                                        const nextConds = [...actionForm.conditions];
                                        nextConds[idx] = { ...c, route_ids: vals };
                                        setActionForm({ ...actionForm, conditions: nextConds });
                                      }}
                                      className="w-full border border-gray-200 rounded px-2 py-1 text-xs"
                                      size={Math.min(4, Math.max(2, inflowRoutes.length))}
                                    >
                                      {inflowRoutes.map((r) => (
                                        <option key={r.id} value={r.id}>{r.name}</option>
                                      ))}
                                    </select>
                                  </div>
                                )}
                                {c.type === "days_after_follow" && (
                                  <div>
                                    <div className="text-[10px] text-gray-400 mb-1">友だち追加から何日後に実行するか</div>
                                    <div className="flex items-center gap-2">
                                      <input
                                        type="number"
                                        min={0}
                                        value={c.days ?? 0}
                                        onChange={(e) => {
                                          const nextConds = [...actionForm.conditions];
                                          nextConds[idx] = { ...c, days: parseInt(e.target.value, 10) || 0 };
                                          setActionForm({ ...actionForm, conditions: nextConds });
                                        }}
                                        className="w-20 border border-gray-200 rounded px-2 py-1 text-xs"
                                      />
                                      <span className="text-xs text-gray-500">日後</span>
                                    </div>
                                  </div>
                                )}
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  const nextConds = actionForm.conditions.filter((_, i) => i !== idx);
                                  setActionForm({ ...actionForm, conditions: nextConds });
                                }}
                                className="text-xs text-red-400 hover:text-red-600 px-1"
                              >
                                ×
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* アクション */}
                      <div>
                        <label className="text-xs text-gray-500 block mb-1.5 font-medium">アクション</label>
                        <select
                          value={actionForm.action_type}
                          onChange={(e) => setActionForm({ ...actionForm, action_type: e.target.value as ActionActionType, action_config: {} })}
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                        >
                          <option value="start_sequence">シナリオ配信開始</option>
                          <option value="label_add">ラベル追加</option>
                          <option value="label_remove">ラベル削除</option>
                          <option value="move_sequence">別シナリオへ移動</option>
                          <option value="webhook">Webhook送信</option>
                          <option value="cross_account_label">別アカウントの同一UserIDにラベル付与</option>
                        </select>

                        {(actionForm.action_type === "start_sequence") && (
                          <div className="mt-2">
                            <label className="text-[10px] text-gray-400 block mb-1">配信するシナリオ</label>
                            <select
                              value={(actionForm.action_config.sequence_id as string) ?? ""}
                              onChange={(e) =>
                                setActionForm({ ...actionForm, action_config: { sequence_id: e.target.value } })
                              }
                              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                            >
                              <option value="">選択してください</option>
                              {stepSequences.map((s) => (
                                <option key={s.id} value={s.id}>{s.name}</option>
                              ))}
                            </select>
                          </div>
                        )}

                        {(actionForm.action_type === "label_add" || actionForm.action_type === "label_remove") && (
                          <div className="mt-2">
                            <label className="text-[10px] text-gray-400 block mb-1">対象ラベル</label>
                            <select
                              value={(actionForm.action_config.label_id as string) ?? ""}
                              onChange={(e) =>
                                setActionForm({ ...actionForm, action_config: { label_id: e.target.value } })
                              }
                              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                            >
                              <option value="">選択してください</option>
                              {labels.map((l) => (
                                <option key={l.id} value={l.id}>{l.name}</option>
                              ))}
                            </select>
                          </div>
                        )}

                        {actionForm.action_type === "move_sequence" && (
                          <div className="mt-2 space-y-2">
                            <div>
                              <label className="text-[10px] text-gray-400 block mb-1">移動元シナリオ（任意）</label>
                              <select
                                value={(actionForm.action_config.from_sequence_id as string) ?? ""}
                                onChange={(e) =>
                                  setActionForm({
                                    ...actionForm,
                                    action_config: { ...actionForm.action_config, from_sequence_id: e.target.value },
                                  })
                                }
                                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                              >
                                <option value="">（なし）</option>
                                {stepSequences.map((s) => (
                                  <option key={s.id} value={s.id}>{s.name}</option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className="text-[10px] text-gray-400 block mb-1">移動先シナリオ</label>
                              <select
                                value={(actionForm.action_config.to_sequence_id as string) ?? ""}
                                onChange={(e) =>
                                  setActionForm({
                                    ...actionForm,
                                    action_config: { ...actionForm.action_config, to_sequence_id: e.target.value },
                                  })
                                }
                                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                              >
                                <option value="">選択してください</option>
                                {stepSequences.map((s) => (
                                  <option key={s.id} value={s.id}>{s.name}</option>
                                ))}
                              </select>
                            </div>
                          </div>
                        )}

                        {actionForm.action_type === "cross_account_label" && (
                          <div className="mt-2 space-y-2">
                            <div>
                              <label className="text-[10px] text-gray-400 block mb-1">対象アカウント（ラベルを付与する先）</label>
                              <select
                                value={(actionForm.action_config.target_account_id as string) ?? ""}
                                onChange={(e) =>
                                  setActionForm({
                                    ...actionForm,
                                    action_config: { ...actionForm.action_config, target_account_id: e.target.value },
                                  })
                                }
                                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                              >
                                <option value="">選択してください</option>
                                {accounts.filter((a) => a.id !== selectedAccount?.id).map((a) => (
                                  <option key={a.id} value={a.id}>{a.account_name ?? a.channel_id}</option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className="text-[10px] text-gray-400 block mb-1">付与するラベル名</label>
                              <input
                                type="text"
                                value={(actionForm.action_config.label_name as string) ?? ""}
                                onChange={(e) =>
                                  setActionForm({
                                    ...actionForm,
                                    action_config: { ...actionForm.action_config, label_name: e.target.value },
                                  })
                                }
                                placeholder="例: 音声相談LINE登録者"
                                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                              />
                              <p className="text-[10px] text-gray-400 mt-1">対象アカウントにラベルがなければ自動作成されます</p>
                            </div>
                          </div>
                        )}

                        {actionForm.action_type === "webhook" && (
                          <div className="mt-2 space-y-2">
                            <div>
                              <label className="text-[10px] text-gray-400 block mb-1">送信先URL</label>
                              <input
                                type="url"
                                value={(actionForm.action_config.url as string) ?? ""}
                                onChange={(e) =>
                                  setActionForm({
                                    ...actionForm,
                                    action_config: { ...actionForm.action_config, url: e.target.value },
                                  })
                                }
                                placeholder="https://..."
                                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                              />
                            </div>
                            <div>
                              <label className="text-[10px] text-gray-400 block mb-1">メソッド</label>
                              <select
                                value={(actionForm.action_config.method as string) ?? "POST"}
                                onChange={(e) =>
                                  setActionForm({
                                    ...actionForm,
                                    action_config: { ...actionForm.action_config, method: e.target.value },
                                  })
                                }
                                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                              >
                                <option value="POST">POST</option>
                                <option value="GET">GET</option>
                              </select>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-200 sticky bottom-0 bg-white">
                      <button onClick={() => setShowActionModal(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition">キャンセル</button>
                      <button
                        onClick={saveActionRule}
                        className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition"
                      >
                        {editingActionRule ? "更新" : "作成"}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </main>
          </>
        )}

        {/* ============================================================ */}
        {/* アカウント詳細: 定型文管理 (Feature 5) */}
        {/* ============================================================ */}
        {mainView === "account-detail" && accountSubView === "templates" && (
          <>
            <header className="bg-white border-b border-gray-200 px-4 md:px-6 py-3 flex-shrink-0">
              <h1 className="text-base font-bold text-gray-800">テンプレート管理</h1>
            </header>
            <main className="flex-1 overflow-y-auto p-4 md:p-6">
              <div className="mb-4">
                <button
                  onClick={() => {
                    setEditingTemplate(null);
                    setTemplateForm({ name: "", messages: [emptyMessage()] as BroadcastMessage[] });
                    setShowTemplateModal(true);
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-md transition"
                >
                  {Icons.plus}
                  新規追加
                </button>
              </div>
              {/* テンプレート作成/編集モーダル */}
              {showTemplateModal && (
                <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 overflow-y-auto">
                  <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl mx-4 my-8">
                    <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
                      <h3 className="font-bold text-gray-800">{editingTemplate ? "テンプレートを編集" : "テンプレートを作成"}</h3>
                      <button onClick={() => setShowTemplateModal(false)} className="text-gray-400 hover:text-gray-600">{Icons.close}</button>
                    </div>
                    <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
                      <div>
                        <label className="text-xs text-gray-500 block mb-1.5 font-medium">テンプレート名</label>
                        <input
                          type="text"
                          value={templateForm.name}
                          onChange={(e) => setTemplateForm({ ...templateForm, name: e.target.value })}
                          placeholder="例: 挨拶メッセージ、予約確認"
                          autoFocus
                          className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
                        />
                      </div>
                      <div className="text-xs font-bold text-gray-700 mb-2">メッセージ（複数設定可）</div>
                      {templateForm.messages.map((msg, mi) => {
                        const msgTabs: { key: BroadcastMsgType; label: string }[] = [
                          { key: "text", label: "テキスト" }, { key: "image", label: "画像" }, { key: "button", label: "ボタン" },
                          { key: "carousel", label: "カルーセル" }, { key: "sticker", label: "スタンプ" },
                        ];
                        const updateTplMsg = (patch: Partial<BroadcastMessage>) => {
                          const next = [...templateForm.messages];
                          next[mi] = { ...next[mi], ...patch };
                          setTemplateForm({ ...templateForm, messages: next });
                        };
                        return (
                          <div key={mi} className="border border-gray-200 rounded-md p-3 space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-xs text-gray-500">メッセージ{mi + 1}</span>
                              {templateForm.messages.length > 1 && (
                                <button type="button" onClick={() => setTemplateForm({ ...templateForm, messages: templateForm.messages.filter((_, j) => j !== mi) })} className="text-[10px] text-red-500">削除</button>
                              )}
                            </div>
                            <div className="flex gap-1 border-b border-gray-100 pb-1">
                              {msgTabs.map((t) => (
                                <button key={t.key} type="button" onClick={() => updateTplMsg({ msgType: t.key })} className={`px-2 py-1 text-xs rounded ${msg.msgType === t.key ? "bg-blue-100 text-blue-700 font-medium" : "text-gray-500 hover:bg-gray-100"}`}>{t.label}</button>
                              ))}
                            </div>
                            {msg.msgType === "text" && (
                              <textarea value={msg.body} onChange={(e) => updateTplMsg({ body: e.target.value })} rows={4} placeholder="テキストを入力..." className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm resize-none" />
                            )}
                            {msg.msgType === "image" && (
                              <input type="url" value={msg.imageUrl} onChange={(e) => updateTplMsg({ imageUrl: e.target.value })} placeholder="画像URL (HTTPS)" className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm" />
                            )}
                            {msg.msgType === "button" && (
                              <div className="space-y-2">
                                <input type="text" value={msg.buttonTitle} onChange={(e) => updateTplMsg({ buttonTitle: e.target.value })} placeholder="タイトル（任意）" maxLength={40} className="w-full border border-gray-200 rounded-md px-2 py-1.5 text-xs" />
                                <textarea value={msg.buttonText} onChange={(e) => updateTplMsg({ buttonText: e.target.value })} rows={2} placeholder="本文" className="w-full border border-gray-200 rounded-md px-2 py-1.5 text-xs resize-none" />
                                {msg.buttonActions.map((act, ai) => (
                                  <div key={ai} className="flex gap-1.5 items-center">
                                    <select value={act.actionType || "uri"} onChange={(e) => { const next = [...msg.buttonActions]; next[ai] = { ...next[ai], actionType: e.target.value as "uri" | "postback" | "message" }; updateTplMsg({ buttonActions: next }); }} className="border border-gray-200 rounded px-1.5 py-1 text-xs bg-white">
                                      <option value="uri">URL</option><option value="postback">PB</option><option value="message">MSG</option>
                                    </select>
                                    <input type="text" value={act.label} onChange={(e) => { const next = [...msg.buttonActions]; next[ai] = { ...next[ai], label: e.target.value }; updateTplMsg({ buttonActions: next }); }} placeholder="ラベル" className="flex-1 border border-gray-200 rounded px-2 py-1 text-xs" />
                                    <input type="text" value={(act.actionType || "uri") === "uri" ? act.uri : (act.data || act.text)} onChange={(e) => { const next = [...msg.buttonActions]; if ((act.actionType || "uri") === "uri") next[ai] = { ...next[ai], uri: e.target.value }; else if (act.actionType === "postback") next[ai] = { ...next[ai], data: e.target.value }; else next[ai] = { ...next[ai], text: e.target.value }; updateTplMsg({ buttonActions: next }); }} placeholder={(act.actionType || "uri") === "uri" ? "URL" : "データ/テキスト"} className="flex-[2] border border-gray-200 rounded px-2 py-1 text-xs" />
                                    <button type="button" onClick={() => updateTplMsg({ buttonActions: msg.buttonActions.filter((_, j) => j !== ai) })} className="text-xs text-red-400">x</button>
                                  </div>
                                ))}
                                {msg.buttonActions.length < 4 && (
                                  <button type="button" onClick={() => updateTplMsg({ buttonActions: [...msg.buttonActions, { label: "", uri: "", actionType: "uri" as const, data: "", text: "" }] })} className="text-xs text-blue-600">+ ボタン追加</button>
                                )}
                              </div>
                            )}
                            {msg.msgType === "carousel" && (
                              <div className="space-y-2">
                                {msg.carouselColumns.map((col, ci) => (
                                  <div key={ci} className="border border-gray-100 rounded p-2 space-y-1">
                                    <div className="flex justify-between items-center">
                                      <span className="text-[10px] text-gray-500">カラム{ci + 1}</span>
                                      {msg.carouselColumns.length > 1 && <button type="button" onClick={() => updateTplMsg({ carouselColumns: msg.carouselColumns.filter((_, j) => j !== ci) })} className="text-[10px] text-red-400">削除</button>}
                                    </div>
                                    <input type="text" value={col.title} onChange={(e) => { const next = [...msg.carouselColumns]; next[ci] = { ...next[ci], title: e.target.value }; updateTplMsg({ carouselColumns: next }); }} placeholder="タイトル" className="w-full border border-gray-200 rounded px-2 py-1 text-xs" />
                                    <input type="text" value={col.text} onChange={(e) => { const next = [...msg.carouselColumns]; next[ci] = { ...next[ci], text: e.target.value }; updateTplMsg({ carouselColumns: next }); }} placeholder="説明文" className="w-full border border-gray-200 rounded px-2 py-1 text-xs" />
                                    <input type="text" value={col.label} onChange={(e) => { const next = [...msg.carouselColumns]; next[ci] = { ...next[ci], label: e.target.value }; updateTplMsg({ carouselColumns: next }); }} placeholder="ボタン名" className="w-full border border-gray-200 rounded px-2 py-1 text-xs" />
                                    <input type="url" value={col.uri} onChange={(e) => { const next = [...msg.carouselColumns]; next[ci] = { ...next[ci], uri: e.target.value }; updateTplMsg({ carouselColumns: next }); }} placeholder="URL" className="w-full border border-gray-200 rounded px-2 py-1 text-xs" />
                                  </div>
                                ))}
                                {msg.carouselColumns.length < 10 && (
                                  <button type="button" onClick={() => updateTplMsg({ carouselColumns: [...msg.carouselColumns, { title: "", text: "", imageUrl: "", uri: "", label: "詳細", actionType: "uri" as const, data: "", actionText: "" }] })} className="text-xs text-blue-600">+ カラム追加</button>
                                )}
                              </div>
                            )}
                            {msg.msgType === "sticker" && (
                              <div className="flex gap-2">
                                <input type="text" value={msg.stickerPackageId} onChange={(e) => updateTplMsg({ stickerPackageId: e.target.value })} placeholder="PackageID" className="flex-1 border border-gray-200 rounded px-2 py-1 text-xs" />
                                <input type="text" value={msg.stickerId} onChange={(e) => updateTplMsg({ stickerId: e.target.value })} placeholder="StickerID" className="flex-1 border border-gray-200 rounded px-2 py-1 text-xs" />
                              </div>
                            )}
                          </div>
                        );
                      })}
                      <button type="button" onClick={() => setTemplateForm({ ...templateForm, messages: [...templateForm.messages, emptyMessage()] })} className="text-xs text-green-600 border border-green-300 rounded px-3 py-1.5 hover:bg-green-50">+ メッセージ追加</button>
                    </div>
                    <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-200">
                      <button onClick={() => setShowTemplateModal(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition">キャンセル</button>
                      <button
                        onClick={saveTemplate}
                        disabled={!templateForm.name.trim()}
                        className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition"
                      >
                        {editingTemplate ? "更新" : "作成"}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              <div className="max-w-5xl">
                {templates.length === 0 ? (
                  <div className="bg-white rounded-lg border border-gray-200 p-16 text-center text-gray-400">
                    <p className="text-lg mb-2">テンプレートがありません</p>
                    <p className="text-sm">「新規作成」ボタンからテンプレートを作成してください</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {templates.map((tpl) => {
                      const firstMsg = tpl.messages?.[0];
                      const msgCount = tpl.messages?.length ?? 0;
                      const preview = firstMsg?.payload?.body || firstMsg?.body || "";
                      return (
                        <div key={tpl.id} className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                          <div className="flex items-center justify-between px-5 py-3.5">
                            <div className="min-w-0 flex-1 mr-4">
                              <div className="text-sm font-medium text-gray-800">{tpl.name || tpl.title}</div>
                              <div className="flex items-center gap-2 mt-1">
                                <span className="text-[10px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded">{msgCount}通</span>
                                {firstMsg && <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">{(firstMsg.payload as Record<string, unknown>)?.msgType as string || firstMsg.msg_type}</span>}
                              </div>
                              {preview && <div className="text-xs text-gray-400 mt-1 line-clamp-2 whitespace-pre-wrap">{String(preview)}</div>}
                              <div className="text-[10px] text-gray-300 mt-1">{fmtShort(tpl.created_at)}</div>
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <button
                                onClick={() => startEditTemplate(tpl)}
                                className="px-3 py-1.5 text-xs text-blue-600 hover:bg-blue-50 rounded-md transition font-medium"
                              >
                                編集
                              </button>
                              <button
                                onClick={() => deleteTemplate(tpl.id)}
                                className="px-3 py-1.5 text-xs text-red-400 hover:text-red-600 hover:bg-red-50 rounded-md transition"
                              >
                                削除
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </main>
          </>
        )}

        {/* ============================================================ */}
        {/* アカウント詳細: 独自置き換え文字 */}
        {/* ============================================================ */}
        {mainView === "account-detail" && accountSubView === "custom-fields" && (
          <>
            <header className="bg-white border-b border-gray-200 px-4 md:px-6 py-3 flex items-center justify-between flex-shrink-0">
              <h1 className="text-base font-bold text-gray-800">独自置き換え文字管理</h1>
              <button
                onClick={() => { setCustomFieldForm({ field_key: "", field_label: "", field_type: "text" }); setShowCustomFieldModal(true); }}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-md transition"
              >
                {Icons.plus} 新規フィールド
              </button>
            </header>
            <main className="flex-1 overflow-y-auto p-4 md:p-6">
              {showCustomFieldModal && (
                <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
                  <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4">
                    <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
                      <h3 className="font-bold text-gray-800">独自置き換え文字追加</h3>
                      <button onClick={() => setShowCustomFieldModal(false)} className="text-gray-400 hover:text-gray-600">{Icons.close}</button>
                    </div>
                    <div className="p-5 space-y-3">
                      <div>
                        <label className="text-xs text-gray-500 block mb-1">フィールドキー</label>
                        <input type="text" value={customFieldForm.field_key} onChange={(e) => setCustomFieldForm({ ...customFieldForm, field_key: e.target.value })} placeholder="email, phone, gender..." className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 block mb-1">表示名</label>
                        <input type="text" value={customFieldForm.field_label} onChange={(e) => setCustomFieldForm({ ...customFieldForm, field_label: e.target.value })} placeholder="メールアドレス、電話番号..." className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 block mb-1">タイプ</label>
                        <select value={customFieldForm.field_type} onChange={(e) => setCustomFieldForm({ ...customFieldForm, field_type: e.target.value })} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white">
                          <option value="text">テキスト</option>
                          <option value="email">メールアドレス</option>
                          <option value="phone">電話番号</option>
                          <option value="number">数値</option>
                          <option value="date">日付</option>
                          <option value="select">選択肢</option>
                        </select>
                      </div>
                    </div>
                    <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-200">
                      <button onClick={() => setShowCustomFieldModal(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">キャンセル</button>
                      <button
                        onClick={async () => {
                          if (!customFieldForm.field_key || !customFieldForm.field_label || !selectedAccount) return;
                          await fetch("/api/line/custom-fields", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ account_id: selectedAccount.id, ...customFieldForm }),
                          });
                          setShowCustomFieldModal(false);
                          fetchCustomFields();
                        }}
                        disabled={!customFieldForm.field_key || !customFieldForm.field_label}
                        className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg"
                      >
                        作成
                      </button>
                    </div>
                  </div>
                </div>
              )}
              <div className="max-w-3xl">
                <div className="bg-white rounded-lg border border-gray-200 mb-4 p-4">
                  <p className="text-xs text-gray-500 mb-2">デフォルトフィールド（自動作成済み）</p>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { key: "email", label: "メールアドレス", type: "email" },
                      { key: "phone", label: "電話番号", type: "phone" },
                      { key: "gender", label: "性別", type: "select" },
                      { key: "birthday", label: "生年月日", type: "date" },
                      { key: "address", label: "住所", type: "text" },
                    ].map((df) => (
                      <button
                        key={df.key}
                        onClick={async () => {
                          if (!selectedAccount) return;
                          await fetch("/api/line/custom-fields", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ account_id: selectedAccount.id, field_key: df.key, field_label: df.label, field_type: df.type }),
                          });
                          fetchCustomFields();
                        }}
                        disabled={customFields.some((f) => f.field_key === df.key)}
                        className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg hover:bg-blue-50 disabled:opacity-30 disabled:cursor-not-allowed"
                      >
                        + {df.label}
                      </button>
                    ))}
                  </div>
                </div>
                {customFields.length === 0 ? (
                  <div className="bg-white rounded-lg border border-gray-200 p-16 text-center text-gray-400">
                    <p className="text-lg mb-2">独自置き換え文字がありません</p>
                    <p className="text-sm">上のボタンから追加してください</p>
                  </div>
                ) : (
                  <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-200 bg-gray-50 text-gray-500 text-left">
                          <th className="px-4 py-2.5 font-medium">キー</th>
                          <th className="px-4 py-2.5 font-medium">表示名</th>
                          <th className="px-4 py-2.5 font-medium">タイプ</th>
                          <th className="px-4 py-2.5 font-medium w-20"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {customFields.map((f) => (
                          <tr key={f.id} className="border-b border-gray-100">
                            <td className="px-4 py-2.5 font-mono text-xs text-gray-600">{f.field_key}</td>
                            <td className="px-4 py-2.5 text-gray-800">{f.field_label}</td>
                            <td className="px-4 py-2.5">
                              <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs">{f.field_type}</span>
                            </td>
                            <td className="px-4 py-2.5">
                              <button
                                onClick={async () => {
                                  if (!confirm(`「${f.field_label}」を削除しますか？`)) return;
                                  await fetch("/api/line/custom-fields", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: f.id }) });
                                  fetchCustomFields();
                                }}
                                className="text-xs text-red-400 hover:text-red-600"
                              >
                                削除
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </main>
          </>
        )}

        {/* ============================================================ */}
        {/* アカウント詳細: リマインダ配信 */}
        {/* ============================================================ */}
        {mainView === "account-detail" && accountSubView === "reminders" && (
          <>
            <header className="bg-white border-b border-gray-200 px-4 md:px-6 py-3 flex-shrink-0">
              <h1 className="text-base font-bold text-gray-800">リマインダ配信</h1>
            </header>
            <main className="flex-1 overflow-y-auto p-4 md:p-6">
              <div className="mb-4">
                <button
                  onClick={() => {
                    setReminderForm({ name: "", base_date_field: "custom", messages: [{ offset_days: -1, offset_time: "09:00", body: "" }] });
                    setShowReminderModal(true);
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-md transition"
                >
                  {Icons.plus} 新規追加
                </button>
              </div>
              {showReminderModal && (
                <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
                  <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4">
                    <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
                      <h3 className="font-bold text-gray-800">リマインダ作成</h3>
                      <button onClick={() => setShowReminderModal(false)} className="text-gray-400 hover:text-gray-600">{Icons.close}</button>
                    </div>
                    <div className="p-5 space-y-3">
                      <div>
                        <label className="text-xs text-gray-500 block mb-1">リマインダ名</label>
                        <input type="text" value={reminderForm.name} onChange={(e) => setReminderForm({ ...reminderForm, name: e.target.value })} placeholder="例: セミナー前日リマインド" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 block mb-1">基準日フィールド</label>
                        <select value={reminderForm.base_date_field} onChange={(e) => setReminderForm({ ...reminderForm, base_date_field: e.target.value })} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white">
                          <option value="custom">手動指定</option>
                          {customFields.filter((f) => f.field_type === "date").map((f) => (
                            <option key={f.id} value={f.field_key}>{f.field_label}</option>
                          ))}
                        </select>
                      </div>
                      <div className="text-xs font-bold text-gray-700 mt-2">リマインダメッセージ</div>
                      {reminderForm.messages.map((msg, mi) => (
                        <div key={mi} className="border border-gray-200 rounded-md p-3 space-y-2">
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-500">基準日の</span>
                            <input type="number" value={msg.offset_days} onChange={(e) => { const next = [...reminderForm.messages]; next[mi] = { ...next[mi], offset_days: Number(e.target.value) }; setReminderForm({ ...reminderForm, messages: next }); }} className="w-16 border border-gray-200 rounded px-2 py-1 text-xs" />
                            <span className="text-xs text-gray-500">日{msg.offset_days < 0 ? "前" : msg.offset_days > 0 ? "後" : "当日"}</span>
                            <input type="time" value={msg.offset_time} onChange={(e) => { const next = [...reminderForm.messages]; next[mi] = { ...next[mi], offset_time: e.target.value }; setReminderForm({ ...reminderForm, messages: next }); }} className="border border-gray-200 rounded px-2 py-1 text-xs" />
                            {reminderForm.messages.length > 1 && (
                              <button type="button" onClick={() => setReminderForm({ ...reminderForm, messages: reminderForm.messages.filter((_, j) => j !== mi) })} className="text-xs text-red-400">削除</button>
                            )}
                          </div>
                          <textarea value={msg.body} onChange={(e) => { const next = [...reminderForm.messages]; next[mi] = { ...next[mi], body: e.target.value }; setReminderForm({ ...reminderForm, messages: next }); }} rows={3} placeholder="メッセージ本文" className="w-full border border-gray-200 rounded px-3 py-2 text-sm resize-none" />
                        </div>
                      ))}
                      <button type="button" onClick={() => setReminderForm({ ...reminderForm, messages: [...reminderForm.messages, { offset_days: 0, offset_time: "09:00", body: "" }] })} className="text-xs text-blue-600">+ メッセージ追加</button>
                    </div>
                    <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-200">
                      <button onClick={() => setShowReminderModal(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">キャンセル</button>
                      <button
                        onClick={async () => {
                          if (!reminderForm.name.trim() || !selectedAccount) return;
                          await fetch("/api/line/reminders", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              account_id: selectedAccount.id,
                              name: reminderForm.name.trim(),
                              base_date_field: reminderForm.base_date_field,
                              messages: reminderForm.messages.map((m, i) => ({
                                msg_order: i + 1,
                                offset_days: m.offset_days,
                                offset_time: m.offset_time,
                                msg_type: "text",
                                body: m.body,
                              })),
                            }),
                          });
                          setShowReminderModal(false);
                          fetchReminders();
                        }}
                        disabled={!reminderForm.name.trim()}
                        className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg"
                      >
                        作成
                      </button>
                    </div>
                  </div>
                </div>
              )}
              <div className="max-w-5xl">
                {reminders.length === 0 ? (
                  <div className="bg-white rounded-lg border border-gray-200 p-16 text-center text-gray-400">
                    <p className="text-lg mb-2">リマインダがありません</p>
                    <p className="text-sm">「新規リマインダ」から作成してください</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {reminders.map((r) => (
                      <div key={r.id} className="bg-white rounded-lg border border-gray-200 overflow-hidden px-5 py-3.5">
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="text-sm font-medium text-gray-800">{r.name}</div>
                            <div className="flex items-center gap-2 mt-1">
                              <span className={`px-2 py-0.5 text-[10px] rounded font-medium ${r.status === "active" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>{r.status}</span>
                              <span className="text-[10px] text-gray-400">{r.messages?.length ?? 0}通</span>
                            </div>
                          </div>
                          <button
                            onClick={async () => {
                              if (!confirm(`「${r.name}」を削除しますか？`)) return;
                              await fetch("/api/line/reminders", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: r.id }) });
                              fetchReminders();
                            }}
                            className="text-xs text-red-400 hover:text-red-600"
                          >
                            削除
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </main>
          </>
        )}

        {/* ============================================================ */}
        {/* アカウント詳細: アンケート */}
        {/* ============================================================ */}
        {mainView === "account-detail" && accountSubView === "surveys" && (
          <>
            <header className="bg-white border-b border-gray-200 px-4 md:px-6 py-3 flex-shrink-0">
              <h1 className="text-base font-bold text-gray-800">アンケート</h1>
            </header>
            <main className="flex-1 overflow-y-auto p-4 md:p-6">
              <div className="mb-4">
                <button
                  onClick={() => {
                    setSurveyForm({ name: "", description: "", questions: [{ question_text: "", question_type: "text", options: [], is_required: true, save_to_field_id: "" }] });
                    setShowSurveyModal(true);
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-md transition"
                >
                  {Icons.plus}
                  新規作成
                </button>
              </div>

              {surveys.length === 0 ? (
                <div className="bg-white rounded-lg border border-gray-200 p-16 text-center text-gray-400">
                  <p className="text-lg mb-2">アンケートがありません</p>
                  <p className="text-sm">「新規作成」からアンケートを作成してください</p>
                </div>
              ) : (
                <div className="space-y-3 max-w-4xl">
                  {surveys.map((s) => (
                    <div key={s.id} className="bg-white rounded-lg border border-gray-200 p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="text-sm font-bold text-gray-800">{s.name}</h3>
                            <span className={`px-2 py-0.5 text-[10px] rounded-full ${s.status === "active" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                              {s.status === "active" ? "公開中" : "非公開"}
                            </span>
                            <span className="text-xs text-gray-400">{s.response_count}件回答</span>
                          </div>
                          {s.description && <p className="text-xs text-gray-500 mt-1">{s.description}</p>}
                          <div className="text-xs text-gray-400 mt-1">質問数: {s.questions.length}</div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => {
                              const url = `${window.location.origin}/line/survey/${s.id}?uid={line_user_id}`;
                              navigator.clipboard.writeText(url);
                              alert(`アンケートURLをコピーしました\n\n${url}\n\nステップ配信のメッセージに貼り付けてください。\n{line_user_id}は自動で置換されます。`);
                            }}
                            className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-medium rounded-md transition"
                          >
                            URL取得
                          </button>
                          <button
                            onClick={async () => {
                              if (!confirm("削除しますか？")) return;
                              await fetch("/api/line/surveys", {
                                method: "DELETE",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ id: s.id }),
                              });
                              fetchSurveys();
                            }}
                            className="px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white text-xs font-medium rounded-md transition"
                          >
                            削除
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* アンケート作成モーダル */}
              {showSurveyModal && (
                <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
                  <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                    <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
                      <h3 className="font-bold text-gray-800">アンケート新規作成</h3>
                      <button onClick={() => setShowSurveyModal(false)} className="text-gray-400 hover:text-gray-600">{Icons.close}</button>
                    </div>
                    <div className="p-5 space-y-4">
                      <div>
                        <label className="text-xs text-gray-500 block mb-1 font-medium">アンケート名 <span className="text-red-500">*</span></label>
                        <input type="text" value={surveyForm.name} onChange={(e) => setSurveyForm({ ...surveyForm, name: e.target.value })} placeholder="例: 初回ヒアリング" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400" />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 block mb-1 font-medium">説明（任意）</label>
                        <input type="text" value={surveyForm.description} onChange={(e) => setSurveyForm({ ...surveyForm, description: e.target.value })} placeholder="例: お客様の状況を確認するアンケートです" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400" />
                      </div>

                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <label className="text-xs text-gray-500 font-medium">質問項目</label>
                          <button
                            onClick={() => setSurveyForm({ ...surveyForm, questions: [...surveyForm.questions, { question_text: "", question_type: "text", options: [], is_required: true, save_to_field_id: "" }] })}
                            className="text-xs text-blue-600 hover:text-blue-800"
                          >
                            + 質問を追加
                          </button>
                        </div>
                        <div className="space-y-3">
                          {surveyForm.questions.map((q, idx) => (
                            <div key={idx} className="border border-gray-200 rounded-lg p-3 space-y-2">
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-bold text-gray-600">質問 {idx + 1}</span>
                                {surveyForm.questions.length > 1 && (
                                  <button onClick={() => setSurveyForm({ ...surveyForm, questions: surveyForm.questions.filter((_, i) => i !== idx) })} className="text-xs text-red-400 hover:text-red-600">削除</button>
                                )}
                              </div>
                              <input type="text" value={q.question_text} onChange={(e) => { const qs = [...surveyForm.questions]; qs[idx] = { ...qs[idx], question_text: e.target.value }; setSurveyForm({ ...surveyForm, questions: qs }); }} placeholder="質問内容" className="w-full border border-gray-200 rounded-md px-3 py-1.5 text-sm focus:border-blue-400 focus:outline-none" />
                              <div className="flex items-center gap-2">
                                <select value={q.question_type} onChange={(e) => { const qs = [...surveyForm.questions]; qs[idx] = { ...qs[idx], question_type: e.target.value }; setSurveyForm({ ...surveyForm, questions: qs }); }} className="border border-gray-200 rounded-md px-2 py-1 text-xs">
                                  <option value="text">テキスト入力</option>
                                  <option value="email">メールアドレス</option>
                                  <option value="phone">電話番号</option>
                                  <option value="number">数値</option>
                                  <option value="select">単一選択</option>
                                  <option value="multi_select">複数選択</option>
                                </select>
                                <label className="flex items-center gap-1 text-xs text-gray-500 cursor-pointer">
                                  <input type="checkbox" checked={q.is_required} onChange={(e) => { const qs = [...surveyForm.questions]; qs[idx] = { ...qs[idx], is_required: e.target.checked }; setSurveyForm({ ...surveyForm, questions: qs }); }} className="accent-blue-600" />
                                  必須
                                </label>
                                <select value={q.save_to_field_id} onChange={(e) => { const qs = [...surveyForm.questions]; qs[idx] = { ...qs[idx], save_to_field_id: e.target.value }; setSurveyForm({ ...surveyForm, questions: qs }); }} className="border border-gray-200 rounded-md px-2 py-1 text-xs flex-1">
                                  <option value="">保存先なし</option>
                                  {customFields.map((cf) => (
                                    <option key={cf.id} value={cf.id}>{cf.field_label}</option>
                                  ))}
                                </select>
                              </div>
                              {(q.question_type === "select" || q.question_type === "multi_select") && (
                                <div className="space-y-1">
                                  <span className="text-[10px] text-gray-400">選択肢</span>
                                  {q.options.map((opt, oi) => (
                                    <div key={oi} className="flex items-center gap-1">
                                      <input type="text" value={opt.label} onChange={(e) => { const qs = [...surveyForm.questions]; const opts = [...qs[idx].options]; opts[oi] = { label: e.target.value, value: e.target.value }; qs[idx] = { ...qs[idx], options: opts }; setSurveyForm({ ...surveyForm, questions: qs }); }} placeholder={`選択肢${oi + 1}`} className="flex-1 border border-gray-200 rounded px-2 py-1 text-xs" />
                                      <button onClick={() => { const qs = [...surveyForm.questions]; qs[idx] = { ...qs[idx], options: qs[idx].options.filter((_, i) => i !== oi) }; setSurveyForm({ ...surveyForm, questions: qs }); }} className="text-red-400 text-xs">x</button>
                                    </div>
                                  ))}
                                  <button onClick={() => { const qs = [...surveyForm.questions]; qs[idx] = { ...qs[idx], options: [...qs[idx].options, { label: "", value: "" }] }; setSurveyForm({ ...surveyForm, questions: qs }); }} className="text-xs text-blue-600 hover:text-blue-800">+ 選択肢追加</button>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-200">
                      <button onClick={() => setShowSurveyModal(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition">キャンセル</button>
                      <button
                        onClick={async () => {
                          if (!surveyForm.name.trim()) { alert("アンケート名を入力してください"); return; }
                          if (!selectedAccount) return;
                          const res = await fetch("/api/line/surveys", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              account_id: selectedAccount.id,
                              name: surveyForm.name.trim(),
                              description: surveyForm.description.trim() || null,
                              questions: surveyForm.questions.filter((q) => q.question_text.trim()).map((q) => ({
                                ...q,
                                save_to_field_id: q.save_to_field_id || null,
                              })),
                            }),
                          });
                          if (res.ok) { setShowSurveyModal(false); fetchSurveys(); }
                          else { const d = await res.json().catch(() => ({})); alert(d.error ?? "作成失敗"); }
                        }}
                        className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition"
                      >
                        作成
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </main>
          </>
        )}

        {/* ============================================================ */}
        {/* アカウント詳細: 登録フォーム */}
        {/* ============================================================ */}
        {mainView === "account-detail" && accountSubView === "reg-forms" && (
          <>
            <header className="bg-white border-b border-gray-200 px-4 md:px-6 py-3 flex-shrink-0">
              <h1 className="text-base font-bold text-gray-800">登録フォーム</h1>
            </header>
            <main className="flex-1 overflow-y-auto p-4 md:p-6">
              <div className="mb-4">
                <button
                  onClick={() => {
                    setRegFormForm({ name: "", description: "", fields: [{ field_label: "メールアドレス", field_type: "email", options: [], is_required: true, placeholder: "example@email.com", save_to_field_id: "" }] });
                    setShowRegFormModal(true);
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-md transition"
                >
                  {Icons.plus} 新規作成
                </button>
              </div>
              {regForms.length === 0 ? (
                <div className="bg-white rounded-lg border border-gray-200 p-16 text-center text-gray-400">
                  <p className="text-lg mb-2">登録フォームがありません</p>
                  <p className="text-sm">「新規作成」からフォームを作成してください</p>
                </div>
              ) : (
                <div className="space-y-3 max-w-4xl">
                  {regForms.map((f) => (
                    <div key={f.id} className="bg-white rounded-lg border border-gray-200 p-4 flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-bold text-gray-800">{f.name}</h3>
                          <span className={`px-2 py-0.5 text-[10px] rounded-full ${f.status === "active" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                            {f.status === "active" ? "公開中" : "非公開"}
                          </span>
                          <span className="text-xs text-gray-400">{f.submission_count}件送信</span>
                        </div>
                        <div className="text-xs text-gray-400 mt-1">項目数: {f.fields.length}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            const url = `${window.location.origin}/line/form/${f.id}?uid={line_user_id}`;
                            navigator.clipboard.writeText(url);
                            alert(`フォームURLをコピーしました\n\n${url}`);
                          }}
                          className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-medium rounded-md transition"
                        >URL取得</button>
                        <button
                          onClick={async () => { if (!confirm("削除しますか？")) return; await fetch("/api/line/registration-forms", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: f.id }) }); fetchRegForms(); }}
                          className="px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white text-xs font-medium rounded-md transition"
                        >削除</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {showRegFormModal && (
                <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
                  <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                    <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
                      <h3 className="font-bold text-gray-800">登録フォーム新規作成</h3>
                      <button onClick={() => setShowRegFormModal(false)} className="text-gray-400 hover:text-gray-600">{Icons.close}</button>
                    </div>
                    <div className="p-5 space-y-4">
                      <div>
                        <label className="text-xs text-gray-500 block mb-1 font-medium">フォーム名 <span className="text-red-500">*</span></label>
                        <input type="text" value={regFormForm.name} onChange={(e) => setRegFormForm({ ...regFormForm, name: e.target.value })} placeholder="例: メールアドレス登録" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400" />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 block mb-1 font-medium">説明（任意）</label>
                        <input type="text" value={regFormForm.description} onChange={(e) => setRegFormForm({ ...regFormForm, description: e.target.value })} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400" />
                      </div>
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <label className="text-xs text-gray-500 font-medium">フォーム項目</label>
                          <button onClick={() => setRegFormForm({ ...regFormForm, fields: [...regFormForm.fields, { field_label: "", field_type: "text", options: [], is_required: true, placeholder: "", save_to_field_id: "" }] })} className="text-xs text-blue-600 hover:text-blue-800">+ 項目追加</button>
                        </div>
                        <div className="space-y-3">
                          {regFormForm.fields.map((f, idx) => (
                            <div key={idx} className="border border-gray-200 rounded-lg p-3 space-y-2">
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-bold text-gray-600">項目 {idx + 1}</span>
                                {regFormForm.fields.length > 1 && <button onClick={() => setRegFormForm({ ...regFormForm, fields: regFormForm.fields.filter((_, i) => i !== idx) })} className="text-xs text-red-400">削除</button>}
                              </div>
                              <input type="text" value={f.field_label} onChange={(e) => { const fs = [...regFormForm.fields]; fs[idx] = { ...fs[idx], field_label: e.target.value }; setRegFormForm({ ...regFormForm, fields: fs }); }} placeholder="項目名" className="w-full border border-gray-200 rounded-md px-3 py-1.5 text-sm focus:border-blue-400 focus:outline-none" />
                              <div className="flex items-center gap-2">
                                <select value={f.field_type} onChange={(e) => { const fs = [...regFormForm.fields]; fs[idx] = { ...fs[idx], field_type: e.target.value }; setRegFormForm({ ...regFormForm, fields: fs }); }} className="border border-gray-200 rounded-md px-2 py-1 text-xs">
                                  <option value="text">テキスト</option>
                                  <option value="email">メールアドレス</option>
                                  <option value="phone">電話番号</option>
                                  <option value="number">数値</option>
                                  <option value="textarea">複数行テキスト</option>
                                  <option value="select">プルダウン</option>
                                  <option value="radio">ラジオボタン</option>
                                  <option value="checkbox">チェックボックス</option>
                                  <option value="date">日付</option>
                                </select>
                                <label className="flex items-center gap-1 text-xs text-gray-500 cursor-pointer">
                                  <input type="checkbox" checked={f.is_required} onChange={(e) => { const fs = [...regFormForm.fields]; fs[idx] = { ...fs[idx], is_required: e.target.checked }; setRegFormForm({ ...regFormForm, fields: fs }); }} className="accent-blue-600" />
                                  必須
                                </label>
                                <select value={f.save_to_field_id} onChange={(e) => { const fs = [...regFormForm.fields]; fs[idx] = { ...fs[idx], save_to_field_id: e.target.value }; setRegFormForm({ ...regFormForm, fields: fs }); }} className="border border-gray-200 rounded-md px-2 py-1 text-xs flex-1">
                                  <option value="">保存先なし</option>
                                  {customFields.map((cf) => <option key={cf.id} value={cf.id}>{cf.field_label}</option>)}
                                </select>
                              </div>
                              {(f.field_type === "select" || f.field_type === "radio" || f.field_type === "checkbox") && (
                                <div className="space-y-1">
                                  <span className="text-[10px] text-gray-400">選択肢</span>
                                  {f.options.map((o, oi) => (
                                    <div key={oi} className="flex items-center gap-1">
                                      <input type="text" value={o.label} onChange={(e) => { const fs = [...regFormForm.fields]; const opts = [...fs[idx].options]; opts[oi] = { label: e.target.value, value: e.target.value }; fs[idx] = { ...fs[idx], options: opts }; setRegFormForm({ ...regFormForm, fields: fs }); }} placeholder={`選択肢${oi+1}`} className="flex-1 border border-gray-200 rounded px-2 py-1 text-xs" />
                                      <button onClick={() => { const fs = [...regFormForm.fields]; fs[idx] = { ...fs[idx], options: fs[idx].options.filter((_,i) => i !== oi) }; setRegFormForm({ ...regFormForm, fields: fs }); }} className="text-red-400 text-xs">x</button>
                                    </div>
                                  ))}
                                  <button onClick={() => { const fs = [...regFormForm.fields]; fs[idx] = { ...fs[idx], options: [...fs[idx].options, { label: "", value: "" }] }; setRegFormForm({ ...regFormForm, fields: fs }); }} className="text-xs text-blue-600">+ 選択肢追加</button>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-200">
                      <button onClick={() => setShowRegFormModal(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition">キャンセル</button>
                      <button
                        onClick={async () => {
                          if (!regFormForm.name.trim()) { alert("フォーム名を入力してください"); return; }
                          if (!selectedAccount) return;
                          const res = await fetch("/api/line/registration-forms", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              account_id: selectedAccount.id,
                              name: regFormForm.name.trim(),
                              description: regFormForm.description.trim() || null,
                              fields: regFormForm.fields.filter((f) => f.field_label.trim()).map((f) => ({ ...f, save_to_field_id: f.save_to_field_id || null })),
                            }),
                          });
                          if (res.ok) { setShowRegFormModal(false); fetchRegForms(); }
                          else { const d = await res.json().catch(() => ({})); alert(d.error ?? "作成失敗"); }
                        }}
                        className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition"
                      >作成</button>
                    </div>
                  </div>
                </div>
              )}
            </main>
          </>
        )}

        {/* ============================================================ */}
        {/* アカウント詳細: レポート */}
        {/* ============================================================ */}
        {mainView === "account-detail" && accountSubView === "reports" && (
          <>
            <header className="bg-white border-b border-gray-200 px-4 md:px-6 py-3 flex items-center justify-between flex-shrink-0">
              <h1 className="text-base font-bold text-gray-800">レポート</h1>
              <button
                onClick={async () => {
                  if (!project?.id) return;
                  setReportGenerating(true);
                  try {
                    const res = await fetch("/api/line/reports", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ project_id: project.id }),
                    });
                    if (res.ok) {
                      alert("レポート生成完了");
                      fetchReports();
                    } else {
                      const d = await res.json().catch(() => ({}));
                      alert(d.error ?? "生成失敗");
                    }
                  } catch { alert("生成エラー"); }
                  finally { setReportGenerating(false); }
                }}
                disabled={reportGenerating}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-medium rounded-md transition"
              >
                {reportGenerating ? "生成中..." : "先月のレポートを生成"}
              </button>
            </header>
            <main className="flex-1 overflow-y-auto p-4 md:p-6">
              {reports.length === 0 ? (
                <div className="bg-white rounded-lg border border-gray-200 p-16 text-center text-gray-400">
                  <p className="text-lg mb-2">レポートがありません</p>
                  <p className="text-sm">毎月1日に自動生成されます。手動で生成することもできます。</p>
                </div>
              ) : (
                <div className="space-y-4 max-w-5xl">
                  {reports.map((r) => (
                    <div key={r.id} className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                      <div className="px-5 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-bold text-gray-800">{r.report_month} 月次レポート</h3>
                          <span className={`px-2 py-0.5 text-[10px] rounded-full ${r.status === "sent" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                            {r.status === "sent" ? "送信済み" : "生成済み"}
                          </span>
                        </div>
                        <span className="text-xs text-gray-400">{new Date(r.created_at).toLocaleString("ja-JP")}</span>
                      </div>
                      <div className="p-5 grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="bg-blue-50 rounded-lg p-3 text-center">
                          <div className="text-2xl font-bold text-blue-700">{r.report_data.delivery.total}</div>
                          <div className="text-xs text-blue-600">配信数</div>
                        </div>
                        <div className="bg-green-50 rounded-lg p-3 text-center">
                          <div className="text-2xl font-bold text-green-700">{r.report_data.new_followers.total}</div>
                          <div className="text-xs text-green-600">友達追加</div>
                        </div>
                        <div className="bg-purple-50 rounded-lg p-3 text-center">
                          <div className="text-2xl font-bold text-purple-700">{Object.values(r.report_data.closer_stats).reduce((s, c) => s + c.seiyaku, 0)}</div>
                          <div className="text-xs text-purple-600">成約数</div>
                        </div>
                        <div className="bg-gray-50 rounded-lg p-3 text-center">
                          <div className="text-2xl font-bold text-gray-700">{Object.values(r.report_data.closer_stats).reduce((s, c) => s + c.shicchu, 0)}</div>
                          <div className="text-xs text-gray-600">失注数</div>
                        </div>
                      </div>
                      {/* 流入経路ランキング */}
                      {r.report_data.new_followers.by_inflow.length > 0 && (
                        <div className="px-5 pb-4">
                          <h4 className="text-xs font-bold text-gray-600 mb-2">流入経路ランキング</h4>
                          <div className="space-y-1">
                            {r.report_data.new_followers.by_inflow.slice(0, 5).map((ir, idx) => (
                              <div key={idx} className="flex items-center justify-between text-xs">
                                <span className="text-gray-700">{idx + 1}. {ir.name}</span>
                                <span className="font-medium text-gray-800">{ir.count}人</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {/* 日別 × 流入経路 */}
                      {r.report_data.new_followers.daily && r.report_data.new_followers.daily.length > 0 && (
                        <div className="px-5 pb-4">
                          <h4 className="text-xs font-bold text-gray-600 mb-2">日別の流入経路</h4>
                          <div className="border border-gray-200 rounded-md overflow-hidden">
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="bg-gray-50 text-gray-500 text-left border-b border-gray-200">
                                  <th className="px-3 py-2 font-medium w-28">日付</th>
                                  <th className="px-3 py-2 font-medium w-16 text-right">合計</th>
                                  <th className="px-3 py-2 font-medium">内訳（流入経路）</th>
                                </tr>
                              </thead>
                              <tbody>
                                {r.report_data.new_followers.daily.map((d) => (
                                  <tr key={d.date} className="border-b border-gray-100 last:border-b-0">
                                    <td className="px-3 py-2 text-gray-700 font-mono">{d.date}</td>
                                    <td className="px-3 py-2 text-right font-medium text-gray-800">{d.total}人</td>
                                    <td className="px-3 py-2">
                                      <div className="flex flex-wrap gap-1">
                                        {d.routes.map((route, idx) => (
                                          <span key={idx} className="px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded text-[11px]">
                                            {route.name}: {route.count}
                                          </span>
                                        ))}
                                      </div>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                      {/* ラベル別 */}
                      {r.report_data.label_stats.length > 0 && (
                        <div className="px-5 pb-4">
                          <h4 className="text-xs font-bold text-gray-600 mb-2">ラベル別フォロワー数</h4>
                          <div className="flex flex-wrap gap-2">
                            {r.report_data.label_stats.slice(0, 10).map((ls, idx) => (
                              <span key={idx} className="px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded">
                                {ls.name}: {ls.count}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </main>
          </>
        )}

        {/* ============================================================ */}
        {/* アカウント詳細: 掘り起こし配信 */}
        {/* ============================================================ */}
        {mainView === "account-detail" && accountSubView === "reengagement" && (
          <>
            <header className="bg-white border-b border-gray-200 px-4 md:px-6 py-3 flex items-center justify-between flex-shrink-0">
              <h1 className="text-base font-bold text-gray-800">掘り起こし配信</h1>
              <button
                onClick={() => {
                  setReengagementForm({ name: "", condition: "all", targetCondition: emptyDeliveryCondition, messages: [emptyMessage()] as BroadcastMessage[] });
                  setReengagementPreview(null);
                  setShowReengagementModal(true);
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-md transition"
              >
                {Icons.plus}
                新規作成
              </button>
            </header>
            <main className="flex-1 overflow-y-auto p-4 md:p-6">
              {reengagements.length === 0 ? (
                <div className="bg-white rounded-lg border border-gray-200 p-16 text-center text-gray-400">
                  <p className="text-lg mb-2">掘り起こし配信がありません</p>
                  <p className="text-sm">「新規作成」から配信を作成してください</p>
                </div>
              ) : (
                <div className="space-y-3 max-w-4xl">
                  {reengagements.map((b) => (
                    <div key={b.id} className="bg-white rounded-lg border border-gray-200 p-4 flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-bold text-gray-800">{b.name}</h3>
                          <span className={`px-2 py-0.5 text-[10px] rounded-full ${b.status === "sent" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                            {b.status === "sent" ? "送信済み" : "下書き"}
                          </span>
                        </div>
                        <div className="text-xs text-gray-400 mt-1">
                          {b.sent_at ? `送信: ${new Date(b.sent_at).toLocaleString("ja-JP")} (${b.sent_count}人)` : `作成: ${new Date(b.created_at).toLocaleString("ja-JP")}`}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {b.status !== "sent" && (
                          <button
                            onClick={async () => {
                              if (!confirm(`「${b.name}」を送信しますか？\n対象者に即座に配信されます。`)) return;
                              setReengagementSending(true);
                              try {
                                const res = await fetch("/api/line/reengagement", {
                                  method: "PUT",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({ id: b.id, action: "send" }),
                                });
                                const data = await res.json();
                                if (res.ok) {
                                  alert(`送信完了: ${data.sent_count}人に配信しました`);
                                  fetchReengagements();
                                } else {
                                  alert(`送信失敗: ${data.error}`);
                                }
                              } catch (e) {
                                alert(`送信エラー: ${(e as Error).message}`);
                              } finally {
                                setReengagementSending(false);
                              }
                            }}
                            disabled={reengagementSending}
                            className="px-3 py-1.5 bg-[#06C755] hover:bg-[#05a648] text-white text-xs font-medium rounded-md transition disabled:opacity-50"
                          >
                            {reengagementSending ? "送信中..." : "送信"}
                          </button>
                        )}
                        <button
                          onClick={async () => {
                            if (!confirm("削除しますか？")) return;
                            await fetch("/api/line/reengagement", {
                              method: "DELETE",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ id: b.id }),
                            });
                            fetchReengagements();
                          }}
                          className="px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white text-xs font-medium rounded-md transition"
                        >
                          削除
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* 掘り起こし配信作成モーダル */}
              {showReengagementModal && (
                <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
                  <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                    <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
                      <h3 className="font-bold text-gray-800">掘り起こし配信 新規作成</h3>
                      <button onClick={() => setShowReengagementModal(false)} className="text-gray-400 hover:text-gray-600">{Icons.close}</button>
                    </div>
                    <div className="p-5 space-y-4">
                      <div>
                        <label className="text-xs text-gray-500 block mb-1 font-medium">配信名 <span className="text-red-500">*</span></label>
                        <input
                          type="text"
                          value={reengagementForm.name}
                          onChange={(e) => setReengagementForm({ ...reengagementForm, name: e.target.value })}
                          placeholder="例: 4月掘り起こし"
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
                        />
                      </div>

                      {/* 配信条件 */}
                      {renderDeliveryConditionSection(
                        { ...emptyBroadcast, name: reengagementForm.name, condition: reengagementForm.condition, targetCondition: reengagementForm.targetCondition, messages: reengagementForm.messages },
                        (f) => setReengagementForm({ ...reengagementForm, condition: f.condition, targetCondition: f.targetCondition }),
                        "reengagement",
                      )}

                      {/* 対象者プレビュー */}
                      <div className="px-5 py-3 border-b border-gray-200">
                        <button
                          onClick={() => {
                            const cond = reengagementForm.condition === "filtered" ? reengagementForm.targetCondition : { ...emptyDeliveryCondition, mode: "all" as const };
                            const matched = followers.filter((f) => {
                              const userLabelIds = labels.filter((l) => l.assigned_users.includes(f.line_user_id)).map((l) => l.id);
                              const lite: FollowerLite = {
                                id: f.id,
                                line_user_id: f.line_user_id,
                                display_name: f.display_name,
                                followed_at: f.followed_at,
                                inflow_route_id: undefined,
                                label_ids: userLabelIds,
                              };
                              return evalCondition(cond, lite);
                            });
                            setReengagementPreview(matched);
                          }}
                          className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-medium rounded-md transition"
                        >
                          対象者プレビュー
                        </button>
                        {reengagementPreview !== null && (
                          <div className="mt-2">
                            <p className="text-xs text-gray-600 mb-1">対象者: <span className="font-bold">{reengagementPreview.length}人</span></p>
                            {reengagementPreview.length > 0 && (
                              <div className="max-h-32 overflow-y-auto border border-gray-200 rounded-md">
                                {reengagementPreview.slice(0, 50).map((f) => (
                                  <div key={f.id} className="px-3 py-1.5 text-xs text-gray-700 border-b border-gray-100 last:border-b-0">
                                    {f.display_name ?? f.line_user_id.slice(0, 12)}
                                  </div>
                                ))}
                                {reengagementPreview.length > 50 && (
                                  <div className="px-3 py-1.5 text-xs text-gray-400">...他 {reengagementPreview.length - 50} 人</div>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      {/* メッセージ本文 */}
                      <div>
                        <label className="text-xs text-gray-500 block mb-1 font-medium">メッセージ本文</label>
                        <textarea
                          value={reengagementForm.messages[0]?.body ?? ""}
                          onChange={(e) => {
                            const msgs = [...reengagementForm.messages];
                            msgs[0] = { ...msgs[0], body: e.target.value };
                            setReengagementForm({ ...reengagementForm, messages: msgs });
                          }}
                          rows={5}
                          placeholder="配信メッセージを入力..."
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
                        />
                      </div>
                    </div>
                    <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-200">
                      <button onClick={() => setShowReengagementModal(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition">キャンセル</button>
                      <button
                        onClick={async () => {
                          if (!reengagementForm.name.trim()) { alert("配信名を入力してください"); return; }
                          if (!selectedAccount) return;
                          const cond = reengagementForm.condition === "filtered"
                            ? { ...reengagementForm.targetCondition, mode: "filtered" as const }
                            : { ...emptyDeliveryCondition, mode: "all" as const };
                          const msgs = reengagementForm.messages.map((m) => ({
                            msg_type: m.msgType,
                            payload: { msgType: m.msgType, body: m.body },
                            body: m.body,
                          }));
                          const res = await fetch("/api/line/reengagement", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              account_id: selectedAccount.id,
                              name: reengagementForm.name.trim(),
                              target_condition: cond,
                              messages: msgs,
                            }),
                          });
                          if (res.ok) {
                            setShowReengagementModal(false);
                            fetchReengagements();
                          } else {
                            const data = await res.json().catch(() => ({}));
                            alert(`作成失敗: ${data.error ?? res.status}`);
                          }
                        }}
                        className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition"
                      >
                        保存
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </main>
          </>
        )}

        {/* ============================================================ */}
        {/* アカウント詳細: メルマガ */}
        {/* ============================================================ */}
        {mainView === "account-detail" && accountSubView === "newsletter" && (
          <>
            <header className="bg-white border-b border-gray-200 px-4 md:px-6 py-3 flex items-center justify-between flex-shrink-0">
              <h1 className="text-base font-bold text-gray-800">メルマガ管理</h1>
              <button
                onClick={() => { setNewsletterForm({ name: "", subject: "", body_text: "" }); setShowNewsletterModal(true); }}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-md transition"
              >
                {Icons.plus} 新規メルマガ
              </button>
            </header>
            <main className="flex-1 overflow-y-auto p-4 md:p-6">
              {showNewsletterModal && (
                <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
                  <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4">
                    <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
                      <h3 className="font-bold text-gray-800">メルマガ作成</h3>
                      <button onClick={() => setShowNewsletterModal(false)} className="text-gray-400 hover:text-gray-600">{Icons.close}</button>
                    </div>
                    <div className="p-5 space-y-3">
                      <div>
                        <label className="text-xs text-gray-500 block mb-1">管理名称</label>
                        <input type="text" value={newsletterForm.name} onChange={(e) => setNewsletterForm({ ...newsletterForm, name: e.target.value })} placeholder="例: 週刊ニュースレター" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 block mb-1">件名</label>
                        <input type="text" value={newsletterForm.subject} onChange={(e) => setNewsletterForm({ ...newsletterForm, subject: e.target.value })} placeholder="メールの件名" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 block mb-1">本文</label>
                        <textarea value={newsletterForm.body_text} onChange={(e) => setNewsletterForm({ ...newsletterForm, body_text: e.target.value })} rows={8} placeholder="メール本文を入力..." className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none" />
                      </div>
                      <p className="text-[10px] text-gray-400">※ メール配信には独自置き換え文字の「メールアドレス」フィールドにデータが登録されているフォロワーが対象になります</p>
                    </div>
                    <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-200">
                      <button onClick={() => setShowNewsletterModal(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">キャンセル</button>
                      <button
                        onClick={async () => {
                          if (!newsletterForm.name.trim() || !selectedAccount) return;
                          await fetch("/api/line/newsletter", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              account_id: selectedAccount.id,
                              name: newsletterForm.name.trim(),
                              subject: newsletterForm.subject.trim(),
                              body_text: newsletterForm.body_text,
                            }),
                          });
                          setShowNewsletterModal(false);
                          fetchNewsletters();
                        }}
                        disabled={!newsletterForm.name.trim()}
                        className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg"
                      >
                        下書き保存
                      </button>
                    </div>
                  </div>
                </div>
              )}
              <div className="max-w-5xl">
                <div className="bg-white rounded-lg border border-gray-200 p-4 mb-4">
                  <p className="text-xs text-gray-500">メルマガ配信の流れ:</p>
                  <ol className="text-xs text-gray-600 mt-1 space-y-0.5 list-decimal list-inside">
                    <li>独自置き換え文字で「メールアドレス」フィールドを作成</li>
                    <li>フォロワーのメールアドレスを収集（LINEリッチメニューのフォームなど）</li>
                    <li>メルマガを作成して配信</li>
                  </ol>
                </div>
                {newsletters.length === 0 ? (
                  <div className="bg-white rounded-lg border border-gray-200 p-16 text-center text-gray-400">
                    <p className="text-lg mb-2">メルマガがありません</p>
                    <p className="text-sm">「新規メルマガ」から作成してください</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {newsletters.map((nl) => (
                      <div key={nl.id} className="bg-white rounded-lg border border-gray-200 overflow-hidden px-5 py-3.5">
                        <div className="flex items-center justify-between">
                          <div className="min-w-0 flex-1 mr-4">
                            <div className="text-sm font-medium text-gray-800">{nl.name}</div>
                            {nl.subject && <div className="text-xs text-gray-500 mt-0.5">件名: {nl.subject}</div>}
                            <div className="flex items-center gap-2 mt-1">
                              <span className={`px-2 py-0.5 text-[10px] rounded font-medium ${
                                nl.status === "sent" ? "bg-green-100 text-green-700" :
                                nl.status === "scheduled" ? "bg-yellow-100 text-yellow-700" :
                                "bg-gray-100 text-gray-500"
                              }`}>{nl.status === "sent" ? "送信済み" : nl.status === "scheduled" ? "予約済み" : "下書き"}</span>
                              {nl.sent_count > 0 && <span className="text-[10px] text-gray-400">{nl.sent_count}通送信</span>}
                              <span className="text-[10px] text-gray-300">{fmtShort(nl.created_at)}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            {nl.status !== "sent" && (
                              <>
                                <button
                                  onClick={async () => {
                                    if (!confirm(`「${nl.name}」を今すぐ送信しますか？対象フォロワーにメールを配信します。`)) return;
                                    const r = await fetch("/api/line/newsletter/send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: nl.id, mode: "now" }) });
                                    const data = await r.json().catch(() => ({}));
                                    if (r.ok) alert(`送信完了: ${data.sent ?? 0}通送信 / ${data.failed ?? 0}通失敗`);
                                    else alert(`送信失敗: ${data.error ?? r.status}`);
                                    fetchNewsletters();
                                  }}
                                  className="text-xs bg-green-100 hover:bg-green-200 text-green-700 px-2 py-1 rounded font-medium"
                                >
                                  今すぐ送信
                                </button>
                                <button
                                  onClick={async () => {
                                    const input = prompt("予約日時を入力 (YYYY-MM-DD HH:mm):", new Date(Date.now() + 60 * 60 * 1000).toISOString().slice(0, 16).replace("T", " "));
                                    if (!input) return;
                                    const iso = new Date(input.replace(" ", "T")).toISOString();
                                    const r = await fetch("/api/line/newsletter/send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: nl.id, mode: "schedule", scheduled_at: iso }) });
                                    if (r.ok) alert(`予約設定完了: ${input}`);
                                    else alert("予約失敗");
                                    fetchNewsletters();
                                  }}
                                  className="text-xs bg-yellow-100 hover:bg-yellow-200 text-yellow-700 px-2 py-1 rounded font-medium"
                                >
                                  予約設定
                                </button>
                              </>
                            )}
                            <button
                              onClick={async () => {
                                if (!confirm(`「${nl.name}」を削除しますか？`)) return;
                                await fetch("/api/line/newsletter", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: nl.id }) });
                                fetchNewsletters();
                              }}
                              className="text-xs text-red-400 hover:text-red-600"
                            >
                              削除
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </main>
          </>
        )}

        {/* ============================================================ */}
        {/* アカウント詳細: 流入経路 */}
        {/* ============================================================ */}
        {mainView === "account-detail" && accountSubView === "inflow" && (
          <>
            <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-3">
                <h1 className="text-base font-bold text-gray-800">流入経路</h1>
                <span className="text-xs text-gray-400">
                  {inflowRoutes.length} 件
                  {inflowRoutesLastFetched && (
                    <span className="ml-2 text-gray-300">
                      最終更新 {inflowRoutesLastFetched.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                    </span>
                  )}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => { fetchInflowRoutes(); fetchInflowGroups(); }}
                  className="px-3 py-1.5 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 text-xs font-medium rounded-md transition"
                  title="最新データを取得"
                >
                  ↻ 再読込
                </button>
                <a
                  href="/line/inflow-stats"
                  className="px-3 py-1.5 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 text-xs font-medium rounded-md transition"
                >
                  レポートを見る
                </a>
                <button
                  onClick={() => { setInflowGroupForm({ name: "", color: "#3B82F6" }); setEditingInflowGroup(null); setShowInflowGroupModal(true); }}
                  className="px-3 py-1.5 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 text-xs font-medium rounded-md transition"
                >
                  ＋ 新規グループ
                </button>
                <button
                  onClick={() => { setInflowForm({ name: "", code: "", url: "", description: "", group_id: "" }); setEditingInflow(null); setShowInflowModal(true); }}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-md transition"
                >
                  {Icons.plus} 新規経路
                </button>
              </div>
            </header>
            <main className="flex-1 overflow-y-auto p-6">
              {/* 流入経路モーダル */}
              {showInflowModal && (
                <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
                  <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4">
                    <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
                      <h3 className="font-bold text-gray-800">{editingInflow ? "経路編集" : "新規流入経路"}</h3>
                      <button onClick={() => setShowInflowModal(false)} className="text-gray-400 hover:text-gray-600">{Icons.close}</button>
                    </div>
                    <div className="p-5 space-y-3">
                      <div>
                        <label className="text-xs text-gray-500 block mb-1 font-medium">経路名 <span className="text-red-500">*</span></label>
                        <input type="text" value={inflowForm.name} onChange={(e) => setInflowForm({ ...inflowForm, name: e.target.value })} placeholder="例: YouTube広告経由" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400" />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 block mb-1 font-medium">経路コード <span className="text-red-500">*</span></label>
                        <input type="text" value={inflowForm.code} onChange={(e) => setInflowForm({ ...inflowForm, code: e.target.value })} placeholder="例: yt-ad-2024" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400" />
                        <p className="text-[10px] text-gray-400 mt-1">友だち追加URLの末尾に付与されるパラメータ</p>
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 block mb-1 font-medium">流入元URL</label>
                        <input type="text" value={inflowForm.url} onChange={(e) => setInflowForm({ ...inflowForm, url: e.target.value })} placeholder="https://..." className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400" />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 block mb-1 font-medium">グループ</label>
                        <select value={inflowForm.group_id} onChange={(e) => setInflowForm({ ...inflowForm, group_id: e.target.value })} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400">
                          <option value="">（グループなし）</option>
                          {inflowGroups.map((g) => (
                            <option key={g.id} value={g.id}>{g.name}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 block mb-1 font-medium">説明</label>
                        <textarea value={inflowForm.description} onChange={(e) => setInflowForm({ ...inflowForm, description: e.target.value })} rows={2} placeholder="メモ" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400" />
                      </div>
                      {inflowSaveMsg && (
                        <div
                          className={`px-3 py-2 rounded-lg text-xs border ${
                            inflowSaveMsg.ok
                              ? "bg-green-50 text-green-700 border-green-200"
                              : "bg-red-50 text-red-600 border-red-200"
                          }`}
                        >
                          {inflowSaveMsg.text}
                        </div>
                      )}
                      <div className="text-[10px] text-gray-400 pt-1 border-t border-gray-100">
                        案件: {project?.name ?? "(未読み込み)"} {project?.id ? `/ ID: ${project.id.slice(0, 8)}...` : ""}
                      </div>
                    </div>
                    <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-200">
                      <button onClick={() => { setShowInflowModal(false); setInflowSaveMsg(null); }} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition">キャンセル</button>
                      <button
                        onClick={async () => {
                          setInflowSaveMsg(null);
                          if (!inflowForm.name.trim() || !inflowForm.code.trim()) {
                            setInflowSaveMsg({ ok: false, text: "経路名と経路コードは必須です" });
                            return;
                          }
                          if (!project?.id) {
                            setInflowSaveMsg({
                              ok: false,
                              text: "案件情報が読み込まれていません。案件選択からやり直してください。",
                            });
                            return;
                          }
                          setInflowSaving(true);
                          const method = editingInflow ? "PUT" : "POST";
                          const body = editingInflow
                            ? { id: editingInflow.id, ...inflowForm }
                            : { project_id: project.id, ...inflowForm };
                          try {
                            console.log("[inflow-save] start", { method, body, project_id: project.id });
                            const res = await fetch("/api/line/inflow-routes", {
                              method,
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify(body),
                              cache: "no-store",
                            });
                            const data = await res.json().catch(() => ({}));
                            console.log("[inflow-save] response", { status: res.status, data });
                            if (res.ok) {
                              setInflowSaveMsg({ ok: true, text: `保存しました (id: ${data.id ?? "-"})` });
                              // ========== 楽観的状態更新 ==========
                              // fetchInflowRoutes が失敗しても画面に確実に反映されるよう、
                              // 保存成功したレコードを関数型更新で直接 state に反映する
                              if (method === "POST" && data.id) {
                                const newRoute: InflowRoute = {
                                  id: data.id,
                                  account_id: "",
                                  name: inflowForm.name,
                                  code: inflowForm.code,
                                  url: inflowForm.url || null,
                                  description: inflowForm.description || null,
                                  is_active: true,
                                  created_at: new Date().toISOString(),
                                  follower_count: 0,
                                  group_id: inflowForm.group_id || null,
                                };
                                setInflowRoutes((prev) => {
                                  // 重複防止（既に入っていれば追加しない）
                                  if (prev.some((r) => r.id === newRoute.id)) return prev;
                                  return [newRoute, ...prev];
                                });
                                console.log("[inflow-save] optimistic update added", newRoute.id);
                              } else if (method === "PUT" && editingInflow) {
                                setInflowRoutes((prev) =>
                                  prev.map((r) =>
                                    r.id === editingInflow.id
                                      ? {
                                          ...r,
                                          name: inflowForm.name,
                                          code: inflowForm.code,
                                          url: inflowForm.url || null,
                                          description: inflowForm.description || null,
                                          group_id: inflowForm.group_id || null,
                                        }
                                      : r,
                                  ),
                                );
                                console.log("[inflow-save] optimistic update edited", editingInflow.id);
                              }
                              // ========== サーバ側の正確値を再取得（click_count/follower_count等） ==========
                              // 失敗しても楽観更新済みなので画面は反映されたまま
                              try {
                                await fetchInflowRoutes();
                                await fetchInflowGroups();
                              } catch (fetchErr) {
                                console.error("[inflow-save] refetch after save failed", fetchErr);
                              }
                              // 少し表示してから閉じる
                              setTimeout(() => {
                                setShowInflowModal(false);
                                setEditingInflow(null);
                                setInflowForm({ name: "", code: "", url: "", description: "", group_id: "" });
                                setInflowSaveMsg(null);
                              }, 600);
                            } else {
                              setInflowSaveMsg({
                                ok: false,
                                text: `保存失敗: ${data.error ?? `HTTP ${res.status}`}${data.detail ? " / " + data.detail : ""}`,
                              });
                            }
                          } catch (e) {
                            console.error("[inflow-save] network error", e);
                            setInflowSaveMsg({
                              ok: false,
                              text: `通信エラー: ${(e as Error).message}`,
                            });
                          } finally {
                            setInflowSaving(false);
                          }
                        }}
                        disabled={inflowSaving || !inflowForm.name.trim() || !inflowForm.code.trim() || !project?.id}
                        className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition"
                      >
                        {inflowSaving ? "保存中..." : editingInflow ? "更新" : "作成"}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* グループ管理モーダル */}
              {showInflowGroupModal && (
                <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
                  <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4">
                    <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
                      <h3 className="font-bold text-gray-800">{editingInflowGroup ? "グループ編集" : "新規グループ"}</h3>
                      <button onClick={() => setShowInflowGroupModal(false)} className="text-gray-400 hover:text-gray-600">{Icons.close}</button>
                    </div>
                    <div className="p-5 space-y-3">
                      <div>
                        <label className="text-xs text-gray-500 block mb-1 font-medium">グループ名 <span className="text-red-500">*</span></label>
                        <input type="text" value={inflowGroupForm.name} onChange={(e) => setInflowGroupForm({ ...inflowGroupForm, name: e.target.value })} placeholder="例: YouTube" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 block mb-1 font-medium">カラー</label>
                        <input type="color" value={inflowGroupForm.color} onChange={(e) => setInflowGroupForm({ ...inflowGroupForm, color: e.target.value })} className="w-20 h-8 border border-gray-200 rounded" />
                      </div>
                    </div>
                    <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-200">
                      <button onClick={() => setShowInflowGroupModal(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">キャンセル</button>
                      <button
                        onClick={async () => {
                          if (!inflowGroupForm.name.trim() || !project?.id) return;
                          const method = editingInflowGroup ? "PUT" : "POST";
                          const body = editingInflowGroup
                            ? { id: editingInflowGroup.id, ...inflowGroupForm }
                            : { project_id: project.id, ...inflowGroupForm };
                          const res = await fetch("/api/line/inflow-groups", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
                          if (res.ok) {
                            setShowInflowGroupModal(false);
                            setEditingInflowGroup(null);
                            setInflowGroupForm({ name: "", color: "#3B82F6" });
                            await fetchInflowGroups();
                          } else {
                            const d = await res.json().catch(() => ({}));
                            alert(`グループの保存に失敗: ${d.error ?? res.status}`);
                          }
                        }}
                        disabled={!inflowGroupForm.name.trim()}
                        className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg"
                      >
                        {editingInflowGroup ? "更新" : "作成"}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              <div className="max-w-5xl">
                {/* グループ集計 */}
                {inflowGroups.length > 0 && (
                  <div className="bg-white rounded-lg border border-gray-200 p-4 mb-4">
                    <div className="text-xs font-medium text-gray-700 mb-2">グループ別集計</div>
                    <div className="flex flex-wrap gap-2">
                      {inflowGroups.map((g) => (
                        <div key={g.id} className="flex items-center gap-2 px-2.5 py-1.5 bg-gray-50 border border-gray-200 rounded-md">
                          <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: g.color }} />
                          <span className="text-xs font-medium text-gray-800">{g.name}</span>
                          <span className="text-[10px] text-gray-500">{g.route_count ?? 0}経路 / {g.follower_count ?? 0}友</span>
                          <button
                            onClick={() => { setInflowGroupForm({ name: g.name, color: g.color }); setEditingInflowGroup(g); setShowInflowGroupModal(true); }}
                            className="text-[10px] text-blue-500 hover:text-blue-700"
                          >編集</button>
                          <button
                            onClick={async () => {
                              if (!confirm(`グループ「${g.name}」を削除しますか？経路自体は残り、所属がクリアされます。`)) return;
                              await fetch("/api/line/inflow-groups", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: g.id }) });
                              await fetchInflowGroups();
                              await fetchInflowRoutes();
                            }}
                            className="text-[10px] text-red-400 hover:text-red-600"
                          >削除</button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {inflowRoutes.length === 0 ? (
                  <div className="bg-white rounded-lg border border-gray-200 p-16 text-center text-gray-400">
                    <p className="text-lg mb-2">流入経路がありません</p>
                    <p className="text-sm">「新規経路」から作成してください</p>
                    {project?.name && (
                      <p className="text-[11px] mt-3 text-gray-300">
                        現在の案件: <span className="font-medium text-gray-500">{project.name}</span>
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-200 text-gray-500 text-left bg-gray-50">
                          <th className="px-5 py-3 font-medium">経路名</th>
                          <th className="px-5 py-3 font-medium">コード</th>
                          <th className="px-5 py-3 font-medium">友だち数</th>
                          <th className="px-5 py-3 font-medium">友だち追加URL</th>
                          <th className="px-5 py-3 font-medium">状態</th>
                          <th className="px-5 py-3 font-medium">操作</th>
                        </tr>
                      </thead>
                      <tbody>
                        {inflowRoutes.map((route) => {
                          const origin =
                            typeof window !== "undefined" ? window.location.origin : "";
                          const addUrl = project?.code
                            ? `${origin}/line/r/${project.code}/${route.code}`
                            : `（案件コード未設定）`;
                          return (
                            <tr key={route.id} className="border-b border-gray-100 hover:bg-gray-50">
                              <td className="px-5 py-3">
                                <div className="font-medium text-gray-800">{route.name}</div>
                                {route.description && <div className="text-xs text-gray-400 mt-0.5">{route.description}</div>}
                              </td>
                              <td className="px-5 py-3 font-mono text-gray-500 text-xs">{route.code}</td>
                              <td className="px-5 py-3">
                                <span className="text-blue-600 font-bold">{route.follower_count ?? 0}</span>
                                <span className="text-gray-400 text-xs ml-0.5">人</span>
                              </td>
                              <td className="px-5 py-3">
                                <div className="flex items-center gap-1.5">
                                  <input readOnly value={addUrl} className="flex-1 border border-gray-200 rounded-md px-2 py-1 text-xs font-mono text-blue-600 bg-gray-50 min-w-0" />
                                  <button
                                    onClick={() => navigator.clipboard.writeText(addUrl)}
                                    className="px-2 py-1 bg-gray-100 hover:bg-gray-200 text-gray-600 text-xs rounded-md transition flex-shrink-0"
                                  >
                                    コピー
                                  </button>
                                </div>
                              </td>
                              <td className="px-5 py-3">
                                <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${route.is_active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                                  {route.is_active ? "有効" : "無効"}
                                </span>
                              </td>
                              <td className="px-5 py-3">
                                <div className="flex items-center gap-1">
                                  <button
                                    onClick={() => {
                                      setInflowForm({ name: route.name, code: route.code, url: route.url ?? "", description: route.description ?? "", group_id: route.group_id ?? "" });
                                      setEditingInflow(route);
                                      setShowInflowModal(true);
                                    }}
                                    className="text-xs text-blue-600 hover:text-blue-800"
                                  >
                                    編集
                                  </button>
                                  <button
                                    onClick={async () => {
                                      if (!confirm(`「${route.name}」を削除しますか？`)) return;
                                      await fetch("/api/line/inflow-routes", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: route.id }) });
                                      fetchInflowRoutes();
                                    }}
                                    className="text-xs text-red-500 hover:text-red-700"
                                  >
                                    削除
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </main>
          </>
        )}

        {/* ============================================================ */}
        {/* アカウント管理（設定） */}
        {/* ============================================================ */}
        {mainView === "settings" && (
          <>
            <header className="bg-white border-b border-gray-200 px-6 py-3 flex-shrink-0">
              <h1 className="text-base font-bold text-gray-800">アカウント管理</h1>
            </header>
            <main className="flex-1 overflow-y-auto p-4 md:p-6">
              <div className="max-w-4xl space-y-6">
                {/* BAN対策: LIFF中継URL表示(案B 実装、2026-04-30: 案件単位 LIFF ID 対応) */}
                {project?.code && <LiffRelayCard projectCode={project.code} />}

                {/* 登録フォーム */}
                <div className="bg-white rounded-lg border border-gray-200 p-4 md:p-6">
                  <h3 className="text-sm font-bold text-gray-800 mb-4">
                    {editingId ? "アカウント編集" : "新規アカウント登録"}
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs text-gray-500 block mb-1 font-medium">アカウント名</label>
                      <input type="text" value={form.account_name} onChange={(e) => setForm({ ...form, account_name: e.target.value })} placeholder="ハピネスサロン音声相談LINE" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400" />
                    </div>
                    {/* 段階5(案B)PR-2:旧ウィザード(登録フォーム panel)の「グループ名」入力 → 「シナリオ」選択プルダウン
                        モーダルフォーム(showAddAccount)とは別の表示位置。同じ form state を共有するため、ロジックは統一。 */}
                    <div>
                      <label className="text-xs text-gray-500 block mb-1 font-medium">シナリオ <span className="text-red-500">*</span></label>
                      {(() => {
                        const targetProjectId = form.project_id || project?.id || null;
                        const visibleScenarios = targetProjectId
                          ? scenarios.filter((s) => s.project_id === targetProjectId)
                          : scenarios;
                        const isLoading = scenarios.length === 0;
                        return (
                          <select
                            value={form.scenario_id}
                            disabled={isLoading}
                            onChange={(e) => setForm({ ...form, scenario_id: e.target.value })}
                            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400 disabled:bg-gray-100 disabled:cursor-not-allowed"
                          >
                            {isLoading ? (
                              <option value="">未取得中...</option>
                            ) : (
                              <>
                                <option value="">-- シナリオを選択 --</option>
                                {visibleScenarios.map((s) => (
                                  <option key={s.id} value={s.id}>{s.name}</option>
                                ))}
                                <option value="__null__">シナリオ未設定</option>
                              </>
                            )}
                          </select>
                        );
                      })()}
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 block mb-1 font-medium">チャネルID <span className="text-red-500">*</span></label>
                      <input type="text" value={form.channel_id} onChange={(e) => setForm({ ...form, channel_id: e.target.value })} placeholder="2009751642" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400" />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 block mb-1 font-medium">Basic ID</label>
                      <input type="text" value={form.basic_id} onChange={(e) => setForm({ ...form, basic_id: e.target.value })} placeholder="576ergby (@除く)" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400" />
                    </div>
                    <div className="md:col-span-2">
                      <label className="text-xs text-gray-500 block mb-1 font-medium">
                        チャネルシークレット {editingId ? <span className="text-gray-400">（変更時のみ入力）</span> : <span className="text-red-500">*</span>}
                      </label>
                      <input
                        type="password"
                        value={form.channel_secret}
                        onChange={(e) => setForm({ ...form, channel_secret: e.target.value })}
                        placeholder={editingId ? "空欄なら既存値を維持" : "LINE Developersからコピー"}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="text-xs text-gray-500 block mb-1 font-medium">
                        チャネルアクセストークン {editingId ? <span className="text-gray-400">（変更時のみ入力）</span> : <span className="text-red-500">*</span>}
                      </label>
                      <input
                        type="password"
                        value={form.channel_access_token}
                        onChange={(e) => setForm({ ...form, channel_access_token: e.target.value })}
                        placeholder={editingId ? "空欄なら既存値を維持" : "発行済みトークン"}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="text-xs text-gray-500 block mb-1 font-medium">所属案件</label>
                      <select
                        value={form.project_id}
                        onChange={(e) => setForm({ ...form, project_id: e.target.value })}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
                      >
                        <option value="">（未設定 / 案件から外す）</option>
                        {allProjects.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                      <p className="text-[10px] text-gray-400 mt-1">誤って別案件に紐付けた場合はここで変更できます</p>
                    </div>
                    <div className="md:col-span-2">
                      <label className="text-xs text-gray-500 block mb-1 font-medium">役割</label>
                      <div className="grid grid-cols-3 gap-2">
                        <label className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border-2 cursor-pointer transition ${
                          form.role === "main" ? "border-green-500 bg-green-50" : "border-gray-200 bg-white hover:bg-gray-50"
                        }`}>
                          <input
                            type="radio"
                            name="account-role"
                            checked={form.role === "main"}
                            onChange={() => setForm({ ...form, role: "main" })}
                            className="accent-green-600"
                          />
                          <div>
                            <div className="text-sm font-bold text-gray-800">本番</div>
                            <div className="text-[10px] text-gray-500 leading-tight">通常運用/マスター</div>
                          </div>
                        </label>
                        <label className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border-2 cursor-pointer transition ${
                          form.role === "distribute" ? "border-purple-500 bg-purple-50" : "border-gray-200 bg-white hover:bg-gray-50"
                        }`}>
                          <input
                            type="radio"
                            name="account-role"
                            checked={form.role === "distribute"}
                            onChange={() => setForm({ ...form, role: "distribute" })}
                            className="accent-purple-600"
                          />
                          <div>
                            <div className="text-sm font-bold text-gray-800">分散本番</div>
                            <div className="text-[10px] text-gray-500 leading-tight">main と同じ設定が自動同期</div>
                          </div>
                        </label>
                        <label className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border-2 cursor-pointer transition ${
                          form.role === "standby" ? "border-blue-500 bg-blue-50" : "border-gray-200 bg-white hover:bg-gray-50"
                        }`}>
                          <input
                            type="radio"
                            name="account-role"
                            checked={form.role === "standby"}
                            onChange={() => setForm({ ...form, role: "standby" })}
                            className="accent-blue-600"
                          />
                          <div>
                            <div className="text-sm font-bold text-gray-800">予備</div>
                            <div className="text-[10px] text-gray-500 leading-tight">BAN時に自動昇格</div>
                          </div>
                        </label>
                      </div>
                      <p className="text-[10px] text-gray-400 mt-1">本番がBAN検知されるとサブが自動で本番に昇格します</p>
                      {editingId && (form.role === "standby" || form.role === "distribute") && (() => {
                        const mainInSame = accounts.find(
                          (a) => a.project_id === (form.project_id || null) && a.role === "main" && a.is_active,
                        );
                        const mainName = mainInSame?.account_name ?? "（未設定）";
                        const label = form.role === "distribute" ? "分散本番" : "予備";
                        return (
                          <div className="mt-2 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                            <p className="text-[11px] text-amber-800 leading-relaxed">
                              ⚠ この{label}アカウントは、メインアカウント（<span className="font-bold">{mainName}</span>）から6時間おきに自動同期されます。
                              ここで編集した内容は、次回の同期で上書きされる可能性があります。
                            </p>
                          </div>
                        );
                      })()}
                      {form.role === "distribute" && (
                        <div className="mt-2">
                          <label className="text-xs text-gray-500 block mb-1 font-medium">
                            分散順序 (order_index)
                          </label>
                          <input
                            type="number"
                            min={1}
                            value={form.order_index}
                            onChange={(e) => setForm({ ...form, order_index: Number(e.target.value) || 0 })}
                            className="w-24 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:border-purple-400 focus:outline-none focus:ring-1 focus:ring-purple-400"
                          />
                          <p className="text-[10px] text-gray-400 mt-1">
                            分散登録時の表示順。マスター (main) は 1、分散本番は 2, 3, 4, 5... で指定してください。
                          </p>
                        </div>
                      )}
                    </div>
                    <div className="md:col-span-2">
                      <label className="text-xs text-gray-500 block mb-1 font-medium">
                        挨拶メッセージ（友だち追加時の自動返信）
                      </label>
                      <textarea
                        value={form.greeting_message}
                        onChange={(e) => setForm({ ...form, greeting_message: e.target.value })}
                        rows={4}
                        placeholder="例: {display_name}さん、友だち追加ありがとうございます！..."
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
                      />
                      <p className="text-[10px] text-gray-400 mt-1">
                        LINE Official Account Manager側の挨拶メッセージをOFFにしてください。`{"{display_name}"}`で友だち名に置換されます。
                      </p>
                    </div>
                    <div className="md:col-span-2 border-t border-gray-200 pt-4 mt-2">
                      <h4 className="text-sm font-bold text-gray-800 mb-1">メール送信設定</h4>
                      <p className="text-[11px] text-gray-500 mb-3">
                        メルマガ送信時の From に使われます。未設定だとこのアカウントではメルマガを送信できません。
                        <br />
                        ※ 送信元ドメインは Resend 側で認証済みである必要があります。
                      </p>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs text-gray-500 block mb-1 font-medium">送信元名（表示名）</label>
                          <input
                            type="text"
                            value={form.newsletter_from_name}
                            onChange={(e) => setForm({ ...form, newsletter_from_name: e.target.value })}
                            placeholder="まり公式"
                            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
                          />
                        </div>
                        <div>
                          <label className="text-xs text-gray-500 block mb-1 font-medium">送信元メールアドレス</label>
                          <input
                            type="email"
                            value={form.newsletter_from_email}
                            onChange={(e) => setForm({ ...form, newsletter_from_email: e.target.value })}
                            placeholder="mari@example.com"
                            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
                          />
                        </div>
                      </div>
                      {(form.newsletter_from_email || form.newsletter_from_name) && (
                        <p className="text-[10px] text-gray-500 mt-2">
                          プレビュー: <span className="font-mono text-gray-700">
                            {form.newsletter_from_name
                              ? `"${form.newsletter_from_name}" <${form.newsletter_from_email || "(未入力)"}>`
                              : form.newsletter_from_email || "(未入力)"}
                          </span>
                        </p>
                      )}
                    </div>
                  </div>
                  {saveMsg && (
                    <div className={`mt-4 px-4 py-2.5 rounded-lg text-sm ${saveMsg.ok ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-600 border border-red-200"}`}>
                      {saveMsg.text}
                    </div>
                  )}
                  <div className="flex gap-2 mt-5">
                    <button onClick={saveAccount} disabled={saving} className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition">
                      {saving ? "保存中..." : editingId ? "更新" : "登録"}
                    </button>
                    {editingId && (
                      <button onClick={resetForm} className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg text-sm transition">キャンセル</button>
                    )}
                  </div>
                </div>

                {/* 登録済みアカウント */}
                {accounts.length > 0 && (
                  <div className="bg-white rounded-lg border border-gray-200 overflow-hidden overflow-x-auto">
                    <div className="px-5 py-3 bg-gray-50 border-b border-gray-200">
                      <h3 className="text-sm font-bold text-gray-700">
                        登録済みアカウント
                        <span className="ml-2 text-xs font-normal text-gray-500">
                          （{selectedAccount?.scenario_id ? `${getScenarioNameForAccount(selectedAccount, scenarios)} のみ` : "全シナリオ"}）
                        </span>
                      </h3>
                    </div>
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-200 text-gray-500 text-left bg-gray-50/50">
                          <th className="px-5 py-3 font-medium">アカウント名</th>
                          <th className="px-5 py-3 font-medium">役割</th>
                          <th className="px-5 py-3 font-medium hidden md:table-cell">シナリオ</th>
                          <th className="px-5 py-3 font-medium hidden md:table-cell">チャネルID</th>
                          <th className="px-5 py-3 font-medium hidden md:table-cell">Basic ID</th>
                          <th className="px-5 py-3 font-medium">状態</th>
                          <th className="px-5 py-3 font-medium">操作</th>
                        </tr>
                      </thead>
                      <tbody>
                        {accounts
                          .filter((acc) => !selectedAccount?.scenario_id || (acc.scenario_id ?? null) === selectedAccount.scenario_id)
                          .map((acc) => (
                          <tr key={acc.id} className="border-b border-gray-100 hover:bg-gray-50 transition">
                            <td className="px-5 py-3">
                              <div className="flex items-center gap-2">
                                <div className="w-7 h-7 rounded-full bg-[#06C755] flex items-center justify-center flex-shrink-0">
                                  <span className="text-white text-xs font-bold">L</span>
                                </div>
                                <span className="font-medium text-gray-800">{acc.account_name ?? "未設定"}</span>
                              </div>
                            </td>
                            <td className="px-5 py-3">
                              <button
                                onClick={() => toggleAccountRole(acc)}
                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold transition hover:opacity-80 ${
                                  acc.role === "main"
                                    ? "bg-green-100 text-green-700 border border-green-300"
                                    : acc.role === "distribute"
                                      ? "bg-purple-100 text-purple-700 border border-purple-300"
                                      : acc.role === "standby"
                                        ? "bg-blue-100 text-blue-700 border border-blue-300"
                                        : acc.role === "banned"
                                          ? "bg-red-100 text-red-700 border border-red-300"
                                          : "bg-gray-100 text-gray-500 border border-gray-200"
                                }`}
                                title={acc.role === "distribute" ? "分散本番は編集フォームから変更" : "クリックで本番⇔サブ切替"}
                              >
                                {acc.role === "main" && "● 本番"}
                                {acc.role === "distribute" && `◎ 分散${acc.order_index ? acc.order_index : ""}`}
                                {acc.role === "standby" && "◌ サブ"}
                                {acc.role === "banned" && "✕ BAN"}
                                {!acc.role && "未設定"}
                              </button>
                            </td>
                            <td className="px-5 py-3 text-gray-500 hidden md:table-cell">{getScenarioNameForAccount(acc, scenarios)}</td>
                            <td className="px-5 py-3 font-mono text-gray-500 hidden md:table-cell">{acc.channel_id}</td>
                            <td className="px-5 py-3 text-gray-500 hidden md:table-cell">{acc.basic_id ? `@${acc.basic_id}` : "未設定"}</td>
                            <td className="px-5 py-3">
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${acc.is_active ? "bg-green-100 text-green-600" : "bg-gray-100 text-gray-400"}`}>
                                {acc.is_active ? "有効" : "無効"}
                              </span>
                            </td>
                            <td className="px-5 py-3">
                              <div className="flex items-center gap-2">
                                <button onClick={() => startEdit(acc)} className="text-blue-600 hover:text-blue-800 text-xs font-medium">編集</button>
                                <button
                                  onClick={async () => {
                                    try {
                                      const res = await fetch("/api/line/health-check", {
                                        method: "POST",
                                        headers: { "Content-Type": "application/json" },
                                        body: JSON.stringify({ account_id: acc.id }),
                                      });
                                      const data = await res.json();
                                      if (data.ok) {
                                        alert(`✓ 接続OK\nBot名: ${data.displayName ?? "-"}\nBasic ID: ${data.basicId ?? "-"}`);
                                      } else {
                                        alert(`✕ 接続失敗 (HTTP ${data.status})\n${data.detail ?? ""}\n\n${data.hint ?? ""}`);
                                      }
                                    } catch (e) {
                                      alert(`接続テストエラー: ${(e as Error).message}`);
                                    }
                                  }}
                                  className="text-purple-600 hover:text-purple-800 text-xs font-medium"
                                >
                                  接続テスト
                                </button>
                                <button
                                  onClick={() => detachAccountFromProject(acc)}
                                  className="text-orange-600 hover:text-orange-800 text-xs font-medium"
                                >
                                  案件から外す
                                </button>
                                <button
                                  onClick={() => deleteAccountHard(acc)}
                                  className="text-red-500 hover:text-red-700 text-xs font-medium"
                                >
                                  削除
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Lpro同期ログ */}
                <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                  <div className="px-5 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                    <h3 className="text-sm font-bold text-gray-700">Lpro 同期ログ</h3>
                    <button
                      onClick={async () => {
                        try {
                          const res = await fetch("/api/line/lpro-sync");
                          if (res.ok) {
                            const logs = await res.json();
                            setSyncLogs(logs);
                          }
                        } catch { /* */ }
                      }}
                      className="text-xs text-blue-600 hover:text-blue-800"
                    >
                      更新
                    </button>
                  </div>
                  {syncLogs.length === 0 ? (
                    <div className="px-5 py-6 text-center text-gray-400 text-sm">同期ログがありません</div>
                  ) : (
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-gray-200 text-gray-500 text-left bg-gray-50/50">
                          <th className="px-4 py-2 font-medium">日時</th>
                          <th className="px-4 py-2 font-medium">件数</th>
                          <th className="px-4 py-2 font-medium">更新</th>
                          <th className="px-4 py-2 font-medium">新規</th>
                          <th className="px-4 py-2 font-medium">スキップ</th>
                          <th className="px-4 py-2 font-medium">エラー</th>
                          <th className="px-4 py-2 font-medium hidden md:table-cell">所要時間</th>
                        </tr>
                      </thead>
                      <tbody>
                        {syncLogs.slice(0, 10).map((log) => (
                          <tr key={log.id} className="border-b border-gray-100 last:border-b-0">
                            <td className="px-4 py-2 text-gray-700">{new Date(log.synced_at).toLocaleString("ja-JP")}</td>
                            <td className="px-4 py-2 text-gray-700">{log.total_rows}</td>
                            <td className="px-4 py-2 text-blue-600">{log.updated_count}</td>
                            <td className="px-4 py-2 text-green-600">{log.created_count}</td>
                            <td className="px-4 py-2 text-gray-400">{log.skipped_count}</td>
                            <td className="px-4 py-2 text-red-500">{log.error_count}</td>
                            <td className="px-4 py-2 text-gray-400 hidden md:table-cell">{(log.duration_ms / 1000).toFixed(1)}s</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            </main>
          </>
        )}
      </div>

      {/* ユーザー詳細モーダル */}
      {showUserDetail && userDetailTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
              <h3 className="font-bold text-gray-800">ユーザー情報</h3>
              <button onClick={() => setShowUserDetail(false)} className="text-gray-400 hover:text-gray-600">{Icons.close}</button>
            </div>
            <div className="p-5 space-y-4">
              {/* プロフィール */}
              <div className="flex items-center gap-3">
                {userDetailTarget.picture_url ? (
                  <img src={userDetailTarget.picture_url} alt="" className="w-16 h-16 rounded-full object-cover" />
                ) : (
                  <div className="w-16 h-16 rounded-full bg-gray-200 flex items-center justify-center text-gray-400">{Icons.user}</div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold text-gray-800 truncate">{userDetailTarget.display_name ?? "名前なし"}</div>
                  <div className="text-[10px] text-gray-400 font-mono truncate">{userDetailTarget.line_user_id}</div>
                  <div className="mt-1"><StatusBadge status={userDetailTarget.status} /></div>
                </div>
              </div>
              {/* 表示名編集 */}
              <div>
                <label className="text-xs text-gray-500 block mb-1 font-medium">表示名</label>
                <input
                  type="text"
                  value={userDetailForm.display_name}
                  onChange={(e) => setUserDetailForm({ ...userDetailForm, display_name: e.target.value })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:border-blue-400 focus:outline-none"
                />
              </div>
              {/* メモ */}
              <div>
                <label className="text-xs text-gray-500 block mb-1 font-medium">メモ</label>
                <textarea
                  value={userDetailForm.memo}
                  onChange={(e) => setUserDetailForm({ ...userDetailForm, memo: e.target.value })}
                  rows={3}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:border-blue-400 focus:outline-none"
                />
              </div>
              {/* テストアカウント */}
              <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={userDetailForm.is_test}
                    onChange={(e) => setUserDetailForm({ ...userDetailForm, is_test: e.target.checked })}
                    className="mt-0.5 accent-purple-600 w-4 h-4"
                  />
                  <div className="flex-1">
                    <div className="text-sm font-medium text-purple-800">テストアカウントに追加</div>
                    <div className="text-[11px] text-purple-600 mt-0.5">配信時にテスト送信先として選択できるようになります</div>
                  </div>
                </label>
              </div>
              {/* 削除 */}
              <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <div className="text-sm font-medium text-red-800">この友だちを削除</div>
                    <div className="text-[11px] text-red-600 mt-0.5">友だち情報とメッセージ履歴を完全に削除します（元に戻せません）</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => deleteFollower(userDetailTarget.id, userDetailTarget.display_name ?? userDetailTarget.line_user_id.slice(0, 10))}
                    className="px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white text-xs font-medium rounded-md transition flex-shrink-0"
                  >
                    削除
                  </button>
                </div>
              </div>
              {/* 友だち追加日 */}
              <div className="text-xs text-gray-500">
                友だち追加日: {fmtShort(userDetailTarget.followed_at)}
              </div>
              {/* ラベル */}
              {labels.length > 0 && (
                <div>
                  <label className="text-xs text-gray-500 block mb-1 font-medium">ラベル</label>
                  <div className="flex flex-wrap gap-1.5">
                    {labels.map((l) => {
                      const assigned = l.assigned_users.includes(userDetailTarget.line_user_id);
                      return (
                        <button
                          key={l.id}
                          type="button"
                          onClick={() => toggleLabelUser(l.id, userDetailTarget.line_user_id)}
                          className={`px-2 py-1 text-xs rounded-full border transition ${
                            assigned ? "text-white border-transparent" : "text-gray-600 border-gray-200 hover:bg-gray-50"
                          }`}
                          style={assigned ? { backgroundColor: l.color } : {}}
                        >
                          {l.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
            <div className="flex justify-between gap-2 px-5 py-4 border-t border-gray-200">
              <button
                onClick={() => { setAccountSubView("chat"); openChat(userDetailTarget); setShowUserDetail(false); }}
                className="px-4 py-2 text-sm text-[#06C755] border border-[#06C755] rounded-lg hover:bg-green-50 transition"
              >
                チャットを開く
              </button>
              <div className="flex gap-2">
                <button onClick={() => setShowUserDetail(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition">キャンセル</button>
                <button
                  onClick={async () => {
                    try {
                      const res = await fetch("/api/line/followers", {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          id: userDetailTarget.id,
                          display_name: userDetailForm.display_name.trim() || null,
                          memo: userDetailForm.memo,
                          is_test: userDetailForm.is_test,
                        }),
                      });
                      if (res.ok) {
                        setFollowers((prev) =>
                          prev.map((f) =>
                            f.id === userDetailTarget.id
                              ? { ...f, display_name: userDetailForm.display_name.trim() || null, memo: userDetailForm.memo, is_test: userDetailForm.is_test }
                              : f,
                          ),
                        );
                        await fetchTestFollowers();
                        setShowUserDetail(false);
                      } else {
                        const data = await res.json().catch(() => ({}));
                        alert(`保存失敗: ${data.error ?? res.status}`);
                      }
                    } catch (e) {
                      alert(`保存エラー: ${(e as Error).message}`);
                    }
                  }}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition"
                >
                  保存
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 友だち詳細モーダル（チャット画面から閲覧） */}
      {showFriendDetailModal && selectedUser && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 sticky top-0 bg-white z-10">
              <h3 className="font-bold text-gray-800">友だち詳細</h3>
              <button onClick={() => setShowFriendDetailModal(false)} className="text-gray-400 hover:text-gray-600">{Icons.close}</button>
            </div>
            <div className="p-5 space-y-5">
              {/* プロフィール */}
              <div className="flex items-center gap-3">
                {selectedUser.picture_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={selectedUser.picture_url} alt="" className="w-16 h-16 rounded-full object-cover" />
                ) : (
                  <div className="w-16 h-16 rounded-full bg-gray-200 flex items-center justify-center text-gray-400">{Icons.user}</div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold text-gray-800 truncate">{selectedUser.display_name ?? "名前なし"}</div>
                  <div className="text-[10px] text-gray-400 font-mono truncate">{selectedUser.line_user_id}</div>
                  <div className="mt-1"><StatusBadge status={selectedUser.status} /></div>
                </div>
              </div>

              {/* 基本情報 */}
              <div className="bg-gray-50 rounded-lg p-3 space-y-1.5">
                <div className="flex justify-between text-xs"><span className="text-gray-500">友だち追加日</span><span className="text-gray-700">{fmtShort(selectedUser.followed_at)}</span></div>
                <div className="flex justify-between text-xs"><span className="text-gray-500">登録日</span><span className="text-gray-700">{fmtShort(selectedUser.created_at)}</span></div>
                <div className="flex justify-between text-xs"><span className="text-gray-500">流入経路</span><span className="text-gray-700">{friendInflowRouteName ?? "未紐付け"}</span></div>
              </div>

              {/* ラベル */}
              <div>
                <h4 className="text-xs font-bold text-gray-600 mb-2">付与ラベル</h4>
                <div className="flex flex-wrap gap-1.5">
                  {labels.filter((l) => l.assigned_users.includes(selectedUser.line_user_id)).length === 0 ? (
                    <span className="text-xs text-gray-400">なし</span>
                  ) : (
                    labels
                      .filter((l) => l.assigned_users.includes(selectedUser.line_user_id))
                      .map((l) => (
                        <span key={l.id} className="px-2 py-1 text-xs rounded-full text-white" style={{ backgroundColor: l.color }}>
                          {l.name}
                        </span>
                      ))
                  )}
                </div>
              </div>

              {/* 独自置き換え文字値 */}
              <div>
                <h4 className="text-xs font-bold text-gray-600 mb-2">独自置き換え文字</h4>
                {friendCustomValues.length === 0 ? (
                  <div className="text-xs text-gray-400">値が登録されていません</div>
                ) : (
                  <div className="border border-gray-200 rounded-lg overflow-hidden">
                    <table className="w-full text-xs">
                      <tbody>
                        {friendCustomValues.map((v) => (
                          <tr key={v.field_id} className="border-b border-gray-100 last:border-b-0">
                            <td className="px-3 py-2 text-gray-500 bg-gray-50 w-1/3">
                              <div className="font-medium">{v.field_label || v.field_key}</div>
                              <div className="text-[10px] font-mono text-gray-400">{`{field:${v.field_key}}`}</div>
                            </td>
                            <td className="px-3 py-2 text-gray-800 break-all">{v.value || <span className="text-gray-300">―</span>}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* 送信履歴（最新20件 - チャットに表示されているもの） */}
              <div>
                <h4 className="text-xs font-bold text-gray-600 mb-2">送信履歴（最新20件）</h4>
                {messages.length === 0 ? (
                  <div className="text-xs text-gray-400">履歴がありません</div>
                ) : (
                  <div className="border border-gray-200 rounded-lg max-h-60 overflow-y-auto">
                    {messages.slice(-20).reverse().map((m) => (
                      <div key={m.id} className="px-3 py-2 border-b border-gray-100 last:border-b-0 text-xs">
                        <div className="flex items-center justify-between mb-0.5">
                          <span className={`font-medium ${m.direction === "outgoing" ? "text-blue-600" : "text-gray-700"}`}>
                            {m.direction === "outgoing" ? "→ 送信" : "← 受信"}
                          </span>
                          <span className="text-gray-400">{fmtShort(m.sent_at)}</span>
                        </div>
                        <div className="text-gray-700 break-all line-clamp-2">
                          {m.message_type === "sticker" ? "[スタンプ]"
                            : m.message_type === "image" ? "[画像]"
                            : m.message_type === "video" ? "[動画]"
                            : m.message_type === "audio" ? "[音声]"
                            : m.message_type === "location" ? "[位置情報]"
                            : m.message_text || `[${m.message_type}]`}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-200 sticky bottom-0 bg-white">
              <button onClick={() => setShowFriendDetailModal(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition">閉じる</button>
            </div>
          </div>
        </div>
      )}

      {/* 対象者確認モーダル */}
      {audiencePreview.open && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
              <h3 className="font-bold text-gray-800 text-sm">対象者確認</h3>
              <button
                onClick={() => setAudiencePreview((s) => ({ ...s, open: false }))}
                className="text-gray-400 hover:text-gray-600"
              >
                {Icons.close}
              </button>
            </div>
            <div className="p-5 space-y-4">
              {audiencePreview.loading ? (
                <div className="text-center text-sm text-gray-500 py-8">集計中...</div>
              ) : audiencePreview.error ? (
                <div className="text-sm text-red-600">エラー: {audiencePreview.error}</div>
              ) : (
                <>
                  <div className="bg-gray-50 rounded-lg p-4 text-center">
                    <div className="text-[11px] text-gray-500">対象人数</div>
                    <div className="text-2xl font-bold text-gray-800 mt-1">
                      {audiencePreview.matched}
                      <span className="text-sm text-gray-400 font-normal ml-1">/ {audiencePreview.total} 人</span>
                    </div>
                  </div>
                  {audiencePreview.unsupported.length > 0 && (
                    <div className="bg-yellow-50 border border-yellow-200 rounded-md p-3 text-[11px] text-yellow-800">
                      <div className="font-bold mb-1">※ 以下のフィールドは未対応のためフィルタに反映されていません:</div>
                      <div>{audiencePreview.unsupported.join(", ")}</div>
                    </div>
                  )}
                  {audiencePreview.sample.length > 0 && (
                    <div>
                      <div className="text-[11px] text-gray-500 mb-2">サンプル（最大20名）</div>
                      <div className="space-y-1 max-h-60 overflow-y-auto">
                        {audiencePreview.sample.map((s) => (
                          <div key={s.id} className="flex items-center justify-between text-xs border border-gray-100 rounded px-2 py-1.5">
                            <span className="truncate">{s.display_name ?? "(名前なし)"}</span>
                            <span className="text-gray-400 font-mono text-[10px] truncate ml-2">{s.line_user_id.slice(0, 12)}...</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {audiencePreview.matched === 0 && !audiencePreview.error && (
                    <div className="text-[11px] text-gray-500 text-center">条件に一致する登録者がいません。</div>
                  )}
                </>
              )}
              <div className="flex justify-end">
                <button
                  onClick={() => setAudiencePreview((s) => ({ ...s, open: false }))}
                  className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 text-sm rounded-lg"
                >
                  閉じる
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SMS送信・チャージモーダル */}
      {showSmsModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
              <h3 className="font-bold text-gray-800">SMS送信</h3>
              <button onClick={() => setShowSmsModal(false)} className="text-gray-400 hover:text-gray-600">{Icons.close}</button>
            </div>
            <div className="p-5 space-y-4">
              {/* クレジット残高 */}
              <div className="bg-orange-50 border border-orange-200 rounded-lg px-4 py-3 flex items-center justify-between">
                <div>
                  <span className="text-xs text-orange-600 font-medium">SMSクレジット残高</span>
                  <div className="text-2xl font-bold text-orange-700">{smsBalance} <span className="text-sm font-normal">通</span></div>
                  <span className="text-[10px] text-orange-500">1通 = 5.5円（70文字まで）</span>
                </div>
                <div className="flex items-center gap-2">
                  <select value={smsChargeAmount} onChange={(e) => setSmsChargeAmount(Number(e.target.value))} className="border border-orange-300 rounded px-2 py-1 text-xs">
                    <option value={100}>100通</option>
                    <option value={500}>500通</option>
                    <option value={1000}>1000通</option>
                    <option value={5000}>5000通</option>
                  </select>
                  <button
                    onClick={async () => {
                      if (!project?.id) return;
                      if (!confirm(`${smsChargeAmount}クレジットをチャージしますか？\n（${(smsChargeAmount * 5.5).toLocaleString()}円相当）`)) return;
                      const res = await fetch("/api/line/sms", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ project_id: project.id, action: "charge", amount: smsChargeAmount }),
                      });
                      if (res.ok) {
                        const data = await res.json();
                        setSmsBalance(data.balance);
                        alert("チャージ完了");
                      }
                    }}
                    className="px-3 py-1.5 bg-orange-500 hover:bg-orange-600 text-white text-xs font-medium rounded-md transition"
                  >
                    チャージ
                  </button>
                </div>
              </div>

              {/* SMS送信フォーム */}
              <div>
                <label className="text-xs text-gray-500 block mb-1 font-medium">送信先電話番号 <span className="text-red-500">*</span></label>
                <input
                  type="tel"
                  value={smsForm.phone_number}
                  onChange={(e) => setSmsForm({ ...smsForm, phone_number: e.target.value })}
                  placeholder="09012345678"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1 font-medium">メッセージ（最大330文字）</label>
                <textarea
                  value={smsForm.message_text}
                  onChange={(e) => setSmsForm({ ...smsForm, message_text: e.target.value.slice(0, 330) })}
                  rows={4}
                  maxLength={330}
                  placeholder="SMSメッセージを入力..."
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
                />
                <div className="flex justify-between text-[10px] text-gray-400 mt-1">
                  <span>{smsForm.message_text.length}/330文字</span>
                  <span>消費: {smsForm.message_text.length <= 70 ? 1 : 1 + Math.ceil((smsForm.message_text.length - 70) / 66)}通</span>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-200">
              <button onClick={() => setShowSmsModal(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition">閉じる</button>
              <button
                onClick={async () => {
                  if (!smsForm.phone_number.trim() || !smsForm.message_text.trim()) { alert("電話番号とメッセージを入力してください"); return; }
                  if (!selectedAccount || !project?.id) return;
                  const res = await fetch("/api/line/sms", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      project_id: project.id,
                      account_id: selectedAccount.id,
                      action: "send",
                      phone_number: smsForm.phone_number.trim(),
                      message_text: smsForm.message_text.trim(),
                    }),
                  });
                  const data = await res.json();
                  if (res.ok) {
                    setSmsBalance(data.balance);
                    setSmsForm({ phone_number: "", message_text: "" });
                    alert(`SMS送信完了（${data.credits_used}通消費）`);
                  } else {
                    alert(data.error ?? "送信失敗");
                  }
                }}
                disabled={smsBalance <= 0}
                className="px-5 py-2 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition"
              >
                送信
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 通知音用audio要素 */}
      <audio ref={audioRef} src="/sounds/notification.wav" preload="auto" />
    </div>
  );
}

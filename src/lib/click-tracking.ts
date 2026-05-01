// ============================================================
// 段階5 §16-9: 配信メッセージ URL クリック計測ユーティリティ
// ============================================================
// 役割:
//   - 送信時に配信メッセージ内 URL を中継 URL (/line/click/{token}) に書き換え、
//     発行した click_token を line_message_click_tokens に保存するための関数群。
//   - クリック実績(line_message_clicks への INSERT)は中継エンドポイント
//     (src/app/line/click/[token]/route.ts) 側で行う。
//
// 方式 A(別テーブル方式)採用前提。
//
// 既存パターン参照:
//   - src/lib/line.ts:245-251(siteUrl 解決ロジック、本ファイル resolveSiteUrl と同一動作)
//   - src/app/line/r/[project_code]/[inflow_code]/route.ts(中継 + クリック記録)
//
// フォールバック原則:
//   計測機能の不調が配信機能を止めないこと。
//   - persistTokens 失敗時は throw せず ok:false を返す(呼び出し側は計測諦めて送信続行可)
//   - rewriteUrlsInMessage は入力を破壊しない(deep clone)
// ============================================================

import { randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

// ------------------------------------------------------------
// 公開型
// ------------------------------------------------------------

/**
 * URL 書き換え時に発行する token に紐付ける送信文脈。
 *
 * - broadcast_sequence_id / step_message_id は line_message_click_tokens 側 NOT NULL FK のため必須。
 * - 残りは NULLABLE。送信経路(予約配信 / ステップ配信 / アクションルール)で取得可能なものを埋める。
 */
export interface ClickContext {
  broadcast_sequence_id: string;
  step_message_id: string;
  step_enrollment_id: string | null;
  scenario_id: string | null;
  project_id: string | null;
  follower_id: string | null;
  line_user_id: string | null;
}

/**
 * 1 件の URL 書き換えで発行された token 1 行分(line_message_click_tokens に INSERT する内容)。
 *
 * - created_at / expires_at は DB DEFAULT 任せ(expires_at は当面 NULL 固定運用)
 */
export interface IssuedToken extends ClickContext {
  token: string;
  url_index: number;
  original_url: string;
}

// ------------------------------------------------------------
// siteUrl 解決
// ------------------------------------------------------------

/**
 * 中継 URL のオリジン解決(末尾スラッシュなし)。
 *
 * src/lib/line.ts:245-251 の siteUrl 解決ロジックと同一動作:
 *   NEXT_PUBLIC_SITE_URL → VERCEL_PROJECT_PRODUCTION_URL → VERCEL_URL の順。
 *   NEXT_PUBLIC_SITE_URL はスキーム込みで設定されている前提でそのまま使う。
 *   VERCEL_* はホスト名のみのため `https://` を前置する。
 *   いずれも未設定なら空文字を返す(中継 URL を作れないので呼び出し側は計測諦め判断可)。
 */
export function resolveSiteUrl(): string {
  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ??
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : "");
  return siteUrl.replace(/\/$/, "");
}

function buildRelayUrl(token: string): string {
  return `${resolveSiteUrl()}/line/click/${token}`;
}

// ------------------------------------------------------------
// token 生成
// ------------------------------------------------------------

/**
 * クリック token を生成。
 *
 * 16 バイト = 128 bit、URL-safe Base64 で 22 文字。
 * 衝突確率は実質ゼロ(配信件数想定上問題にならない)。
 * line_message_click_tokens.token PRIMARY KEY なので衝突したら INSERT が失敗するが、
 * その場合は計測のみ落として元 URL で送る(呼び出し側のフォールバック責務)。
 */
export function generateClickToken(): string {
  return randomBytes(16)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

// ------------------------------------------------------------
// URL 書き換え
// ------------------------------------------------------------

// ASCII URL のみ抽出。RFC3986 完全準拠ではなく、実運用での誤抽出が少ない保守的な式。
const URL_RE = /https?:\/\/[A-Za-z0-9\-._~:/?#\[\]@!$&'()*+,;=%]+/g;

// 末尾の句読点・括弧などを URL から外す。
// 確定リスト:. , ! ? ) 」 】 、 。
const TRIM_TRAILING = /[.,!?)」】、。]+$/;

function trimTrailingPunctuation(url: string): string {
  return url.replace(TRIM_TRAILING, "");
}

interface RewriteState {
  ctx: ClickContext;
  tokens: IssuedToken[];
  nextIndex: number;
}

function issueToken(state: RewriteState, originalUrl: string): string {
  const token = generateClickToken();
  state.tokens.push({
    ...state.ctx,
    token,
    url_index: state.nextIndex++,
    original_url: originalUrl,
  });
  return buildRelayUrl(token);
}

function rewriteTextField(state: RewriteState, text: string): string {
  return text.replace(URL_RE, (match) => {
    const trimmed = trimTrailingPunctuation(match);
    if (!trimmed) return match;
    const replaced = issueToken(state, trimmed);
    // 末尾句読点が落ちていたらそれを残す(例:「URL.」→「中継URL.」)
    const tail = match.slice(trimmed.length);
    return `${replaced}${tail}`;
  });
}

function rewriteUriActions(
  state: RewriteState,
  actions: unknown,
): void {
  if (!Array.isArray(actions)) return;
  for (const a of actions) {
    if (
      a &&
      typeof a === "object" &&
      (a as Record<string, unknown>).type === "uri" &&
      typeof (a as Record<string, unknown>).uri === "string"
    ) {
      const obj = a as Record<string, unknown>;
      obj.uri = issueToken(state, obj.uri as string);
    }
  }
}

function rewriteOne(state: RewriteState, msg: Record<string, unknown>): void {
  const type = msg.type as string | undefined;

  // text: 本文中の URL を書き換え
  if (type === "text" && typeof msg.text === "string") {
    msg.text = rewriteTextField(state, msg.text);
    return;
  }

  // template: buttons / carousel の uri アクションのみ書き換え
  if (type === "template" && msg.template && typeof msg.template === "object") {
    const tpl = msg.template as Record<string, unknown>;
    const tplType = tpl.type as string | undefined;
    if (tplType === "buttons") {
      rewriteUriActions(state, tpl.actions);
      return;
    }
    if (tplType === "carousel") {
      const cols = tpl.columns;
      if (Array.isArray(cols)) {
        for (const col of cols) {
          if (col && typeof col === "object") {
            rewriteUriActions(state, (col as Record<string, unknown>).actions);
          }
        }
      }
      return;
    }
  }

  // image / imagemap / video / audio / sticker などは触らない
  // (既存 imagemap 中継経路を維持)
}

/**
 * 1 メッセージ分の URL を中継 URL に書き換え + 発行 token を蓄積。
 *
 * - 入力 built は破壊しない(JSON deep clone)
 * - 戻り値の tokens は呼び出し側で persistTokens に渡して DB に保存する
 */
export function rewriteUrlsInMessage(
  built: Record<string, unknown>,
  ctx: ClickContext,
): { message: Record<string, unknown>; tokens: IssuedToken[] } {
  const cloned = JSON.parse(JSON.stringify(built)) as Record<string, unknown>;
  const state: RewriteState = { ctx, tokens: [], nextIndex: 0 };
  rewriteOne(state, cloned);
  return { message: cloned, tokens: state.tokens };
}

/**
 * 複数メッセージの一括書き換え。
 *
 * - url_index はメッセージをまたいで通し番号(0 から)
 * - 各メッセージは deep clone され、入力配列・要素は破壊しない
 */
export function rewriteUrlsInMessages(
  builts: Array<Record<string, unknown>>,
  ctx: ClickContext,
): { messages: Array<Record<string, unknown>>; tokens: IssuedToken[] } {
  const state: RewriteState = { ctx, tokens: [], nextIndex: 0 };
  const messages = builts.map((b) => {
    const cloned = JSON.parse(JSON.stringify(b)) as Record<string, unknown>;
    rewriteOne(state, cloned);
    return cloned;
  });
  return { messages, tokens: state.tokens };
}

// ------------------------------------------------------------
// DB 永続化
// ------------------------------------------------------------

/**
 * 発行 tokens を line_message_click_tokens に一括 INSERT。
 *
 * - tokens.length === 0 なら何もせず ok: true
 * - エラー時は console.error してから ok: false を返す(throw しない)
 *   呼び出し側の責務:ok: false でも送信は元 URL で続行可能(計測のみロス)
 * - created_at / expires_at は DB DEFAULT 任せ
 */
export async function persistTokens(
  client: SupabaseClient,
  tokens: IssuedToken[],
): Promise<{ ok: boolean; error?: string }> {
  if (tokens.length === 0) return { ok: true };

  const rows = tokens.map((t) => ({
    token: t.token,
    broadcast_sequence_id: t.broadcast_sequence_id,
    step_message_id: t.step_message_id,
    step_enrollment_id: t.step_enrollment_id,
    scenario_id: t.scenario_id,
    project_id: t.project_id,
    follower_id: t.follower_id,
    line_user_id: t.line_user_id,
    url_index: t.url_index,
    original_url: t.original_url,
  }));

  const { error } = await client.from("line_message_click_tokens").insert(rows);
  if (error) {
    console.error(
      "[click-tracking] persistTokens insert failed:",
      error.message,
    );
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

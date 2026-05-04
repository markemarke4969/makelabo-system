import { supabase } from "@/lib/supabase";

// ============================================================
// 段階6 共通ヘルパー: scenario_id 主軸クエリ + account_id fallback
// ============================================================
// 段階5(2026-05-01 完了)で DB は scenario_id 主軸に移行。段階6 で各 LINE
// API ルートに `?scenario_id=X` クエリを追加する際、ここのヘルパーを使うことで
// 「scenario_id 列なし環境(Step 02 未適用)」「scenario_id 解決失敗」のフォール
// バックを一元化できる。
//
// 参照: src/app/api/line/step-sequences/route.ts L9-28(同等パターンの先行実装)
// ============================================================

/**
 * line_accounts.scenario_id を引いて scenario_id を解決。
 * - account 不在 / scenario_id 列なし(Step 02 未適用)/ scenario_id NULL → null を返す
 * - 列なしエラーは columnMissing=true で呼び出し側に通知し、account_id fallback に切り替えさせる
 */
export async function resolveScenarioFromAccount(
  accountId: string,
): Promise<{ scenario_id: string | null; columnMissing: boolean }> {
  const r = await supabase
    .from("line_accounts")
    .select("scenario_id")
    .eq("id", accountId)
    .maybeSingle();
  if (r.error) {
    if (/scenario_id/i.test(r.error.message)) {
      return { scenario_id: null, columnMissing: true };
    }
    return { scenario_id: null, columnMissing: false };
  }
  return {
    scenario_id: ((r.data?.scenario_id as string | null) ?? null),
    columnMissing: false,
  };
}

/**
 * 段階8-2-E-4: scenario 配下統合配信用ヘルパー。
 *
 * scenario_id 配下の有効な account_ids + 各 account の channel_access_token を一括取得。
 * 予約配信(broadcast)/ 掘り起こし配信(reengagement)で「scenario 配下の main + standby に
 * 一括送信」する用途。banned / is_active=false は除外。
 *
 * 戻り値:
 *   - accountIds: 対象 account の id 配列(line_followers の IN 句に使う)
 *   - tokenMap:   account_id → channel_access_token の Map
 *                 follower.line_account_id ごとに対応 token を引いて pushLineMessages 呼出
 *   - columnMissing: scenario_id 列なし環境(Step 02 未適用)時 true、空配列で返却
 *
 * 設計判断(D-2):role IN ('main', 'standby') AND is_active=true で絞る。
 * - main:scenario の代表アカウント
 * - standby:本番運用で friend を保持しているケースあり(MARI 構成参照)
 * - distribute:LIFF 経由の登録分散用、配信対象外として現状除外(必要に応じて呼出側で追加)
 * - banned:配信対象外
 */
export async function resolveScenarioAccountsWithTokens(
  scenarioId: string,
): Promise<{ accountIds: string[]; tokenMap: Map<string, string>; columnMissing: boolean }> {
  const r = await supabase
    .from("line_accounts")
    .select("id, channel_access_token")
    .eq("scenario_id", scenarioId)
    .in("role", ["main", "standby"])
    .eq("is_active", true);
  if (r.error) {
    if (/scenario_id/i.test(r.error.message)) {
      return { accountIds: [], tokenMap: new Map(), columnMissing: true };
    }
    return { accountIds: [], tokenMap: new Map(), columnMissing: false };
  }
  const rows = ((r.data ?? []) as Array<{ id: string; channel_access_token: string | null }>);
  const accountIds: string[] = [];
  const tokenMap = new Map<string, string>();
  for (const a of rows) {
    if (!a.channel_access_token) continue; // token なし account は配信対象外
    accountIds.push(a.id);
    tokenMap.set(a.id, a.channel_access_token);
  }
  return { accountIds, tokenMap, columnMissing: false };
}

/**
 * scenario_id 配下の全 line_accounts.id を返す。
 * - scenario_id NULL の account も含めたい場合は呼び出し側で別途処理(現状は対応外)
 * - scenario_id 列なし(Step 02 未適用)→ 空配列 + columnMissing=true
 * - 配下 0 件 → 空配列 + columnMissing=false
 *
 * 段階6c1: options.roles で role 絞り込み(リッチメニュー一括 deploy 用途で main+distribute を指定)。
 * 既存呼出(reminders / labels 等)は roles 未指定で従来通り全件取得(後方互換)。
 */
export async function resolveAccountIdsFromScenario(
  scenarioId: string,
  options?: { roles?: ("main" | "distribute" | "standby" | "banned")[] },
): Promise<{ account_ids: string[]; columnMissing: boolean }> {
  let query = supabase
    .from("line_accounts")
    .select("id")
    .eq("scenario_id", scenarioId);
  if (options?.roles && options.roles.length > 0) {
    query = query.in("role", options.roles);
  }
  const r = await query;
  if (r.error) {
    if (/scenario_id/i.test(r.error.message)) {
      return { account_ids: [], columnMissing: true };
    }
    return { account_ids: [], columnMissing: false };
  }
  const ids = ((r.data ?? []) as Array<{ id: string }>).map((a) => a.id);
  return { account_ids: ids, columnMissing: false };
}

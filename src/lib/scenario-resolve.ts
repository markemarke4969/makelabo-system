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
 * scenario_id 配下の全 line_accounts.id を返す。
 * - scenario_id NULL の account も含めたい場合は呼び出し側で別途処理(現状は対応外)
 * - scenario_id 列なし(Step 02 未適用)→ 空配列 + columnMissing=true
 * - 配下 0 件 → 空配列 + columnMissing=false
 */
export async function resolveAccountIdsFromScenario(
  scenarioId: string,
): Promise<{ account_ids: string[]; columnMissing: boolean }> {
  const r = await supabase
    .from("line_accounts")
    .select("id")
    .eq("scenario_id", scenarioId);
  if (r.error) {
    if (/scenario_id/i.test(r.error.message)) {
      return { account_ids: [], columnMissing: true };
    }
    return { account_ids: [], columnMissing: false };
  }
  const ids = ((r.data ?? []) as Array<{ id: string }>).map((a) => a.id);
  return { account_ids: ids, columnMissing: false };
}

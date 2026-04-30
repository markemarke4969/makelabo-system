import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";
import { createClient as createServerSupabase } from "@/lib/supabase-server";
import { syncOneStandby, type AccountRow, type SyncAccountResult } from "@/lib/account-sync";
import { notifyChatwork } from "@/lib/chatwork";

export const maxDuration = 300;

// ============================================================
// メイン → 予備 自動同期 cron(段階5 案B 対応・後方互換維持)
// ============================================================
// 6時間ごとに cron-job.org 等から叩かれる。加えてダッシュボードの
// 「今すぐ同期」ボタンからログイン済み管理者も実行できる。
//
// 認可パス (いずれか満たせば通過):
//   A. Authorization: Bearer $CRON_SECRET  (cron用)
//   B. ?secret=$CRON_SECRET                (cron用)
//   C. Supabase セッション cookie + user_metadata.is_admin === true
//   D. CRON_SECRET が未設定 = 開発環境扱いで全許可
//
// 二重起動防止: line_sync_history.status='running' が存在する場合は拒否。
//
// 同期対象フィルタ(段階5 案B):
//   1. 第一優先: line_scenarios.ban_sync_enabled = true のシナリオを取得し、
//      各シナリオ内で main 1 + distribute/standby を syncOneStandby で同期
//   2. 後方互換: line_scenarios テーブル / scenario_id 列が不在の環境では
//      従来通り line_projects.ban_sync_enabled = true で案件単位の同期に fallback
//   3. デフォルトは false なので、明示的にダッシュボードから ON にした
//      シナリオ(または案件)だけが同期対象になる(セーフティ)
//
// 1 シナリオ(または案件)の失敗で全体を止めない。
//
// 草案出典: C:\Users\lmsml\.claude\plans\07-calm-pudding.md §11(高優先度 5-4)
// ============================================================

async function isAuthorized(request: NextRequest): Promise<boolean> {
  const secret = process.env.CRON_SECRET;

  // A/B: CRON_SECRET 認証
  if (secret) {
    const auth = request.headers.get("authorization") ?? "";
    if (auth === `Bearer ${secret}`) return true;
    const query = request.nextUrl.searchParams.get("secret");
    if (query === secret) return true;
  } else {
    // D: 開発環境等で未設定なら通す
    return true;
  }

  // C: ログイン済み管理者
  try {
    const server = await createServerSupabase();
    const { data: { user } } = await server.auth.getUser();
    if (user) {
      const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
      if (meta.is_admin === true) return true;
    }
  } catch {
    // Cookie 取得失敗・セッションなし等はそのまま拒否
  }

  return false;
}

interface ScenarioFetchResult {
  /** シナリオベースで取得できた場合の行(空配列の可能性あり) */
  scenarios: Array<{ id: string; name: string; code: string | null; project_id: string }> | null;
  /** テーブル不在等で従来パスへ fallback すべきか */
  legacyFallback: boolean;
  error?: string;
}

/**
 * line_scenarios.ban_sync_enabled=true のシナリオを取得。
 * テーブル不在 / 列不在の場合は legacyFallback=true を返す。
 */
async function fetchScenariosForSync(): Promise<ScenarioFetchResult> {
  const r = await supabase
    .from("line_scenarios")
    .select("id, name, code, project_id")
    .eq("ban_sync_enabled", true);
  if (r.error) {
    if (
      /line_scenarios/i.test(r.error.message) ||
      /ban_sync_enabled/i.test(r.error.message) ||
      r.error.code === "PGRST205"
    ) {
      return { scenarios: null, legacyFallback: true };
    }
    return { scenarios: null, legacyFallback: false, error: r.error.message };
  }
  return { scenarios: (r.data ?? []) as ScenarioFetchResult["scenarios"], legacyFallback: false };
}

/**
 * scenario_id でアカウント取得。列不在なら columnMissing=true を返し、呼び出し側で従来パスへ fallback。
 */
async function fetchAccountsByScenario(scenarioId: string): Promise<{
  accounts: AccountRow[] | null;
  columnMissing: boolean;
  error?: string;
}> {
  const r = await supabase
    .from("line_accounts")
    .select("id, account_name, project_id, role, is_active, greeting_message")
    .eq("scenario_id", scenarioId);
  if (r.error) {
    if (/scenario_id/i.test(r.error.message)) {
      return { accounts: null, columnMissing: true };
    }
    return { accounts: null, columnMissing: false, error: r.error.message };
  }
  return { accounts: (r.data ?? []) as AccountRow[], columnMissing: false };
}

export async function GET(request: NextRequest) {
  if (!(await isAuthorized(request))) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  // 二重起動防止: running の履歴があれば拒否
  const { data: running } = await supabase
    .from("line_sync_history")
    .select("id, started_at")
    .eq("status", "running")
    .limit(1);
  if (running && running.length > 0) {
    return Response.json(
      {
        ok: false,
        error: "現在、前回の同期が実行中です。完了まで待機してください。",
        running_since: (running[0] as { started_at: string }).started_at,
      },
      { status: 409 },
    );
  }

  const startedAt = new Date().toISOString();
  const results: SyncAccountResult[] = [];
  const errors: string[] = [];

  // 実行中ロックの代表レコードを作成 (project_id=null, source=target=null)
  const { data: lockRow } = await supabase
    .from("line_sync_history")
    .insert({
      status: "running",
      started_at: startedAt,
      synced_items: { kind: "lock" },
    })
    .select("id")
    .single();
  const lockId = (lockRow?.id as string) ?? null;

  try {
    // ============================================================
    // 段階5 案B: line_scenarios.ban_sync_enabled をまず試みる
    // ============================================================
    const sf = await fetchScenariosForSync();
    if (sf.error) {
      throw new Error(`scenarios fetch: ${sf.error}`);
    }

    let useLegacyProjectLoop = sf.legacyFallback;

    if (!useLegacyProjectLoop && sf.scenarios) {
      // シナリオベースのループ
      for (const scn of sf.scenarios) {
        try {
          const sa = await fetchAccountsByScenario(scn.id);
          if (sa.error) {
            errors.push(`scenario ${scn.name}: accounts fetch: ${sa.error}`);
            continue;
          }
          if (sa.columnMissing) {
            // scenario_id 列が無い(Step 02 未適用)→ 全体を従来パスに切替
            console.warn(
              "[line-sync] scenario_id 列が未作成のため、project_id ベースの従来パスに切替",
            );
            useLegacyProjectLoop = true;
            break;
          }

          const rows = sa.accounts ?? [];
          const main = rows.find((a) => a.role === "main" && a.is_active) ?? null;
          const targets = rows.filter(
            (a) => a.role === "distribute" || a.role === "standby",
          );
          if (!main) {
            errors.push(`scenario ${scn.name}: アクティブなメインなし`);
            continue;
          }
          if (targets.length === 0) {
            continue;
          }

          for (const tg of targets) {
            try {
              const res = await syncOneStandby(supabase, main, tg);
              results.push(res);
              await supabase.from("line_sync_history").insert({
                project_id: scn.project_id,
                source_account_id: main.id,
                target_account_id: tg.id,
                synced_items: res.items,
                status: res.overall,
                started_at: startedAt,
                completed_at: new Date().toISOString(),
              });
            } catch (e) {
              const msg = `scenario=${scn.name} target=${tg.account_name ?? tg.id}(${tg.role}): ${(e as Error).message}`;
              errors.push(msg);
              await supabase.from("line_sync_history").insert({
                project_id: scn.project_id,
                source_account_id: main.id,
                target_account_id: tg.id,
                synced_items: null,
                status: "failed",
                error_message: (e as Error).message,
                started_at: startedAt,
                completed_at: new Date().toISOString(),
              });
            }
          }
        } catch (e) {
          errors.push(`scenario ${scn.name}: ${(e as Error).message}`);
        }
      }
    }

    // ============================================================
    // 後方互換: line_scenarios 不在 / scenario_id 列不在 → 従来 project ループ
    // ============================================================
    if (useLegacyProjectLoop) {
      let projects: Array<{ id: string; name: string; code: string | null }> = [];
      {
        const r = await supabase
          .from("line_projects")
          .select("id, name, code")
          .eq("ban_sync_enabled", true);
        if (r.error && /ban_sync_enabled/.test(r.error.message)) {
          console.warn(
            "[line-sync] ban_sync_enabled カラム未作成 → マイグレーション未適用。安全のため対象ゼロ件で終了します。",
          );
          projects = [];
        } else if (r.error) {
          throw new Error(`projects fetch: ${r.error.message}`);
        } else {
          projects = (r.data ?? []) as Array<{ id: string; name: string; code: string | null }>;
        }
      }

      for (const proj of projects) {
        try {
          // 各プロジェクトの main + standby を取得
          const { data: accs, error: accErr } = await supabase
            .from("line_accounts")
            .select("id, account_name, project_id, role, is_active, greeting_message")
            .eq("project_id", proj.id);
          if (accErr) throw new Error(`accounts fetch: ${accErr.message}`);

          const rows = (accs ?? []) as AccountRow[];
          const main = rows.find((a) => a.role === "main" && a.is_active) ?? null;
          // 分散本番 (distribute) と予備 (standby) の両方を同期対象にする。
          const targets = rows.filter(
            (a) => a.role === "distribute" || a.role === "standby",
          );

          if (!main) {
            errors.push(`project ${proj.name}: アクティブなメインなし`);
            continue;
          }
          if (targets.length === 0) {
            continue;
          }

          for (const tg of targets) {
            try {
              const res = await syncOneStandby(supabase, main, tg);
              results.push(res);
              await supabase.from("line_sync_history").insert({
                project_id: proj.id,
                source_account_id: main.id,
                target_account_id: tg.id,
                synced_items: res.items,
                status: res.overall,
                started_at: startedAt,
                completed_at: new Date().toISOString(),
              });
            } catch (e) {
              const msg = `project=${proj.name} target=${tg.account_name ?? tg.id}(${tg.role}): ${(e as Error).message}`;
              errors.push(msg);
              await supabase.from("line_sync_history").insert({
                project_id: proj.id,
                source_account_id: main.id,
                target_account_id: tg.id,
                synced_items: null,
                status: "failed",
                error_message: (e as Error).message,
                started_at: startedAt,
                completed_at: new Date().toISOString(),
              });
            }
          }
        } catch (e) {
          errors.push(`project ${proj.name}: ${(e as Error).message}`);
        }
      }
    }

    // Chatwork 通知
    const totalAccounts = results.length;
    const successCount = results.filter((r) => r.overall === "success").length;
    const partialCount = results.filter((r) => r.overall === "partial").length;
    const failedCount = results.filter((r) => r.overall === "failed").length;

    let msg = `\n【メイン→予備 同期完了】\n`;
    msg += `対象: ${totalAccounts}件 (成功 ${successCount} / 一部スキップ ${partialCount} / 失敗 ${failedCount})\n`;
    if (errors.length > 0) {
      msg += `\n[エラー]\n${errors.slice(0, 5).join("\n")}\n`;
      if (errors.length > 5) msg += `... 他 ${errors.length - 5}件\n`;
    }
    await notifyChatwork(msg, { toAll: false }).catch(() => { /* 通知失敗は握りつぶす */ });

    // ロックレコードを最終ステータスで閉じる
    if (lockId) {
      const finalStatus = failedCount > 0 ? "partial" : partialCount > 0 ? "partial" : "success";
      await supabase
        .from("line_sync_history")
        .update({
          status: finalStatus,
          completed_at: new Date().toISOString(),
          synced_items: {
            kind: "lock",
            totalAccounts,
            successCount,
            partialCount,
            failedCount,
          },
          error_message: errors.length > 0 ? errors.join("\n") : null,
        })
        .eq("id", lockId);
    }

    return Response.json({
      ok: true,
      total: totalAccounts,
      success: successCount,
      partial: partialCount,
      failed: failedCount,
      errors,
      results,
    });
  } catch (e) {
    // 全体失敗
    if (lockId) {
      await supabase
        .from("line_sync_history")
        .update({
          status: "failed",
          completed_at: new Date().toISOString(),
          error_message: (e as Error).message,
        })
        .eq("id", lockId);
    }
    return Response.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  return GET(request);
}

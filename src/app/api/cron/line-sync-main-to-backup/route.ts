import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";
import { syncOneStandby, type AccountRow, type SyncAccountResult } from "@/lib/account-sync";
import { notifyChatwork } from "@/lib/chatwork";

export const maxDuration = 300;

// ============================================================
// メイン → 予備 自動同期 cron
// ============================================================
// 6時間ごとに cron-job.org 等から叩かれる。
//
// 認証: Authorization: Bearer $CRON_SECRET もしくは ?secret=$CRON_SECRET
// 二重起動防止: line_sync_history.status='running' が存在する場合は拒否。
// 各案件を順次処理し、1 案件の失敗で全体を止めない。
// ============================================================

function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  const auth = request.headers.get("authorization") ?? "";
  if (auth === `Bearer ${secret}`) return true;
  const query = request.nextUrl.searchParams.get("secret");
  return query === secret;
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
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
    // 全プロジェクト
    const { data: projects, error: projErr } = await supabase
      .from("line_projects")
      .select("id, name, code");
    if (projErr) throw new Error(`projects fetch: ${projErr.message}`);

    for (const proj of projects ?? []) {
      try {
        // 各プロジェクトの main + standby を取得
        const { data: accs, error: accErr } = await supabase
          .from("line_accounts")
          .select("id, account_name, project_id, role, is_active, greeting_message")
          .eq("project_id", proj.id);
        if (accErr) throw new Error(`accounts fetch: ${accErr.message}`);

        const rows = (accs ?? []) as AccountRow[];
        const main = rows.find((a) => a.role === "main" && a.is_active) ?? null;
        const standbys = rows.filter((a) => a.role === "standby");

        if (!main) {
          errors.push(`project ${proj.name}: アクティブなメインなし`);
          continue;
        }
        if (standbys.length === 0) {
          continue; // 予備なしは正常系
        }

        for (const sb of standbys) {
          try {
            const res = await syncOneStandby(supabase, main, sb);
            results.push(res);
            await supabase.from("line_sync_history").insert({
              project_id: proj.id,
              source_account_id: main.id,
              target_account_id: sb.id,
              synced_items: res.items,
              status: res.overall,
              started_at: startedAt,
              completed_at: new Date().toISOString(),
            });
          } catch (e) {
            const msg = `project=${proj.name} standby=${sb.account_name ?? sb.id}: ${(e as Error).message}`;
            errors.push(msg);
            await supabase.from("line_sync_history").insert({
              project_id: proj.id,
              source_account_id: main.id,
              target_account_id: sb.id,
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

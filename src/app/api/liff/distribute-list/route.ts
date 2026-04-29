import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

// ============================================================
// 分散登録対象リスト取得 API(振り分け方式・B1 実装 2026-04-28)
// ============================================================
// GET /api/liff/distribute-list?project=<code>&group=<group_name>&user_id=<line_user_id>
//
// 【分散案件 (line_projects.distribute_enabled = true) の場合】
//   - group クエリ必須(未指定なら 400 / error: "group_required")
//   - line_accounts を以下で絞り込み:
//       project_id = ? AND group_name = ?
//       AND role IN ('main','distribute')
//       AND is_active = true
//   - 振り分けロジック(B1):
//       (a) user_id 指定時、既存 follower があればそのアカウントを返却(再振り分けなし)
//       (b) 既存 follower なし or user_id 未指定時、friend 数最少のアカウントを選ぶ
//           同数は order_index 昇順タイブレーカー(main を含む順序)
//   - 振り分けた1件のみを accounts 配列に入れて返却(クライアントは list[0] にリダイレクト)
//
// 【非分散案件 (distribute_enabled = false) の場合】※ MARI 互換維持
//   - 従来通り role='main' の1件のみを返却(group / user_id は無視)
//   - クライアント側の分岐をシンプルにするため distributeEnabled=false 付き
//
// 【スコープ】(2026-04-28 時点)
//   - ウマトクシナリオのみ対象(group_name='ウマトク')
//   - トレサロ・マネーボートは段階5(シナリオ単位 DB 移行)で対応予定
//
// 詳細:設計図05 §3 / 2026-04-28_LINEハーネス_段階3残務整理.md(B1)
// ============================================================

interface AccountRow {
  id: string;
  basic_id: string | null;
  account_name: string | null;
  role: string | null;
  order_index?: number | null;
  is_active: boolean;
  group_name?: string | null;
}

export async function GET(request: NextRequest) {
  const projectCode = request.nextUrl.searchParams.get("project")?.trim();
  const groupName = request.nextUrl.searchParams.get("group")?.trim();
  const lineUserId = request.nextUrl.searchParams.get("user_id")?.trim();

  if (!projectCode) {
    return Response.json({ success: false, error: "project code is required" }, { status: 400 });
  }

  // project 解決 (+ distribute_* も取得、カラム未作成 fallback 付き)
  let project: {
    id: string;
    name: string;
    code: string | null;
    distribute_enabled?: boolean | null;
    distribute_count?: number | null;
  } | null = null;
  {
    const r = await supabaseAdmin
      .from("line_projects")
      .select("id, name, code, distribute_enabled, distribute_count")
      .eq("code", projectCode)
      .maybeSingle();
    if (r.error && /distribute_enabled|distribute_count/.test(r.error.message)) {
      const fb = await supabaseAdmin
        .from("line_projects")
        .select("id, name, code")
        .eq("code", projectCode)
        .maybeSingle();
      if (fb.error) {
        return Response.json({ success: false, error: fb.error.message }, { status: 500 });
      }
      project = fb.data
        ? { ...(fb.data as { id: string; name: string; code: string | null }), distribute_enabled: false, distribute_count: 1 }
        : null;
    } else if (r.error) {
      return Response.json({ success: false, error: r.error.message }, { status: 500 });
    } else {
      project = r.data as typeof project;
    }
  }

  if (!project) {
    return Response.json({ success: false, error: `project not found: ${projectCode}` }, { status: 404 });
  }

  const distributeEnabled = !!project.distribute_enabled;

  // ============================================================
  // 非分散案件: main 1件だけ返す (MARI 互換、従来挙動維持)
  // ============================================================
  if (!distributeEnabled) {
    let accounts: AccountRow[] = [];
    {
      const r = await supabaseAdmin
        .from("line_accounts")
        .select("id, basic_id, account_name, role, order_index, is_active")
        .eq("project_id", project.id)
        .eq("is_active", true);
      if (r.error && /order_index/.test(r.error.message)) {
        const fb = await supabaseAdmin
          .from("line_accounts")
          .select("id, basic_id, account_name, role, is_active")
          .eq("project_id", project.id)
          .eq("is_active", true);
        if (fb.error) {
          return Response.json({ success: false, error: fb.error.message }, { status: 500 });
        }
        accounts = ((fb.data ?? []) as Array<Omit<AccountRow, "order_index">>).map((a) => ({
          ...a,
          order_index: 0,
        }));
      } else if (r.error) {
        return Response.json({ success: false, error: r.error.message }, { status: 500 });
      } else {
        accounts = (r.data ?? []) as AccountRow[];
      }
    }

    const main = accounts.find((a) => a.role === "main");
    if (!main) {
      return Response.json(
        { success: false, error: "現在利用可能なアカウントがありません" },
        { status: 404 },
      );
    }
    if (!main.basic_id) {
      return Response.json(
        { success: false, error: "メインアカウントに basic_id が設定されていません" },
        { status: 500 },
      );
    }
    const bid = main.basic_id.replace(/^@/, "");
    return Response.json({
      success: true,
      distributeEnabled: false,
      distributeCount: 1,
      accounts: [
        {
          id: main.id,
          basic_id: bid,
          account_name: main.account_name,
          order_index: 1,
          role: "main",
          addUrl: `https://line.me/R/ti/p/@${bid}`,
        },
      ],
    });
  }

  // ============================================================
  // 分散案件: group 必須 + 振り分け方式
  // ============================================================
  if (!groupName) {
    return Response.json(
      {
        success: false,
        error: "group_required",
        message: "分散案件では group クエリパラメータが必須です。例: ?project=threads&group=ウマトク",
      },
      { status: 400 },
    );
  }

  // アカウント取得: project_id + group_name で絞り込み
  let accounts: AccountRow[] = [];
  {
    const r = await supabaseAdmin
      .from("line_accounts")
      .select("id, basic_id, account_name, role, order_index, is_active, group_name")
      .eq("project_id", project.id)
      .eq("group_name", groupName)
      .eq("is_active", true);
    if (r.error && /order_index/.test(r.error.message)) {
      const fb = await supabaseAdmin
        .from("line_accounts")
        .select("id, basic_id, account_name, role, is_active, group_name")
        .eq("project_id", project.id)
        .eq("group_name", groupName)
        .eq("is_active", true);
      if (fb.error) {
        return Response.json({ success: false, error: fb.error.message }, { status: 500 });
      }
      accounts = ((fb.data ?? []) as Array<Omit<AccountRow, "order_index">>).map((a) => ({
        ...a,
        order_index: 0,
      }));
    } else if (r.error) {
      return Response.json({ success: false, error: r.error.message }, { status: 500 });
    } else {
      accounts = (r.data ?? []) as AccountRow[];
    }
  }

  // main + distribute のみ + basic_id あり
  const targets = accounts
    .filter((a) => (a.role === "main" || a.role === "distribute") && !!a.basic_id)
    .sort((a, b) => {
      const oa = a.order_index ?? 0;
      const ob = b.order_index ?? 0;
      if (oa !== ob) return oa - ob;
      // 同 order_index の場合は main を優先
      if (a.role === "main" && b.role !== "main") return -1;
      if (b.role === "main" && a.role !== "main") return 1;
      return 0;
    });

  if (targets.length === 0) {
    return Response.json(
      {
        success: false,
        error: `振り分け対象アカウントがありません (project=${projectCode}, group=${groupName})`,
      },
      { status: 404 },
    );
  }

  const targetIds = targets.map((t) => t.id);

  // ============================================================
  // 振り分けロジック
  // ============================================================
  // (a) user_id 指定時、既存 follower があればそのアカウントを返す(再振り分けしない)
  // (b) なければ friend 数最少 + order_index 昇順タイブレーカーで選ぶ
  // ============================================================

  let assignedAccountId: string | null = null;

  if (lineUserId) {
    const { data: existing, error: fErr } = await supabaseAdmin
      .from("line_followers")
      .select("line_account_id, status")
      .eq("line_user_id", lineUserId)
      .in("line_account_id", targetIds);
    if (fErr) {
      return Response.json(
        { success: false, error: `follower lookup failed: ${fErr.message}` },
        { status: 500 },
      );
    }
    if (existing && existing.length > 0) {
      // status='following' を優先、なければ最初の1件(unfollowed 等の状態でも account を返す)
      const following = existing.find((f) => f.status === "following");
      assignedAccountId = ((following ?? existing[0]).line_account_id as string) ?? null;
    }
  }

  // 振り分けロジック(既存 follower なし、または user_id 未指定の場合)
  if (!assignedAccountId) {
    const { data: followerRows, error: countErr } = await supabaseAdmin
      .from("line_followers")
      .select("line_account_id")
      .in("line_account_id", targetIds)
      .eq("status", "following");
    if (countErr) {
      return Response.json(
        { success: false, error: `follower count failed: ${countErr.message}` },
        { status: 500 },
      );
    }
    const countMap = new Map<string, number>();
    for (const id of targetIds) countMap.set(id, 0);
    for (const row of followerRows ?? []) {
      const id = row.line_account_id as string;
      countMap.set(id, (countMap.get(id) ?? 0) + 1);
    }
    // targets は order_index 昇順でソート済みなので、
    // 同数なら先頭(order_index 最少)が選ばれる
    let minCount = Infinity;
    let chosen: AccountRow | null = null;
    for (const t of targets) {
      const c = countMap.get(t.id) ?? 0;
      if (c < minCount) {
        minCount = c;
        chosen = t;
      }
    }
    if (chosen) {
      assignedAccountId = chosen.id;
    }
  }

  // 選ばれたアカウントを特定
  const assigned = targets.find((t) => t.id === assignedAccountId);
  if (!assigned || !assigned.basic_id) {
    return Response.json(
      { success: false, error: "振り分けたアカウントが特定できません" },
      { status: 500 },
    );
  }

  const bid = assigned.basic_id.replace(/^@/, "");

  return Response.json({
    success: true,
    distributeEnabled: true,
    distributeCount: 1, // 振り分け方式では常に1件返却
    assignedAccountId: assigned.id,
    accounts: [
      {
        id: assigned.id,
        basic_id: bid,
        account_name: assigned.account_name,
        order_index: assigned.order_index ?? 0,
        role: assigned.role,
        addUrl: `https://line.me/R/ti/p/@${bid}`,
      },
    ],
  });
}

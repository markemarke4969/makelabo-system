import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";

// ============================================================
// 分散登録対象リスト取得 API
// ============================================================
// GET /api/liff/distribute-list?project=<code>
//
// 分散案件 (line_projects.distribute_enabled = true) の場合:
//   role='main' と role='distribute' を order_index 昇順で返却。
//   is_active=true のみ。
//
// 非分散案件の場合:
//   resolve と同じく role='main' の1件のみを返す
//   (クライアント側の分岐をシンプルにするため distributeEnabled=false 付き)。
// ============================================================

interface AccountRow {
  id: string;
  basic_id: string | null;
  account_name: string | null;
  role: string | null;
  order_index?: number | null;
  is_active: boolean;
}

export async function GET(request: NextRequest) {
  const projectCode = request.nextUrl.searchParams.get("project")?.trim();
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
    const r = await supabase
      .from("line_projects")
      .select("id, name, code, distribute_enabled, distribute_count")
      .eq("code", projectCode)
      .maybeSingle();
    if (r.error && /distribute_enabled|distribute_count/.test(r.error.message)) {
      const fb = await supabase
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

  // アカウント取得 (order_index 未作成 fallback 付き)
  let accounts: AccountRow[] = [];
  {
    const r = await supabase
      .from("line_accounts")
      .select("id, basic_id, account_name, role, order_index, is_active")
      .eq("project_id", project.id)
      .eq("is_active", true);
    if (r.error && /order_index/.test(r.error.message)) {
      const fb = await supabase
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

  // 非分散案件: main 1件だけ返す (resolve と同等)
  if (!distributeEnabled) {
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
    return Response.json({
      success: true,
      distributeEnabled: false,
      distributeCount: 1,
      accounts: [
        {
          id: main.id,
          basic_id: main.basic_id.replace(/^@/, ""),
          account_name: main.account_name,
          order_index: 1,
          role: "main",
          addUrl: `https://line.me/R/ti/p/@${main.basic_id.replace(/^@/, "")}`,
        },
      ],
    });
  }

  // 分散案件: main + distribute を order_index 昇順
  const targets = accounts
    .filter((a) => a.role === "main" || a.role === "distribute")
    .filter((a) => !!a.basic_id)
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
      { success: false, error: "分散登録対象のアカウントがありません" },
      { status: 404 },
    );
  }

  return Response.json({
    success: true,
    distributeEnabled: true,
    distributeCount: project.distribute_count ?? targets.length,
    accounts: targets.map((a) => {
      const bid = (a.basic_id ?? "").replace(/^@/, "");
      return {
        id: a.id,
        basic_id: bid,
        account_name: a.account_name,
        order_index: a.order_index ?? 0,
        role: a.role,
        addUrl: `https://line.me/R/ti/p/@${bid}`,
      };
    }),
  });
}

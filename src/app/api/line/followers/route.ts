import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";

// ============================================================
// LINE フォロワー API(段階5 案B 対応・後方互換維持)
// ============================================================
// closer_visible_only クエリ:
//   - 段階5 以前:line_account_groups.closer_visible で絞り込み
//   - Step 12 適用後:line_account_groups テーブル削除済 → 絞り込み無効化(全表示)
//
// クローザー権限制御を将来も維持したい場合、line_scenarios に closer_visible 列を追加して
// 同等のロジックを再実装する想定(本タスクスコープ外、別タスクで対応)。
//
// 草案出典: C:\Users\lmsml\.claude\plans\07-calm-pudding.md §11(低優先度・followers)
// ============================================================

export async function GET(request: NextRequest) {
  const testOnly = request.nextUrl.searchParams.get("test_only") === "1";
  const accountId = request.nextUrl.searchParams.get("account_id");
  const projectId = request.nextUrl.searchParams.get("project_id");
  // クローザーログイン時: closer_visible=true のグループのアカウントのみに限定
  const closerVisibleOnly = request.nextUrl.searchParams.get("closer_visible_only") === "1";

  // クローザー絞り込み: 表示可能なグループ名リストを取得(line_account_groups 不在なら絞り込み無効化)
  let allowedGroupNames: string[] | null = null;
  let closerFilterDisabled = false; // line_account_groups テーブル不在時に true(全表示にフォールバック)
  if (closerVisibleOnly && projectId) {
    const { data: visGroups, error: visErr } = await supabase
      .from("line_account_groups")
      .select("group_name")
      .eq("project_id", projectId)
      .eq("closer_visible", true);
    if (visErr) {
      // テーブル不在(Step 12 適用後)→ 絞り込み無効化、全表示にフォールバック
      if (/line_account_groups/i.test(visErr.message) || visErr.code === "PGRST205") {
        console.warn(
          "[followers GET] line_account_groups テーブル未作成 → closer_visible_only フィルタを無効化",
        );
        closerFilterDisabled = true;
      } else {
        return Response.json({ error: visErr.message }, { status: 500 });
      }
    } else {
      allowedGroupNames = (visGroups ?? []).map((g) => g.group_name);
      // クローザー可視のグループが無い場合は空配列(closer_visible=true 行が無い)
      if (allowedGroupNames.length === 0) {
        return Response.json([]);
      }
    }
  }

  // project_id 指定時: line_accounts からその project に属する account_id を全取得し .in() で絞る
  let accountIdsFromProject: string[] | null = null;
  if (projectId && !accountId) {
    // group_name フィルタは line_account_groups が利用可能 + closer 絞り込み有効時のみ
    const useGroupFilter = !!allowedGroupNames && !closerFilterDisabled;

    // 列存在 fallback 付きで account 取得
    const accSelectWithGroup = "id, group_name";
    const accSelectNoGroup = "id";

    const tryFetch = async (withGroupCol: boolean) => {
      let q = supabase
        .from("line_accounts")
        .select(withGroupCol ? accSelectWithGroup : accSelectNoGroup)
        .eq("project_id", projectId);
      if (withGroupCol && useGroupFilter && allowedGroupNames) {
        q = q.in("group_name", allowedGroupNames);
      }
      return await q;
    };

    let { data: accs, error: accErr } = await tryFetch(true);
    if (accErr && /group_name/i.test(accErr.message)) {
      // group_name 列削除後(Step 12 適用後)→ group_name フィルタを完全無効化して再取得
      ({ data: accs, error: accErr } = await tryFetch(false));
    }
    if (accErr) {
      return Response.json({ error: accErr.message }, { status: 500 });
    }
    accountIdsFromProject = ((accs ?? []) as unknown as Array<{ id: string }>).map((a) => a.id);
    // その案件にアカウントが0件なら即空配列を返す
    if (accountIdsFromProject.length === 0) {
      return Response.json([]);
    }
  } else if (accountId && allowedGroupNames && !closerFilterDisabled) {
    // 単一アカウント指定でクローザー絞り込み時、そのアカウントが可視グループ内か確認
    // group_name 列削除後(Step 12 適用後)はチェックをスキップして許可(全表示)
    const r = await supabase
      .from("line_accounts")
      .select("group_name")
      .eq("id", accountId)
      .maybeSingle();
    if (r.error) {
      if (/group_name/i.test(r.error.message)) {
        // 列削除後 → クローザー絞り込みを無効化(全表示にフォールバック)
      } else {
        return Response.json({ error: r.error.message }, { status: 500 });
      }
    } else {
      const acc = r.data as { group_name?: string | null } | null;
      if (!acc || !acc.group_name || !allowedGroupNames.includes(acc.group_name)) {
        return Response.json([]);
      }
    }
  }

  const buildQuery = (withTestFilter: boolean) => {
    let q = supabase
      .from("line_followers")
      .select("*")
      .order("followed_at", { ascending: false });
    if (accountId) q = q.eq("line_account_id", accountId);
    else if (accountIdsFromProject) q = q.in("line_account_id", accountIdsFromProject);
    if (withTestFilter) q = q.eq("is_test", true);
    return q;
  };

  let { data, error } = await buildQuery(testOnly);

  // is_test カラム未作成時の fallback
  if (error && testOnly && /is_test/.test(error.message)) {
    ({ data, error } = await buildQuery(false));
  }

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json(data);
}

export async function PATCH(request: NextRequest) {
  const body = await request.json();
  const { id, display_name, memo, is_test, closer_id } = body;

  if (!id) {
    return Response.json({ error: "id is required" }, { status: 400 });
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (display_name !== undefined) updates.display_name = display_name;
  if (memo !== undefined) updates.memo = memo;
  if (is_test !== undefined) updates.is_test = is_test;
  if (closer_id !== undefined) updates.closer_id = closer_id;

  let { error } = await supabase
    .from("line_followers")
    .update(updates)
    .eq("id", id);

  // is_test カラム未作成の環境では fallback
  if (error && is_test !== undefined && /is_test/.test(error.message)) {
    const { is_test: _omit, ...rest } = updates as Record<string, unknown>;
    void _omit;
    ({ error } = await supabase
      .from("line_followers")
      .update(rest)
      .eq("id", id));
  }

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const { ids, all } = await request.json();

  if (all) {
    // 全件削除: messages → followers
    const { error: msgErr } = await supabase.from("line_messages").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    if (msgErr) return Response.json({ error: msgErr.message }, { status: 500 });

    const { error } = await supabase.from("line_followers").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    if (error) return Response.json({ error: error.message }, { status: 500 });

    return Response.json({ ok: true, deleted: "all" });
  }

  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return Response.json({ error: "ids or all is required" }, { status: 400 });
  }

  // 対象ユーザーのline_user_idを取得
  const { data: targets } = await supabase
    .from("line_followers")
    .select("line_user_id")
    .in("id", ids);

  const userIds = (targets ?? []).map((t) => t.line_user_id);

  // messages削除
  if (userIds.length > 0) {
    await supabase.from("line_messages").delete().in("line_user_id", userIds);
  }

  // followers削除
  const { error } = await supabase.from("line_followers").delete().in("id", ids);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ ok: true, deleted: ids.length });
}

import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";
import { resolveAccountIdsFromScenario } from "@/lib/scenario-resolve";

// ============================================================
// 段階6c1a: scenario_id 対応(代表リッチメニュー = scenario 単位の 1 menu 管理)
// - GET ?scenario_id=X: scenario 代表 menu + 配下 account の legacy fallback を 1 リクエストで返す
// - POST { scenario_id, name, ... }: scenario 代表 menu を作成
// - PUT: patch リストに scenario_id を将来用フックとして追加(NULL 許容)
// - DELETE: scenario 代表 menu の場合、deploy_status.details[] の各 account の
//   line_rich_menu_id を順次 LINE API DELETE してから DB 削除(失敗してもスキップ)
//
// 段階7-B1: GET を 7-A2 と同じ OR 句構文に統一(N+1 解消)
//   注: rich-menus は他 9 ルートと違って account 列が `line_account_id`(他は `account_id`)
// ============================================================

interface DeployDetail {
  account_id: string;
  line_rich_menu_id?: string;
  status?: string;
}

// 一覧取得（account_id または scenario_id 指定）
export async function GET(request: NextRequest) {
  const accountId = request.nextUrl.searchParams.get("account_id");
  const scenarioId = request.nextUrl.searchParams.get("scenario_id");
  if (!accountId && !scenarioId) {
    return Response.json({ error: "account_id or scenario_id is required" }, { status: 400 });
  }

  // 段階7-B1: 案 Y(過渡期ハイブリッド)直 hit + legacy fallback を 1 クエリで返す
  // - scenario_id 直 hit(代表 menu = line_account_id NULL で scenario_id を持つ row)
  // - OR 句で「scenario_id NULL かつ line_account_id IN 句」も拾う(配下 account の legacy menu)
  // - カラム名は line_account_id(rich-menus 固有、他 9 ルートの account_id とは命名違い)
  let query = supabase
    .from("line_rich_menus")
    .select("*")
    .order("created_at", { ascending: false });
  if (scenarioId && !accountId) {
    const resolved = await resolveAccountIdsFromScenario(scenarioId);
    if (resolved.account_ids.length === 0) {
      query = query.eq("scenario_id", scenarioId);
    } else {
      const idsList = resolved.account_ids.map((id) => `"${id}"`).join(",");
      query = query.or(
        `scenario_id.eq.${scenarioId},and(scenario_id.is.null,line_account_id.in.(${idsList}))`,
      );
    }
  } else if (accountId) {
    // 後方互換: account 単位の旧 menu
    query = query.eq("line_account_id", accountId);
  }

  const { data, error } = await query;
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data ?? []);
}

// 新規作成（line_account_id か scenario_id のどちらか必須、scope_check 制約と整合)
export async function POST(request: NextRequest) {
  const body = await request.json();
  const {
    line_account_id,
    scenario_id,
    name,
    size_type,
    chat_bar_text,
    selected,
    template_type,
    areas,
    image_url,
  } = body;

  if (!name || (!line_account_id && !scenario_id)) {
    return Response.json(
      { error: "name and (line_account_id or scenario_id) are required" },
      { status: 400 },
    );
  }

  const { data, error } = await supabase
    .from("line_rich_menus")
    .insert({
      line_account_id: line_account_id ?? null,
      scenario_id: scenario_id ?? null,
      name,
      size_type: size_type ?? "large",
      chat_bar_text: chat_bar_text ?? "メニュー",
      selected: selected ?? true,
      template_type: template_type ?? "L1",
      areas: areas ?? [],
      image_url: image_url ?? null,
    })
    .select("*")
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
}

// 更新
export async function PUT(request: NextRequest) {
  const body = await request.json();
  const { id, ...patch } = body;
  if (!id) return Response.json({ error: "id is required" }, { status: 400 });

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const k of [
    "name",
    "size_type",
    "chat_bar_text",
    "selected",
    "template_type",
    "areas",
    "image_url",
    "is_default",
    // 段階6c1a: scenario_id を将来用フックとして patch 受理(段階6 では UI 動線なし、NULL 許容)
    "scenario_id",
  ] as const) {
    if (patch[k] !== undefined) updates[k] = patch[k];
  }

  const { error } = await supabase.from("line_rich_menus").update(updates).eq("id", id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}

// 削除
export async function DELETE(request: NextRequest) {
  const body = await request.json();
  const { id } = body;
  if (!id) return Response.json({ error: "id is required" }, { status: 400 });

  // 削除対象 menu を取得(line_account_id / scenario_id / line_rich_menu_id / deploy_status)
  const { data: menu } = await supabase
    .from("line_rich_menus")
    .select("id, line_account_id, scenario_id, line_rich_menu_id, deploy_status")
    .eq("id", id)
    .maybeSingle();

  if (menu) {
    if (menu.line_account_id && menu.line_rich_menu_id) {
      // 旧パス: account 単位 menu の LINE API 削除(後方互換、既存挙動踏襲)
      const { data: account } = await supabase
        .from("line_accounts")
        .select("channel_access_token")
        .eq("id", menu.line_account_id)
        .maybeSingle();
      if (account?.channel_access_token) {
        await fetch(`https://api.line.me/v2/bot/richmenu/${menu.line_rich_menu_id}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${account.channel_access_token}` },
        }).catch(() => { /* 失敗しても DB 側は削除 */ });
      }
    } else if (menu.scenario_id && menu.deploy_status) {
      // 段階6c1a 新パス: scenario 代表 menu の場合、deploy_status.details[] の各 account
      // の line_rich_menu_id を順次 LINE API DELETE。失敗してもスキップ続行(既存挙動踏襲)。
      const details = (menu.deploy_status as { details?: DeployDetail[] }).details ?? [];
      for (const d of details) {
        if (!d.line_rich_menu_id || !d.account_id) continue;
        const { data: account } = await supabase
          .from("line_accounts")
          .select("channel_access_token")
          .eq("id", d.account_id)
          .maybeSingle();
        if (!account?.channel_access_token) continue;
        await fetch(`https://api.line.me/v2/bot/richmenu/${d.line_rich_menu_id}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${account.channel_access_token}` },
        }).catch(() => { /* 個別失敗は無視(既存挙動踏襲) */ });
      }
    }
  }

  const { error } = await supabase.from("line_rich_menus").delete().eq("id", id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}

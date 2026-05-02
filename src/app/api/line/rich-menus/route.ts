import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";

// ============================================================
// 段階6c1a: scenario_id 対応(代表リッチメニュー = scenario 単位の 1 menu 管理)
// - GET ?scenario_id=X: scenario 代表 menu を返す(line_account_id IS NULL)
// - POST { scenario_id, name, ... }: scenario 代表 menu を作成
// - PUT: patch リストに scenario_id を将来用フックとして追加(NULL 許容)
// - DELETE: scenario 代表 menu の場合、deploy_status.details[] の各 account の
//   line_rich_menu_id を順次 LINE API DELETE してから DB 削除(失敗してもスキップ)
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

  let query = supabase
    .from("line_rich_menus")
    .select("*")
    .order("created_at", { ascending: false });
  if (scenarioId) {
    // scenario 代表 menu(line_account_id 不問。代表 menu は line_account_id NULL で作成されるが、
    // 旧 hybrid データも scenario_id でヒット可能にする)
    query = query.eq("scenario_id", scenarioId);
  } else if (accountId) {
    // 後方互換: account 単位の旧 menu(scenario_id NULL の場合も含む)
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

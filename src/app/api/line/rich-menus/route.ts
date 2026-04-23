import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";

// 一覧取得（account_id 指定）
export async function GET(request: NextRequest) {
  const accountId = request.nextUrl.searchParams.get("account_id");
  if (!accountId) {
    return Response.json({ error: "account_id is required" }, { status: 400 });
  }
  const { data, error } = await supabase
    .from("line_rich_menus")
    .select("*")
    .eq("line_account_id", accountId)
    .order("created_at", { ascending: false });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data ?? []);
}

// 新規作成
export async function POST(request: NextRequest) {
  const body = await request.json();
  const {
    line_account_id,
    name,
    size_type,
    chat_bar_text,
    selected,
    template_type,
    areas,
    image_url,
  } = body;

  if (!line_account_id || !name) {
    return Response.json({ error: "line_account_id and name are required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("line_rich_menus")
    .insert({
      line_account_id,
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

  // LINE API 側で先に削除（line_rich_menu_id が登録済みなら）
  const { data: menu } = await supabase
    .from("line_rich_menus")
    .select("id, line_account_id, line_rich_menu_id")
    .eq("id", id)
    .maybeSingle();

  if (menu?.line_rich_menu_id && menu.line_account_id) {
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
  }

  const { error } = await supabase.from("line_rich_menus").delete().eq("id", id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}

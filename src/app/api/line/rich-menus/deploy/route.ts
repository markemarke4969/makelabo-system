import { NextRequest } from "next/server";
import sharp from "sharp";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * リッチメニューを LINE API に登録する。
 *
 * フロー:
 *   1. DB からリッチメニュー設定を取得
 *   2. 画像を LINE 要求サイズ(2500x1686 or 2500x843)に sharp でリサイズ
 *   3. POST /richmenu でメニュー枠を作成 → richMenuId 取得
 *   4. POST /richmenu/{id}/content で画像アップロード
 *   5. is_default=true なら POST /user/all/richmenu/{id} でデフォルト設定
 *   6. DB に line_rich_menu_id / status=deployed を保存
 */

// LINE areas 配列を構築（template_type に応じた座標変換）
function buildLineAreas(
  template: string,
  sizeType: string,
  areas: Array<{ actionType?: string; uri?: string; text?: string; data?: string; label?: string }>,
): Array<{ bounds: { x: number; y: number; width: number; height: number }; action: Record<string, unknown> }> {
  const W = 2500;
  const H = sizeType === "compact" ? 843 : 1686;
  const half = Math.floor(W / 2);
  const third = Math.floor(W / 3);
  const halfH = Math.floor(H / 2);

  // テンプレ別の bounds 配列（順序がエリアA, B, C... に対応）
  let boundsList: Array<{ x: number; y: number; width: number; height: number }> = [];
  switch (template) {
    case "L1":
    case "C1":
      boundsList = [{ x: 0, y: 0, width: W, height: H }];
      break;
    case "L2":
    case "C2":
      boundsList = [
        { x: 0, y: 0, width: half, height: H },
        { x: half, y: 0, width: W - half, height: H },
      ];
      break;
    case "L3":
      boundsList = [
        { x: 0, y: 0, width: W, height: halfH },
        { x: 0, y: halfH, width: W, height: H - halfH },
      ];
      break;
    case "L4":
      boundsList = [
        { x: 0, y: 0, width: half, height: halfH },
        { x: half, y: 0, width: W - half, height: halfH },
        { x: 0, y: halfH, width: half, height: H - halfH },
        { x: half, y: halfH, width: W - half, height: H - halfH },
      ];
      break;
    case "L5":
    case "C3":
      boundsList = [
        { x: 0, y: 0, width: third, height: H },
        { x: third, y: 0, width: third, height: H },
        { x: third * 2, y: 0, width: W - third * 2, height: H },
      ];
      break;
    case "L6":
      boundsList = [
        { x: 0, y: 0, width: third, height: halfH },
        { x: third, y: 0, width: third, height: halfH },
        { x: third * 2, y: 0, width: W - third * 2, height: halfH },
        { x: 0, y: halfH, width: third, height: H - halfH },
        { x: third, y: halfH, width: third, height: H - halfH },
        { x: third * 2, y: halfH, width: W - third * 2, height: H - halfH },
      ];
      break;
    case "L7":
      // 上: 1行まるごと, 下: 2列
      boundsList = [
        { x: 0, y: 0, width: W, height: halfH },
        { x: 0, y: halfH, width: half, height: H - halfH },
        { x: half, y: halfH, width: W - half, height: H - halfH },
      ];
      break;
    case "L8":
      // 上: 2列, 下: 1行まるごと
      boundsList = [
        { x: 0, y: 0, width: half, height: halfH },
        { x: half, y: 0, width: W - half, height: halfH },
        { x: 0, y: halfH, width: W, height: H - halfH },
      ];
      break;
    default:
      boundsList = [{ x: 0, y: 0, width: W, height: H }];
  }

  const result: Array<{ bounds: { x: number; y: number; width: number; height: number }; action: Record<string, unknown> }> = [];
  for (let i = 0; i < boundsList.length; i++) {
    const cfg = areas[i];
    if (!cfg) continue;
    const at = cfg.actionType ?? "none";
    if (at === "none") continue;
    let action: Record<string, unknown> | null = null;
    if (at === "uri" && cfg.uri) {
      action = { type: "uri", label: cfg.label || "開く", uri: cfg.uri };
    } else if (at === "message" && cfg.text) {
      action = { type: "message", label: cfg.label || "送信", text: cfg.text };
    } else if (at === "postback" && cfg.data) {
      action = { type: "postback", label: cfg.label || "実行", data: cfg.data, displayText: cfg.text || undefined };
    }
    if (action) {
      result.push({ bounds: boundsList[i], action });
    }
  }
  return result;
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { id } = body;
  if (!id) return Response.json({ error: "id is required" }, { status: 400 });

  // 1. リッチメニュー取得
  const { data: menu, error: menuErr } = await supabase
    .from("line_rich_menus")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (menuErr || !menu) {
    return Response.json({ error: menuErr?.message ?? "リッチメニューが見つかりません" }, { status: 404 });
  }
  if (!menu.image_url) {
    return Response.json({ error: "画像がアップロードされていません" }, { status: 400 });
  }

  // 2. アカウント（チャネルトークン）
  const { data: account } = await supabase
    .from("line_accounts")
    .select("channel_access_token")
    .eq("id", menu.line_account_id)
    .maybeSingle();
  if (!account?.channel_access_token) {
    return Response.json({ error: "チャネルアクセストークンが未設定です" }, { status: 400 });
  }
  const token = account.channel_access_token as string;

  const sizeType = (menu.size_type as string) ?? "large";
  const width = 2500;
  const height = sizeType === "compact" ? 843 : 1686;

  // 3. 既存の line_rich_menu_id があれば LINE 側を一旦削除
  if (menu.line_rich_menu_id) {
    await fetch(`https://api.line.me/v2/bot/richmenu/${menu.line_rich_menu_id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => { /* ignore */ });
  }

  // 4. 画像を取得 → LINE 要求サイズにリサイズ → JPEG に
  let imageBuf: Buffer;
  try {
    const imgRes = await fetch(menu.image_url as string);
    if (!imgRes.ok) {
      return Response.json({ error: `画像取得失敗: HTTP ${imgRes.status}` }, { status: 500 });
    }
    const raw = Buffer.from(await imgRes.arrayBuffer());
    imageBuf = await sharp(raw)
      .rotate()
      .resize(width, height, { fit: "cover" })
      .jpeg({ quality: 85 })
      .toBuffer();
  } catch (e) {
    return Response.json({ error: `画像変換失敗: ${(e as Error).message}` }, { status: 500 });
  }

  // 5. /richmenu でメニュー枠を作成
  const areasInput = (menu.areas as Array<Record<string, unknown>>) ?? [];
  const lineAreas = buildLineAreas(menu.template_type as string, sizeType, areasInput as Array<{ actionType?: string; uri?: string; text?: string; data?: string; label?: string }>);
  if (lineAreas.length === 0) {
    return Response.json({ error: "アクションが設定されているエリアがありません" }, { status: 400 });
  }

  const createRes = await fetch("https://api.line.me/v2/bot/richmenu", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      size: { width, height },
      selected: !!menu.selected,
      name: (menu.name as string).slice(0, 300),
      chatBarText: ((menu.chat_bar_text as string) || "メニュー").slice(0, 14),
      areas: lineAreas,
    }),
  });
  if (!createRes.ok) {
    const err = await createRes.text();
    return Response.json(
      { error: `LINE richmenu 作成失敗 (${createRes.status}): ${err.slice(0, 300)}` },
      { status: 500 },
    );
  }
  const createData = await createRes.json();
  const richMenuId = createData.richMenuId as string;

  // 6. 画像アップロード
  const uploadRes = await fetch(`https://api-data.line.me/v2/bot/richmenu/${richMenuId}/content`, {
    method: "POST",
    headers: {
      "Content-Type": "image/jpeg",
      Authorization: `Bearer ${token}`,
    },
    body: imageBuf as unknown as BodyInit,
  });
  if (!uploadRes.ok) {
    const err = await uploadRes.text();
    return Response.json(
      { error: `画像アップロード失敗 (${uploadRes.status}): ${err.slice(0, 300)}` },
      { status: 500 },
    );
  }

  // 7. is_default ならデフォルト設定
  if (menu.is_default) {
    await fetch(`https://api.line.me/v2/bot/user/all/richmenu/${richMenuId}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    }).catch((e) => console.error("set default failed:", e));
  }

  // 8. DB に反映
  await supabase
    .from("line_rich_menus")
    .update({
      line_rich_menu_id: richMenuId,
      status: "deployed",
      deployed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  return Response.json({ ok: true, line_rich_menu_id: richMenuId });
}

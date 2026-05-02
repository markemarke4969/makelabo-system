import { NextRequest } from "next/server";
import sharp from "sharp";
import { supabase } from "@/lib/supabase";
import { resolveAccountIdsFromScenario } from "@/lib/scenario-resolve";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * リッチメニュー deploy。
 *
 * 段階6c1a 入力分岐(致命バグ防止):menu の取得直後に line_account_id / scenario_id を確認:
 *   - menu.line_account_id NOT NULL & menu.scenario_id NULL → 旧パス(account 単位 deploy、後方互換)
 *   - menu.scenario_id NOT NULL → 新パス(配下 main+distribute へ Promise.allSettled 並列 deploy)
 *   - 両方 NULL → 400(scope_check 制約で実質発生しないが防御的に)
 *
 * 入力ペイロード:
 *   - { id }                        → menu.id 経由で 1 件取得
 *   - { scenario_id }               → scenario 代表 menu(line_account_id NULL)を取得
 *   - { id, retry_account_ids }     → scenario menu の指定 account のみ retry(ゆるい認可)
 *
 * 旧パス(account 単位):既存 247 行のロジックをそのまま維持(後方互換)。
 * 新パス(scenario 単位):
 *   1. resolveAccountIdsFromScenario(scenario_id, { roles: ["main", "distribute"] })
 *   2. retry_account_ids あれば existing.includes フィルタ
 *   3. prepareImage(menu.image_url, size_type) を 1 回だけ実施(各 channel への重複アップロードは LINE 仕様)
 *   4. Promise.allSettled で配下並列 deploy
 *   5. deploy_status JSONB を構築 → DB 保存
 *   6. HTTP 常に 200(部分失敗は body.deploy_status で表現)
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
      boundsList = [
        { x: 0, y: 0, width: W, height: halfH },
        { x: 0, y: halfH, width: half, height: H - halfH },
        { x: half, y: halfH, width: W - half, height: H - halfH },
      ];
      break;
    case "L8":
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

// 段階6c1a: 画像取得 + sharp リサイズ(scenario 並列 deploy 時は 1 回だけ実施、Buffer は immutable で共有可)
async function prepareImage(imageUrl: string, sizeType: string): Promise<Buffer> {
  const width = 2500;
  const height = sizeType === "compact" ? 843 : 1686;
  const imgRes = await fetch(imageUrl);
  if (!imgRes.ok) {
    throw new Error(`画像取得失敗: HTTP ${imgRes.status}`);
  }
  const raw = Buffer.from(await imgRes.arrayBuffer());
  return await sharp(raw)
    .rotate()
    .resize(width, height, { fit: "cover" })
    .jpeg({ quality: 85 })
    .toBuffer();
}

interface DeployDetail {
  account_id: string;
  account_name: string | null;
  status: "success" | "failed";
  stage: number; // 0=token / 1=create / 2=upload / 3=success
  line_rich_menu_id?: string;
  deployed_at?: string;
  error?: string;
  http_status?: number;
}

// 段階6c1a: 1 アカウントへの deploy(scenario 並列 deploy の各 worker)
// prevLineRichMenuId: 既存 line_rich_menu_id があれば deploy 前に LINE 側を削除(再 deploy 用)
async function deployToOneAccount(
  accountId: string,
  menu: Record<string, unknown>,
  imageBuf: Buffer,
  lineAreas: Array<{ bounds: { x: number; y: number; width: number; height: number }; action: Record<string, unknown> }>,
  prevLineRichMenuId: string | null,
): Promise<DeployDetail> {
  const sizeType = (menu.size_type as string) ?? "large";
  const width = 2500;
  const height = sizeType === "compact" ? 843 : 1686;

  // 1. token
  const { data: account } = await supabase
    .from("line_accounts")
    .select("account_name, channel_access_token")
    .eq("id", accountId)
    .maybeSingle();
  const accountName = (account?.account_name as string | null) ?? null;
  if (!account?.channel_access_token) {
    return { account_id: accountId, account_name: accountName, status: "failed", stage: 0, error: "channel_access_token 未設定" };
  }
  const token = account.channel_access_token as string;

  // 2. 既存 line_rich_menu_id があれば LINE 側を削除(再 deploy 用、失敗無視)
  if (prevLineRichMenuId) {
    await fetch(`https://api.line.me/v2/bot/richmenu/${prevLineRichMenuId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => { /* ignore */ });
  }

  // 3. richmenu 作成
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
    return {
      account_id: accountId,
      account_name: accountName,
      status: "failed",
      stage: 1,
      error: `richmenu 作成失敗: ${err.slice(0, 200)}`,
      http_status: createRes.status,
    };
  }
  const createData = await createRes.json();
  const richMenuId = createData.richMenuId as string;

  // 4. 画像アップロード
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
    return {
      account_id: accountId,
      account_name: accountName,
      status: "failed",
      stage: 2,
      error: `画像アップロード失敗: ${err.slice(0, 200)}`,
      http_status: uploadRes.status,
    };
  }

  // 5. is_default ならデフォルト設定(失敗は無視、status は success)
  if (menu.is_default) {
    await fetch(`https://api.line.me/v2/bot/user/all/richmenu/${richMenuId}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    }).catch((e) => console.error("set default failed:", e));
  }

  return {
    account_id: accountId,
    account_name: accountName,
    status: "success",
    stage: 3,
    line_rich_menu_id: richMenuId,
    deployed_at: new Date().toISOString(),
  };
}

// 段階6c1a 旧パス: account 単位 deploy(既存ロジックの完全保存、後方互換)
async function deployToSingleAccount(menu: Record<string, unknown>): Promise<Response> {
  // アカウント(チャネルトークン)
  const { data: account } = await supabase
    .from("line_accounts")
    .select("channel_access_token")
    .eq("id", menu.line_account_id as string)
    .maybeSingle();
  if (!account?.channel_access_token) {
    return Response.json({ error: "チャネルアクセストークンが未設定です" }, { status: 400 });
  }
  const token = account.channel_access_token as string;
  const sizeType = (menu.size_type as string) ?? "large";

  // 既存の line_rich_menu_id があれば LINE 側を一旦削除
  if (menu.line_rich_menu_id) {
    await fetch(`https://api.line.me/v2/bot/richmenu/${menu.line_rich_menu_id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => { /* ignore */ });
  }

  // 画像準備
  let imageBuf: Buffer;
  try {
    imageBuf = await prepareImage(menu.image_url as string, sizeType);
  } catch (e) {
    return Response.json({ error: `画像変換失敗: ${(e as Error).message}` }, { status: 500 });
  }

  // areas
  const areasInput = (menu.areas as Array<Record<string, unknown>>) ?? [];
  const lineAreas = buildLineAreas(
    menu.template_type as string,
    sizeType,
    areasInput as Array<{ actionType?: string; uri?: string; text?: string; data?: string; label?: string }>,
  );
  if (lineAreas.length === 0) {
    return Response.json({ error: "アクションが設定されているエリアがありません" }, { status: 400 });
  }

  const width = 2500;
  const height = sizeType === "compact" ? 843 : 1686;

  // richmenu 作成
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

  // 画像アップロード
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

  // is_default ならデフォルト設定
  if (menu.is_default) {
    await fetch(`https://api.line.me/v2/bot/user/all/richmenu/${richMenuId}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    }).catch((e) => console.error("set default failed:", e));
  }

  // DB 反映
  await supabase
    .from("line_rich_menus")
    .update({
      line_rich_menu_id: richMenuId,
      status: "deployed",
      deployed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", menu.id as string);

  return Response.json({ ok: true, line_rich_menu_id: richMenuId });
}

// 段階6c1a 新パス: scenario 単位 deploy(配下 main+distribute へ Promise.allSettled 並列)
async function deployToScenarioAccounts(
  menu: Record<string, unknown>,
  retryAccountIds: string[] | undefined,
): Promise<Response> {
  const sizeType = (menu.size_type as string) ?? "large";

  // 1. 配下 account_ids 解決(main + distribute のみ)
  const resolved = await resolveAccountIdsFromScenario(menu.scenario_id as string, {
    roles: ["main", "distribute"],
  });
  if (resolved.account_ids.length === 0) {
    return Response.json({
      ok: false,
      error: "配下に main / distribute アカウントがありません",
      deploy_status: { total: 0, succeeded: 0, failed: 0, details: [] },
    });
  }

  // 2. retry_account_ids 適用(ゆるい認可:既存 details に存在するもののみ)
  const existingDetails = ((menu.deploy_status as { details?: DeployDetail[] } | null)?.details ?? []) as DeployDetail[];
  let targets = resolved.account_ids;
  if (retryAccountIds && retryAccountIds.length > 0) {
    const existingIds = existingDetails.map((d) => d.account_id);
    targets = retryAccountIds.filter((aid) => existingIds.includes(aid));
    if (targets.length === 0) {
      return Response.json({
        ok: false,
        error: "retry_account_ids に該当する既存 deploy 結果がありません",
        deploy_status: menu.deploy_status ?? null,
      });
    }
  }

  // 3. 画像準備(1 回だけ、targets 全 worker で共有)
  let imageBuf: Buffer;
  try {
    imageBuf = await prepareImage(menu.image_url as string, sizeType);
  } catch (e) {
    return Response.json({ error: `画像変換失敗: ${(e as Error).message}` }, { status: 500 });
  }

  // 4. areas 構築(1 回だけ)
  const areasInput = (menu.areas as Array<Record<string, unknown>>) ?? [];
  const lineAreas = buildLineAreas(
    menu.template_type as string,
    sizeType,
    areasInput as Array<{ actionType?: string; uri?: string; text?: string; data?: string; label?: string }>,
  );
  if (lineAreas.length === 0) {
    return Response.json({ error: "アクションが設定されているエリアがありません" }, { status: 400 });
  }

  // 5. 並列 deploy(Promise.allSettled で部分失敗を許容)
  const startedAt = new Date().toISOString();
  // 各 account の前回 line_rich_menu_id を既存 details から引く(再 deploy 用)
  const prevIdMap = new Map<string, string | null>();
  for (const d of existingDetails) {
    prevIdMap.set(d.account_id, d.line_rich_menu_id ?? null);
  }
  const results = await Promise.allSettled(
    targets.map((accountId) =>
      deployToOneAccount(accountId, menu, imageBuf, lineAreas, prevIdMap.get(accountId) ?? null),
    ),
  );
  const newDetails: DeployDetail[] = results.map((r, i) =>
    r.status === "fulfilled"
      ? r.value
      : {
          account_id: targets[i],
          account_name: null,
          status: "failed" as const,
          stage: 0,
          error: String(r.reason),
        },
  );

  // 6. retry 時は既存 details の該当 account のみ上書き
  let mergedDetails: DeployDetail[];
  if (retryAccountIds && retryAccountIds.length > 0) {
    const newMap = new Map(newDetails.map((d) => [d.account_id, d]));
    mergedDetails = existingDetails.map((d) => newMap.get(d.account_id) ?? d);
  } else {
    mergedDetails = newDetails;
  }

  const succeeded = mergedDetails.filter((d) => d.status === "success").length;
  const failed = mergedDetails.length - succeeded;
  const completedAt = new Date().toISOString();

  // 7. DB 保存
  const updatePayload: Record<string, unknown> = {
    deploy_status: {
      started_at: startedAt,
      completed_at: completedAt,
      total: mergedDetails.length,
      succeeded,
      failed,
      details: mergedDetails,
    },
    status: failed === 0 ? "deployed" : "partial",
    updated_at: completedAt,
  };
  if (succeeded > 0) updatePayload.deployed_at = completedAt;
  await supabase
    .from("line_rich_menus")
    .update(updatePayload)
    .eq("id", menu.id as string);

  // 8. HTTP 常に 200(部分失敗は body.deploy_status で表現)
  return Response.json({
    ok: failed === 0,
    deploy_status: {
      started_at: startedAt,
      completed_at: completedAt,
      total: mergedDetails.length,
      succeeded,
      failed,
      details: mergedDetails,
    },
  });
}

// ============================================================
// メインエントリ:menu 取得 → 入力分岐 → 旧パス or 新パス
// ============================================================
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { id, scenario_id: inputScenarioId, retry_account_ids } = body;

  // 1. menu 取得
  let menu: Record<string, unknown> | null = null;
  if (id) {
    const r = await supabase
      .from("line_rich_menus")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (r.error || !r.data) {
      return Response.json({ error: r.error?.message ?? "リッチメニューが見つかりません" }, { status: 404 });
    }
    menu = r.data as Record<string, unknown>;
  } else if (inputScenarioId) {
    // scenario 代表 menu(line_account_id NULL)を取得
    const r = await supabase
      .from("line_rich_menus")
      .select("*")
      .eq("scenario_id", inputScenarioId)
      .is("line_account_id", null)
      .maybeSingle();
    if (r.error || !r.data) {
      return Response.json({ error: r.error?.message ?? "scenario 代表 menu が見つかりません" }, { status: 404 });
    }
    menu = r.data as Record<string, unknown>;
  } else {
    return Response.json({ error: "id or scenario_id is required" }, { status: 400 });
  }

  if (!menu.image_url) {
    return Response.json({ error: "画像がアップロードされていません" }, { status: 400 });
  }

  // 2. 入力分岐(致命バグ防止:line_account_id NULL 時に旧パスを通さない)
  const hasAccountId = menu.line_account_id !== null && menu.line_account_id !== undefined;
  const hasScenarioId = menu.scenario_id !== null && menu.scenario_id !== undefined;

  if (hasAccountId && !hasScenarioId) {
    // 旧パス: account 単位 deploy(後方互換)
    return await deployToSingleAccount(menu);
  }
  if (hasScenarioId) {
    // 新パス: scenario 配下並列 deploy(line_account_id は NULL でも NOT NULL でも、scenario 経由で扱う)
    return await deployToScenarioAccounts(menu, retry_account_ids as string[] | undefined);
  }

  return Response.json(
    { error: "menu に line_account_id も scenario_id もありません(scope_check 制約違反)" },
    { status: 400 },
  );
}

import { NextRequest } from "next/server";
import { supabase, supabaseAdmin } from "@/lib/supabase";
import { verifySignature, getProfile, buildLineMessage, pushLineMessages, summarizeBuiltMessage } from "@/lib/line";
import { fireTrigger } from "@/lib/action-rules";

// PR#2-B: 副業診断アプリ(matching)の AI セクションを line_follower_custom_values に取り込み
// - GET /api/matching/diagnoses/[id]/ai-sections を Bearer 認証で呼出
// - ready 時のみ matching_* 7 個の field_id → value を upsert
// - pending/failed のときは matching_strength を upsert しない
//   → seed の branch 評価 `op:'exists'` で false → defaultMessage(pending 本文)
// - matching_cta_url は line_custom_fields.default_value で fallback 解決(replacer 拡張)
// - タイムアウト 5s / 1 リトライ(指数バックオフ 500ms)。全失敗時は throw → 呼出側で silent log
async function enrichFollowerWithMatchingSections(args: {
  followerId: string;
  accountId: string;
  externalRef: string;
}): Promise<void> {
  const token = process.env.LINE_MATCHING_LOOKUP_TOKEN;
  if (!token) {
    throw new Error("LINE_MATCHING_LOOKUP_TOKEN が未設定");
  }
  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ??
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : "");
  if (!siteUrl) {
    throw new Error("base URL が解決できません(NEXT_PUBLIC_SITE_URL / VERCEL_URL 未設定)");
  }
  const url = `${siteUrl.replace(/\/$/, "")}/api/matching/diagnoses/${encodeURIComponent(args.externalRef)}/ai-sections`;

  async function fetchOnce(): Promise<Response> {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 5000);
    try {
      return await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
        signal: ctrl.signal,
        cache: "no-store",
      });
    } finally {
      clearTimeout(t);
    }
  }

  let res: Response;
  try {
    res = await fetchOnce();
  } catch {
    // 1 回リトライ(指数バックオフ 500ms)
    await new Promise((r) => setTimeout(r, 500));
    res = await fetchOnce();
  }
  if (!res.ok) {
    throw new Error(`matching API ${res.status}`);
  }
  const json = (await res.json()) as {
    status: "ready" | "pending" | "failed";
    generatedAt?: string | null;
    sections?: { strength?: string; animal?: string; risk?: string } | null;
    typeId?: string;
    typeName?: string | null;
    animal?: string | null;
  };

  // 7 個の field_key → field_id を一括取得
  const { data: fields } = await supabaseAdmin
    .from("line_custom_fields")
    .select("id, field_key")
    .eq("account_id", args.accountId)
    .in("field_key", [
      "matching_diagnosis_id",
      "matching_type_name",
      "matching_animal",
      "matching_strength",
      "matching_animal_text",
      "matching_risk",
      "matching_cta_url",
    ]);
  if (!fields || fields.length === 0) {
    // seed 未投入 or aifukugyo 以外の account → enrichment 無効(silent skip)
    return;
  }
  const map: Record<string, string> = {};
  for (const f of fields as Array<{ id: string; field_key: string }>) {
    map[f.field_key] = f.id;
  }

  const upserts: Array<{ follower_id: string; field_id: string; value: string }> = [];
  function push(key: string, value: string | null | undefined): void {
    if (!value) return;
    const fid = map[key];
    if (!fid) return;
    upserts.push({ follower_id: args.followerId, field_id: fid, value });
  }

  push("matching_diagnosis_id", args.externalRef);
  if (json.status === "ready" && json.sections) {
    push("matching_type_name", json.typeName ?? "");
    push("matching_animal", json.animal ?? "");
    push("matching_strength", json.sections.strength ?? "");
    push("matching_animal_text", json.sections.animal ?? "");
    push("matching_risk", json.sections.risk ?? "");
  }
  // matching_cta_url は seed の default_value で fallback(明示 upsert しない)

  if (upserts.length === 0) return;
  const { error: upErr } = await supabaseAdmin
    .from("line_follower_custom_values")
    .upsert(upserts, { onConflict: "follower_id,field_id" });
  if (upErr) {
    throw new Error(`custom_values upsert failed: ${upErr.message}`);
  }
}

interface LineAccountRow {
  id: string;
  channel_id: string | null;
  channel_secret: string | null;
  channel_access_token: string | null;
  greeting_message: string | null;
  project_id: string | null;
  role: string | null;
  // 段階5 Step 11:line_step_sequences クエリを scenario_id 主軸で発行するために取得。
  // Step 02 未適用環境では SELECT fallback で除外され undefined となる。
  scenario_id?: string | null;
}

interface LineEvent {
  type: string;
  source: { userId: string };
  replyToken?: string;
  timestamp: number;
  message?: {
    id: string;
    type: string;
    text?: string;
    stickerId?: string;
    packageId?: string;
    stickerResourceType?: string;
    emojis?: Array<{ index: number; length: number; productId: string; emojiId: string }>;
    contentProvider?: { type: string; originalContentUrl?: string; previewImageUrl?: string };
    fileName?: string;
    fileSize?: number;
    title?: string;
    address?: string;
    latitude?: number;
    longitude?: number;
  };
  postback?: { data: string };
}

async function logWebhookAttempt(
  body: string,
  signature: string,
  matched: { id: string; channel_id: string | null } | null,
  verifyResult: string,
  eventTypes: string[],
) {
  try {
    await supabase.from("line_webhook_logs").insert({
      received_at: new Date().toISOString(),
      signature_header: signature ? signature.slice(0, 16) + "..." : null,
      body_preview: body.slice(0, 1000),
      matched_account_id: matched?.id ?? null,
      matched_channel_id: matched?.channel_id ?? null,
      verify_result: verifyResult,
      event_types: eventTypes,
    });
  } catch (e) {
    console.error("[LINE Webhook] webhook log insert failed:", e);
  }
}

export async function POST(request: NextRequest) {
  const body = await request.text();
  const signature = request.headers.get("x-line-signature") ?? "";

  console.log("[LINE Webhook] body length:", body.length);

  // 登録されている全アカウントを取得 → 署名が一致する secret を持つアカウントを特定
  let accounts: LineAccountRow[] = [];
  {
    // 段階5 Step 11:scenario_id を含む primary SELECT(後段の line_step_sequences クエリで主軸として利用)。
    // 列なし環境(Step 02 未適用 / 旧スキーマ)には 2 段階 fallback で対応:
    //   - scenario_id 列なし → scenario_id を抜いて再 SELECT
    //   - greeting_message 列なし → greeting_message + scenario_id を抜いて再 SELECT(既存パターン)
    let res = await supabase
      .from("line_accounts")
      .select("id, channel_id, channel_secret, channel_access_token, greeting_message, project_id, role, scenario_id");

    if (res.error && /scenario_id/i.test(res.error.message)) {
      // scenario_id 列なし(Step 02 未適用)→ scenario_id を抜いて再取得
      res = await supabase
        .from("line_accounts")
        .select("id, channel_id, channel_secret, channel_access_token, greeting_message, project_id, role");
    }

    if (res.error && /greeting_message/.test(res.error.message)) {
      const fb = await supabase
        .from("line_accounts")
        .select("id, channel_id, channel_secret, channel_access_token, project_id, role");
      if (fb.error) {
        console.error("[LINE Webhook] accounts fetch error:", fb.error.message);
        return Response.json({ error: "DB error" }, { status: 500 });
      }
      accounts = (fb.data ?? []).map((a) => ({ ...a, greeting_message: null }));
    } else if (res.error) {
      console.error("[LINE Webhook] accounts fetch error:", res.error.message);
      return Response.json({ error: "DB error" }, { status: 500 });
    } else {
      accounts = (res.data ?? []) as LineAccountRow[];
    }
  }

  // 署名一致するアカウントを探す
  let matchedAccount: LineAccountRow | null = null;
  for (const acc of accounts) {
    if (!acc.channel_secret) continue;
    if (verifySignature(body, signature, acc.channel_secret)) {
      matchedAccount = acc;
      break;
    }
  }

  if (!matchedAccount) {
    console.error(
      "[LINE Webhook] 署名検証失敗 - 登録済み",
      accounts.length,
      "アカウントどれも一致せず",
    );
    await logWebhookAttempt(body, signature, null, "no_account_matched", []);
    return Response.json({ error: "Invalid signature" }, { status: 403 });
  }

  console.log("[LINE Webhook] 署名一致:", matchedAccount.id, matchedAccount.channel_id);

  let payload: { events?: LineEvent[]; destination?: string };
  try {
    payload = JSON.parse(body);
  } catch {
    await logWebhookAttempt(body, signature, matchedAccount, "invalid_json", []);
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const eventTypes = (payload.events ?? []).map((e) => e.type);
  await logWebhookAttempt(body, signature, matchedAccount, "verified", eventTypes);

  // LINE Developers 検証リクエスト（events 空）
  if (!payload.events || payload.events.length === 0) {
    console.log("[LINE Webhook] 検証リクエスト - OK");
    return Response.json({ ok: true });
  }

  for (const event of payload.events) {
    console.log(`[LINE Webhook] event.type=${event.type}, userId=${event.source?.userId}`);

    await saveEvent(event, matchedAccount.id);

    if (event.type === "follow") {
      await handleFollow(event, matchedAccount);
      await fireTrigger("follow", {
        account_id: matchedAccount.id,
        line_user_id: event.source.userId,
      });
    } else if (event.type === "unfollow") {
      await handleUnfollow(event, matchedAccount.id);
    } else if (event.type === "block") {
      await handleBlock(event, matchedAccount.id);
    } else if (event.type === "message") {
      await fireTrigger("message_received", {
        account_id: matchedAccount.id,
        line_user_id: event.source.userId,
        message_text: event.message?.text ?? null,
      });
    } else if (event.type === "postback") {
      console.log(`[LINE Webhook] postback data=${event.postback?.data}`);
      await handlePostback(event, matchedAccount);
    }
  }

  return Response.json({ ok: true });
}

async function handleFollow(event: LineEvent, account: LineAccountRow) {
  const userId = event.source.userId;

  // プロフィール取得
  const profile = account.channel_access_token
    ? await getProfile(userId, account.channel_access_token)
    : null;
  console.log("[LINE Webhook] follow profile:", profile);

  // BAN対策: 同一 project_id 内の他アカウントに同 userId の follower 行が
  // 既に存在するかを探す。見つかったら「復元対象」として、挨拶メッセージを
  // スキップし、restored_from_* を記録する。
  let restoredFrom: { account_id: string; follower_id: string } | null = null;
  if (account.project_id) {
    try {
      // 同一案件のアカウントID一覧
      const { data: siblingAccs } = await supabase
        .from("line_accounts")
        .select("id")
        .eq("project_id", account.project_id);
      const siblingIds = (siblingAccs ?? [])
        .map((a) => a.id as string)
        .filter((id) => id !== account.id);

      if (siblingIds.length > 0) {
        const { data: priorFollowers } = await supabase
          .from("line_followers")
          .select("id, line_account_id, followed_at")
          .eq("line_user_id", userId)
          .in("line_account_id", siblingIds)
          .order("followed_at", { ascending: false })
          .limit(1);
        if (priorFollowers && priorFollowers.length > 0) {
          const prior = priorFollowers[0] as {
            id: string;
            line_account_id: string;
            followed_at: string;
          };
          restoredFrom = {
            account_id: prior.line_account_id,
            follower_id: prior.id,
          };
          console.log(
            `[LINE Webhook] 復元対象検出: user=${userId} prior_account=${prior.line_account_id} prior_follower=${prior.id}`,
          );
        }
      }
    } catch (e) {
      console.error("[LINE Webhook] 復元判定失敗:", e);
    }
  }

  // upsert（再フォロー対応）
  // upsert + select の同時実行は maybeSingle で null が返る既知の挙動があるため、
  // upsert と select を分離する
  const upsertBase: Record<string, unknown> = {
    line_account_id: account.id,
    line_user_id: userId,
    display_name: profile?.displayName ?? null,
    picture_url: profile?.pictureUrl ?? null,
    status: "following",
    followed_at: new Date().toISOString(),
    unfollowed_at: null,
    updated_at: new Date().toISOString(),
    // 段階8-2-B-hotfix(C-1):新規 follower 追加時に account.scenario_id を継承。
    // 列なし環境(段階5 Step 02 未適用)では account.scenario_id が undefined となり null 化される。
    // 列なし時の upsert エラーは既存 fallback パターンの拡張対象だが、本番は Step 02 適用済のため発火しない。
    scenario_id: account.scenario_id ?? null,
  };
  if (restoredFrom) {
    upsertBase.restored_from_account_id = restoredFrom.account_id;
    upsertBase.restored_from_follower_id = restoredFrom.follower_id;
    upsertBase.restored_at = new Date().toISOString();
  }

  // ステップ1: upsert のみ実行 (restored_* カラム未作成環境への fallback 付き)
  let upsertRes = await supabase
    .from("line_followers")
    .upsert(upsertBase, { onConflict: "line_account_id,line_user_id" });
  if (
    upsertRes.error &&
    /restored_from_account_id|restored_from_follower_id|restored_at/.test(upsertRes.error.message)
  ) {
    console.warn("[LINE Webhook] restored_* カラム未作成 → migration 推奨。復元記録なしで再試行");
    const fallback = { ...upsertBase };
    delete fallback.restored_from_account_id;
    delete fallback.restored_from_follower_id;
    delete fallback.restored_at;
    upsertRes = await supabase
      .from("line_followers")
      .upsert(fallback, { onConflict: "line_account_id,line_user_id" });
  }
  if (upsertRes.error) {
    console.error("[LINE Webhook] follower upsert失敗:", upsertRes.error.message);
  }

  // ステップ2: 対象行を一意キーで別 select → inflow_route_id カラム有無を判定しつつ取得
  let upserted: { id: string; inflow_route_id: string | null } | null = null;
  let hasInflowCol = true;

  const sel1 = await supabase
    .from("line_followers")
    .select("id, inflow_route_id")
    .eq("line_account_id", account.id)
    .eq("line_user_id", userId)
    .maybeSingle();

  if (sel1.error && /inflow_route_id/.test(sel1.error.message)) {
    hasInflowCol = false;
    console.warn("[LINE Webhook] inflow_route_id カラム未作成 → migration 推奨");
    const sel2 = await supabase
      .from("line_followers")
      .select("id")
      .eq("line_account_id", account.id)
      .eq("line_user_id", userId)
      .maybeSingle();
    if (!sel2.error && sel2.data) {
      upserted = { id: sel2.data.id as string, inflow_route_id: null };
    }
  } else if (sel1.error) {
    console.error("[LINE Webhook] follower select失敗:", sel1.error.message);
  } else if (sel1.data) {
    upserted = {
      id: sel1.data.id as string,
      inflow_route_id: (sel1.data as { inflow_route_id: string | null }).inflow_route_id ?? null,
    };
  }

  console.log(
    `[LINE Webhook] follower upsert完了: id=${upserted?.id ?? "(null)"}, existing_inflow=${upserted?.inflow_route_id ?? "(null)"}, project_id=${account.project_id ?? "(null)"}, hasInflowCol=${hasInflowCol}`,
  );

  // 流入経路の紐付け: 直近60分以内の未消費クリックで最新のものを同一案件内から探す
  // LINE webhook には流入情報が来ないため時間窓ヒューリスティックで対応。
  // カラム未作成の場合はスキップ。
  //
  // PR#2-B: 引当に成功した click の external_ref を pr2bExternalRef に保持し、
  //         本ブロック直後で matching API 呼出 + custom_values upsert に使う
  let pr2bExternalRef: string | null = null;
  if (hasInflowCol && upserted && !upserted.inflow_route_id && account.project_id) {
    try {
      const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const { data: routesOfProject } = await supabase
        .from("line_inflow_routes")
        .select("id")
        .eq("project_id", account.project_id);
      const routeIds = (routesOfProject ?? []).map((r) => r.id as string);

      if (routeIds.length === 0) {
        console.log(`[LINE Webhook] 流入紐付けスキップ: project=${account.project_id} に流入経路なし`);
      } else {
        // line_inflow_clicks の RLS で anon の SELECT が塞がっていることがあるため
        // service role クライアントで検索・更新する
        // PR#2-B: external_ref も取得(列なし環境は fallback)
        let r = await supabaseAdmin
          .from("line_inflow_clicks")
          .select("id, inflow_route_id, clicked_at, external_ref")
          .in("inflow_route_id", routeIds)
          .is("follower_id", null)
          .gte("clicked_at", since)
          .order("clicked_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (r.error && /external_ref/i.test(r.error.message)) {
          // PR-Harness SQL 未適用環境への fallback
          r = await supabaseAdmin
            .from("line_inflow_clicks")
            .select("id, inflow_route_id, clicked_at")
            .in("inflow_route_id", routeIds)
            .is("follower_id", null)
            .gte("clicked_at", since)
            .order("clicked_at", { ascending: false })
            .limit(1)
            .maybeSingle();
        }
        const recentClick = r.data as
          | { id: string; inflow_route_id: string; clicked_at: string; external_ref?: string | null }
          | null;
        const clickErr = r.error;

        if (clickErr && /follower_id/.test(clickErr.message)) {
          console.warn("[LINE Webhook] line_inflow_clicks.follower_id カラム未作成 → migration 推奨");
        } else if (clickErr) {
          console.warn("[LINE Webhook] click検索失敗:", clickErr.message);
        } else if (recentClick) {
          const up1 = await supabaseAdmin
            .from("line_followers")
            .update({ inflow_route_id: recentClick.inflow_route_id })
            .eq("id", upserted.id);
          if (up1.error) console.warn("[LINE Webhook] follower.inflow_route_id更新失敗:", up1.error.message);

          const up2 = await supabaseAdmin
            .from("line_inflow_clicks")
            .update({ follower_id: upserted.id })
            .eq("id", recentClick.id);
          if (up2.error) console.warn("[LINE Webhook] click.follower_id更新失敗:", up2.error.message);

          console.log(
            `[LINE Webhook] 流入紐付け成功: follower=${upserted.id} ← click=${recentClick.id} (route=${recentClick.inflow_route_id}, clicked_at=${recentClick.clicked_at})`,
          );

          // PR#2-B: external_ref があれば後段で matching enrichment を発火
          if (recentClick.external_ref) {
            pr2bExternalRef = recentClick.external_ref;
          }
        } else {
          console.log(
            `[LINE Webhook] 流入紐付けなし: follower=${upserted.id} project=${account.project_id} routes=${routeIds.length} since=${since}(60分以内の未消費クリックなし)`,
          );
        }
      }
    } catch (e) {
      console.error("[LINE Webhook] 流入紐付け失敗:", e);
    }
  }

  // PR#2-B: 副業診断アプリ(matching)の AI セクションを line_follower_custom_values に取り込み
  // - external_ref(=diagnosis_id)が引当 click に保存されている follower 限定
  // - matching API GET を Bearer 認証で呼出、ready 時のみ values を upsert
  // - 失敗は silent log + 続行(挨拶送信 + step 配信は必ず走る、PR#2-D の cron で救済)
  if (pr2bExternalRef && upserted?.id) {
    try {
      await enrichFollowerWithMatchingSections({
        followerId: upserted.id,
        accountId: account.id,
        externalRef: pr2bExternalRef,
      });
    } catch (e) {
      console.error("[LINE Webhook] PR#2-B matching enrichment failed (silent):", e);
    }
  }

  // カスタム挨拶メッセージを送信（設定されていれば）
  // BAN対策: 復元対象 (restoredFrom != null) の場合は挨拶送信しない
  if (restoredFrom) {
    console.log(
      `[LINE Webhook] 復元対象のため挨拶送信スキップ: user=${userId} prior=${restoredFrom.account_id}`,
    );
  }

  // 分散案件 (distribute_enabled=true) では、マスター (role='main') 以外の
  // アカウントへの follow では挨拶メッセージを送信しない。
  // ・5本連続で挨拶が送られる UX 崩れを回避
  // ・マスターだけが「代表」として挨拶する設計
  let skipGreetingForDistribute = false;
  if (account.project_id && account.role && account.role !== "main") {
    try {
      const { data: projRow } = await supabase
        .from("line_projects")
        .select("distribute_enabled")
        .eq("id", account.project_id)
        .maybeSingle();
      if (projRow && (projRow as { distribute_enabled?: boolean | null }).distribute_enabled === true) {
        skipGreetingForDistribute = true;
        console.log(
          `[LINE Webhook] 分散案件のためマスター以外は挨拶スキップ: account=${account.id} role=${account.role}`,
        );
      }
    } catch (e) {
      // distribute_enabled カラム未作成 / その他エラーは無視 (従来挙動フォールバック)
      console.warn("[LINE Webhook] distribute_enabled check failed:", (e as Error).message);
    }
  }

  if (!restoredFrom && !skipGreetingForDistribute && account.greeting_message && account.channel_access_token && event.replyToken) {
    const text = account.greeting_message.replace(
      /\{display_name\}/g,
      profile?.displayName ?? "ゲスト",
    );
    try {
      const res = await fetch("https://api.line.me/v2/bot/message/reply", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${account.channel_access_token}`,
        },
        body: JSON.stringify({
          replyToken: event.replyToken,
          messages: [{ type: "text", text }],
        }),
      });
      if (!res.ok) {
        const errText = await res.text();
        console.error("[LINE Webhook] 挨拶送信失敗:", res.status, errText);
      }
    } catch (e) {
      console.error("[LINE Webhook] 挨拶送信例外:", e);
    }
  }

  // ステップ配信: 「登録直後 (delay_minutes = 0)」の step_messages を push
  // ※ kind='step' のシーケンスのみ対象（予約配信 kind='schedule' は cron で処理）
  if (account.channel_access_token) {
    try {
      // 段階5 Step 11 対応:line_step_sequences は account_id → scenario_id への主軸切り替え期。
      // primary path:account.scenario_id が取得できていれば scenario_id でフィルタ。
      // fallback path:scenario_id 列なし(Step 02 未適用)or scenario_id 解決不能時に account_id でフィルタ(従来動作)。
      // kind 列なし環境への fallback は scenario_id / account_id の各経路に二重に適用。
      let sequenceIds: string[] = [];
      {
        let resolved = false;

        // primary:scenario_id 経路
        if (account.scenario_id) {
          let r = await supabase
            .from("line_step_sequences")
            .select("id")
            .eq("scenario_id", account.scenario_id)
            .eq("status", "active")
            .eq("kind", "step");
          if (r.error && /kind/i.test(r.error.message)) {
            // scenario_id 経路 + kind 列なし fallback
            r = await supabase
              .from("line_step_sequences")
              .select("id")
              .eq("scenario_id", account.scenario_id)
              .eq("status", "active");
          }
          if (!r.error) {
            sequenceIds = (r.data ?? []).map((s: { id: string }) => s.id);
            resolved = true;
          } else if (!/scenario_id/i.test(r.error.message)) {
            // scenario_id 列なし以外のエラーはここでログのみ出して、account_id fallback へ進む
            console.error(
              "[LINE Webhook] step_sequences (scenario_id 経路) fetch error:",
              r.error.message,
            );
          }
          // scenario_id 列なし(Step 02 未適用)時は resolved=false のまま account_id 経路へフォールスルー
        }

        // fallback:account_id 経路(scenario_id 解決不能 or scenario_id 列なし)
        if (!resolved) {
          let r = await supabase
            .from("line_step_sequences")
            .select("id")
            .eq("account_id", account.id)
            .eq("status", "active")
            .eq("kind", "step");
          if (r.error && /kind/i.test(r.error.message)) {
            // account_id 経路 + kind 列なし fallback
            r = await supabase
              .from("line_step_sequences")
              .select("id")
              .eq("account_id", account.id)
              .eq("status", "active");
          }
          if (!r.error) {
            sequenceIds = (r.data ?? []).map((s: { id: string }) => s.id);
          } else if (/account_id/i.test(r.error.message)) {
            // Step 11 適用後 + scenario_id 解決不能 → 該当データなし扱いで silent skip
            console.warn(
              "[LINE Webhook] step_sequences: account_id 列なし + scenario_id 解決不能のためスキップ (account=" +
                account.id +
                ")",
            );
          } else {
            console.error(
              "[LINE Webhook] step_sequences (account_id 経路) fetch error:",
              r.error.message,
            );
          }
        }
      }

      if (sequenceIds.length > 0) {
        const { data: msgs } = await supabase
          .from("line_step_messages")
          .select("id, body, payload, msg_type, step_order, sequence_id, delay_minutes")
          .in("sequence_id", sequenceIds)
          .order("step_order", { ascending: true });

        const displayName = profile?.displayName ?? "ゲスト";

        // PR#2-B: 即時配信(delay_minutes = 0)を「1 push にまとめる」方式へ書換
        //
        // 既存(行ごとに pushLineMessages 単発)では、ダッシュボード UI で
        // 「1 配信 = メッセージ 1/2/3」と意図したものが LINE 通知 3 回飛ぶ問題があった。
        // 本修正で同 delay_minutes の複数行を 1 push にまとめる(LINE API 上限 5 件 / 1 push)。
        //
        // 副次効果として、MARI 等の既存 scenario で「同 delay_minutes の複数 step_messages」が
        // ある場合も 1 通知に集約される(UI 意図に沿う本来の挙動、UX 改善方向)。
        //
        // branch 評価のための ReplacerContext / BranchEvalContext は、直前の matching
        // enrichment (pr2bExternalRef) 後に upsert された custom_values を反映するため、
        // 必ず本ループ前にビルドする。
        const delay0Msgs = (msgs ?? [])
          .filter((m) => m.delay_minutes === 0)
          .sort((a, b) => a.step_order - b.step_order);

        if (delay0Msgs.length > 0) {
          // 動的 import で循環参照回避(line-replacer は line.ts 経由でも使われる)
          const { buildReplacerContext, buildBranchEvalContext, defaultContext } =
            await import("@/lib/line-replacer");
          const replacerCtx = upserted
            ? await buildReplacerContext(supabase, { id: upserted.id })
            : defaultContext(displayName);
          const branchCtx = upserted
            ? await buildBranchEvalContext(supabase, { id: upserted.id })
            : { label_ids: [], inflow_route_id: null, custom_fields: {} };

          // 各メッセージをビルド(null = branch defaultMessage=null フォールスルー、スキップ)
          const builtMessages: Array<{
            built: Record<string, unknown>;
            src: (typeof delay0Msgs)[number];
          }> = [];
          for (const msg of delay0Msgs) {
            const payload = (msg.payload as Record<string, unknown> | null) ?? {
              msgType: "text",
              body: msg.body,
            };
            const lineMsg = buildLineMessage(payload, replacerCtx, branchCtx);
            if (!lineMsg) continue;
            builtMessages.push({ built: lineMsg, src: msg });
          }

          // 5 件単位で chunk(LINE Push API 制約: 1 push = 最大 5 件)
          for (let i = 0; i < builtMessages.length; i += 5) {
            const chunk = builtMessages.slice(i, i + 5);
            try {
              const res = await pushLineMessages(
                account.channel_access_token!,
                userId,
                chunk.map((c) => c.built),
              );
              if (!res.ok) {
                console.error(
                  "[LINE Webhook] 登録直後ステップまとめ送信失敗:",
                  res.status,
                  res.error,
                );
              } else {
                // チャット画面表示用ログを各メッセージごとに記録
                for (const c of chunk) {
                  const builtType = (c.built.type as string) || "text";
                  const payload =
                    (c.src.payload as Record<string, unknown> | null) ?? {
                      msgType: "text",
                      body: c.src.body,
                    };
                  await supabase.from("line_messages").insert({
                    line_account_id: account.id,
                    line_user_id: userId,
                    direction: "outgoing",
                    message_type: builtType,
                    message_text: summarizeBuiltMessage(c.built, payload),
                    sent_at: new Date().toISOString(),
                  });
                }
              }
            } catch (e) {
              console.error("[LINE Webhook] 登録直後ステップまとめ送信例外:", e);
            }
          }
        }

        // N分後配信 (delay_minutes > 0) があるシーケンスにエンロールメント作成
        const seqsWithDelay = new Set(
          (msgs ?? []).filter((m) => m.delay_minutes > 0).map((m) => m.sequence_id as string),
        );
        if (seqsWithDelay.size > 0 && upserted) {
          // 即時送信済みの最大 step_order を計算（エンロールメントの last_sent_step に設定）
          const immediateSteps = (msgs ?? []).filter((m) => m.delay_minutes === 0);
          for (const seqId of seqsWithDelay) {
            const maxImmediate = immediateSteps
              .filter((m) => m.sequence_id === seqId)
              .reduce((max, m) => Math.max(max, m.step_order), 0);
            try {
              await supabase.from("line_step_enrollments").upsert(
                {
                  sequence_id: seqId,
                  follower_id: upserted.id,
                  account_id: account.id,
                  line_user_id: userId,
                  enrolled_at: new Date().toISOString(),
                  last_sent_step: maxImmediate,
                  status: "active",
                },
                { onConflict: "sequence_id,follower_id" },
              );
            } catch (e) {
              console.error("[LINE Webhook] エンロールメント作成失敗:", e);
            }
          }
        }
      }
    } catch (e) {
      console.error("[LINE Webhook] ステップ配信起動失敗:", e);
    }
  }
}

async function handleUnfollow(event: LineEvent, accountId: string) {
  const { error } = await supabase
    .from("line_followers")
    .update({
      status: "unfollowed",
      unfollowed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("line_account_id", accountId)
    .eq("line_user_id", event.source.userId);

  if (error) {
    console.error("[LINE Webhook] unfollow更新失敗:", error.message);
  }
}

async function saveEvent(event: LineEvent, accountId: string) {
  const { error } = await supabase
    .from("line_messages")
    .insert({
      line_account_id: accountId,
      line_user_id: event.source.userId,
      direction: "incoming",
      message_type: event.type === "message" ? event.message?.type ?? "text" : event.type,
      message_text: event.message?.text ?? null,
      raw_event: event,
      line_message_id: event.message?.id ?? null,
      reply_token: event.replyToken ?? null,
      sent_at: new Date(event.timestamp).toISOString(),
    });

  if (error) {
    console.error("[LINE Webhook] event保存失敗:", error.message);
  }
}

async function handleBlock(event: LineEvent, accountId: string) {
  const { error } = await supabase
    .from("line_followers")
    .update({
      status: "blocked",
      updated_at: new Date().toISOString(),
    })
    .eq("line_account_id", accountId)
    .eq("line_user_id", event.source.userId);

  if (error) {
    console.error("[LINE Webhook] block更新失敗:", error.message);
  }
}

async function handlePostback(event: LineEvent, account: LineAccountRow) {
  const postbackData = event.postback?.data ?? "";
  console.log(`[LINE Webhook] handlePostback: userId=${event.source.userId}, data=${postbackData}`);

  // postbackデータをメッセージとして保存
  await supabase.from("line_messages").insert({
    line_account_id: account.id,
    line_user_id: event.source.userId,
    direction: "incoming",
    message_type: "postback",
    message_text: postbackData,
    raw_event: event,
    reply_token: event.replyToken ?? null,
    sent_at: new Date(event.timestamp).toISOString(),
  });

  // postbackデータのパース: "action=xxx&label_id=yyy" 形式をサポート
  const params = new URLSearchParams(postbackData);
  const action = params.get("action");

  if (action === "add_label" && params.get("label_id")) {
    // ラベル追加アクション
    const { data: follower } = await supabase
      .from("line_followers")
      .select("id")
      .eq("line_account_id", account.id)
      .eq("line_user_id", event.source.userId)
      .maybeSingle();
    if (follower) {
      await supabase.from("line_follower_labels").upsert({
        label_id: params.get("label_id"),
        follower_id: follower.id,
      });
      await fireTrigger("label_added", {
        account_id: account.id,
        line_user_id: event.source.userId,
        follower_id: follower.id,
        label_id: params.get("label_id"),
      });
    }
  } else if (action === "start_sequence" && params.get("sequence_id")) {
    // シーケンス開始アクション
    const { data: follower } = await supabase
      .from("line_followers")
      .select("id")
      .eq("line_account_id", account.id)
      .eq("line_user_id", event.source.userId)
      .maybeSingle();
    if (follower) {
      await supabase.from("line_step_enrollments").upsert({
        sequence_id: params.get("sequence_id"),
        follower_id: follower.id,
        account_id: account.id,
        line_user_id: event.source.userId,
        enrolled_at: new Date().toISOString(),
        last_sent_step: 0,
        status: "active",
      });
    }
  }

  // message_received トリガーとしても発火（Postbackはメッセージ受信の一種として扱う）
  await fireTrigger("message_received", {
    account_id: account.id,
    line_user_id: event.source.userId,
    message_text: postbackData,
  });
}

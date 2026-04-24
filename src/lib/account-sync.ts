// ============================================================
// マスター → 同期ターゲット 同期コアロジック
// ============================================================
// マスター (role='main') の設定を、同一案件内の同期ターゲット
// (role='distribute' = 分散本番、または role='standby' = 予備) に複製する。
//
// - BAN対策の予備 (standby) を常にマスターと同じ状態に保つ
// - 分散登録の distribute 本番群もマスターと完全同一の設定で運用する
// のが目的。
//
// 同期対象:
//   1. 挨拶メッセージ (line_accounts.greeting_message)
//   2. ラベル (line_labels)
//   3. カスタムフィールド (line_custom_fields)
//   4. ステップ配信 (line_step_sequences kind='step' + line_step_messages)
//   5. 流入経路 (line_inflow_routes)
//   6. リッチメニュー (line_rich_menus, 画像URLベースで変更検知)
//
// 方針:
//   - 同名upsert (name / field_key / code で突合)
//   - マスターに無いものでもターゲットの既存は削除しない (安全優先)
//   - ターゲット sequence に active enrollment があればその sequence はスキップ
//   - リッチメニューの line_rich_menu_id (LINE API側) はコピーしない
// ============================================================

import { SupabaseClient } from "@supabase/supabase-js";
import { notifyChatwork } from "./chatwork";

export interface SyncItemResult {
  item: string;
  copied: number;
  updated: number;
  skipped: number;
  failed: number;
  notes?: string[];
}

export interface SyncAccountResult {
  source_account_id: string;
  target_account_id: string;
  target_account_name: string | null;
  items: SyncItemResult[];
  overall: "success" | "partial" | "failed";
  error?: string;
}

export interface AccountRow {
  id: string;
  account_name: string | null;
  project_id: string | null;
  role: string | null;
  is_active: boolean;
  greeting_message: string | null;
}

// ------------------------------------------------------------
// ユーティリティ
// ------------------------------------------------------------

function pushNote(notes: string[], msg: string) {
  notes.push(msg);
}

function emptyResult(item: string): SyncItemResult {
  return { item, copied: 0, updated: 0, skipped: 0, failed: 0, notes: [] };
}

// ------------------------------------------------------------
// 1. 挨拶メッセージ
// ------------------------------------------------------------
async function syncGreetingMessage(
  db: SupabaseClient,
  main: AccountRow,
  standby: AccountRow,
): Promise<SyncItemResult> {
  const result = emptyResult("greeting_message");
  if ((main.greeting_message ?? null) === (standby.greeting_message ?? null)) {
    result.skipped = 1;
    pushNote(result.notes!, "変更なし");
    return result;
  }
  const { error } = await db
    .from("line_accounts")
    .update({
      greeting_message: main.greeting_message ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", standby.id);
  if (error) {
    result.failed = 1;
    pushNote(result.notes!, error.message);
  } else {
    result.updated = 1;
  }
  return result;
}

// ------------------------------------------------------------
// 2. ラベル
// ------------------------------------------------------------
async function syncLabels(
  db: SupabaseClient,
  mainId: string,
  standbyId: string,
): Promise<SyncItemResult> {
  const result = emptyResult("labels");

  const { data: mainLabels, error: listErr } = await db
    .from("line_labels")
    .select("name, color, sort_order")
    .eq("account_id", mainId);
  if (listErr) {
    result.failed = 1;
    pushNote(result.notes!, listErr.message);
    return result;
  }

  for (const lb of mainLabels ?? []) {
    const { data: exists } = await db
      .from("line_labels")
      .select("id, color, sort_order")
      .eq("account_id", standbyId)
      .eq("name", lb.name)
      .maybeSingle();
    if (exists) {
      if (exists.color !== lb.color || exists.sort_order !== lb.sort_order) {
        const upd = await db
          .from("line_labels")
          .update({ color: lb.color, sort_order: lb.sort_order, updated_at: new Date().toISOString() })
          .eq("id", exists.id);
        if (upd.error) {
          result.failed++;
          pushNote(result.notes!, `label ${lb.name}: ${upd.error.message}`);
        } else {
          result.updated++;
        }
      } else {
        result.skipped++;
      }
    } else {
      const ins = await db.from("line_labels").insert({
        account_id: standbyId,
        name: lb.name,
        color: lb.color,
        sort_order: lb.sort_order,
      });
      if (ins.error) {
        result.failed++;
        pushNote(result.notes!, `label ${lb.name}: ${ins.error.message}`);
      } else {
        result.copied++;
      }
    }
  }
  return result;
}

// ------------------------------------------------------------
// 3. カスタムフィールド定義
// ------------------------------------------------------------
async function syncCustomFields(
  db: SupabaseClient,
  mainId: string,
  standbyId: string,
): Promise<SyncItemResult> {
  const result = emptyResult("custom_fields");

  const { data: mainFields, error: listErr } = await db
    .from("line_custom_fields")
    .select("field_key, field_label, field_type, options, sort_order")
    .eq("account_id", mainId);
  if (listErr) {
    result.failed = 1;
    pushNote(result.notes!, listErr.message);
    return result;
  }

  for (const f of mainFields ?? []) {
    const { data: exists } = await db
      .from("line_custom_fields")
      .select("id, field_label, field_type, options, sort_order")
      .eq("account_id", standbyId)
      .eq("field_key", f.field_key)
      .maybeSingle();

    if (exists) {
      const same =
        exists.field_label === f.field_label &&
        exists.field_type === f.field_type &&
        (exists.sort_order ?? 0) === (f.sort_order ?? 0) &&
        JSON.stringify(exists.options ?? null) === JSON.stringify(f.options ?? null);
      if (same) {
        result.skipped++;
        continue;
      }
      const upd = await db
        .from("line_custom_fields")
        .update({
          field_label: f.field_label,
          field_type: f.field_type,
          options: f.options ?? null,
          sort_order: f.sort_order ?? 0,
        })
        .eq("id", exists.id);
      if (upd.error) {
        result.failed++;
        pushNote(result.notes!, `field ${f.field_key}: ${upd.error.message}`);
      } else {
        result.updated++;
      }
    } else {
      const ins = await db.from("line_custom_fields").insert({
        account_id: standbyId,
        field_key: f.field_key,
        field_label: f.field_label,
        field_type: f.field_type,
        options: f.options ?? null,
        sort_order: f.sort_order ?? 0,
      });
      if (ins.error) {
        result.failed++;
        pushNote(result.notes!, `field ${f.field_key}: ${ins.error.message}`);
      } else {
        result.copied++;
      }
    }
  }
  return result;
}

// ------------------------------------------------------------
// 4. ステップ配信 (kind='step' のみ)
// ------------------------------------------------------------
interface SeqRow {
  id: string;
  name: string;
  status: string | null;
  kind: string | null;
}

interface MsgRow {
  sequence_id: string;
  step_order: number;
  delay_minutes: number;
  media: string | null;
  title: string | null;
  body: string | null;
  msg_type: string | null;
  payload: Record<string, unknown> | null;
  status: string | null;
}

async function syncStepSequences(
  db: SupabaseClient,
  mainId: string,
  standbyId: string,
  standbyName: string | null,
): Promise<SyncItemResult> {
  const result = emptyResult("step_sequences");

  // kind カラム有無のハンドリング: エラーなら kind なし扱い
  let mainSeqs: SeqRow[] = [];
  {
    const r = await db
      .from("line_step_sequences")
      .select("id, name, status, kind")
      .eq("account_id", mainId)
      .eq("kind", "step");
    if (r.error && /kind/.test(r.error.message)) {
      const fb = await db
        .from("line_step_sequences")
        .select("id, name, status")
        .eq("account_id", mainId);
      mainSeqs = ((fb.data ?? []) as Array<Omit<SeqRow, "kind">>).map((s) => ({ ...s, kind: null }));
    } else if (r.error) {
      result.failed = 1;
      pushNote(result.notes!, r.error.message);
      return result;
    } else {
      mainSeqs = (r.data ?? []) as SeqRow[];
    }
  }

  for (const ms of mainSeqs) {
    // 予備側の同名シーケンスを探す
    const sel = await db
      .from("line_step_sequences")
      .select("id, name, status, kind")
      .eq("account_id", standbyId)
      .eq("name", ms.name)
      .maybeSingle();

    let targetSeqId: string | null = (sel.data?.id as string) ?? null;

    if (targetSeqId) {
      // active enrollment チェック (安全策)
      const { data: activeEnroll } = await db
        .from("line_step_enrollments")
        .select("id")
        .eq("sequence_id", targetSeqId)
        .eq("status", "active")
        .limit(1);
      if (activeEnroll && activeEnroll.length > 0) {
        result.skipped++;
        const note = `シナリオ「${ms.name}」をスキップした理由: active enrollment 存在`;
        pushNote(result.notes!, note);
        const warn = `⚠ 予備アカウント「${standbyName ?? standbyId}」のシナリオ「${ms.name}」は進行中のenrollmentがあるため同期をスキップしました`;
        await notifyChatwork(warn).catch(() => { /* 通知失敗は握りつぶす */ });
        continue;
      }

      // シーケンス本体を更新 (status のみ同期、kind は step 固定)
      const upd = await db
        .from("line_step_sequences")
        .update({
          status: ms.status ?? "active",
          updated_at: new Date().toISOString(),
        })
        .eq("id", targetSeqId);
      if (upd.error) {
        result.failed++;
        pushNote(result.notes!, `sequence ${ms.name}: ${upd.error.message}`);
        continue;
      }

      // 既存 messages を全消し
      const del = await db.from("line_step_messages").delete().eq("sequence_id", targetSeqId);
      if (del.error) {
        result.failed++;
        pushNote(result.notes!, `messages delete ${ms.name}: ${del.error.message}`);
        continue;
      }
    } else {
      // 新規作成
      const ins = await db
        .from("line_step_sequences")
        .insert({
          account_id: standbyId,
          name: ms.name,
          status: ms.status ?? "active",
          kind: "step",
        })
        .select("id")
        .single();
      if (ins.error || !ins.data) {
        // kind カラム未存在時は kind 抜きで再試行
        if (ins.error && /kind/.test(ins.error.message)) {
          const ins2 = await db
            .from("line_step_sequences")
            .insert({
              account_id: standbyId,
              name: ms.name,
              status: ms.status ?? "active",
            })
            .select("id")
            .single();
          if (ins2.error || !ins2.data) {
            result.failed++;
            pushNote(result.notes!, `sequence ${ms.name}: ${ins2.error?.message ?? "insert failed"}`);
            continue;
          }
          targetSeqId = ins2.data.id as string;
        } else {
          result.failed++;
          pushNote(result.notes!, `sequence ${ms.name}: ${ins.error?.message ?? "insert failed"}`);
          continue;
        }
      } else {
        targetSeqId = ins.data.id as string;
      }
    }

    if (!targetSeqId) continue;

    // メインのメッセージをコピー
    const { data: mainMsgs, error: msgErr } = await db
      .from("line_step_messages")
      .select("step_order, delay_minutes, media, title, body, msg_type, payload, status")
      .eq("sequence_id", ms.id)
      .order("step_order", { ascending: true });
    if (msgErr) {
      result.failed++;
      pushNote(result.notes!, `messages fetch ${ms.name}: ${msgErr.message}`);
      continue;
    }

    if ((mainMsgs ?? []).length > 0) {
      const rows = (mainMsgs as MsgRow[]).map((m) => ({
        sequence_id: targetSeqId!,
        step_order: m.step_order,
        delay_minutes: m.delay_minutes,
        media: m.media,
        title: m.title,
        body: m.body,
        msg_type: m.msg_type,
        payload: m.payload,
        status: m.status,
      }));
      const insMsgs = await db.from("line_step_messages").insert(rows);
      if (insMsgs.error) {
        result.failed++;
        pushNote(result.notes!, `messages insert ${ms.name}: ${insMsgs.error.message}`);
        continue;
      }
    }

    if (sel.data?.id) {
      result.updated++;
    } else {
      result.copied++;
    }
  }

  return result;
}

// ------------------------------------------------------------
// 5. 流入経路
// ------------------------------------------------------------
async function syncInflowRoutes(
  db: SupabaseClient,
  mainId: string,
  standbyId: string,
): Promise<SyncItemResult> {
  const result = emptyResult("inflow_routes");

  const { data: mainRoutes, error: listErr } = await db
    .from("line_inflow_routes")
    .select("name, code, url, description, is_active, project_id")
    .eq("account_id", mainId);
  if (listErr) {
    result.failed = 1;
    pushNote(result.notes!, listErr.message);
    return result;
  }

  for (const r of mainRoutes ?? []) {
    const { data: exists } = await db
      .from("line_inflow_routes")
      .select("id, name, url, description, is_active")
      .eq("account_id", standbyId)
      .eq("code", r.code)
      .maybeSingle();

    if (exists) {
      const same =
        exists.name === r.name &&
        (exists.url ?? null) === (r.url ?? null) &&
        (exists.description ?? null) === (r.description ?? null) &&
        exists.is_active === r.is_active;
      if (same) {
        result.skipped++;
        continue;
      }
      const upd = await db
        .from("line_inflow_routes")
        .update({
          name: r.name,
          url: r.url,
          description: r.description,
          is_active: r.is_active,
          updated_at: new Date().toISOString(),
        })
        .eq("id", exists.id);
      if (upd.error) {
        result.failed++;
        pushNote(result.notes!, `route ${r.code}: ${upd.error.message}`);
      } else {
        result.updated++;
      }
    } else {
      const ins = await db.from("line_inflow_routes").insert({
        account_id: standbyId,
        name: r.name,
        code: r.code,
        url: r.url,
        description: r.description,
        is_active: r.is_active,
        project_id: r.project_id,
      });
      if (ins.error) {
        result.failed++;
        pushNote(result.notes!, `route ${r.code}: ${ins.error.message}`);
      } else {
        result.copied++;
      }
    }
  }
  return result;
}

// ------------------------------------------------------------
// 6. リッチメニュー (image_url で変更検知)
// ------------------------------------------------------------
async function syncRichMenus(
  db: SupabaseClient,
  mainId: string,
  standbyId: string,
): Promise<SyncItemResult> {
  const result = emptyResult("rich_menus");

  const { data: mainMenus, error: listErr } = await db
    .from("line_rich_menus")
    .select("name, image_url, size_type, chat_bar_text, selected, is_default, template_type, areas, status")
    .eq("line_account_id", mainId);
  if (listErr) {
    // テーブル未作成時は skip
    if ((listErr as { code?: string }).code === "42P01") {
      result.skipped = 1;
      pushNote(result.notes!, "line_rich_menus テーブル未作成");
      return result;
    }
    result.failed = 1;
    pushNote(result.notes!, listErr.message);
    return result;
  }

  for (const m of mainMenus ?? []) {
    const { data: exists } = await db
      .from("line_rich_menus")
      .select("id, image_url, size_type, chat_bar_text, selected, is_default, template_type, areas, status")
      .eq("line_account_id", standbyId)
      .eq("name", m.name)
      .maybeSingle();

    const baseFields = {
      size_type: m.size_type,
      chat_bar_text: m.chat_bar_text,
      selected: m.selected,
      is_default: m.is_default,
      template_type: m.template_type,
      areas: m.areas ?? [],
      status: "draft" as const, // 予備側は常に draft (LINE APIへの反映は別)
    };

    if (exists) {
      // 画像URLが変化した時だけ image_url を更新、他メタは毎回同期
      const imageChanged = (exists.image_url ?? null) !== (m.image_url ?? null);
      const updatePayload: Record<string, unknown> = {
        ...baseFields,
        updated_at: new Date().toISOString(),
      };
      if (imageChanged) updatePayload.image_url = m.image_url ?? null;

      const upd = await db
        .from("line_rich_menus")
        .update(updatePayload)
        .eq("id", exists.id);
      if (upd.error) {
        result.failed++;
        pushNote(result.notes!, `menu ${m.name}: ${upd.error.message}`);
      } else {
        result.updated++;
        if (imageChanged) pushNote(result.notes!, `menu ${m.name}: image_url 更新`);
      }
    } else {
      const ins = await db.from("line_rich_menus").insert({
        line_account_id: standbyId,
        name: m.name,
        image_url: m.image_url ?? null,
        // line_rich_menu_id は意図的にコピーしない (予備が昇格後に再デプロイ)
        ...baseFields,
      });
      if (ins.error) {
        result.failed++;
        pushNote(result.notes!, `menu ${m.name}: ${ins.error.message}`);
      } else {
        result.copied++;
      }
    }
  }

  return result;
}

// ------------------------------------------------------------
// メインエントリ: 1つの main → 1つの standby
// ------------------------------------------------------------
export async function syncOneStandby(
  db: SupabaseClient,
  main: AccountRow,
  standby: AccountRow,
): Promise<SyncAccountResult> {
  const items: SyncItemResult[] = [];

  const steps: Array<() => Promise<SyncItemResult>> = [
    () => syncGreetingMessage(db, main, standby),
    () => syncLabels(db, main.id, standby.id),
    () => syncCustomFields(db, main.id, standby.id),
    () => syncStepSequences(db, main.id, standby.id, standby.account_name),
    () => syncInflowRoutes(db, main.id, standby.id),
    () => syncRichMenus(db, main.id, standby.id),
  ];

  for (const step of steps) {
    try {
      items.push(await step());
    } catch (e) {
      items.push({
        item: "unknown",
        copied: 0,
        updated: 0,
        skipped: 0,
        failed: 1,
        notes: [(e as Error).message],
      });
    }
  }

  const anyFailed = items.some((it) => it.failed > 0);
  const anySkipped = items.some((it) => it.skipped > 0);
  const overall: SyncAccountResult["overall"] = anyFailed
    ? "partial"
    : anySkipped
      ? "partial"
      : "success";

  return {
    source_account_id: main.id,
    target_account_id: standby.id,
    target_account_name: standby.account_name,
    items,
    overall,
  };
}

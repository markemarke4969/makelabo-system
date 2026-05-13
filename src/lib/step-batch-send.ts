import { supabaseAdmin } from "@/lib/supabase";
import {
  buildLineMessage,
  pushLineMessages,
  summarizeBuiltMessage,
} from "@/lib/line";
import {
  buildReplacerContext,
  buildBranchEvalContext,
  defaultContext,
} from "@/lib/line-replacer";

// ============================================================
// PR#2-D: delay=0 ステップメッセージのまとめ送信ヘルパ
// ============================================================
// PR#2-B で webhook/route.ts 内に実装した「同 delay_minutes=0 の複数 step_messages
// を 1 push にまとめる」ロジックを src/lib/ に切り出して、webhook と PR#2-D の
// aifukugyo-redeliver API の両方から呼べるようにする。
//
// 処理:
// - sequenceIds に紐づく line_step_messages のうち delay_minutes=0 を全件 SELECT
// - buildReplacerContext + buildBranchEvalContext で配信時 context を組立て
//   (matching 値が follow 直後に upsert された custom_values を反映)
// - buildLineMessage で各メッセージビルド(null = branch defaultMessage=null
//   フォールスルーは push しない)
// - 5 件単位で chunk して pushLineMessages(LINE Push API 上限)
// - 各メッセージを line_messages に outgoing 記録
//
// 失敗は throw しない:push 失敗は console.error + 部分カウント返却。
// 呼出側で必要なら結果を見て判断する。
// ============================================================

export interface SendDelayZeroBatchArgs {
  followerId: string;
  accountId: string;
  lineUserId: string;
  channelAccessToken: string;
  displayName?: string;
  sequenceIds: string[];
}

export interface SendDelayZeroBatchResult {
  sentCount: number;
  chunks: number;
  failedChunks: number;
}

export async function sendDelayZeroBatch(
  args: SendDelayZeroBatchArgs,
): Promise<SendDelayZeroBatchResult> {
  if (args.sequenceIds.length === 0) {
    return { sentCount: 0, chunks: 0, failedChunks: 0 };
  }

  // 1. delay=0 step_messages 取得
  const { data: msgs } = await supabaseAdmin
    .from("line_step_messages")
    .select("id, body, payload, msg_type, step_order, sequence_id, delay_minutes")
    .in("sequence_id", args.sequenceIds)
    .order("step_order", { ascending: true });

  const delay0Msgs = (msgs ?? [])
    .filter((m) => m.delay_minutes === 0)
    .sort((a, b) => a.step_order - b.step_order);

  if (delay0Msgs.length === 0) {
    return { sentCount: 0, chunks: 0, failedChunks: 0 };
  }

  // 2. branch / replacer context 構築(matching enrichment 後の custom_values を反映)
  const displayName = args.displayName ?? "ゲスト";
  const replacerCtx = await buildReplacerContext(supabaseAdmin, {
    id: args.followerId,
  });
  if (!replacerCtx || !replacerCtx.display_name) {
    // 念のため defaultContext で初期化(buildReplacerContext は follower 未発見時に
    // defaultContext を返すので通常はこちらは発火しない)
    Object.assign(replacerCtx, defaultContext(displayName));
  }
  const branchCtx = await buildBranchEvalContext(supabaseAdmin, {
    id: args.followerId,
  });

  // 3. 各メッセージをビルド(null = branch defaultMessage=null フォールスルー、skip)
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

  if (builtMessages.length === 0) {
    return { sentCount: 0, chunks: 0, failedChunks: 0 };
  }

  // 4. 5 件単位で chunk → push + line_messages 記録
  let sentCount = 0;
  let chunks = 0;
  let failedChunks = 0;
  for (let i = 0; i < builtMessages.length; i += 5) {
    chunks++;
    const chunk = builtMessages.slice(i, i + 5);
    try {
      const res = await pushLineMessages(
        args.channelAccessToken,
        args.lineUserId,
        chunk.map((c) => c.built),
      );
      if (!res.ok) {
        failedChunks++;
        console.error(
          "[step-batch-send] push 失敗:",
          res.status,
          res.error,
        );
        continue;
      }
      // 成功時:各メッセージを line_messages に outgoing 記録
      for (const c of chunk) {
        const builtType = (c.built.type as string) || "text";
        const payload =
          (c.src.payload as Record<string, unknown> | null) ?? {
            msgType: "text",
            body: c.src.body,
          };
        await supabaseAdmin.from("line_messages").insert({
          line_account_id: args.accountId,
          line_user_id: args.lineUserId,
          direction: "outgoing",
          message_type: builtType,
          message_text: summarizeBuiltMessage(c.built, payload),
          sent_at: new Date().toISOString(),
        });
        sentCount++;
      }
    } catch (e) {
      failedChunks++;
      console.error("[step-batch-send] push 例外:", e);
    }
  }

  return { sentCount, chunks, failedChunks };
}

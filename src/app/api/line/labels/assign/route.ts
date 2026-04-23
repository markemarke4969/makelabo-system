import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";
import { fireTrigger } from "@/lib/action-rules";

// ------------------------------------------------------------
// POST /api/line/labels/assign
//   body: {
//     label_id, line_user_id, account_id,
//     assigned?: boolean,       // true=付与（default）, false=解除
//     cross_account?: boolean,  // true なら同一 project 内の別アカウントの
//                                //       同一 line_user_id にも同名ラベルを付与/解除
//   }
//   line_user_id → follower_id への解決を API 内で行うことで、
//   クライアント側を line_user_id 中心で統一できる。
// ------------------------------------------------------------
export async function POST(request: NextRequest) {
  const body = await request.json();
  const labelId: string | undefined = body.label_id;
  const lineUserId: string | undefined = body.line_user_id;
  const accountId: string | undefined = body.account_id;
  const assigned: boolean = body.assigned !== false; // default true
  const crossAccount: boolean = body.cross_account === true;

  if (!labelId || !lineUserId || !accountId) {
    return Response.json(
      { error: "label_id, line_user_id, account_id are required" },
      { status: 400 },
    );
  }

  // follower_id を解決
  const { data: follower, error: fErr } = await supabase
    .from("line_followers")
    .select("id")
    .eq("line_account_id", accountId)
    .eq("line_user_id", lineUserId)
    .maybeSingle();

  if (fErr) {
    return Response.json({ error: fErr.message }, { status: 500 });
  }
  if (!follower) {
    return Response.json(
      { error: `follower not found (account=${accountId}, user=${lineUserId})` },
      { status: 404 },
    );
  }

  // ソースラベル情報を取得（クロスアカウント時はラベル名と project を引くため）
  const { data: sourceLabel, error: lblErr } = await supabase
    .from("line_labels")
    .select("id, name, account_id")
    .eq("id", labelId)
    .maybeSingle();
  if (lblErr) {
    return Response.json({ error: lblErr.message }, { status: 500 });
  }
  if (!sourceLabel) {
    return Response.json({ error: "label not found" }, { status: 404 });
  }

  // --- 基本操作: 指定アカウントへの付与/解除 ---
  if (assigned) {
    const { error } = await supabase
      .from("line_follower_labels")
      .upsert(
        { label_id: labelId, follower_id: follower.id },
        { onConflict: "label_id,follower_id" },
      );
    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }
    await fireTrigger("label_added", {
      account_id: accountId,
      line_user_id: lineUserId,
      follower_id: follower.id,
      label_id: labelId,
    });
  } else {
    const { error } = await supabase
      .from("line_follower_labels")
      .delete()
      .eq("label_id", labelId)
      .eq("follower_id", follower.id);
    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }
  }

  // --- クロスアカウント処理 ---
  const crossResults: Array<{ account_id: string; ok: boolean; reason?: string }> = [];
  if (crossAccount) {
    // ソースアカウントの project_id を取得（同一 project ＝ 同一プロバイダー扱い）
    const { data: srcAccount } = await supabase
      .from("line_accounts")
      .select("project_id")
      .eq("id", accountId)
      .maybeSingle();

    if (srcAccount?.project_id) {
      // 同一 project 内の他アカウント一覧
      const { data: siblings } = await supabase
        .from("line_accounts")
        .select("id")
        .eq("project_id", srcAccount.project_id)
        .neq("id", accountId);

      for (const sib of siblings ?? []) {
        const sibId = sib.id as string;

        // 同名ラベルを取得（無ければスキップ）
        const { data: sibLabel } = await supabase
          .from("line_labels")
          .select("id")
          .eq("account_id", sibId)
          .eq("name", sourceLabel.name)
          .maybeSingle();
        if (!sibLabel) {
          crossResults.push({ account_id: sibId, ok: false, reason: "no matching label" });
          continue;
        }

        // 同一 line_user_id のフォロワーを取得
        const { data: sibFollower } = await supabase
          .from("line_followers")
          .select("id")
          .eq("line_account_id", sibId)
          .eq("line_user_id", lineUserId)
          .maybeSingle();
        if (!sibFollower) {
          crossResults.push({ account_id: sibId, ok: false, reason: "no matching follower" });
          continue;
        }

        if (assigned) {
          const { error } = await supabase
            .from("line_follower_labels")
            .upsert(
              { label_id: sibLabel.id, follower_id: sibFollower.id },
              { onConflict: "label_id,follower_id" },
            );
          if (error) {
            crossResults.push({ account_id: sibId, ok: false, reason: error.message });
            continue;
          }
          await fireTrigger("label_added", {
            account_id: sibId,
            line_user_id: lineUserId,
            follower_id: sibFollower.id,
            label_id: sibLabel.id,
          });
        } else {
          const { error } = await supabase
            .from("line_follower_labels")
            .delete()
            .eq("label_id", sibLabel.id)
            .eq("follower_id", sibFollower.id);
          if (error) {
            crossResults.push({ account_id: sibId, ok: false, reason: error.message });
            continue;
          }
        }
        crossResults.push({ account_id: sibId, ok: true });
      }
    }
  }

  return Response.json({
    ok: true,
    cross_account: crossAccount,
    cross_results: crossResults,
  });
}

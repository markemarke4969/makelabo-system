import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { POINT_ACTIONS } from "@/lib/fia-points";

// ========================================
// GET: ポイント残高・レベル・履歴を取得
// ========================================
export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // プロフィールからポイント残高取得
    const { data: profile } = await supabase
      .from("fiana_profiles")
      .select("fia_points, fia_level")
      .eq("user_id", user.id)
      .single();

    // 累計獲得ポイント（付与のみ合計）
    const { data: totalData } = await supabase
      .from("fia_points_ledger")
      .select("amount")
      .eq("user_id", user.id)
      .gt("amount", 0);

    const totalEarned = totalData?.reduce((sum, r) => sum + r.amount, 0) || 0;

    // 直近の履歴
    const { data: ledger } = await supabase
      .from("fia_points_ledger")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50);

    // 今日のチェックイン状況
    const today = new Date().toISOString().split("T")[0];
    const { data: checkins } = await supabase
      .from("fia_daily_checkins")
      .select("action")
      .eq("user_id", user.id)
      .eq("checkin_date", today);

    // アンロック中のシステム
    const { data: unlocks } = await supabase
      .from("fia_system_unlocks")
      .select("*")
      .eq("user_id", user.id)
      .gte("expires_at", new Date().toISOString());

    return NextResponse.json({
      points: profile?.fia_points || 0,
      level: profile?.fia_level || 1,
      totalEarned,
      ledger: ledger || [],
      todayCheckins: checkins?.map((c) => c.action) || [],
      activeUnlocks: unlocks || [],
    });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// ========================================
// POST: ポイント付与・消化
// ========================================
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { action, systemId } = body as {
      action: string;
      systemId?: string;
    };

    if (!action) {
      return NextResponse.json(
        { error: "action is required" },
        { status: 400 }
      );
    }

    // アクション定義の取得
    const actionDef = POINT_ACTIONS.find((a) => a.action === action);

    // system_unlock は別処理
    if (action === "system_unlock" && systemId) {
      return handleSystemUnlock(supabase, user.id, systemId);
    }

    if (!actionDef) {
      return NextResponse.json(
        { error: "Unknown action" },
        { status: 400 }
      );
    }

    // デイリー制限チェック
    if (actionDef.daily) {
      const today = new Date().toISOString().split("T")[0];
      const { data: existing } = await supabase
        .from("fia_daily_checkins")
        .select("id")
        .eq("user_id", user.id)
        .eq("checkin_date", today)
        .eq("action", action)
        .limit(1);

      if (existing && existing.length > 0) {
        return NextResponse.json(
          { error: "Already claimed today", alreadyClaimed: true },
          { status: 409 }
        );
      }
    }

    // 現在のポイント取得
    const { data: profile } = await supabase
      .from("fiana_profiles")
      .select("fia_points")
      .eq("user_id", user.id)
      .single();

    const currentPoints = profile?.fia_points || 0;
    const newBalance = currentPoints + actionDef.points;

    // ポイント更新
    await supabase
      .from("fiana_profiles")
      .update({ fia_points: newBalance })
      .eq("user_id", user.id);

    // 台帳に記録
    await supabase.from("fia_points_ledger").insert({
      user_id: user.id,
      amount: actionDef.points,
      balance_after: newBalance,
      action: actionDef.action,
      description: actionDef.label,
    });

    // デイリーチェックイン記録
    if (actionDef.daily) {
      await supabase.from("fia_daily_checkins").insert({
        user_id: user.id,
        action: actionDef.action,
      });
    }

    // レベル更新
    const { data: totalData } = await supabase
      .from("fia_points_ledger")
      .select("amount")
      .eq("user_id", user.id)
      .gt("amount", 0);

    const totalEarned = totalData?.reduce((sum, r) => sum + r.amount, 0) || 0;

    const { calculateLevel } = await import("@/lib/fia-points");
    const newLevel = calculateLevel(totalEarned);

    await supabase
      .from("fiana_profiles")
      .update({ fia_level: newLevel.level })
      .eq("user_id", user.id);

    return NextResponse.json({
      success: true,
      points: newBalance,
      earned: actionDef.points,
      level: newLevel.level,
      totalEarned,
      action: actionDef.action,
      label: actionDef.label,
    });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// ========================================
// システム体験開放処理
// ========================================
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleSystemUnlock(supabase: any, userId: string, systemId: string) {
  const { SYSTEM_UNLOCK_COSTS } = await import("@/lib/fia-points");
  const cost = SYSTEM_UNLOCK_COSTS.find((c) => c.systemId === systemId);

  if (!cost) {
    return NextResponse.json({ error: "Invalid system" }, { status: 400 });
  }

  // 現在のポイント確認
  const { data: profile } = await supabase
    .from("fiana_profiles")
    .select("fia_points")
    .eq("user_id", userId)
    .single();

  const currentPoints = profile?.fia_points || 0;

  if (currentPoints < cost.fiaCost) {
    return NextResponse.json(
      { error: "Insufficient points", required: cost.fiaCost, current: currentPoints },
      { status: 400 }
    );
  }

  // 既にアクティブなアンロックがないかチェック
  const { data: existing } = await supabase
    .from("fia_system_unlocks")
    .select("id, expires_at")
    .eq("user_id", userId)
    .eq("system_id", systemId)
    .gte("expires_at", new Date().toISOString())
    .limit(1);

  if (existing && existing.length > 0) {
    return NextResponse.json(
      { error: "Already unlocked", expires_at: existing[0].expires_at },
      { status: 409 }
    );
  }

  const newBalance = currentPoints - cost.fiaCost;
  const expiresAt = new Date(
    Date.now() + cost.durationHours * 60 * 60 * 1000
  ).toISOString();

  // ポイント消化
  await supabase
    .from("fiana_profiles")
    .update({ fia_points: newBalance })
    .eq("user_id", userId);

  // 台帳に記録
  await supabase.from("fia_points_ledger").insert({
    user_id: userId,
    amount: -cost.fiaCost,
    balance_after: newBalance,
    action: "system_unlock",
    description: `${systemId} 体験開放`,
    metadata: { systemId, durationHours: cost.durationHours },
  });

  // アンロック記録
  await supabase.from("fia_system_unlocks").insert({
    user_id: userId,
    system_id: systemId,
    expires_at: expiresAt,
    fia_cost: cost.fiaCost,
  });

  return NextResponse.json({
    success: true,
    points: newBalance,
    systemId,
    expires_at: expiresAt,
  });
}

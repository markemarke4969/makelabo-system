import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";

// SMSクレジット残高・履歴取得
export async function GET(request: NextRequest) {
  const projectId = request.nextUrl.searchParams.get("project_id");
  const type = request.nextUrl.searchParams.get("type") ?? "balance";

  if (!projectId) return Response.json({ error: "project_id required" }, { status: 400 });

  if (type === "balance") {
    const { data } = await supabase
      .from("line_sms_credits")
      .select("balance, updated_at")
      .eq("project_id", projectId)
      .maybeSingle();
    return Response.json({ balance: data?.balance ?? 0, updated_at: data?.updated_at ?? null });
  }

  if (type === "history") {
    const { data } = await supabase
      .from("line_sms_credit_history")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .limit(50);
    return Response.json(data ?? []);
  }

  if (type === "logs") {
    const accountId = request.nextUrl.searchParams.get("account_id");
    let query = supabase
      .from("line_sms_logs")
      .select("*")
      .order("sent_at", { ascending: false })
      .limit(100);
    if (accountId) query = query.eq("account_id", accountId);
    const { data } = await query;
    return Response.json(data ?? []);
  }

  return Response.json({ error: "invalid type" }, { status: 400 });
}

// SMSクレジットチャージ
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { project_id, action, amount } = body;

  if (!project_id) return Response.json({ error: "project_id required" }, { status: 400 });

  if (action === "charge") {
    const credits = Number(amount);
    if (!credits || credits <= 0) return Response.json({ error: "invalid amount" }, { status: 400 });

    // 残高更新（upsert）
    const { data: current } = await supabase
      .from("line_sms_credits")
      .select("balance")
      .eq("project_id", project_id)
      .maybeSingle();

    const newBalance = (current?.balance ?? 0) + credits;

    await supabase.from("line_sms_credits").upsert(
      { project_id, balance: newBalance, updated_at: new Date().toISOString() },
      { onConflict: "project_id" },
    );

    // 履歴記録
    await supabase.from("line_sms_credit_history").insert({
      project_id,
      amount: credits,
      type: "charge",
      description: `${credits}クレジットをチャージ`,
    });

    return Response.json({ ok: true, balance: newBalance });
  }

  if (action === "send") {
    // SMS送信
    const { account_id, phone_number, message_text, follower_id } = body;
    if (!account_id || !phone_number || !message_text) {
      return Response.json({ error: "account_id, phone_number, message_text required" }, { status: 400 });
    }

    // Twilio 認証情報チェック
    const twilioSid = process.env.TWILIO_ACCOUNT_SID;
    const twilioToken = process.env.TWILIO_AUTH_TOKEN;
    const twilioFrom = process.env.TWILIO_PHONE_NUMBER;
    if (!twilioSid || !twilioToken || !twilioFrom) {
      return Response.json(
        { error: "Twilio認証情報が未設定です（TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_PHONE_NUMBER）" },
        { status: 500 },
      );
    }

    // クレジット計算（1-70文字=1通、71文字以降は66文字ごとに+1通。日本語SMSはUCS-2で70文字基準）
    const textLength = [...String(message_text)].length;
    const creditsNeeded = textLength <= 70 ? 1 : 1 + Math.ceil((textLength - 70) / 66);

    // 残高チェック
    const { data: credits } = await supabase
      .from("line_sms_credits")
      .select("balance")
      .eq("project_id", project_id)
      .maybeSingle();

    const balance = credits?.balance ?? 0;
    if (balance < creditsNeeded) {
      return Response.json({ error: `クレジット不足です（必要: ${creditsNeeded}、残高: ${balance}）` }, { status: 400 });
    }

    // 電話番号を E.164 形式に正規化（日本の番号を想定して簡易処理）
    const normalizedPhone = normalizeJpPhone(String(phone_number));
    if (!normalizedPhone) {
      return Response.json({ error: "電話番号の形式が不正です" }, { status: 400 });
    }

    // Twilio REST API 呼び出し
    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`;
    const formBody = new URLSearchParams({
      To: normalizedPhone,
      From: twilioFrom,
      Body: String(message_text),
    }).toString();
    const authHeader = "Basic " + Buffer.from(`${twilioSid}:${twilioToken}`).toString("base64");

    let twilioStatus: "sent" | "failed" = "sent";
    let twilioError: string | null = null;
    let twilioMessageSid: string | null = null;
    try {
      const twilioRes = await fetch(twilioUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: authHeader,
        },
        body: formBody,
      });
      const twilioJson = await twilioRes.json().catch(() => ({}));
      if (!twilioRes.ok) {
        twilioStatus = "failed";
        twilioError = (twilioJson?.message as string | undefined) ?? `Twilio error ${twilioRes.status}`;
      } else {
        twilioMessageSid = (twilioJson?.sid as string | undefined) ?? null;
      }
    } catch (e) {
      twilioStatus = "failed";
      twilioError = e instanceof Error ? e.message : "Twilio fetch error";
    }

    // ログ記録（成功/失敗どちらも残す）
    const { error: logErr } = await supabase.from("line_sms_logs").insert({
      account_id,
      follower_id: follower_id ?? null,
      phone_number: normalizedPhone,
      message_text,
      credits_used: twilioStatus === "sent" ? creditsNeeded : 0,
      status: twilioStatus,
      error_message: twilioError,
    });
    if (logErr) return Response.json({ error: logErr.message }, { status: 500 });

    // 送信失敗時はクレジット消費しない
    if (twilioStatus === "failed") {
      return Response.json({ error: twilioError ?? "送信失敗" }, { status: 502 });
    }

    // クレジット消費
    await supabase.from("line_sms_credits").update({
      balance: balance - creditsNeeded,
      updated_at: new Date().toISOString(),
    }).eq("project_id", project_id);

    await supabase.from("line_sms_credit_history").insert({
      project_id,
      amount: -creditsNeeded,
      type: "consume",
      description: `SMS送信 (${normalizedPhone.slice(-4)}) ${creditsNeeded}通`,
    });

    return Response.json({
      ok: true,
      credits_used: creditsNeeded,
      balance: balance - creditsNeeded,
      twilio_sid: twilioMessageSid,
    });
  }

  return Response.json({ error: "invalid action" }, { status: 400 });
}

// 日本の電話番号を E.164（+81...）形式に正規化
// 例: "090-1234-5678" → "+819012345678"
//      "09012345678"  → "+819012345678"
//      "+819012345678" → "+819012345678"
function normalizeJpPhone(raw: string): string | null {
  const trimmed = raw.replace(/[\s\-()]/g, "");
  if (!trimmed) return null;
  if (/^\+\d{10,15}$/.test(trimmed)) return trimmed;
  const digits = trimmed.replace(/^0/, "");
  if (!/^\d{9,11}$/.test(digits)) return null;
  return `+81${digits}`;
}

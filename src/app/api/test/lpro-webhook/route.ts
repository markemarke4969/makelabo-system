import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";

export async function POST(request: NextRequest) {
  try {
    const raw_data = await request.json();

    // 全件ログ出力
    console.log("[Lpro Webhook 受信]", JSON.stringify(raw_data, null, 2));

    // Supabaseに保存
    const { data, error } = await supabase
      .from("test_webhook")
      .insert({ raw_data })
      .select()
      .single();

    if (error) {
      console.error("[Lpro Webhook] DB保存エラー:", error.message);
      return Response.json({ ok: false, error: error.message }, { status: 500 });
    }

    return Response.json({ ok: true, id: data.id });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    console.error("[Lpro Webhook] パースエラー:", message);
    return Response.json({ ok: false, error: message }, { status: 400 });
  }
}

// GETでヘルスチェック用
export async function GET() {
  return Response.json({ status: "ok", endpoint: "lpro-webhook" });
}

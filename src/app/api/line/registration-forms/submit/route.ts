import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";

// フォーム送信
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { form_id, line_user_id, data: formData } = body;

  if (!form_id || !formData) return Response.json({ error: "form_id and data required" }, { status: 400 });

  const { data: form } = await supabase
    .from("line_registration_forms")
    .select("*, account_id")
    .eq("id", form_id)
    .single();

  if (!form) return Response.json({ error: "form not found" }, { status: 404 });

  // フォロワー検索（LINE経由の場合）
  let followerId: string | null = null;
  if (line_user_id) {
    const { data: follower } = await supabase
      .from("line_followers")
      .select("id")
      .eq("line_account_id", form.account_id)
      .eq("line_user_id", line_user_id)
      .maybeSingle();
    followerId = follower?.id as string ?? null;
  }

  // 送信データ保存
  await supabase.from("line_registration_submissions").insert({
    form_id,
    follower_id: followerId,
    line_user_id: line_user_id ?? null,
    data: formData,
  });

  // フィールドごとにカスタムフィールドへ保存
  if (followerId) {
    const { data: fields } = await supabase
      .from("line_registration_form_fields")
      .select("id, save_to_field_id")
      .eq("form_id", form_id);

    for (const field of fields ?? []) {
      const fid = field.id as string;
      const value = (formData as Record<string, string>)[fid];
      if (value && field.save_to_field_id) {
        await supabase.from("line_follower_custom_values").upsert(
          { follower_id: followerId, field_id: field.save_to_field_id, value, updated_at: new Date().toISOString() },
          { onConflict: "follower_id,field_id" },
        );
      }
    }

    // 登録後アクション
    if (form.post_action_type === "label_add") {
      const cfg = (form.post_action_config ?? {}) as Record<string, string>;
      if (cfg.label_id) {
        await supabase.from("line_follower_labels").upsert(
          { label_id: cfg.label_id, follower_id: followerId },
          { onConflict: "label_id,follower_id" },
        );
      }
    }
  }

  return Response.json({
    ok: true,
    thank_you_message: form.thank_you_message ?? "登録ありがとうございます！",
  });
}

// フォーム情報取得（公開ページ用）
export async function GET(request: NextRequest) {
  const formId = request.nextUrl.searchParams.get("form_id");
  if (!formId) return Response.json({ error: "form_id required" }, { status: 400 });

  const { data: form } = await supabase
    .from("line_registration_forms")
    .select("id, name, description, status")
    .eq("id", formId)
    .single();

  if (!form) return Response.json({ error: "not found" }, { status: 404 });
  if (form.status !== "active") return Response.json({ error: "inactive" }, { status: 400 });

  const { data: fields } = await supabase
    .from("line_registration_form_fields")
    .select("id, field_order, field_label, field_type, options, is_required, placeholder")
    .eq("form_id", formId)
    .order("field_order", { ascending: true });

  return Response.json({ ...form, fields: fields ?? [] });
}

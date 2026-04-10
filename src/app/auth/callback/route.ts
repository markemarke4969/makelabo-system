import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase-server";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/fiana";

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error && data.session) {
      // プロフィールをupsert（初回登録時に作成、既存ならスキップ）
      await supabase.from("fiana_profiles").upsert(
        {
          user_id: data.session.user.id,
          email: data.session.user.email || "",
          display_name: data.session.user.user_metadata?.full_name || "",
          auth_provider: "google",
          created_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );

      return NextResponse.redirect(new URL(next, request.url));
    }
  }

  return NextResponse.redirect(
    new URL("/fiana/register?error=auth_failed", request.url)
  );
}

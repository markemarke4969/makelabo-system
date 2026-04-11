import { createClient } from "@supabase/supabase-js";

const TEST_EMAIL = "test@line-harness.local";
const TEST_PASSWORD = "test-harness-2026";

// お試しログイン用: テストユーザーを存在保証して email/password を返す
export async function POST() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!serviceKey || !supabaseUrl) {
    return Response.json(
      { error: "SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_URL is not set" },
      { status: 500 },
    );
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // 既存ユーザーを探す
  const { data: list, error: listErr } = await admin.auth.admin.listUsers({ perPage: 200 });
  if (listErr) {
    return Response.json({ error: listErr.message }, { status: 500 });
  }
  const existing = list?.users?.find((u) => u.email === TEST_EMAIL);

  if (!existing) {
    const { error: createErr } = await admin.auth.admin.createUser({
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
      email_confirm: true,
    });
    if (createErr) {
      return Response.json({ error: createErr.message }, { status: 500 });
    }
  }

  return Response.json({ email: TEST_EMAIL, password: TEST_PASSWORD });
}

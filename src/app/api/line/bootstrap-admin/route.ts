import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { loginIdToEmail, isValidLoginId } from "@/lib/login-id";

/**
 * 初期管理者アカウントを作成する一回限りのブートストラップエンドポイント。
 *
 * 認証: CRON_SECRET（Bearer or ?secret=）
 *
 * 使い方（例）:
 *   POST /api/line/bootstrap-admin?secret=xxx
 *   body: { id: "ishiisab", password: "hE5B$aUG", name: "石井" }
 *
 * 既に同IDのアカウントが存在する場合は 409 を返す（上書きしない）。
 * 作成が終わったら git から削除することを推奨。
 */
function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = request.headers.get("authorization") ?? "";
  if (auth === `Bearer ${secret}`) return true;
  const query = request.nextUrl.searchParams.get("secret");
  return query === secret;
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const id: string | undefined = body.id;
  const password: string | undefined = body.password;
  const name: string | undefined = body.name;

  if (!id || !password) {
    return Response.json({ error: "id and password are required" }, { status: 400 });
  }
  if (!isValidLoginId(id)) {
    return Response.json(
      { error: "id は英数字・ . _ - のみ、3〜50文字で入力してください" },
      { status: 400 },
    );
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    return Response.json({ error: "SUPABASE_SERVICE_ROLE_KEY is not configured" }, { status: 500 });
  }

  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const email = loginIdToEmail(id);

  // 既存チェック: 同一 email の既存ユーザーを全ページ走査（listUsers は paginate 仕様）
  let existing = null as { id: string; email: string | null | undefined } | null;
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage: 100 });
    if (error) return Response.json({ error: error.message }, { status: 500 });
    const hit = (data.users ?? []).find((u) => u.email === email);
    if (hit) {
      existing = { id: hit.id, email: hit.email };
      break;
    }
    if (!data.users || data.users.length < 100) break;
  }
  if (existing) {
    return Response.json(
      { error: `ID "${id}" は既に存在します`, user_id: existing.id },
      { status: 409 },
    );
  }

  const { data: created, error: createErr } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      name: name ?? null,
      closer_name: null,
      is_closer: false,
      is_admin: true,
      password_memo: password,
    },
  });

  if (createErr) {
    return Response.json({ error: createErr.message }, { status: 400 });
  }

  return Response.json({
    ok: true,
    id: created.user.id,
    email,
    display_id: id,
    is_admin: true,
  });
}

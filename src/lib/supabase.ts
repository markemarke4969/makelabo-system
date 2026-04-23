import { createClient, SupabaseClient } from "@supabase/supabase-js";

let _supabase: SupabaseClient | null = null;
let _supabaseAdmin: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!_supabase) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) {
      // 環境変数未設定時はダミークライアントを返す（本番デプロイ用フォールバック）
      console.warn("Supabase環境変数が未設定です。ダミークライアントを使用します。");
      _supabase = createClient("https://placeholder.supabase.co", "placeholder-key");
      return _supabase;
    }
    _supabase = createClient(url, key);
  }
  return _supabase;
}

/**
 * Service Role Key で RLS をバイパスする管理用クライアント。
 * サーバサイド専用。webhook / バックフィル / 集計など、
 * RLS で匿名 SELECT が塞がっているテーブルを読み書きするときに使う。
 * SUPABASE_SERVICE_ROLE_KEY が未設定なら anon クライアントにフォールバックする。
 */
export function getSupabaseAdmin(): SupabaseClient {
  if (!_supabaseAdmin) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !serviceKey) {
      console.warn(
        "[supabase] SUPABASE_SERVICE_ROLE_KEY 未設定 → anon クライアントにフォールバック。RLS で読めないテーブルは動作しません。",
      );
      return getSupabase();
    }
    _supabaseAdmin = createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return _supabaseAdmin;
}

// 遅延初期化Proxy: ビルド時にcreateClientを呼ばない
function createLazyProxy(): SupabaseClient {
  return new Proxy({} as SupabaseClient, {
    get(_target, prop) {
      const client = getSupabase();
      const value = (client as unknown as Record<string | symbol, unknown>)[prop];
      if (typeof value === "function") {
        return value.bind(client);
      }
      return value;
    },
  });
}

function createLazyAdminProxy(): SupabaseClient {
  return new Proxy({} as SupabaseClient, {
    get(_target, prop) {
      const client = getSupabaseAdmin();
      const value = (client as unknown as Record<string | symbol, unknown>)[prop];
      if (typeof value === "function") {
        return value.bind(client);
      }
      return value;
    },
  });
}

export const supabase: SupabaseClient = createLazyProxy();
export const supabaseAdmin: SupabaseClient = createLazyAdminProxy();

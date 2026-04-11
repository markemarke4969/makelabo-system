"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";

export default function LineLogin() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const supabase = createClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) {
        setError("メールアドレスまたはパスワードが正しくありません");
        return;
      }

      router.push("/line/projects");
    } catch {
      setError("エラーが発生しました");
    } finally {
      setLoading(false);
    }
  };

  const handleTestLogin = async () => {
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/line/test-login", { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(`お試しログイン準備失敗: ${data.error ?? res.status}`);
        return;
      }
      const { email: testEmail, password: testPassword } = await res.json();

      const supabase = createClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: testEmail,
        password: testPassword,
      });
      if (signInError) {
        setError(`ログインエラー: ${signInError.message}`);
        return;
      }
      router.push("/line/projects");
    } catch (e) {
      setError(`エラーが発生しました: ${(e as Error).message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#1e2744] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* ロゴ */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-[#06C755] flex items-center justify-center mx-auto mb-4">
            <svg className="w-9 h-9 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63h2.386c.346 0 .627.285.627.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.06-.023.136-.033.194-.033.195 0 .375.104.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63.346 0 .628.285.628.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.282.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314" /></svg>
          </div>
          <h1 className="text-2xl font-bold text-white mb-1">LINE ハーネス</h1>
          <p className="text-sm text-white/50">LINE公式アカウント管理プラットフォーム</p>
        </div>

        {/* ログインフォーム */}
        <div className="bg-white rounded-2xl shadow-xl p-6">
          <h2 className="text-base font-bold text-gray-800 mb-5 text-center">ログイン</h2>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">メールアドレス</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="example@company.com"
                required
                className="w-full border border-gray-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-[#06C755] focus:outline-none focus:ring-1 focus:ring-[#06C755] transition"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">パスワード</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="パスワードを入力"
                required
                className="w-full border border-gray-200 rounded-lg px-3.5 py-2.5 text-sm focus:border-[#06C755] focus:outline-none focus:ring-1 focus:ring-[#06C755] transition"
              />
            </div>

            {error && (
              <div className="bg-red-50 text-red-600 text-sm px-4 py-2.5 rounded-lg border border-red-200">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-[#06C755] hover:bg-[#05a648] disabled:opacity-60 text-white font-medium rounded-lg text-sm transition"
            >
              {loading ? "ログイン中..." : "ログイン"}
            </button>
          </form>

          {/* 区切り線 */}
          <div className="flex items-center gap-3 mt-5 mb-4">
            <div className="flex-1 h-px bg-gray-200" />
            <span className="text-xs text-gray-400">または</span>
            <div className="flex-1 h-px bg-gray-200" />
          </div>

          {/* お試しログイン */}
          <button
            type="button"
            onClick={handleTestLogin}
            disabled={loading}
            className="w-full py-2.5 bg-gray-100 hover:bg-gray-200 disabled:opacity-60 text-gray-600 font-medium rounded-lg text-sm transition"
          >
            {loading ? "ログイン中..." : "ID/Pass なしでお試しログイン"}
          </button>
        </div>

        <p className="text-center text-xs text-white/30 mt-6">LINE Harness v1.0</p>
      </div>
    </div>
  );
}

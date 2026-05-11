"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

type Phase =
  | "init"
  | "login"
  | "profile"
  | "binding"
  | "redirecting"
  | "error";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function LiffClient() {
  const searchParams = useSearchParams();
  const diagnosisId = searchParams.get("diagnosis_id");

  const [phase, setPhase] = useState<Phase>("init");
  const [errorMessage, setErrorMessage] = useState<string>("");

  useEffect(() => {
    let cancelled = false;

    async function run() {
      const liffId = process.env.NEXT_PUBLIC_MATCHING_LIFF_ID;

      if (!liffId) {
        if (!cancelled) {
          setErrorMessage(
            "LIFF ID が設定されていません。管理者にお問い合わせください。",
          );
          setPhase("error");
        }
        return;
      }

      if (!diagnosisId || !UUID_RE.test(diagnosisId)) {
        if (!cancelled) {
          setErrorMessage(
            "診断結果の情報を取得できませんでした。お手数ですが診断をやり直してください。",
          );
          setPhase("error");
        }
        return;
      }

      try {
        const liffModule = await import("@line/liff");
        const liff = liffModule.default;

        setPhase("init");
        await liff.init({ liffId });

        if (!liff.isLoggedIn()) {
          setPhase("login");
          liff.login({
            redirectUri: window.location.href,
          });
          return;
        }

        setPhase("profile");
        const profile = await liff.getProfile();
        const lineUserId = profile.userId;

        setPhase("binding");
        const res = await fetch("/api/matching/bind", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            diagnosis_id: diagnosisId,
            line_user_id: lineUserId,
          }),
        });

        const data = (await res.json().catch(() => null)) as
          | { success: boolean; redirect_url?: string; error?: string }
          | null;

        if (!res.ok || !data?.success || !data.redirect_url) {
          throw new Error(
            data?.error || `bind API でエラーが発生しました (status: ${res.status})`,
          );
        }

        if (cancelled) return;
        setPhase("redirecting");
        window.location.replace(data.redirect_url);
      } catch (err) {
        if (cancelled) return;
        const message =
          err instanceof Error ? err.message : "予期しないエラーが発生しました";
        setErrorMessage(message);
        setPhase("error");
      }
    }

    void run();

    return () => {
      cancelled = true;
    };
  }, [diagnosisId]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 to-black flex items-center justify-center px-6">
      <div className="max-w-sm w-full text-center">
        {phase !== "error" ? (
          <>
            <div className="mb-6 flex justify-center">
              <div className="w-12 h-12 border-4 border-white/20 border-t-[#06C755] rounded-full animate-spin" />
            </div>
            <p className="text-white text-base font-medium">
              {phase === "init" && "LINEへの接続を準備しています..."}
              {phase === "login" && "LINEログイン画面へ移動しています..."}
              {phase === "profile" && "LINEプロフィールを確認しています..."}
              {phase === "binding" && "あなたの診断結果を紐付けています..."}
              {phase === "redirecting" && "LINEアカウントへ移動しています..."}
            </p>
            <p className="text-gray-500 text-xs mt-3">
              そのままお待ちください
            </p>
          </>
        ) : (
          <>
            <div className="text-4xl mb-4">⚠️</div>
            <h2 className="text-white text-lg font-bold mb-3">
              接続に失敗しました
            </h2>
            <p className="text-gray-300 text-sm leading-relaxed mb-6">
              {errorMessage}
            </p>
            <button
              onClick={() => window.location.reload()}
              className="w-full py-3 rounded-xl font-bold text-white text-base bg-[#06C755] hover:bg-[#05B04C] transition-colors active:scale-[0.98]"
            >
              もう一度試す
            </button>
          </>
        )}
      </div>
    </div>
  );
}

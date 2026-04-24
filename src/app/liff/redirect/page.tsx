"use client";

// ============================================================
// LIFF 中継ページ
// ============================================================
// フロー:
//   1. 全配信メッセージに埋め込むURL:
//      https://liff.line.me/<LIFF_ID>?project=<案件コード>
//   2. ユーザーがタップ → LINE アプリ内ブラウザで LIFF 起動
//   3. ここで LIFF SDK を初期化 → userId を取得
//      (ただし userId は現時点では使用せず、今後のデータ復元用に取得のみ)
//   4. /api/liff/resolve?project=xxx で現メインの友達追加URLを取得
//   5. window.location.replace() で自動遷移
// ============================================================

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";

type Status = "init" | "resolving" | "redirecting" | "error";

function RedirectInner() {
  const params = useSearchParams();
  const project = params.get("project")?.trim() ?? "";
  const [status, setStatus] = useState<Status>("init");
  const [errorMsg, setErrorMsg] = useState<string>("");

  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (!project) {
        setStatus("error");
        setErrorMsg("案件指定がありません");
        return;
      }

      // LIFF 初期化
      try {
        const liffId = process.env.NEXT_PUBLIC_LIFF_ID;
        if (!liffId) {
          throw new Error("LIFF ID が設定されていません");
        }
        const liff = (await import("@line/liff")).default;
        await liff.init({ liffId });
        // ログイン済みでなければログイン誘導 (プロフィール取得のため)
        if (!liff.isLoggedIn()) {
          liff.login();
          return; // login() はリダイレクトを発生させる
        }
      } catch (e) {
        if (cancelled) return;
        setStatus("error");
        setErrorMsg(`LIFF 初期化失敗: ${(e as Error).message}`);
        return;
      }

      if (cancelled) return;
      setStatus("resolving");

      // 現メイン取得
      try {
        const res = await fetch(`/api/liff/resolve?project=${encodeURIComponent(project)}`);
        const data = (await res.json()) as {
          success: boolean;
          addUrl?: string;
          error?: string;
        };
        if (!res.ok || !data.success || !data.addUrl) {
          throw new Error(data.error || `HTTP ${res.status}`);
        }
        if (cancelled) return;
        setStatus("redirecting");
        window.location.replace(data.addUrl);
      } catch (e) {
        if (cancelled) return;
        setStatus("error");
        setErrorMsg(`案件情報を取得できません: ${(e as Error).message}`);
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [project]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="max-w-sm w-full bg-white rounded-lg shadow-sm border border-gray-200 p-6 text-center">
        {status === "error" ? (
          <>
            <div className="text-red-600 text-2xl mb-3">!</div>
            <h1 className="text-base font-bold text-gray-800 mb-2">エラー</h1>
            <p className="text-sm text-gray-600">{errorMsg}</p>
            <p className="text-xs text-gray-400 mt-4">
              お手数ですがしばらく経ってから再度お試しください。
            </p>
          </>
        ) : (
          <>
            <div className="w-10 h-10 mx-auto mb-4 border-4 border-gray-200 border-t-green-500 rounded-full animate-spin" />
            <h1 className="text-base font-bold text-gray-800 mb-2">
              {status === "redirecting" ? "遷移中..." : "準備中..."}
            </h1>
            <p className="text-sm text-gray-500">
              {status === "resolving"
                ? "案件情報を取得しています"
                : status === "redirecting"
                  ? "LINE友だち追加ページへ移動します"
                  : "LIFF を初期化しています"}
            </p>
          </>
        )}
      </div>
    </div>
  );
}

export default function LiffRedirectPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div className="text-sm text-gray-500">読み込み中...</div>
        </div>
      }
    >
      <RedirectInner />
    </Suspense>
  );
}

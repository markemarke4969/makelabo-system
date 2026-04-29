"use client";

// ============================================================
// LIFF 中継ページ
// ============================================================
// フロー:
//   1. 全配信メッセージに埋め込むURL:
//      https://liff.line.me/<LIFF_ID>?project=<案件コード>
//   2. ユーザーがタップ → LINE アプリ内ブラウザで LIFF 起動
//   3. LINE サーバ側で ?project=xxx は liff.state=%3Fproject%3Dxxx に
//      変換されて endpoint URL に付与されてくる。
//      → getProjectCode() で通常クエリ / liff.state の両方に対応。
//   4. ここで LIFF SDK を初期化 (userId 取得は今後の復元用として保留)
//   5. /api/liff/resolve?project=xxx で現メインの友達追加URLを取得
//   6. window.location.replace() で自動遷移
// ============================================================

import { useEffect, useState, Suspense } from "react";

type Status = "init" | "resolving" | "redirecting" | "error";

function getProjectCode(search: string): string | null {
  const params = new URLSearchParams(search);

  // 1. 通常のクエリパラメータ
  const direct = params.get("project")?.trim();
  if (direct) return direct;

  // 2. LIFF が元のクエリを liff.state に詰め替えてくるケース
  //    例: ?liff.state=%3Fproject%3Dmari → "?project=mari"
  const liffState = params.get("liff.state");
  if (liffState) {
    const stateStr = liffState.startsWith("?") ? liffState.slice(1) : liffState;
    const stateParams = new URLSearchParams(stateStr);
    const fromState = stateParams.get("project")?.trim();
    if (fromState) return fromState;
  }

  return null;
}

function RedirectInner() {
  const [project, setProject] = useState<string>("");
  const [status, setStatus] = useState<Status>("init");
  const [errorMsg, setErrorMsg] = useState<string>("");

  useEffect(() => {
    let cancelled = false;

    async function run() {
      // ---- デバッグ出力 (動作確認用、次回修正で削除) ----
      try {
        console.log("[LIFF redirect] href =", window.location.href);
        console.log("[LIFF redirect] search =", window.location.search);
      } catch { /* noop */ }

      const code = getProjectCode(window.location.search);
      if (cancelled) return;
      if (!code) {
        setStatus("error");
        setErrorMsg("案件指定がありません");
        return;
      }
      setProject(code);

      // 案B 実装(2026-04-30):案件単位で LIFF ID を切り替える
      // /api/liff/config?project=<code> で LIFF ID を取得し、liff.init に渡す
      // DB 未設定 / API 失敗時は env(NEXT_PUBLIC_LIFF_ID)に fallback して MARI 既存動作を維持
      let liffId: string | null = null;
      try {
        const r = await fetch(`/api/liff/config?project=${encodeURIComponent(code)}`);
        const data = (await r.json()) as { liffId?: string | null; error?: string };
        liffId = data.liffId ?? null;
      } catch {
        // API 失敗時は env fallback で続行(MARI 既存動作の保険)
        liffId = null;
      }
      if (!liffId) liffId = process.env.NEXT_PUBLIC_LIFF_ID ?? null;

      // LIFF 初期化
      try {
        if (!liffId) {
          throw new Error("LIFF ID が設定されていません");
        }
        const liff = (await import("@line/liff")).default;
        await liff.init({ liffId });
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
        const res = await fetch(`/api/liff/resolve?project=${encodeURIComponent(code)}`);
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
  }, []);

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
                ? `案件情報を取得しています${project ? ` (${project})` : ""}`
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

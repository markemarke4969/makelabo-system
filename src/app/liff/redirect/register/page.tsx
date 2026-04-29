"use client";

// ============================================================
// LIFF 分散登録ページ(振り分け方式・B1 実装 2026-04-28)
// ============================================================
// 想定 URL:
//   https://liff.line.me/<LIFF_ID>/register?project=<code>&group=<group_name>
//   → endpoint URL に liff.state=%3Fproject%3D<code>%26group%3D<group_name>
//     として届く。project / group とも liff.state 経由 / 通常クエリ両対応。
//
// フロー:
//   1. LIFF init → userId 取得
//   2. /api/liff/distribute-list?project=...&group=...&user_id=... で振り分け先を取得(1件のみ)
//   3. その addUrl に自動リダイレクト
//   4. LINE 友達追加画面へ遷移 → 戻りは webhook 経由で line_followers に記録
//
// 仕様(B1 振り分け方式):
//   - ハーネスが「friend 数最少 + order_index 昇順」で1件を選ぶ
//   - 再タップ時:既存 follower があれば、そのアカウントが返る(再振り分けなし)
//   - distribute_enabled=false 案件(MARI 等):main 1件返却(従来通り)
//   - 旧「全部登録方式」の進捗 UI / distribute-progress 呼出は撤去済
//
// 詳細:設計図05 §3 / 2026-04-28_LINEハーネス_段階3残務整理.md(B1)
// ============================================================

import { useEffect, useState, Suspense } from "react";

type Status = "init" | "loading" | "redirecting" | "error";

function getQueryFromSearch(search: string, key: string): string | null {
  const params = new URLSearchParams(search);
  const direct = params.get(key)?.trim();
  if (direct) return direct;
  const liffState = params.get("liff.state");
  if (liffState) {
    const stateStr = liffState.startsWith("?") ? liffState.slice(1) : liffState;
    const stateParams = new URLSearchParams(stateStr);
    const fromState = stateParams.get(key)?.trim();
    if (fromState) return fromState;
  }
  return null;
}

function RegisterInner() {
  const [status, setStatus] = useState<Status>("init");
  const [errorMsg, setErrorMsg] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    async function run() {
      try {
        console.log("[LIFF register] href =", window.location.href);
      } catch { /* noop */ }

      const code = getQueryFromSearch(window.location.search, "project");
      if (!code) {
        setStatus("error");
        setErrorMsg("案件指定がありません(project クエリ未指定)");
        return;
      }
      const groupName = getQueryFromSearch(window.location.search, "group");

      // LIFF init
      let uid = "";
      try {
        const liffId = process.env.NEXT_PUBLIC_LIFF_ID;
        if (!liffId) throw new Error("LIFF ID が設定されていません");
        const liff = (await import("@line/liff")).default;
        await liff.init({ liffId });
        if (!liff.isLoggedIn()) {
          liff.login();
          return;
        }
        const profile = await liff.getProfile();
        uid = profile.userId;
        if (!uid) throw new Error("LINE UserID が取得できませんでした");
      } catch (e) {
        if (cancelled) return;
        setStatus("error");
        setErrorMsg(`LIFF 初期化失敗: ${(e as Error).message}`);
        return;
      }
      if (cancelled) return;

      // 振り分け先取得(1件のみ返ってくる前提)
      setStatus("loading");
      try {
        const qs = new URLSearchParams();
        qs.set("project", code);
        if (groupName) qs.set("group", groupName);
        if (uid) qs.set("user_id", uid);
        const r = await fetch(`/api/liff/distribute-list?${qs.toString()}`);
        const data = (await r.json()) as {
          success: boolean;
          distributeEnabled?: boolean;
          accounts?: Array<{ id: string; addUrl: string; basic_id: string; account_name: string | null }>;
          assignedAccountId?: string;
          error?: string;
          message?: string;
        };
        if (!r.ok || !data.success) {
          // group 必須エラーは明示
          if (data.error === "group_required") {
            throw new Error("LIFF URL に group が指定されていません(運用設定の漏れ)");
          }
          throw new Error(data.error || data.message || `HTTP ${r.status}`);
        }
        const assigned = data.accounts?.[0];
        if (!assigned?.addUrl) {
          throw new Error("振り分けたアカウントが取得できませんでした");
        }
        if (cancelled) return;
        setStatus("redirecting");
        window.location.replace(assigned.addUrl);
      } catch (e) {
        if (cancelled) return;
        setStatus("error");
        setErrorMsg(`案件情報を取得できません: ${(e as Error).message}`);
        return;
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, []);

  // ---------------- Render ----------------
  if (status === "error") {
    return (
      <FullScreen>
        <div className="text-red-600 text-2xl mb-3">!</div>
        <h1 className="text-base font-bold text-gray-800 mb-2">エラー</h1>
        <p className="text-sm text-gray-600">{errorMsg}</p>
        <p className="text-xs text-gray-400 mt-4">
          お手数ですがしばらく経ってから再度お試しください。
        </p>
      </FullScreen>
    );
  }

  return (
    <FullScreen>
      <Spinner />
      <h1 className="text-base font-bold text-gray-800 mb-2">
        {status === "redirecting" ? "友達追加画面へ移動します" : "準備中..."}
      </h1>
      <p className="text-sm text-gray-500">
        {status === "loading" ? "登録先を決定しています" : "LIFF を初期化しています"}
      </p>
    </FullScreen>
  );
}

function FullScreen({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="max-w-sm w-full bg-white rounded-lg shadow-sm border border-gray-200 p-6 text-center">
        {children}
      </div>
    </div>
  );
}

function Spinner() {
  return <div className="w-10 h-10 mx-auto mb-4 border-4 border-gray-200 border-t-green-500 rounded-full animate-spin" />;
}

export default function LiffRegisterPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div className="text-sm text-gray-500">読み込み中...</div>
        </div>
      }
    >
      <RegisterInner />
    </Suspense>
  );
}

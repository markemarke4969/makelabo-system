"use client";

// ============================================================
// LIFF 分散登録ページ
// ============================================================
// 想定 URL:
//   https://liff.line.me/<LIFF_ID>/register?project=<code>
//   → endpoint URL 末尾にパスが追加されて
//     https://app-pink-tau-37.vercel.app/liff/redirect/register?liff.state=%3Fproject%3D<code>
//   として届く。project は liff.state 経由 / 通常クエリ両対応。
//
// フロー:
//   1. LIFF init → userId 取得
//   2. /api/liff/distribute-list で対象アカウント一覧取得
//      ・distributeEnabled = false の案件 → main 1件だけが返るので
//        最初の addUrl にそのままリダイレクト (/liff/redirect と同等挙動)
//   3. /api/liff/distribute-progress で userId の登録済みアカウントを取得
//   4. 未登録アカウントを order_index 順に1件ずつ案内
//   5. ユーザーが「友達追加する」をタップ → 友達追加画面へ
//   6. LINE へ遷移 → 戻ってきたら webhook 経由で line_followers に記録
//      されるため、画面の「追加済みを確認」で再取得して次へ進める
// ============================================================

import { useCallback, useEffect, useState, Suspense } from "react";

interface DistributeAccount {
  id: string;
  basic_id: string;
  account_name: string | null;
  order_index: number;
  role?: string | null;
  addUrl: string;
}

type Status =
  | "init"
  | "loading-list"
  | "loading-progress"
  | "ready"
  | "completed"
  | "single-redirect"
  | "error";

function getProjectCode(search: string): string | null {
  const params = new URLSearchParams(search);
  const direct = params.get("project")?.trim();
  if (direct) return direct;
  const liffState = params.get("liff.state");
  if (liffState) {
    const stateStr = liffState.startsWith("?") ? liffState.slice(1) : liffState;
    const stateParams = new URLSearchParams(stateStr);
    const fromState = stateParams.get("project")?.trim();
    if (fromState) return fromState;
  }
  return null;
}

function RegisterInner() {
  const [status, setStatus] = useState<Status>("init");
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [project, setProject] = useState<string>("");
  const [userId, setUserId] = useState<string>("");
  const [accounts, setAccounts] = useState<DistributeAccount[]>([]);
  const [registeredIds, setRegisteredIds] = useState<Set<string>>(new Set());
  const [checking, setChecking] = useState<boolean>(false);

  // 進捗照会
  const fetchProgress = useCallback(async (proj: string, uid: string) => {
    const res = await fetch(
      `/api/liff/distribute-progress?project=${encodeURIComponent(proj)}&user_id=${encodeURIComponent(uid)}`,
    );
    const data = (await res.json()) as {
      success: boolean;
      registeredAccountIds?: string[];
      error?: string;
    };
    if (!res.ok || !data.success) {
      throw new Error(data.error || `HTTP ${res.status}`);
    }
    return new Set(data.registeredAccountIds ?? []);
  }, []);

  // 初期化
  useEffect(() => {
    let cancelled = false;
    async function run() {
      try {
        console.log("[LIFF register] href =", window.location.href);
      } catch { /* noop */ }

      const code = getProjectCode(window.location.search);
      if (!code) {
        setStatus("error");
        setErrorMsg("案件指定がありません");
        return;
      }
      setProject(code);

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
      setUserId(uid);

      // 対象リスト取得
      setStatus("loading-list");
      let list: DistributeAccount[] = [];
      let distributeEnabled = true;
      try {
        const r = await fetch(`/api/liff/distribute-list?project=${encodeURIComponent(code)}`);
        const data = (await r.json()) as {
          success: boolean;
          distributeEnabled?: boolean;
          accounts?: DistributeAccount[];
          error?: string;
        };
        if (!r.ok || !data.success) throw new Error(data.error || `HTTP ${r.status}`);
        list = data.accounts ?? [];
        distributeEnabled = !!data.distributeEnabled;
      } catch (e) {
        if (cancelled) return;
        setStatus("error");
        setErrorMsg(`案件情報を取得できません: ${(e as Error).message}`);
        return;
      }
      if (cancelled) return;

      // 分散無効の案件は単発リダイレクト
      if (!distributeEnabled || list.length === 1) {
        setStatus("single-redirect");
        if (list[0]) {
          window.location.replace(list[0].addUrl);
        } else {
          setStatus("error");
          setErrorMsg("現在利用可能なアカウントがありません");
        }
        return;
      }

      setAccounts(list);

      // 進捗照会
      setStatus("loading-progress");
      try {
        const registered = await fetchProgress(code, uid);
        if (cancelled) return;
        setRegisteredIds(registered);
      } catch (e) {
        if (cancelled) return;
        // 進捗取得失敗時は空で続行 (最初から順次案内)
        console.warn("[LIFF register] progress fetch failed:", e);
      }

      setStatus("ready");
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [fetchProgress]);

  // 未登録アカウント
  const pendingAccounts = accounts.filter((a) => !registeredIds.has(a.id));
  const completedCount = accounts.length - pendingAccounts.length;
  const next = pendingAccounts[0];

  const totalTargets = accounts.length;
  const progress = totalTargets > 0 ? Math.round((completedCount / totalTargets) * 100) : 0;

  // 「追加済みを確認」ボタン
  const refreshProgress = useCallback(async () => {
    if (!project || !userId) return;
    setChecking(true);
    try {
      const registered = await fetchProgress(project, userId);
      setRegisteredIds(registered);
    } catch (e) {
      console.warn("[LIFF register] refresh failed:", e);
    } finally {
      setChecking(false);
    }
  }, [project, userId, fetchProgress]);

  // 全員登録済みなら completed
  useEffect(() => {
    if (status === "ready" && totalTargets > 0 && pendingAccounts.length === 0) {
      setStatus("completed");
    }
  }, [status, totalTargets, pendingAccounts.length]);

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

  if (status === "init" || status === "loading-list" || status === "loading-progress" || status === "single-redirect") {
    return (
      <FullScreen>
        <Spinner />
        <h1 className="text-base font-bold text-gray-800 mb-2">
          {status === "single-redirect" ? "友達追加画面へ移動します" : "準備中..."}
        </h1>
        <p className="text-sm text-gray-500">
          {status === "loading-list" ? "案件情報を取得しています" : status === "loading-progress" ? "登録済みを確認しています" : "LIFF を初期化しています"}
        </p>
      </FullScreen>
    );
  }

  if (status === "completed") {
    return (
      <FullScreen>
        <div className="text-3xl mb-3">🎉</div>
        <h1 className="text-lg font-bold text-gray-800 mb-2">登録完了しました!</h1>
        <p className="text-sm text-gray-500 leading-relaxed">
          {totalTargets}本すべての公式アカウントへの友だち追加が完了しました。
          <br />
          ご登録ありがとうございます。
        </p>
      </FullScreen>
    );
  }

  // ready
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4 py-10">
      <div className="max-w-sm w-full bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="mb-5">
          <div className="flex items-center justify-between mb-1">
            <h1 className="text-sm font-bold text-gray-800">分散登録</h1>
            <span className="text-xs text-gray-500">
              {completedCount} / {totalTargets}
            </span>
          </div>
          <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-green-500 transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-[11px] text-gray-500 mt-2 leading-relaxed">
            複数の公式アカウントを順番に友だち追加していただきます。
            下のボタンで1つずつ追加してください。
          </p>
        </div>

        {next && (
          <div className="bg-green-50 border border-green-200 rounded-md p-4 mb-4">
            <div className="text-[11px] text-gray-500 mb-1">次に追加するアカウント ({next.order_index}本目)</div>
            <div className="text-sm font-bold text-gray-800 mb-2">
              {next.account_name ?? `アカウント ${next.order_index}`}
            </div>
            <div className="text-xs font-mono text-gray-500 mb-3">@{next.basic_id}</div>
            <a
              href={next.addUrl}
              className="block w-full text-center px-4 py-2.5 bg-[#06C755] hover:bg-[#05a648] text-white text-sm font-bold rounded-lg transition"
            >
              このアカウントを友だち追加
            </a>
          </div>
        )}

        <button
          onClick={refreshProgress}
          disabled={checking}
          className="w-full px-4 py-2 bg-white hover:bg-gray-50 disabled:opacity-50 text-gray-700 text-xs border border-gray-200 rounded-lg transition"
        >
          {checking ? "確認中..." : "友だち追加後にタップ: 登録状況を更新"}
        </button>

        <div className="mt-5 pt-5 border-t border-gray-100">
          <div className="text-[10px] text-gray-400 mb-2">登録対象一覧</div>
          <ul className="space-y-1.5">
            {accounts.map((a) => {
              const done = registeredIds.has(a.id);
              return (
                <li
                  key={a.id}
                  className={`flex items-center gap-2 text-[11px] ${done ? "text-gray-400 line-through" : "text-gray-700"}`}
                >
                  <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] ${done ? "bg-green-500 text-white" : "bg-gray-200 text-gray-500"}`}>
                    {done ? "✓" : a.order_index}
                  </span>
                  <span className="truncate">{a.account_name ?? `アカウント ${a.order_index}`}</span>
                  <span className="ml-auto font-mono text-[10px] text-gray-400">@{a.basic_id}</span>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
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

"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";

interface PoolEntry {
  id: string;
  project_id: string;
  account_id: string;
  status: string;
  activated_at: string | null;
  created_at: string;
  line_accounts: {
    id: string;
    account_name: string | null;
    basic_id: string | null;
    channel_id: string;
    is_active: boolean;
    role: string | null;
  } | null;
}

interface BanRecord {
  id: string;
  detected_at: string;
  note: string | null;
  banned: { account_name: string | null; basic_id: string | null } | null;
  replacement: { account_name: string | null; basic_id: string | null } | null;
}

interface MainAccount {
  id: string;
  account_name: string | null;
  basic_id: string | null;
  channel_id: string;
  role: string | null;
  is_active: boolean;
}

interface PoolData {
  main_accounts: MainAccount[];
  pool: PoolEntry[];
  ban_history: BanRecord[];
  remaining_standby: number;
}

export default function LinePool() {
  const router = useRouter();
  const [data, setData] = useState<PoolData | null>(null);
  const [loading, setLoading] = useState(true);
  const [project, setProject] = useState<{ id: string; name: string; color: string } | null>(null);

  // 追加フォーム
  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm] = useState({
    account_name: "",
    channel_id: "",
    basic_id: "",
    channel_secret: "",
    channel_access_token: "",
    priority: 0,
  });
  const [addSaving, setAddSaving] = useState(false);
  const [addMsg, setAddMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // 手動BAN
  const [banTarget, setBanTarget] = useState("");
  const [banReason, setBanReason] = useState("");
  const [banSwitching, setBanSwitching] = useState(false);
  const [banResult, setBanResult] = useState<{ ok: boolean; text: string } | null>(null);

  const fetchPool = useCallback(async () => {
    if (!project) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/line/ban-switch?project_id=${project.id}`);
      if (res.ok) setData(await res.json());
    } catch { /* */ }
    setLoading(false);
  }, [project]);

  useEffect(() => {
    const stored = sessionStorage.getItem("line_project");
    if (!stored) { router.push("/line/projects"); return; }
    try { setProject(JSON.parse(stored)); } catch { router.push("/line/projects"); }
  }, [router]);

  useEffect(() => {
    if (project) fetchPool();
  }, [project, fetchPool]);

  const fmt = (d: string) => new Date(d).toLocaleString("ja-JP");

  // 予備アカウント追加
  const addStandby = async () => {
    if (!addForm.channel_id || !addForm.channel_secret || !addForm.channel_access_token || !project) {
      setAddMsg({ ok: false, text: "チャネルID・シークレット・トークンは必須です" });
      return;
    }
    setAddSaving(true);
    setAddMsg(null);
    try {
      // 1. アカウント登録
      const accRes = await fetch("/api/line/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...addForm,
          project_id: project.id,
          role: "standby",
        }),
      });
      const accData = await accRes.json();
      if (!accRes.ok) throw new Error(accData.error ?? "アカウント登録失敗");

      // 2. プールに追加
      const poolRes = await fetch("/api/line/pool", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: project.id,
          account_id: accData.id,
        }),
      });
      if (!poolRes.ok) {
        const poolData = await poolRes.json();
        throw new Error(poolData.error ?? "プール追加失敗");
      }

      setAddMsg({ ok: true, text: "予備アカウントを追加しました" });
      setAddForm({ account_name: "", channel_id: "", basic_id: "", channel_secret: "", channel_access_token: "", priority: 0 });
      setShowAddForm(false);
      fetchPool();
    } catch (e) {
      setAddMsg({ ok: false, text: e instanceof Error ? e.message : "エラー" });
    }
    setAddSaving(false);
  };

  // 手動BAN切り替え
  const executeBanSwitch = async () => {
    if (!banTarget || !project) return;
    if (!confirm(`本当に「${banTarget}」をBAN扱いにして切り替えますか？`)) return;
    setBanSwitching(true);
    setBanResult(null);
    try {
      const res = await fetch("/api/line/ban-switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          account_id: banTarget,
          project_id: project.id,
          reason: banReason || "手動BAN切り替え",
        }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error ?? "切り替え失敗");
      setBanResult({
        ok: true,
        text: result.switched
          ? `切り替え完了: ${result.banned_account} → ${result.new_account}（残り予備: ${result.remaining_standby}個）`
          : `BANマーク済み。予備アカウントがありません！`,
      });
      setBanTarget("");
      setBanReason("");
      fetchPool();
    } catch (e) {
      setBanResult({ ok: false, text: e instanceof Error ? e.message : "エラー" });
    }
    setBanSwitching(false);
  };

  const readyPool = data?.pool.filter((p) => p.status === "ready") ?? [];
  const activePool = data?.pool.filter((p) => p.status === "active") ?? [];
  const bannedPool = data?.pool.filter((p) => p.status === "banned") ?? [];
  const remaining = data?.remaining_standby ?? 0;

  // BANできるアカウント（main or active）
  const banTargets = [
    ...(data?.main_accounts ?? []).map((a) => ({ id: a.id, name: a.account_name ?? a.channel_id })),
    ...activePool.map((p) => ({ id: p.account_id, name: p.line_accounts?.account_name ?? p.account_id.slice(0, 8) })),
  ];

  if (!project) return null;

  return (
    <div className="min-h-screen bg-[#f5f6fa] text-gray-800">
      {/* ヘッダー */}
      <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push("/line/dashboard")} className="text-gray-400 hover:text-gray-600 transition">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          </button>
          <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-sm font-bold" style={{ backgroundColor: project.color }}>
            {project.name.charAt(0)}
          </div>
          <div>
            <h1 className="text-base font-bold">{project.name} - アカウントプール管理</h1>
            <p className="text-xs text-gray-400">BAN自動切り替え・予備アカウント管理</p>
          </div>
        </div>
        <button onClick={fetchPool} className="px-3 py-1.5 text-xs text-blue-600 hover:bg-blue-50 rounded-md transition">更新</button>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-6 space-y-6">
        {loading ? (
          <div className="text-center text-gray-400 py-20">読み込み中...</div>
        ) : (
          <>
            {/* ① 現在の状態表示 */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* メインアカウント */}
              <div className="md:col-span-2 bg-white rounded-xl border border-gray-200 p-5">
                <div className="flex items-center gap-2 mb-3">
                  <span className="w-2.5 h-2.5 rounded-full bg-green-500" />
                  <h2 className="text-sm font-bold text-gray-700">メインアカウント（稼働中）</h2>
                </div>
                {(data?.main_accounts ?? []).length === 0 ? (
                  <p className="text-sm text-gray-400 py-4">メインアカウントが設定されていません</p>
                ) : (
                  <div className="space-y-3">
                    {data!.main_accounts.map((acc) => (
                      <div key={acc.id} className="flex items-center gap-4 bg-green-50 border border-green-200 rounded-lg px-4 py-3">
                        <div className="w-10 h-10 rounded-full bg-[#06C755] flex items-center justify-center flex-shrink-0">
                          <span className="text-white text-sm font-bold">L</span>
                        </div>
                        <div className="flex-1">
                          <div className="text-sm font-bold text-gray-800">{acc.account_name ?? "未設定"}</div>
                          <div className="text-xs text-gray-500">{acc.basic_id ? `@${acc.basic_id}` : "Basic ID未設定"} / {acc.channel_id}</div>
                        </div>
                        <span className="px-2.5 py-1 bg-green-100 text-green-700 text-xs font-medium rounded-full">稼働中</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* 予備残数カード */}
              <div className={`bg-white rounded-xl border p-5 flex flex-col items-center justify-center ${remaining <= 5 ? "border-red-300 bg-red-50" : "border-gray-200"}`}>
                <span className="text-xs font-medium text-gray-500 mb-2">予備アカウント残数</span>
                <span className={`text-5xl font-bold ${remaining <= 5 ? "text-red-600" : remaining <= 10 ? "text-orange-500" : "text-blue-600"}`}>
                  {remaining}
                </span>
                <span className="text-xs text-gray-400 mt-1">個</span>
                {remaining <= 5 && (
                  <div className="mt-3 px-3 py-1.5 bg-red-100 text-red-700 text-xs font-medium rounded-full">
                    補充が必要です
                  </div>
                )}
              </div>
            </div>

            {/* ② 予備プール一覧 */}
            <div className="bg-white rounded-xl border border-gray-200">
              <div className="px-5 py-3 border-b border-gray-200 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-blue-500" />
                  <h2 className="text-sm font-bold text-gray-700">予備プール</h2>
                  <span className="text-xs text-gray-400">({readyPool.length} 待機 / {activePool.length} 稼働中 / {bannedPool.length} BAN)</span>
                </div>
                <button
                  onClick={() => { setAddMsg(null); setShowAddForm(true); }}
                  className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-md transition"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                  予備追加
                </button>
              </div>

              {(data?.pool ?? []).length === 0 ? (
                <div className="px-5 py-10 text-center text-gray-400 text-sm">予備アカウントがありません</div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {data!.pool.map((entry, i) => {
                    const acc = entry.line_accounts;
                    const statusColors: Record<string, { bg: string; text: string; label: string }> = {
                      ready: { bg: "bg-blue-100", text: "text-blue-700", label: "待機中" },
                      active: { bg: "bg-green-100", text: "text-green-700", label: "稼働中" },
                      banned: { bg: "bg-red-100", text: "text-red-600", label: "BAN" },
                    };
                    const s = statusColors[entry.status] ?? statusColors.ready;
                    return (
                      <div key={entry.id} className={`flex items-center gap-4 px-5 py-3 ${entry.status === "banned" ? "opacity-50" : ""}`}>
                        <span className="text-xs text-gray-400 w-6 text-center">{i + 1}</span>
                        <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0">
                          <span className="text-gray-500 text-xs font-bold">L</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-gray-800 truncate">{acc?.account_name ?? "未設定"}</div>
                          <div className="text-xs text-gray-400">{acc?.basic_id ? `@${acc.basic_id}` : "Basic ID未設定"}</div>
                        </div>
                        <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${s.bg} ${s.text}`}>{s.label}</span>
                        {entry.activated_at && (
                          <span className="text-[10px] text-gray-400">{fmt(entry.activated_at)}</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* ③ 予備アカウント追加モーダル */}
            {showAddForm && (
              <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
                <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
                  <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
                    <h3 className="font-bold text-gray-800">予備アカウント追加</h3>
                    <button onClick={() => setShowAddForm(false)} className="text-gray-400 hover:text-gray-600">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  </div>
                  <div className="p-5 space-y-3">
                    <div>
                      <label className="text-xs text-gray-500 block mb-1 font-medium">アカウント名</label>
                      <input type="text" value={addForm.account_name} onChange={(e) => setAddForm({ ...addForm, account_name: e.target.value })} placeholder="音声相談LINE（予備B）" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400" />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs text-gray-500 block mb-1 font-medium">チャネルID <span className="text-red-500">*</span></label>
                        <input type="text" value={addForm.channel_id} onChange={(e) => setAddForm({ ...addForm, channel_id: e.target.value })} placeholder="2009751642" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400" />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 block mb-1 font-medium">Basic ID</label>
                        <input type="text" value={addForm.basic_id} onChange={(e) => setAddForm({ ...addForm, basic_id: e.target.value })} placeholder="576ergby (@除く)" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400" />
                      </div>
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 block mb-1 font-medium">チャネルシークレット <span className="text-red-500">*</span></label>
                      <input type="password" value={addForm.channel_secret} onChange={(e) => setAddForm({ ...addForm, channel_secret: e.target.value })} placeholder="LINE Developersからコピー" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400" />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 block mb-1 font-medium">チャネルアクセストークン <span className="text-red-500">*</span></label>
                      <input type="password" value={addForm.channel_access_token} onChange={(e) => setAddForm({ ...addForm, channel_access_token: e.target.value })} placeholder="発行済みトークン" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400" />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 block mb-1 font-medium">優先順位</label>
                      <input type="number" value={addForm.priority} onChange={(e) => setAddForm({ ...addForm, priority: Number(e.target.value) })} min={0} className="w-24 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400" />
                      <p className="text-xs text-gray-400 mt-1">数字が小さいほど優先的に使用されます</p>
                    </div>
                    {addMsg && (
                      <div className={`px-4 py-2.5 rounded-lg text-sm ${addMsg.ok ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-600 border border-red-200"}`}>
                        {addMsg.text}
                      </div>
                    )}
                  </div>
                  <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-200">
                    <button onClick={() => setShowAddForm(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition">キャンセル</button>
                    <button onClick={addStandby} disabled={addSaving} className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition">
                      {addSaving ? "追加中..." : "追加"}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* ④ BAN履歴 */}
            <div className="bg-white rounded-xl border border-gray-200">
              <div className="px-5 py-3 border-b border-gray-200 flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-red-500" />
                <h2 className="text-sm font-bold text-gray-700">BAN履歴</h2>
              </div>
              {(data?.ban_history ?? []).length === 0 ? (
                <div className="px-5 py-10 text-center text-gray-400 text-sm">BAN履歴はありません</div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 text-gray-500 text-left bg-gray-50">
                      <th className="px-5 py-2.5 font-medium">日時</th>
                      <th className="px-5 py-2.5 font-medium">BANアカウント</th>
                      <th className="px-5 py-2.5 font-medium">切替先</th>
                      <th className="px-5 py-2.5 font-medium">理由</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data!.ban_history.map((h) => (
                      <tr key={h.id} className="border-b border-gray-100">
                        <td className="px-5 py-2.5 text-gray-500 text-xs whitespace-nowrap">{fmt(h.detected_at)}</td>
                        <td className="px-5 py-2.5">
                          <span className="text-red-600 font-medium">{h.banned?.account_name ?? "不明"}</span>
                          {h.banned?.basic_id && <span className="text-xs text-gray-400 ml-1">@{h.banned.basic_id}</span>}
                        </td>
                        <td className="px-5 py-2.5">
                          {h.replacement ? (
                            <>
                              <span className="text-green-700 font-medium">{h.replacement.account_name ?? "不明"}</span>
                              {h.replacement.basic_id && <span className="text-xs text-gray-400 ml-1">@{h.replacement.basic_id}</span>}
                            </>
                          ) : (
                            <span className="text-gray-400">切替なし</span>
                          )}
                        </td>
                        <td className="px-5 py-2.5 text-gray-500 text-xs">{h.note ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* ⑤ 手動BAN切り替え */}
            <div className="bg-white rounded-xl border border-orange-200 p-5">
              <div className="flex items-center gap-2 mb-3">
                <span className="w-2.5 h-2.5 rounded-full bg-orange-500" />
                <h2 className="text-sm font-bold text-gray-700">手動BAN切り替え</h2>
                <span className="text-xs text-gray-400">（テスト・緊急対応用）</span>
              </div>
              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <label className="text-xs text-gray-500 block mb-1 font-medium">対象アカウント</label>
                  <select
                    value={banTarget}
                    onChange={(e) => setBanTarget(e.target.value)}
                    className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-400 min-w-[200px]"
                  >
                    <option value="">選択してください</option>
                    {banTargets.map((t) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </div>
                <div className="flex-1 min-w-[200px]">
                  <label className="text-xs text-gray-500 block mb-1 font-medium">理由（任意）</label>
                  <input
                    type="text"
                    value={banReason}
                    onChange={(e) => setBanReason(e.target.value)}
                    placeholder="例: テスト切り替え"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-400"
                  />
                </div>
                <button
                  onClick={executeBanSwitch}
                  disabled={!banTarget || banSwitching}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition whitespace-nowrap"
                >
                  {banSwitching ? "切替中..." : "BAN切り替え実行"}
                </button>
              </div>
              {banResult && (
                <div className={`mt-3 px-4 py-2.5 rounded-lg text-sm ${banResult.ok ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-600 border border-red-200"}`}>
                  {banResult.text}
                </div>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}

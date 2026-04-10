"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";

interface Project {
  id: string;
  name: string;
  color: string;
}

interface UserWithProjects {
  id: string;
  email: string;
  project_ids: string[];
}

export default function LineAdmin() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [users, setUsers] = useState<UserWithProjects[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  // 新規ユーザー登録
  const [showAddUser, setShowAddUser] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newSelectedProjects, setNewSelectedProjects] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      // 案件一覧
      const projRes = await fetch("/api/line/user-projects");
      if (projRes.ok) setProjects(await projRes.json());

      // ユーザー一覧（Supabase auth admin APIは使えないので、line_user_projectsから取得）
      const supabase = createClient();
      const { data: userProjects } = await supabase
        .from("line_user_projects")
        .select("user_id, project_id");

      // ユニークuser_idを取得
      const userMap = new Map<string, string[]>();
      for (const up of userProjects ?? []) {
        if (!userMap.has(up.user_id)) userMap.set(up.user_id, []);
        userMap.get(up.user_id)!.push(up.project_id);
      }

      // ユーザーのメールを取得するため、別途profiles等が必要だが
      // 簡易的にuser_idのみで表示
      const userList: UserWithProjects[] = Array.from(userMap.entries()).map(([id, pids]) => ({
        id,
        email: id.slice(0, 8) + "...",
        project_ids: pids,
      }));

      setUsers(userList);
    } catch { /* */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const toggleProject = async (userId: string, projectId: string, currentlyAssigned: boolean) => {
    setSaving(`${userId}-${projectId}`);
    setMessage(null);
    try {
      const res = await fetch("/api/line/user-projects", {
        method: currentlyAssigned ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId, project_id: projectId }),
      });
      if (!res.ok) {
        const data = await res.json();
        setMessage({ ok: false, text: data.error ?? "エラー" });
      } else {
        setMessage({ ok: true, text: currentlyAssigned ? "解除しました" : "追加しました" });
        fetchData();
      }
    } catch {
      setMessage({ ok: false, text: "通信エラー" });
    }
    setSaving(null);
    setTimeout(() => setMessage(null), 2000);
  };

  const createUser = async () => {
    if (!newEmail || !newPassword) return;
    setCreating(true);
    setMessage(null);
    try {
      // Supabaseでユーザー作成
      const res = await fetch("/api/line/create-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: newEmail,
          password: newPassword,
          project_ids: Array.from(newSelectedProjects),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "作成失敗");
      setMessage({ ok: true, text: `${newEmail} を作成しました` });
      setShowAddUser(false);
      setNewEmail("");
      setNewPassword("");
      setNewSelectedProjects(new Set());
      fetchData();
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : "エラー" });
    }
    setCreating(false);
  };

  return (
    <div className="min-h-screen bg-[#1e2744]">
      {/* ヘッダー */}
      <header className="border-b border-white/10 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-[#06C755] flex items-center justify-center">
            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
          </div>
          <div>
            <h1 className="text-lg font-bold text-white">ユーザー管理</h1>
            <p className="text-xs text-white/40">担当案件の割り当て</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => router.push("/line/projects")}
            className="px-3 py-1.5 text-xs text-white/60 hover:text-white hover:bg-white/10 rounded-md transition"
          >
            案件選択に戻る
          </button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8">
        {/* メッセージ */}
        {message && (
          <div className={`mb-4 px-4 py-2.5 rounded-lg text-sm ${message.ok ? "bg-green-500/20 text-green-300 border border-green-500/30" : "bg-red-500/20 text-red-300 border border-red-500/30"}`}>
            {message.text}
          </div>
        )}

        {/* 新規ユーザー追加ボタン */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-white text-base font-bold">登録済みユーザー</h2>
          <button
            onClick={() => setShowAddUser(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-md transition"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
            新規ユーザー追加
          </button>
        </div>

        {/* 新規ユーザーモーダル */}
        {showAddUser && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4">
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
                <h3 className="font-bold text-gray-800">新規ユーザー追加</h3>
                <button onClick={() => setShowAddUser(false)} className="text-gray-400 hover:text-gray-600">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
              <div className="p-5 space-y-4">
                <div>
                  <label className="text-xs text-gray-500 block mb-1 font-medium">メールアドレス</label>
                  <input
                    type="email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    placeholder="user@example.com"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-1 font-medium">パスワード</label>
                  <input
                    type="text"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="初期パスワード"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500 block mb-2 font-medium">担当案件</label>
                  <div className="space-y-2">
                    {projects.map((p) => (
                      <label key={p.id} className="flex items-center gap-2.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={newSelectedProjects.has(p.id)}
                          onChange={() => {
                            setNewSelectedProjects((prev) => {
                              const next = new Set(prev);
                              if (next.has(p.id)) next.delete(p.id); else next.add(p.id);
                              return next;
                            });
                          }}
                          className="accent-blue-600 w-4 h-4"
                        />
                        <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: p.color }} />
                        <span className="text-sm text-gray-700">{p.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
              <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-200">
                <button onClick={() => setShowAddUser(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition">キャンセル</button>
                <button
                  onClick={createUser}
                  disabled={creating || !newEmail || !newPassword}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition"
                >
                  {creating ? "作成中..." : "作成"}
                </button>
              </div>
            </div>
          </div>
        )}

        {loading ? (
          <div className="text-center text-white/40 py-16">読み込み中...</div>
        ) : users.length === 0 ? (
          <div className="bg-white/5 rounded-xl border border-white/10 p-12 text-center">
            <p className="text-white/50 text-sm mb-2">ユーザーが登録されていません</p>
            <p className="text-white/30 text-xs">「新規ユーザー追加」から登録してください</p>
          </div>
        ) : (
          <div className="space-y-3">
            {users.map((user) => (
              <div key={user.id} className="bg-white/5 border border-white/10 rounded-xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center text-white/60">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                    </div>
                    <div>
                      <span className="text-sm font-medium text-white">{user.email}</span>
                      <span className="text-xs text-white/40 ml-2">ID: {user.id.slice(0, 8)}...</span>
                    </div>
                  </div>
                  <span className="text-xs text-white/40">{user.project_ids.length} 案件</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {projects.map((p) => {
                    const assigned = user.project_ids.includes(p.id);
                    const isSaving = saving === `${user.id}-${p.id}`;
                    return (
                      <button
                        key={p.id}
                        onClick={() => toggleProject(user.id, p.id, assigned)}
                        disabled={isSaving}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition border ${
                          assigned
                            ? "bg-white/10 text-white border-white/20 hover:bg-red-500/20 hover:border-red-500/30 hover:text-red-300"
                            : "bg-transparent text-white/40 border-white/10 hover:bg-green-500/20 hover:border-green-500/30 hover:text-green-300"
                        } ${isSaving ? "opacity-50" : ""}`}
                      >
                        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: assigned ? p.color : "transparent", border: assigned ? "none" : `1px solid ${p.color}` }} />
                        {p.name}
                        {assigned && <span className="ml-0.5 opacity-60">x</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

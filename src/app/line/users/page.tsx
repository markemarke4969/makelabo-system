"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { emailToDisplayId, isValidLoginId } from "@/lib/login-id";

interface Project {
  id: string;
  name: string;
  description: string | null;
  color: string;
  sort_order: number;
}

interface ManagedUser {
  id: string;
  email: string | null;
  name: string | null;
  closer_name: string | null;
  is_closer: boolean;
  is_admin: boolean;
  password_memo: string | null;
  owner_project_ids: string[];
  viewer_project_ids: string[];
}

interface UserForm {
  email: string;
  password: string;
  name: string;
  closer_name: string;
  is_closer: boolean;
  is_admin: boolean;
  owner_project_ids: string[];
  viewer_project_ids: string[];
}

const emptyUserForm: UserForm = {
  email: "",
  password: "",
  name: "",
  closer_name: "",
  is_closer: false,
  is_admin: false,
  owner_project_ids: [],
  viewer_project_ids: [],
};

export default function LineUsers() {
  const router = useRouter();
  const [allProjects, setAllProjects] = useState<Project[]>([]);
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [showUserForm, setShowUserForm] = useState(false);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [userForm, setUserForm] = useState<UserForm>(emptyUserForm);
  const [userSaving, setUserSaving] = useState(false);
  const [userMsg, setUserMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [revealedIds, setRevealedIds] = useState<Set<string>>(new Set());
  const toggleReveal = (id: string) => {
    setRevealedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const fetchUsers = useCallback(async () => {
    setUsersLoading(true);
    try {
      const res = await fetch("/api/line/users");
      if (res.ok) setUsers(await res.json());
    } catch { /* */ } finally { setUsersLoading(false); }
  }, []);

  const fetchAllProjects = useCallback(async () => {
    try {
      const res = await fetch("/api/line/user-projects");
      if (res.ok) setAllProjects(await res.json());
    } catch { /* */ }
  }, []);

  useEffect(() => {
    fetchUsers();
    fetchAllProjects();
  }, [fetchUsers, fetchAllProjects]);

  const openCreateUser = () => {
    setEditingUserId(null);
    setUserForm(emptyUserForm);
    setUserMsg(null);
    setShowUserForm(true);
  };

  const openEditUser = (u: ManagedUser) => {
    setEditingUserId(u.id);
    setUserForm({
      email: emailToDisplayId(u.email),
      password: "",
      name: u.name ?? "",
      closer_name: u.closer_name ?? "",
      is_closer: u.is_closer,
      is_admin: u.is_admin,
      owner_project_ids: u.owner_project_ids,
      viewer_project_ids: u.viewer_project_ids,
    });
    setUserMsg(null);
    setShowUserForm(true);
  };

  const toggleProjectId = (pid: string, kind: "owner" | "viewer") => {
    setUserForm((prev) => {
      const key = kind === "owner" ? "owner_project_ids" : "viewer_project_ids";
      const list = prev[key];
      const next = list.includes(pid) ? list.filter((x) => x !== pid) : [...list, pid];
      return { ...prev, [key]: next };
    });
  };

  const saveUser = async () => {
    const input = userForm.email.trim();
    if (!input) {
      setUserMsg({ ok: false, text: "ログインIDを入力してください" });
      return;
    }
    // @が含まれていない（ID 形式の）場合のみ英数記号バリデーション。
    // 既存のメアドユーザーの編集時に誤って弾かないため。
    if (!input.includes("@") && !isValidLoginId(input)) {
      setUserMsg({ ok: false, text: "ログインIDは英数字・ . _ - のみ、3〜50文字で入力してください" });
      return;
    }
    if (!editingUserId && !userForm.password.trim()) {
      setUserMsg({ ok: false, text: "パスワードを入力してください" });
      return;
    }
    setUserSaving(true);
    setUserMsg(null);
    try {
      if (editingUserId) {
        const res = await fetch("/api/line/users", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: editingUserId,
            email: userForm.email.trim(),
            password: userForm.password.trim() || undefined,
            name: userForm.name.trim() || null,
            closer_name: userForm.closer_name.trim() || null,
            is_closer: userForm.is_closer,
            is_admin: userForm.is_admin,
            owner_project_ids: userForm.owner_project_ids,
            viewer_project_ids: userForm.viewer_project_ids,
          }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setUserMsg({ ok: false, text: data.error ?? "更新失敗" });
        } else {
          setUserMsg({ ok: true, text: "更新しました" });
          await fetchUsers();
          setShowUserForm(false);
        }
      } else {
        const res = await fetch("/api/line/create-user", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: userForm.email.trim(),
            password: userForm.password.trim(),
            name: userForm.name.trim() || null,
            closer_name: userForm.closer_name.trim() || null,
            is_closer: userForm.is_closer,
            is_admin: userForm.is_admin,
            owner_project_ids: userForm.owner_project_ids,
            viewer_project_ids: userForm.viewer_project_ids,
          }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setUserMsg({ ok: false, text: data.error ?? "作成失敗" });
        } else {
          setUserMsg({ ok: true, text: "作成しました" });
          await fetchUsers();
          setShowUserForm(false);
        }
      }
    } catch (e) {
      setUserMsg({ ok: false, text: (e as Error).message });
    } finally {
      setUserSaving(false);
    }
  };

  const deleteUser = async (u: ManagedUser) => {
    if (!confirm(`${emailToDisplayId(u.email)} を削除しますか？`)) return;
    const res = await fetch("/api/line/users", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: u.id }),
    });
    if (res.ok) {
      fetchUsers();
    } else {
      const data = await res.json().catch(() => ({}));
      alert(`削除失敗: ${data.error ?? res.status}`);
    }
  };

  const projectNameById = (id: string) =>
    allProjects.find((p) => p.id === id)?.name ?? id.slice(0, 8);

  return (
    <div className="min-h-screen bg-[#1e2744]">
      <header className="border-b border-white/10 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push("/line/projects")}
            className="text-white/60 hover:text-white text-sm"
          >
            ← 案件一覧
          </button>
          <div>
            <h1 className="text-lg font-bold text-white">ユーザー管理</h1>
            <p className="text-xs text-white/40">クローザー・担当者のログイン情報と閲覧権限を管理します</p>
          </div>
        </div>
        <button
          onClick={openCreateUser}
          className="px-4 py-2 bg-[#06C755] hover:bg-[#05a648] text-white text-xs font-medium rounded-md transition"
        >
          + 新規ユーザー
        </button>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-10">
        <div className="mb-4 px-3 py-2 rounded-md bg-yellow-500/10 border border-yellow-500/30 text-yellow-200 text-[11px]">
          ⚠ パスワード列は管理の利便性のためにメモとして保存されています（平文）。
          作成・変更時に入力された内容のみが記録されます。管理者以外のアクセスを避けてください。
        </div>
        {showUserForm && (
          <div className="bg-white/5 border border-white/10 rounded-xl p-6 mb-6">
            <h3 className="text-white text-sm font-bold mb-4">
              {editingUserId ? "ユーザー編集" : "新規ユーザー作成"}
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-[11px] text-white/60 block mb-1 font-medium">名前</label>
                <input
                  type="text"
                  value={userForm.name}
                  onChange={(e) => setUserForm({ ...userForm, name: e.target.value })}
                  placeholder="山田 太郎"
                  className="w-full bg-white/10 border border-white/10 rounded-md px-3 py-2 text-sm text-white placeholder-white/30 focus:border-[#06C755] focus:outline-none"
                />
              </div>
              <div>
                <label className="text-[11px] text-white/60 block mb-1 font-medium">クローザー名</label>
                <input
                  type="text"
                  value={userForm.closer_name}
                  onChange={(e) => setUserForm({ ...userForm, closer_name: e.target.value })}
                  placeholder="例: TARO"
                  className="w-full bg-white/10 border border-white/10 rounded-md px-3 py-2 text-sm text-white placeholder-white/30 focus:border-[#06C755] focus:outline-none"
                />
              </div>
              <div>
                <label className="text-[11px] text-white/60 block mb-1 font-medium">
                  ログインID <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={userForm.email}
                  onChange={(e) => setUserForm({ ...userForm, email: e.target.value })}
                  placeholder="例: taro"
                  className="w-full bg-white/10 border border-white/10 rounded-md px-3 py-2 text-sm text-white placeholder-white/30 focus:border-[#06C755] focus:outline-none"
                />
                <p className="text-[10px] text-white/40 mt-1">英数字・ . _ - のみ、3〜50文字。メアド形式も可（既存ユーザー向け）</p>
              </div>
              <div className="md:col-span-2 flex items-center gap-6">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={userForm.is_closer}
                    onChange={(e) => setUserForm({ ...userForm, is_closer: e.target.checked })}
                    className="accent-[#06C755] w-4 h-4"
                  />
                  <span className="text-sm text-white/80">クローザー</span>
                  <span className="text-[10px] text-white/40">（担当クローザー選択肢に表示）</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={userForm.is_admin}
                    onChange={(e) => setUserForm({ ...userForm, is_admin: e.target.checked })}
                    className="accent-[#06C755] w-4 h-4"
                  />
                  <span className="text-sm text-white/80">管理者</span>
                  <span className="text-[10px] text-white/40">（全アカウント表示・設定変更可）</span>
                </label>
              </div>
              <div className="md:col-span-2">
                <label className="text-[11px] text-white/60 block mb-1 font-medium">
                  パスワード {editingUserId ? "（変更時のみ入力）" : <span className="text-red-400">*</span>}
                </label>
                <input
                  type="text"
                  value={userForm.password}
                  onChange={(e) => setUserForm({ ...userForm, password: e.target.value })}
                  placeholder={editingUserId ? "空欄なら変更しない" : "8文字以上"}
                  className="w-full bg-white/10 border border-white/10 rounded-md px-3 py-2 text-sm text-white font-mono placeholder-white/30 focus:border-[#06C755] focus:outline-none"
                />
              </div>
            </div>

            <div className="mt-5">
              <label className="text-[11px] text-white/60 block mb-2 font-medium">担当案件（編集権限）</label>
              <div className="flex flex-wrap gap-1.5">
                {allProjects.length === 0 ? (
                  <span className="text-xs text-white/30">案件がありません</span>
                ) : (
                  allProjects.map((p) => {
                    const active = userForm.owner_project_ids.includes(p.id);
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => toggleProjectId(p.id, "owner")}
                        className={`px-3 py-1.5 text-xs rounded-full border transition ${
                          active
                            ? "bg-[#06C755] border-[#06C755] text-white"
                            : "bg-white/5 border-white/10 text-white/60 hover:bg-white/10"
                        }`}
                      >
                        {p.name}
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            <div className="mt-4">
              <label className="text-[11px] text-white/60 block mb-2 font-medium">
                閲覧可能案件（閲覧のみ）
                <span className="text-white/30 ml-2 text-[10px]">※担当案件は自動で閲覧可能扱いです</span>
              </label>
              <div className="flex flex-wrap gap-1.5">
                {allProjects.map((p) => {
                  const owner = userForm.owner_project_ids.includes(p.id);
                  const active = userForm.viewer_project_ids.includes(p.id);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      disabled={owner}
                      onClick={() => toggleProjectId(p.id, "viewer")}
                      className={`px-3 py-1.5 text-xs rounded-full border transition ${
                        owner
                          ? "bg-[#06C755]/20 border-[#06C755]/40 text-[#06C755] cursor-not-allowed"
                          : active
                            ? "bg-blue-500 border-blue-500 text-white"
                            : "bg-white/5 border-white/10 text-white/60 hover:bg-white/10"
                      }`}
                    >
                      {p.name}
                    </button>
                  );
                })}
              </div>
            </div>

            {userMsg && (
              <div className={`mt-4 px-4 py-2.5 rounded-md text-xs ${
                userMsg.ok ? "bg-green-500/10 text-green-300 border border-green-500/30" : "bg-red-500/10 text-red-300 border border-red-500/30"
              }`}>
                {userMsg.text}
              </div>
            )}

            <div className="flex gap-2 mt-5">
              <button
                onClick={saveUser}
                disabled={userSaving}
                className="px-5 py-2 bg-[#06C755] hover:bg-[#05a648] disabled:opacity-50 text-white text-sm font-medium rounded-md transition"
              >
                {userSaving ? "保存中..." : editingUserId ? "更新" : "作成"}
              </button>
              <button
                onClick={() => setShowUserForm(false)}
                className="px-4 py-2 bg-white/5 hover:bg-white/10 text-white/60 text-sm rounded-md transition"
              >
                キャンセル
              </button>
            </div>
          </div>
        )}

        <div className="bg-white/5 rounded-xl border border-white/10 overflow-hidden">
          {usersLoading ? (
            <div className="p-12 text-center text-white/40 text-sm">読み込み中...</div>
          ) : users.length === 0 ? (
            <div className="p-12 text-center text-white/40 text-sm">
              ユーザーが登録されていません
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-white/40 text-left text-xs">
                    <th className="px-5 py-3 font-medium">名前</th>
                    <th className="px-5 py-3 font-medium">クローザー名</th>
                    <th className="px-5 py-3 font-medium">権限</th>
                    <th className="px-5 py-3 font-medium">ログインID</th>
                    <th className="px-5 py-3 font-medium">パスワード</th>
                    <th className="px-5 py-3 font-medium">担当案件</th>
                    <th className="px-5 py-3 font-medium">閲覧可能</th>
                    <th className="px-5 py-3 font-medium">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id} className="border-b border-white/5 hover:bg-white/5 transition">
                      <td className="px-5 py-3 text-white">{u.name ?? "—"}</td>
                      <td className="px-5 py-3 text-white/70">{u.closer_name ?? "—"}</td>
                      <td className="px-5 py-3">
                        <div className="flex flex-wrap gap-1">
                          {u.is_admin && <span className="px-2 py-0.5 text-[10px] bg-purple-500/20 text-purple-300 rounded">管理者</span>}
                          {u.is_closer && <span className="px-2 py-0.5 text-[10px] bg-orange-500/20 text-orange-300 rounded">クローザー</span>}
                          {!u.is_admin && !u.is_closer && <span className="text-white/30 text-xs">—</span>}
                        </div>
                      </td>
                      <td className="px-5 py-3 text-white/70 text-xs font-mono">{emailToDisplayId(u.email) || "—"}</td>
                      <td className="px-5 py-3">
                        {u.password_memo ? (
                          <div className="flex items-center gap-1.5">
                            <code className="text-xs font-mono text-white/70 bg-white/5 px-2 py-0.5 rounded">
                              {revealedIds.has(u.id) ? u.password_memo : "•".repeat(Math.min(u.password_memo.length, 10))}
                            </code>
                            <button
                              onClick={() => toggleReveal(u.id)}
                              className="text-[10px] text-blue-300 hover:text-blue-200"
                              title={revealedIds.has(u.id) ? "隠す" : "表示"}
                            >
                              {revealedIds.has(u.id) ? "隠す" : "表示"}
                            </button>
                            {revealedIds.has(u.id) && (
                              <button
                                onClick={() => { if (u.password_memo) { navigator.clipboard.writeText(u.password_memo); } }}
                                className="text-[10px] text-blue-300 hover:text-blue-200"
                                title="コピー"
                              >
                                コピー
                              </button>
                            )}
                          </div>
                        ) : (
                          <span className="text-white/30 text-xs">—</span>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex flex-wrap gap-1">
                          {u.owner_project_ids.length === 0 ? (
                            <span className="text-white/30 text-xs">—</span>
                          ) : (
                            u.owner_project_ids.map((pid) => (
                              <span key={pid} className="px-2 py-0.5 text-[10px] bg-[#06C755]/20 text-[#06C755] rounded">
                                {projectNameById(pid)}
                              </span>
                            ))
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex flex-wrap gap-1">
                          {u.viewer_project_ids.length === 0 ? (
                            <span className="text-white/30 text-xs">—</span>
                          ) : (
                            u.viewer_project_ids.map((pid) => (
                              <span key={pid} className="px-2 py-0.5 text-[10px] bg-blue-500/20 text-blue-300 rounded">
                                {projectNameById(pid)}
                              </span>
                            ))
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => openEditUser(u)}
                            className="text-xs text-blue-400 hover:text-blue-300"
                          >
                            編集
                          </button>
                          <button
                            onClick={() => deleteUser(u)}
                            className="text-xs text-red-400 hover:text-red-300"
                          >
                            削除
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

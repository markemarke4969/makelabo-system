"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";

// ============================================================
// 型定義
// ============================================================
interface Follower {
  id: string;
  line_user_id: string;
  display_name: string | null;
  picture_url: string | null;
  status: string;
  followed_at: string;
  unfollowed_at: string | null;
  created_at: string;
  account_id?: string;
  memo?: string | null;
  labels?: string[];
}

interface Message {
  id: string;
  line_user_id: string;
  direction: string;
  message_type: string;
  message_text: string | null;
  raw_event: Record<string, unknown>;
  sent_at: string;
  is_read?: boolean;
}

interface LineAccount {
  id: string;
  channel_id: string;
  account_name: string | null;
  basic_id: string | null;
  is_active: boolean;
  group_name?: string | null;
}

interface Label {
  id: string;
  name: string;
  color: string;
  created_at: string;
  assigned_users: string[]; // line_user_id[]
}

// メインビュー
type MainView = "accounts" | "account-detail" | "settings";
// アカウント詳細内のサブビュー
type AccountSubView = "followers" | "chat" | "step" | "schedule" | "friend-page" | "labels";

// ============================================================
// アイコンコンポーネント
// ============================================================
const Icons = {
  back: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
  ),
  chevronRight: (
    <svg className="w-4 h-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
  ),
  search: (
    <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
  ),
  user: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
  ),
  users: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
  ),
  chat: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
  ),
  send: (
    <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" /></svg>
  ),
  image: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
  ),
  video: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
  ),
  template: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
  ),
  emoji: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
  ),
  settings: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
  ),
  step: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" /></svg>
  ),
  schedule: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
  ),
  friendAdd: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" /></svg>
  ),
  label: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" /></svg>
  ),
  download: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
  ),
  plus: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
  ),
  sort: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12" /></svg>
  ),
  folder: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" /></svg>
  ),
  edit: (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
  ),
  close: (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
  ),
};

const LINE_ICON = (
  <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63h2.386c.346 0 .627.285.627.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.06-.023.136-.033.194-.033.195 0 .375.104.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63.346 0 .628.285.628.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.282.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314" /></svg>
);

// ============================================================
// メイン
// ============================================================
export default function LineDashboard() {
  const router = useRouter();

  // 案件情報
  const [project, setProject] = useState<{ id: string; name: string; color: string } | null>(null);
  const [authChecked, setAuthChecked] = useState(false);

  // 案件チェック（認証はオプション）
  useEffect(() => {
    const stored = sessionStorage.getItem("line_project");
    if (!stored) {
      router.push("/line/projects");
      return;
    }
    try {
      setProject(JSON.parse(stored));
      setAuthChecked(true);
    } catch {
      router.push("/line/projects");
    }
  }, [router]);

  // ビュー状態
  const [mainView, setMainView] = useState<MainView>("accounts");
  const [accountSubView, setAccountSubView] = useState<AccountSubView>("chat");

  // データ
  const [followers, setFollowers] = useState<Follower[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [selectedUser, setSelectedUser] = useState<Follower | null>(null);
  const [selectedAccount, setSelectedAccount] = useState<LineAccount | null>(null);
  const [accounts, setAccounts] = useState<LineAccount[]>([]);

  // UI状態
  const [loading, setLoading] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [sending, setSending] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [chatSearch, setChatSearch] = useState("");
  const [memoText, setMemoText] = useState("");
  const [showAddAccount, setShowAddAccount] = useState(false);
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
  const [needsAction, setNeedsAction] = useState<Set<string>>(new Set());
  const [labels, setLabels] = useState<Label[]>([]);
  const [showAddLabel, setShowAddLabel] = useState(false);
  const [newLabelName, setNewLabelName] = useState("");
  const [expandedLabelId, setExpandedLabelId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showGroupManager, setShowGroupManager] = useState(false);
  const [editingGroupName, setEditingGroupName] = useState<{ old: string; new: string } | null>(null);
  const [newGroupName, setNewGroupName] = useState("");
  const [showSortMode, setShowSortMode] = useState(false);
  const [sortGroups, setSortGroups] = useState<{ name: string; accountIds: string[] }[]>([]);
  const [dragType, setDragType] = useState<"group" | "account" | null>(null);
  const [dragId, setDragId] = useState<string | null>(null); // group name or account id
  const [dragSourceGroup, setDragSourceGroup] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{ type: "group" | "account"; id: string } | null>(null);

  const [form, setForm] = useState({
    account_name: "",
    channel_id: "",
    basic_id: "",
    channel_secret: "",
    channel_access_token: "",
    group_name: "",
  });
  const [editingId, setEditingId] = useState<string | null>(null);

  const chatEndRef = useRef<HTMLDivElement>(null);

  // ============================================================
  // API
  // ============================================================
  const fetchFollowers = useCallback(async () => {
    setLoading(true);
    try {
      const pid = project?.id;
      const url = pid ? `/api/line/followers?project_id=${pid}` : "/api/line/followers";
      const res = await fetch(url);
      setFollowers(await res.json());
    } catch { /* */ } finally { setLoading(false); }
  }, [project?.id]);

  const fetchMessages = useCallback(async (userId?: string) => {
    try {
      const url = userId ? `/api/line/messages?user_id=${userId}` : "/api/line/messages";
      const res = await fetch(url);
      setMessages(await res.json());
    } catch { /* */ }
  }, []);

  const fetchAccounts = useCallback(async () => {
    try {
      const pid = project?.id;
      const url = pid ? `/api/line/accounts?project_id=${pid}` : "/api/line/accounts";
      const res = await fetch(url);
      setAccounts(await res.json());
    } catch { /* */ }
  }, [project?.id]);

  // 未読件数を計算（全メッセージから取得）
  const fetchUnreadCounts = useCallback(async () => {
    try {
      const res = await fetch("/api/line/messages");
      const allMessages: Message[] = await res.json();
      const counts: Record<string, number> = {};
      for (const m of allMessages) {
        if (m.direction === "incoming" && !m.is_read) {
          counts[m.line_user_id] = (counts[m.line_user_id] || 0) + 1;
        }
      }
      setUnreadCounts(counts);
    } catch { /* */ }
  }, []);

  // 既読にする
  const markAsRead = async (lineUserId: string) => {
    try {
      await fetch("/api/line/messages", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ line_user_id: lineUserId }),
      });
      // メッセージを再取得して is_read を更新
      await fetchMessages(lineUserId);
      // 未読カウントを更新
      setUnreadCounts((prev) => {
        const next = { ...prev };
        delete next[lineUserId];
        return next;
      });
    } catch {
      alert("既読処理に失敗しました");
    }
  };

  // 要対応トグル
  const toggleNeedsAction = (lineUserId: string) => {
    setNeedsAction((prev) => {
      const next = new Set(prev);
      if (next.has(lineUserId)) next.delete(lineUserId);
      else next.add(lineUserId);
      return next;
    });
  };

  // グループ名編集
  const renameGroup = (oldName: string, newName: string) => {
    if (!newName.trim() || newName === oldName) {
      setEditingGroupName(null);
      return;
    }
    // 全アカウントのgroup_nameを更新（ローカル）
    setAccounts((prev) =>
      prev.map((acc) =>
        (acc.group_name || "未分類") === oldName
          ? { ...acc, group_name: newName.trim() }
          : acc
      )
    );
    setEditingGroupName(null);
  };

  const deleteGroup = (groupName: string) => {
    if (!confirm(`グループ「${groupName}」を削除しますか？\nアカウントは「未分類」に移動します。`)) return;
    setAccounts((prev) =>
      prev.map((acc) =>
        (acc.group_name || "未分類") === groupName
          ? { ...acc, group_name: null }
          : acc
      )
    );
  };

  // 表示順変更（ドラッグ＆ドロップ）
  const enterSortMode = () => {
    // 現在のグループ構造をsortGroupsに初期化
    const groups: { name: string; accountIds: string[] }[] = [];
    const seen = new Set<string>();
    for (const acc of accounts) {
      const gn = acc.group_name || "未分類";
      if (!seen.has(gn)) {
        seen.add(gn);
        groups.push({ name: gn, accountIds: [] });
      }
    }
    for (const acc of accounts) {
      const gn = acc.group_name || "未分類";
      const g = groups.find((g) => g.name === gn);
      if (g) g.accountIds.push(acc.id);
    }
    setSortGroups(groups);
    setShowSortMode(true);
  };

  const clearDrag = () => {
    setDragType(null);
    setDragId(null);
    setDragSourceGroup(null);
    setDropTarget(null);
  };

  // グループをドラッグ開始
  const onGroupDragStart = (groupName: string) => {
    setDragType("group");
    setDragId(groupName);
  };

  // アカウントをドラッグ開始
  const onAccountDragStart = (accId: string, fromGroup: string) => {
    setDragType("account");
    setDragId(accId);
    setDragSourceGroup(fromGroup);
  };

  const onDragOverGroup = (e: React.DragEvent, groupName: string) => {
    e.preventDefault();
    setDropTarget({ type: "group", id: groupName });
  };

  const onDragOverAccount = (e: React.DragEvent, accId: string) => {
    e.preventDefault();
    setDropTarget({ type: "account", id: accId });
  };

  const onDropOnGroup = (targetGroupName: string) => {
    if (!dragId) { clearDrag(); return; }

    if (dragType === "group" && dragId !== targetGroupName) {
      // グループ同士の並び替え
      setSortGroups((prev) => {
        const next = [...prev];
        const fromIdx = next.findIndex((g) => g.name === dragId);
        const toIdx = next.findIndex((g) => g.name === targetGroupName);
        if (fromIdx === -1 || toIdx === -1) return prev;
        const [moved] = next.splice(fromIdx, 1);
        next.splice(toIdx, 0, moved);
        return next;
      });
    } else if (dragType === "account") {
      // アカウントを別グループに移動（グループヘッダーにドロップ → そのグループの末尾に追加）
      setSortGroups((prev) => {
        const next = prev.map((g) => ({ ...g, accountIds: [...g.accountIds] }));
        // 元のグループから削除
        for (const g of next) {
          g.accountIds = g.accountIds.filter((id) => id !== dragId);
        }
        // ターゲットグループの末尾に追加
        const targetG = next.find((g) => g.name === targetGroupName);
        if (targetG && dragId) targetG.accountIds.push(dragId);
        return next;
      });
    }
    clearDrag();
  };

  const onDropOnAccount = (targetAccId: string) => {
    if (!dragId || dragType !== "account" || dragId === targetAccId) { clearDrag(); return; }

    setSortGroups((prev) => {
      const next = prev.map((g) => ({ ...g, accountIds: [...g.accountIds] }));
      // ターゲットがどのグループにいるか
      const targetGroup = next.find((g) => g.accountIds.includes(targetAccId));
      if (!targetGroup) return prev;

      // 元のグループから削除
      for (const g of next) {
        g.accountIds = g.accountIds.filter((id) => id !== dragId);
      }
      // ターゲットの位置に挿入
      const toIdx = targetGroup.accountIds.indexOf(targetAccId);
      if (dragId) targetGroup.accountIds.splice(toIdx, 0, dragId);
      return next;
    });
    clearDrag();
  };

  const saveSortOrder = () => {
    // sortGroupsに基づいてaccountsを再構成
    const accMap = new Map(accounts.map((a) => [a.id, a]));
    const newAccounts: LineAccount[] = [];
    for (const group of sortGroups) {
      for (const accId of group.accountIds) {
        const acc = accMap.get(accId);
        if (acc) {
          newAccounts.push({ ...acc, group_name: group.name === "未分類" ? null : group.name });
        }
      }
    }
    // 含まれなかったもの（万が一）
    for (const acc of accounts) {
      if (!newAccounts.find((a) => a.id === acc.id)) newAccounts.push(acc);
    }
    setAccounts(newAccounts);
    setShowSortMode(false);
  };

  // 通常表示用のグループ
  const sortedGroupedAccounts = accounts.reduce<Record<string, LineAccount[]>>((groups, acc) => {
    const group = acc.group_name || "未分類";
    if (!groups[group]) groups[group] = [];
    groups[group].push(acc);
    return groups;
  }, {});

  // 選択削除
  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = (ids: string[]) => {
    if (ids.every((id) => selectedIds.has(id))) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(ids));
    }
  };

  const deleteSelected = async () => {
    if (selectedIds.size === 0) return;
    const names = followers.filter((f) => selectedIds.has(f.id)).map((f) => f.display_name ?? f.line_user_id.slice(0, 10)).join(", ");
    if (!confirm(`${selectedIds.size}件を削除しますか？\n\n${names}\n\n※メッセージ履歴も削除されます`)) return;
    const res = await fetch("/api/line/followers", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: Array.from(selectedIds) }),
    });
    if (res.ok) {
      setSelectedIds(new Set());
      setSelectedUser(null);
      fetchFollowers();
    } else {
      alert("削除に失敗しました");
    }
  };

  // ラベル管理
  const LABEL_COLORS = ["#3B82F6", "#EF4444", "#10B981", "#F59E0B", "#8B5CF6", "#EC4899", "#06B6D4", "#F97316"];

  const createLabel = () => {
    if (!newLabelName.trim()) return;
    const newLabel: Label = {
      id: crypto.randomUUID(),
      name: newLabelName.trim(),
      color: LABEL_COLORS[labels.length % LABEL_COLORS.length],
      created_at: new Date().toISOString(),
      assigned_users: [],
    };
    setLabels((prev) => [newLabel, ...prev]);
    setNewLabelName("");
    setShowAddLabel(false);
  };

  const deleteLabel = (id: string) => {
    if (!confirm("このラベルを削除しますか？")) return;
    setLabels((prev) => prev.filter((l) => l.id !== id));
  };

  const toggleLabelUser = (labelId: string, lineUserId: string) => {
    setLabels((prev) =>
      prev.map((l) => {
        if (l.id !== labelId) return l;
        const has = l.assigned_users.includes(lineUserId);
        return {
          ...l,
          assigned_users: has
            ? l.assigned_users.filter((u) => u !== lineUserId)
            : [lineUserId, ...l.assigned_users],
        };
      })
    );
  };

  const resetForm = () => {
    setForm({ account_name: "", channel_id: "", basic_id: "", channel_secret: "", channel_access_token: "", group_name: "" });
    setEditingId(null);
    setSaveMsg(null);
  };

  const startEdit = (acc: LineAccount & { channel_secret?: string; channel_access_token?: string }) => {
    setForm({
      account_name: acc.account_name ?? "",
      channel_id: acc.channel_id,
      basic_id: acc.basic_id ?? "",
      channel_secret: acc.channel_secret ?? "",
      channel_access_token: acc.channel_access_token ?? "",
      group_name: acc.group_name ?? "",
    });
    setEditingId(acc.id);
    setSaveMsg(null);
    setShowAddAccount(true);
  };

  const saveAccount = async () => {
    if (!form.channel_id || !form.channel_secret || !form.channel_access_token) {
      setSaveMsg({ ok: false, text: "チャネルID・シークレット・アクセストークンは必須です" });
      return;
    }
    setSaving(true);
    setSaveMsg(null);
    try {
      const res = await fetch("/api/line/accounts", {
        method: editingId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editingId ? { id: editingId, ...form } : { ...form, project_id: project?.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "保存失敗");
      setSaveMsg({ ok: true, text: editingId ? "更新しました" : "登録しました" });
      resetForm();
      setShowAddAccount(false);
      fetchAccounts();
    } catch (e) {
      setSaveMsg({ ok: false, text: e instanceof Error ? e.message : "エラー" });
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    fetchFollowers();
    fetchAccounts();
    fetchUnreadCounts();
  }, [fetchFollowers, fetchAccounts, fetchUnreadCounts]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async () => {
    if (!chatInput.trim() || !selectedUser) return;
    setSending(true);
    try {
      const res = await fetch("/api/line/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ line_user_id: selectedUser.line_user_id, message: chatInput.trim() }),
      });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error ?? "送信失敗");
        return;
      }
      setChatInput("");
      fetchMessages(selectedUser.line_user_id);
    } catch {
      alert("送信エラー");
    } finally {
      setSending(false);
    }
  };

  const openAccount = (acc: LineAccount) => {
    setSelectedAccount(acc);
    setMainView("account-detail");
    setAccountSubView("chat");
    setSelectedUser(null);
  };

  const openChat = (f: Follower) => {
    setSelectedUser(f);
    setMemoText(f.memo ?? "");
    fetchMessages(f.line_user_id);
  };

  const downloadCSV = (type: "followers" | "messages") => {
    const params = new URLSearchParams({ type });
    if (type === "messages" && selectedUser) {
      params.set("user_id", selectedUser.line_user_id);
    }
    window.open(`/api/line/export?${params}`, "_blank");
  };

  // ============================================================
  // ヘルパー
  // ============================================================
  const fmtTime = (d: string) => new Date(d).toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });
  const fmtShort = (d: string) => {
    const date = new Date(d);
    const today = new Date();
    if (date.toDateString() === today.toDateString()) return fmtTime(d);
    return date.toLocaleDateString("ja-JP", { month: "short", day: "numeric" });
  };
  const fmtFull = (d: string) => new Date(d).toLocaleDateString("ja-JP", { year: "numeric", month: "long", day: "numeric" });

  const groupedAccounts = accounts.reduce<Record<string, LineAccount[]>>((groups, acc) => {
    const group = acc.group_name || "未分類";
    if (!groups[group]) groups[group] = [];
    groups[group].push(acc);
    return groups;
  }, {});

  // チャット一覧用: 最新メッセージで並び替え（仮：followed_atの新しい順）
  const sortedFollowers = [...followers].sort((a, b) =>
    new Date(b.followed_at).getTime() - new Date(a.followed_at).getTime()
  );

  const filteredChatFollowers = sortedFollowers.filter((f) => {
    if (!chatSearch) return true;
    return f.display_name?.toLowerCase().includes(chatSearch.toLowerCase()) ||
      f.line_user_id.includes(chatSearch);
  });

  const filteredFollowers = followers.filter((f) => {
    if (!searchQuery) return true;
    return f.display_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      f.line_user_id.includes(searchQuery);
  });

  const StatusBadge = ({ status }: { status: string }) => {
    const styles: Record<string, string> = {
      following: "bg-green-100 text-green-700",
      unfollowed: "bg-gray-100 text-gray-500",
      blocked: "bg-red-100 text-red-600",
    };
    const labels: Record<string, string> = {
      following: "友だち", unfollowed: "解除", blocked: "ブロック",
    };
    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${styles[status] ?? styles.unfollowed}`}>
        {labels[status] ?? status}
      </span>
    );
  };

  // ============================================================
  // サイドバーメニュー定義
  // ============================================================
  const accountDetailMenu: { key: AccountSubView; label: string; icon: React.ReactNode }[] = [
    { key: "chat", label: "LINE チャット", icon: Icons.chat },
    { key: "followers", label: "LINE 友だち", icon: Icons.users },
    { key: "step", label: "ステップ配信", icon: Icons.step },
    { key: "schedule", label: "予約配信", icon: Icons.schedule },
    { key: "friend-page", label: "友だち追加ページ", icon: Icons.friendAdd },
    { key: "labels", label: "ラベル管理", icon: Icons.label },
  ];

  // ============================================================
  // レンダリング
  // ============================================================
  return (
    !authChecked ? <div className="min-h-screen bg-[#1e2744] flex items-center justify-center"><div className="text-white/50 text-sm">読み込み中...</div></div> : <div className="min-h-screen h-screen bg-[#f5f6fa] text-gray-800 flex overflow-hidden">
      {/* ===== 左サイドバー ===== */}
      <aside className="w-52 bg-[#1e2744] text-white flex flex-col flex-shrink-0">
        {/* ロゴ + 案件名 */}
        <div className="px-4 py-3 border-b border-white/10">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: project?.color || "#06C755" }}>
              <span className="text-white text-xs font-bold">{project?.name?.charAt(0) || "L"}</span>
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-bold text-sm text-white truncate">{project?.name || "LINE ハーネス"}</div>
              <div className="text-[10px] text-white/40">LINE Harness</div>
            </div>
          </div>
          <button
            onClick={() => router.push("/line/projects")}
            className="mt-2 w-full px-2 py-1 text-[11px] text-white/50 hover:text-white hover:bg-white/10 rounded-md transition text-center border border-white/10"
          >
            案件を切り替える
          </button>
        </div>

        <nav className="flex-1 py-2 overflow-y-auto">
          {/* メインビューがaccountsまたはsettings */}
          {mainView !== "account-detail" ? (
            <>
              <div className="px-3 pt-2 pb-1">
                <span className="text-[10px] uppercase tracking-wider text-white/40 font-medium">シナリオ管理</span>
              </div>
              <button
                onClick={() => { setMainView("accounts"); setSelectedAccount(null); setSelectedUser(null); }}
                className={`w-full flex items-center gap-2.5 px-4 py-2 text-[13px] transition-colors ${mainView === "accounts" ? "bg-white/10 text-white border-l-[3px] border-[#06C755]" : "text-white/60 hover:text-white hover:bg-white/5"}`}
              >
                {Icons.users}
                配信アカウント
              </button>

              <div className="px-3 pt-4 pb-1">
                <span className="text-[10px] uppercase tracking-wider text-white/40 font-medium">ツール</span>
              </div>
              <button onClick={() => downloadCSV("followers")} className="w-full flex items-center gap-2.5 px-4 py-2 text-[13px] text-white/60 hover:text-white hover:bg-white/5 transition-colors">
                {Icons.download}
                友だちCSV
              </button>
              <button onClick={() => downloadCSV("messages")} className="w-full flex items-center gap-2.5 px-4 py-2 text-[13px] text-white/60 hover:text-white hover:bg-white/5 transition-colors">
                {Icons.download}
                履歴CSV
              </button>

              <div className="px-3 pt-4 pb-1">
                <span className="text-[10px] uppercase tracking-wider text-white/40 font-medium">設定</span>
              </div>
              <button
                onClick={() => setMainView("settings")}
                className={`w-full flex items-center gap-2.5 px-4 py-2 text-[13px] transition-colors ${mainView === "settings" ? "bg-white/10 text-white border-l-[3px] border-[#06C755]" : "text-white/60 hover:text-white hover:bg-white/5"}`}
              >
                {Icons.settings}
                アカウント管理
              </button>
            </>
          ) : (
            /* アカウント詳細時のサイドバー */
            <>
              <button
                onClick={() => { setMainView("accounts"); setSelectedAccount(null); setSelectedUser(null); }}
                className="w-full flex items-center gap-2 px-4 py-2.5 text-[13px] text-white/50 hover:text-white hover:bg-white/5 transition-colors border-b border-white/10"
              >
                {Icons.back}
                アカウント一覧に戻る
              </button>

              {/* 選択中アカウント名 */}
              <div className="px-4 py-3 border-b border-white/10">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-[#06C755] flex items-center justify-center flex-shrink-0">
                    <span className="text-white text-[10px] font-bold">L</span>
                  </div>
                  <span className="text-xs font-medium text-white truncate">{selectedAccount?.account_name ?? "アカウント"}</span>
                </div>
              </div>

              {accountDetailMenu.map((item) => (
                <button
                  key={item.key}
                  onClick={() => { setAccountSubView(item.key); setSelectedUser(null); }}
                  className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-[13px] transition-colors ${accountSubView === item.key ? "bg-[#4f8ff7] text-white" : "text-white/60 hover:text-white hover:bg-white/5"}`}
                >
                  {item.icon}
                  {item.label}
                </button>
              ))}

              <div className="px-3 pt-4 pb-1">
                <span className="text-[10px] uppercase tracking-wider text-white/40 font-medium">その他</span>
              </div>
              <button
                onClick={() => { setMainView("settings"); }}
                className="w-full flex items-center gap-2.5 px-4 py-2 text-[13px] text-white/60 hover:text-white hover:bg-white/5 transition-colors"
              >
                {Icons.settings}
                アカウント設定
              </button>
            </>
          )}
        </nav>

        <div className="px-4 py-2.5 border-t border-white/10 text-[10px] text-white/30">
          LINE Harness v1.0
        </div>
      </aside>

      {/* ===== メインエリア ===== */}
      <div className="flex-1 flex flex-col min-w-0">

        {/* ============================================================ */}
        {/* アカウント一覧 */}
        {/* ============================================================ */}
        {mainView === "accounts" && (
          <>
            <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between flex-shrink-0">
              <h1 className="text-base font-bold text-gray-800">アカウント一覧</h1>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => { resetForm(); setShowAddAccount(true); }}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-md transition"
                >
                  {Icons.plus}
                  追加
                </button>
                <button
                  onClick={() => setShowGroupManager(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-medium rounded-md transition"
                >
                  {Icons.folder}
                  グループ管理
                </button>
                <button
                  onClick={enterSortMode}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-500 hover:bg-orange-600 text-white text-xs font-medium rounded-md transition"
                >
                  {Icons.sort}
                  表示順変更
                </button>
              </div>
            </header>

            <main className="flex-1 overflow-y-auto p-6">
              {/* アカウント追加モーダル */}
              {showAddAccount && (
                <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
                  <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
                    <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
                      <h3 className="font-bold text-gray-800">{editingId ? "アカウント編集" : "新規アカウント追加"}</h3>
                      <button onClick={() => { setShowAddAccount(false); resetForm(); }} className="text-gray-400 hover:text-gray-600">{Icons.close}</button>
                    </div>
                    <div className="p-5 space-y-3">
                      <div>
                        <label className="text-xs text-gray-500 block mb-1 font-medium">アカウント名</label>
                        <input type="text" value={form.account_name} onChange={(e) => setForm({ ...form, account_name: e.target.value })} placeholder="ハピネスサロン音声相談LINE" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400" />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 block mb-1 font-medium">グループ名</label>
                        <input type="text" value={form.group_name} onChange={(e) => setForm({ ...form, group_name: e.target.value })} placeholder="ハピネスサロン" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400" />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 block mb-1 font-medium">チャネルID <span className="text-red-500">*</span></label>
                        <input type="text" value={form.channel_id} onChange={(e) => setForm({ ...form, channel_id: e.target.value })} placeholder="2009751642" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400" />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 block mb-1 font-medium">Basic ID</label>
                        <input type="text" value={form.basic_id} onChange={(e) => setForm({ ...form, basic_id: e.target.value })} placeholder="576ergby (@除く)" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400" />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 block mb-1 font-medium">チャネルシークレット <span className="text-red-500">*</span></label>
                        <input type="password" value={form.channel_secret} onChange={(e) => setForm({ ...form, channel_secret: e.target.value })} placeholder="LINE Developersからコピー" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400" />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 block mb-1 font-medium">チャネルアクセストークン <span className="text-red-500">*</span></label>
                        <input type="password" value={form.channel_access_token} onChange={(e) => setForm({ ...form, channel_access_token: e.target.value })} placeholder="発行済みトークン" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400" />
                      </div>
                      {saveMsg && (
                        <div className={`px-4 py-2.5 rounded-lg text-sm ${saveMsg.ok ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-600 border border-red-200"}`}>
                          {saveMsg.text}
                        </div>
                      )}
                    </div>
                    <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-200">
                      <button onClick={() => { setShowAddAccount(false); resetForm(); }} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition">キャンセル</button>
                      <button onClick={saveAccount} disabled={saving} className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition">
                        {saving ? "保存中..." : editingId ? "更新" : "登録"}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* グループ管理モーダル */}
              {showGroupManager && (
                <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
                  <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4">
                    <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
                      <h3 className="font-bold text-gray-800">グループ管理</h3>
                      <button onClick={() => { setShowGroupManager(false); setEditingGroupName(null); }} className="text-gray-400 hover:text-gray-600">{Icons.close}</button>
                    </div>
                    <div className="p-5">
                      {/* 新規グループ作成 */}
                      <div className="flex items-center gap-2 mb-4">
                        <input
                          type="text"
                          value={newGroupName}
                          onChange={(e) => setNewGroupName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.nativeEvent.isComposing && newGroupName.trim()) {
                              // 空のグループを作成（groupedAccountsに表示されるようaccountsには影響しないが、名前だけ予約）
                              // 既存グループ名と重複チェック
                              if (Object.keys(groupedAccounts).includes(newGroupName.trim())) {
                                alert("同じ名前のグループが既にあります");
                                return;
                              }
                              // ダミーとしてgroupedAccountsに空配列を入れるためstateに保持
                              setAccounts((prev) => [...prev, { id: `group-placeholder-${Date.now()}`, channel_id: "", account_name: null, basic_id: null, is_active: false, group_name: newGroupName.trim() } as LineAccount]);
                              setNewGroupName("");
                            }
                          }}
                          placeholder="新しいグループ名を入力"
                          className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
                        />
                        <button
                          onClick={() => {
                            if (!newGroupName.trim()) return;
                            if (Object.keys(groupedAccounts).includes(newGroupName.trim())) {
                              alert("同じ名前のグループが既にあります");
                              return;
                            }
                            setAccounts((prev) => [...prev, { id: `group-placeholder-${Date.now()}`, channel_id: "", account_name: null, basic_id: null, is_active: false, group_name: newGroupName.trim() } as LineAccount]);
                            setNewGroupName("");
                          }}
                          disabled={!newGroupName.trim()}
                          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-medium rounded-lg transition"
                        >
                          作成
                        </button>
                      </div>

                      {Object.keys(groupedAccounts).length === 0 ? (
                        <p className="text-sm text-gray-400 text-center py-4">グループがありません</p>
                      ) : (
                        <div className="space-y-2">
                          {Object.entries(groupedAccounts).map(([groupName, groupAccs]) => (
                            <div key={groupName} className="flex items-center justify-between bg-gray-50 rounded-lg px-4 py-3">
                              {editingGroupName?.old === groupName ? (
                                <div className="flex items-center gap-2 flex-1">
                                  <input
                                    type="text"
                                    value={editingGroupName.new}
                                    onChange={(e) => setEditingGroupName({ ...editingGroupName, new: e.target.value })}
                                    onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) renameGroup(editingGroupName.old, editingGroupName.new); }}
                                    autoFocus
                                    className="flex-1 border border-blue-400 rounded-md px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
                                  />
                                  <button
                                    onClick={() => renameGroup(editingGroupName.old, editingGroupName.new)}
                                    className="px-2.5 py-1 bg-blue-600 text-white text-xs rounded-md hover:bg-blue-700 transition"
                                  >
                                    保存
                                  </button>
                                  <button
                                    onClick={() => setEditingGroupName(null)}
                                    className="px-2.5 py-1 text-gray-500 text-xs hover:bg-gray-200 rounded-md transition"
                                  >
                                    取消
                                  </button>
                                </div>
                              ) : (
                                <>
                                  <div>
                                    <span className="text-sm font-medium text-gray-800">{groupName}</span>
                                    <span className="text-xs text-gray-400 ml-2">({groupAccs.length} アカウント)</span>
                                  </div>
                                  <div className="flex items-center gap-1.5">
                                    <button
                                      onClick={() => setEditingGroupName({ old: groupName, new: groupName })}
                                      className="px-2.5 py-1 text-xs text-blue-600 hover:bg-blue-50 rounded-md transition"
                                    >
                                      編集
                                    </button>
                                    {groupName !== "未分類" && (
                                      <button
                                        onClick={() => deleteGroup(groupName)}
                                        className="px-2.5 py-1 text-xs text-red-500 hover:bg-red-50 rounded-md transition"
                                      >
                                        削除
                                      </button>
                                    )}
                                  </div>
                                </>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex justify-end px-5 py-4 border-t border-gray-200">
                      <button onClick={() => { setShowGroupManager(false); setEditingGroupName(null); }} className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm rounded-lg transition">閉じる</button>
                    </div>
                  </div>
                </div>
              )}

              {/* 表示順変更モード */}
              {showSortMode && (
                <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
                  <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 max-h-[85vh] flex flex-col">
                    <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
                      <h3 className="font-bold text-gray-800">表示順変更</h3>
                      <button onClick={() => { setShowSortMode(false); clearDrag(); }} className="text-gray-400 hover:text-gray-600">{Icons.close}</button>
                    </div>
                    <div className="px-5 pt-3 flex items-center gap-4 text-[11px] text-gray-500">
                      <span className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-orange-400" />
                        グループをドラッグで並び替え
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-green-500" />
                        アカウントをドラッグでグループ間移動
                      </span>
                    </div>
                    <div className="flex-1 overflow-y-auto p-5 space-y-2">
                      {sortGroups.map((group) => {
                        const isGroupDragging = dragType === "group" && dragId === group.name;
                        const isGroupDropTarget = dropTarget?.type === "group" && dropTarget.id === group.name;
                        return (
                          <div
                            key={group.name}
                            className={`rounded-lg border transition-all ${
                              isGroupDragging ? "opacity-50" : ""
                            } ${isGroupDropTarget && dragType === "account" ? "border-blue-500 ring-2 ring-blue-200" : isGroupDropTarget && dragType === "group" ? "border-orange-500 ring-2 ring-orange-200" : "border-gray-200"}`}
                          >
                            {/* グループヘッダー（ドラッグ可能） */}
                            <div
                              draggable
                              onDragStart={() => onGroupDragStart(group.name)}
                              onDragOver={(e) => onDragOverGroup(e, group.name)}
                              onDrop={() => onDropOnGroup(group.name)}
                              onDragEnd={clearDrag}
                              className="flex items-center gap-2.5 px-4 py-2.5 bg-gray-50 rounded-t-lg cursor-grab active:cursor-grabbing border-b border-gray-200"
                            >
                              {/* ドラッグハンドル */}
                              <svg className="w-3.5 h-3.5 text-orange-400 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24"><circle cx="9" cy="5" r="1.5" /><circle cx="15" cy="5" r="1.5" /><circle cx="9" cy="12" r="1.5" /><circle cx="15" cy="12" r="1.5" /><circle cx="9" cy="19" r="1.5" /><circle cx="15" cy="19" r="1.5" /></svg>
                              <span className="text-sm font-bold text-gray-700">{group.name}</span>
                              <span className="text-[11px] text-gray-400">({group.accountIds.length})</span>
                            </div>

                            {/* グループ内のアカウント */}
                            <div className="py-1">
                              {group.accountIds.length === 0 ? (
                                <div
                                  onDragOver={(e) => onDragOverGroup(e, group.name)}
                                  onDrop={() => onDropOnGroup(group.name)}
                                  className="px-4 py-3 text-xs text-gray-400 text-center"
                                >
                                  アカウントをここにドロップ
                                </div>
                              ) : (
                                group.accountIds.map((accId) => {
                                  const acc = accounts.find((a) => a.id === accId);
                                  if (!acc) return null;
                                  const isAccDragging = dragType === "account" && dragId === accId;
                                  const isAccDropTarget = dropTarget?.type === "account" && dropTarget.id === accId;
                                  return (
                                    <div
                                      key={accId}
                                      draggable
                                      onDragStart={() => onAccountDragStart(accId, group.name)}
                                      onDragOver={(e) => onDragOverAccount(e, accId)}
                                      onDrop={() => onDropOnAccount(accId)}
                                      onDragEnd={clearDrag}
                                      className={`flex items-center gap-3 mx-2 my-1 px-3 py-2.5 rounded-md transition-all cursor-grab active:cursor-grabbing ${
                                        isAccDragging
                                          ? "opacity-40 bg-green-50"
                                          : isAccDropTarget
                                            ? "bg-green-50 border border-green-400 shadow-sm"
                                            : "hover:bg-gray-50"
                                      }`}
                                    >
                                      <svg className="w-3.5 h-3.5 text-green-500 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24"><circle cx="9" cy="5" r="1.5" /><circle cx="15" cy="5" r="1.5" /><circle cx="9" cy="12" r="1.5" /><circle cx="15" cy="12" r="1.5" /><circle cx="9" cy="19" r="1.5" /><circle cx="15" cy="19" r="1.5" /></svg>
                                      <div className="w-6 h-6 rounded-full bg-[#06C755] flex items-center justify-center flex-shrink-0">
                                        <span className="text-white text-[9px] font-bold">L</span>
                                      </div>
                                      <span className="text-sm text-gray-800 truncate">{acc.account_name ?? "未設定"}</span>
                                    </div>
                                  );
                                })
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-200">
                      <button onClick={() => { setShowSortMode(false); clearDrag(); }} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition">キャンセル</button>
                      <button
                        onClick={saveSortOrder}
                        className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition"
                      >
                        保存
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {loading ? (
                <div className="text-center text-gray-400 py-20">読み込み中...</div>
              ) : accounts.length === 0 ? (
                <div className="bg-white rounded-lg border border-gray-200 p-16 text-center text-gray-400">
                  <p className="text-lg mb-2">LINEアカウントが登録されていません</p>
                  <p className="text-sm mb-4">「+ 追加」ボタンから新規登録してください</p>
                </div>
              ) : (
                <div className="space-y-5 max-w-5xl">
                  {Object.entries(sortedGroupedAccounts).map(([groupName, groupAccs]) => (
                    <div key={groupName} className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                      <div className="px-5 py-3 bg-gray-50 border-b border-gray-200">
                        <h3 className="text-sm font-bold text-gray-700">{groupName}</h3>
                      </div>
                      {groupAccs.map((acc, i) => (
                        <div
                          key={acc.id}
                          onClick={() => openAccount(acc)}
                          className={`flex items-center justify-between px-5 py-3.5 hover:bg-blue-50/50 cursor-pointer transition-colors ${i < groupAccs.length - 1 ? "border-b border-gray-100" : ""}`}
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-full bg-[#06C755] flex items-center justify-center">{LINE_ICON}</div>
                            <div>
                              <div className="text-sm font-medium text-gray-800">{acc.account_name ?? "未設定"}</div>
                              {acc.basic_id && <div className="text-xs text-gray-400">@{acc.basic_id}</div>}
                            </div>
                          </div>
                          <div className="flex items-center gap-4">
                            <span className={`text-xs px-2 py-0.5 rounded-full ${acc.is_active ? "bg-green-100 text-green-600" : "bg-gray-100 text-gray-400"}`}>
                              {acc.is_active ? "有効" : "無効"}
                            </span>
                            {Icons.chevronRight}
                          </div>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </main>
          </>
        )}

        {/* ============================================================ */}
        {/* アカウント詳細: チャット一覧 */}
        {/* ============================================================ */}
        {mainView === "account-detail" && accountSubView === "chat" && (
          <div className="flex-1 flex min-h-0">
            {/* --- チャットリスト（左） --- */}
            <div className="w-72 bg-white border-r border-gray-200 flex flex-col flex-shrink-0">
              <div className="px-3 py-3 border-b border-gray-200">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-bold text-gray-700">LINE チャット</span>
                  <button onClick={() => fetchFollowers()} className="text-xs text-blue-600 hover:text-blue-800">更新</button>
                </div>
                <div className="relative">
                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2">{Icons.search}</span>
                  <input
                    type="text"
                    value={chatSearch}
                    onChange={(e) => setChatSearch(e.target.value)}
                    placeholder="名前で検索"
                    className="w-full pl-8 pr-3 py-1.5 border border-gray-200 rounded-md text-xs bg-gray-50 focus:bg-white focus:border-blue-400 focus:outline-none"
                  />
                </div>
              </div>
              <div className="flex-1 overflow-y-auto">
                {filteredChatFollowers.length === 0 ? (
                  <div className="p-4 text-center text-xs text-gray-400">チャット履歴なし</div>
                ) : (
                  filteredChatFollowers.map((f) => (
                    <button
                      key={f.id}
                      onClick={() => openChat(f)}
                      className={`w-full flex items-center gap-2.5 px-3 py-3 text-left border-b border-gray-100 hover:bg-gray-50 transition-colors ${selectedUser?.id === f.id ? "bg-blue-50 border-l-[3px] border-l-blue-500" : ""}`}
                    >
                      {f.picture_url ? (
                        <img src={f.picture_url} alt="" className="w-10 h-10 rounded-full object-cover flex-shrink-0" />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0 text-gray-400">{Icons.user}</div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-gray-800 truncate">{f.display_name ?? "名前なし"}</span>
                          {needsAction.has(f.line_user_id) && (
                            <span className="flex-shrink-0 inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-white border-2 border-red-500 rounded-full">
                              <span className="w-2 h-2 bg-red-500 rounded-full" />
                              <span className="text-[9px] font-bold text-red-600 leading-none">要対応</span>
                            </span>
                          )}
                          <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
                            {(unreadCounts[f.line_user_id] ?? 0) > 0 && (
                              <span className="min-w-[18px] h-[18px] px-1 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                                {unreadCounts[f.line_user_id]}
                              </span>
                            )}
                            <span className="text-[10px] text-gray-400">{fmtShort(f.followed_at)}</span>
                          </div>
                        </div>
                        <div className="text-xs text-gray-400 truncate mt-0.5">
                          {f.status === "following" ? "友だち" : f.status === "blocked" ? "ブロック中" : "解除済み"}
                        </div>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>

            {/* --- チャットメイン（中央） --- */}
            {selectedUser ? (
              <>
                <div className="flex-1 flex flex-col min-w-0">
                  {/* チャットヘッダー */}
                  <div className="bg-white border-b border-gray-200 px-4 py-2.5 flex items-center gap-3 flex-shrink-0">
                    <span className="text-sm text-gray-500">チャット内容</span>
                    <div className="flex items-center gap-3 ml-auto">
                      {(unreadCounts[selectedUser.line_user_id] ?? 0) > 0 && (
                        <span className="text-xs text-red-500 font-medium">
                          未読 {unreadCounts[selectedUser.line_user_id]} 件
                        </span>
                      )}
                      <button
                        onClick={() => markAsRead(selectedUser.line_user_id)}
                        disabled={(unreadCounts[selectedUser.line_user_id] ?? 0) === 0}
                        className={`px-3 py-1 text-xs font-medium rounded-md transition ${
                          (unreadCounts[selectedUser.line_user_id] ?? 0) > 0
                            ? "bg-blue-600 hover:bg-blue-700 text-white"
                            : "bg-gray-100 text-gray-400 cursor-not-allowed"
                        }`}
                      >
                        既読にする
                      </button>
                      <button
                        onClick={() => toggleNeedsAction(selectedUser.line_user_id)}
                        className={`px-3 py-1 text-xs font-medium rounded-md border-2 transition ${
                          needsAction.has(selectedUser.line_user_id)
                            ? "bg-red-50 text-red-600 border-red-500 hover:bg-red-100"
                            : "bg-white text-red-500 border-red-400 hover:bg-red-50"
                        }`}
                      >
                        {needsAction.has(selectedUser.line_user_id) ? "要対応 解除" : "要対応"}
                      </button>
                      <span className="text-xs text-gray-400">{messages.length} 件</span>
                    </div>
                  </div>

                  {/* メッセージ（LINE風） */}
                  <div className="flex-1 overflow-y-auto bg-[#8cabd9]">
                    <div className="max-w-2xl mx-auto px-4 py-4 space-y-2">
                      {messages.length === 0 ? (
                        <div className="text-center text-white/70 text-sm pt-20">メッセージがありません</div>
                      ) : (
                        messages.map((m, i) => {
                          const showDate = i === 0 || new Date(m.sent_at).toDateString() !== new Date(messages[i - 1].sent_at).toDateString();
                          return (
                            <div key={m.id}>
                              {showDate && (
                                <div className="text-center my-3">
                                  <span className="bg-black/20 text-white text-[11px] px-3 py-0.5 rounded-full">
                                    {fmtFull(m.sent_at)}
                                  </span>
                                </div>
                              )}
                              <div className={`flex ${m.direction === "outgoing" ? "justify-end" : "justify-start"} items-end gap-1.5`}>
                                {m.direction === "incoming" && (
                                  selectedUser.picture_url ? (
                                    <img src={selectedUser.picture_url} alt="" className="w-8 h-8 rounded-full object-cover flex-shrink-0 mb-0.5" />
                                  ) : (
                                    <div className="w-8 h-8 rounded-full bg-gray-300 flex items-center justify-center flex-shrink-0 mb-0.5 text-gray-500">
                                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                                    </div>
                                  )
                                )}
                                {m.direction === "outgoing" && (
                                  <span className="text-[10px] text-white/60 mb-0.5">{fmtTime(m.sent_at)}</span>
                                )}
                                <div className={`max-w-[75%] rounded-2xl px-3.5 py-2 text-[13px] shadow-sm leading-relaxed ${
                                  m.direction === "outgoing"
                                    ? "bg-[#06C755] text-white rounded-br-md"
                                    : "bg-white text-gray-800 rounded-bl-md"
                                }`}>
                                  {m.message_text ?? `[${m.message_type}]`}
                                </div>
                                {m.direction === "incoming" && (
                                  <span className="text-[10px] text-white/60 mb-0.5">{fmtTime(m.sent_at)}</span>
                                )}
                              </div>
                            </div>
                          );
                        })
                      )}
                      <div ref={chatEndRef} />
                    </div>
                  </div>

                  {/* 送信ツールバー + 入力 */}
                  <div className="bg-white border-t border-gray-200 flex-shrink-0">
                    {/* ツールボタン */}
                    <div className="flex items-center gap-1 px-3 py-1.5 border-b border-gray-100">
                      <button className="p-1.5 hover:bg-gray-100 rounded-md text-gray-500 transition" title="画像添付">{Icons.image}</button>
                      <button className="p-1.5 hover:bg-gray-100 rounded-md text-gray-500 transition" title="動画添付">{Icons.video}</button>
                      <button className="p-1.5 hover:bg-gray-100 rounded-md text-gray-500 transition" title="定型文">{Icons.template}</button>
                      <button className="p-1.5 hover:bg-gray-100 rounded-md text-gray-500 transition" title="絵文字">{Icons.emoji}</button>
                    </div>
                    {/* メッセージ入力 */}
                    <div className="flex items-center gap-2 px-3 py-2.5">
                      <input
                        type="text"
                        value={chatInput}
                        onChange={(e) => setChatInput(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) sendMessage(); }}
                        placeholder="メッセージを入力..."
                        className="flex-1 border border-gray-200 rounded-full px-4 py-2 text-sm bg-gray-50 focus:bg-white focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400 transition"
                      />
                      <button
                        onClick={sendMessage}
                        disabled={sending || !chatInput.trim()}
                        className="w-9 h-9 bg-[#06C755] hover:bg-[#05a648] disabled:opacity-40 rounded-full flex items-center justify-center transition flex-shrink-0"
                      >
                        {sending ? (
                          <svg className="w-4 h-4 text-white animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                        ) : Icons.send}
                      </button>
                    </div>
                  </div>
                </div>

                {/* --- 右サイドパネル: プロフィール・メモ・ラベル --- */}
                <div className="w-72 bg-white border-l border-gray-200 flex flex-col flex-shrink-0 overflow-y-auto">
                  {/* プロフィール */}
                  <div className="px-4 py-5 text-center border-b border-gray-200">
                    {selectedUser.picture_url ? (
                      <img src={selectedUser.picture_url} alt="" className="w-20 h-20 rounded-full object-cover mx-auto mb-3" />
                    ) : (
                      <div className="w-20 h-20 rounded-full bg-gray-200 flex items-center justify-center mx-auto mb-3 text-gray-400">
                        <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                      </div>
                    )}
                    <div className="flex items-center justify-center gap-1.5">
                      <h3 className="text-base font-bold text-gray-800">{selectedUser.display_name ?? "名前なし"}</h3>
                      <button className="text-gray-400 hover:text-blue-500 transition">{Icons.edit}</button>
                    </div>
                    <p className="text-xs text-gray-400 mt-1 font-mono">{selectedUser.line_user_id.slice(0, 16)}...</p>
                  </div>

                  {/* アクションボタン */}
                  <div className="flex gap-2 px-4 py-3 border-b border-gray-200">
                    <button className="flex-1 py-1.5 bg-red-500 hover:bg-red-600 text-white text-xs font-medium rounded-md transition">新規</button>
                    <button className="flex-1 py-1.5 bg-blue-500 hover:bg-blue-600 text-white text-xs font-medium rounded-md transition">友だち詳細</button>
                  </div>

                  {/* ステータス */}
                  <div className="px-4 py-3 border-b border-gray-200">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-gray-500">ステータス</span>
                      <StatusBadge status={selectedUser.status} />
                    </div>
                    <div className="flex items-center justify-between text-xs mt-2">
                      <span className="text-gray-500">友だち追加日</span>
                      <span className="text-gray-700">{fmtShort(selectedUser.followed_at)}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs mt-2">
                      <span className="text-gray-500">登録日</span>
                      <span className="text-gray-700">{fmtShort(selectedUser.created_at)}</span>
                    </div>
                  </div>

                  {/* ラベル */}
                  <div className="px-4 py-3 border-b border-gray-200">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-medium text-gray-500">ラベル</span>
                      <button className="text-[10px] text-blue-600 hover:text-blue-800">+ 追加</button>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {(selectedUser.labels && selectedUser.labels.length > 0) ? (
                        selectedUser.labels.map((label, i) => (
                          <span key={i} className="px-2 py-0.5 bg-blue-100 text-blue-700 text-[11px] rounded-full">{label}</span>
                        ))
                      ) : (
                        <span className="text-xs text-gray-400">ラベルなし</span>
                      )}
                    </div>
                  </div>

                  {/* メモ */}
                  <div className="px-4 py-3 border-b border-gray-200">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-medium text-gray-500">メモ</span>
                      <button className="text-[10px] text-blue-600 hover:text-blue-800">保存</button>
                    </div>
                    <textarea
                      value={memoText}
                      onChange={(e) => setMemoText(e.target.value)}
                      placeholder="メモを入力..."
                      rows={4}
                      className="w-full border border-gray-200 rounded-md px-2.5 py-2 text-xs resize-none focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
                    />
                  </div>

                  {/* テンプレート送信 */}
                  <div className="px-4 py-3">
                    <span className="text-xs font-medium text-gray-500 block mb-2">LINE テンプレートを送る</span>
                    <div className="flex gap-2">
                      <select className="flex-1 border border-gray-200 rounded-md px-2 py-1.5 text-xs bg-white focus:border-blue-400 focus:outline-none">
                        <option>テンプレートを選択</option>
                      </select>
                      <button className="px-3 py-1.5 bg-[#06C755] hover:bg-[#05a648] text-white text-xs font-medium rounded-md transition">送信</button>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              /* チャット未選択 */
              <div className="flex-1 flex items-center justify-center bg-gray-50">
                <div className="text-center text-gray-400">
                  <div className="w-16 h-16 rounded-full bg-gray-200 flex items-center justify-center mx-auto mb-3">
                    {Icons.chat}
                  </div>
                  <p className="text-sm">左のリストからユーザーを選択してください</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ============================================================ */}
        {/* アカウント詳細: 読者一覧 */}
        {/* ============================================================ */}
        {mainView === "account-detail" && accountSubView === "followers" && (
          <>
            <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-3">
                <h1 className="text-base font-bold text-gray-800">LINE 友だち</h1>
                <span className="text-sm text-gray-400">{filteredFollowers.length} 件</span>
                {selectedIds.size > 0 && (
                  <button
                    onClick={deleteSelected}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white text-xs font-medium rounded-md transition"
                  >
                    選択削除（{selectedIds.size}件）
                  </button>
                )}
              </div>
              <div className="relative w-64">
                <span className="absolute left-3 top-1/2 -translate-y-1/2">{Icons.search}</span>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="読者を検索..."
                  className="w-full pl-9 pr-4 py-1.5 border border-gray-200 rounded-lg text-sm bg-white focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
                />
              </div>
            </header>
            <main className="flex-1 overflow-y-auto p-6">
              <div className="bg-white rounded-lg border border-gray-200 overflow-hidden max-w-5xl">
                {filteredFollowers.length === 0 ? (
                  <div className="p-16 text-center text-gray-400">読者がいません</div>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 text-gray-500 text-left bg-gray-50">
                        <th className="px-3 py-3 w-10">
                          <input
                            type="checkbox"
                            checked={filteredFollowers.length > 0 && filteredFollowers.every((f) => selectedIds.has(f.id))}
                            onChange={() => toggleSelectAll(filteredFollowers.map((f) => f.id))}
                            className="accent-blue-600 w-4 h-4 cursor-pointer"
                          />
                        </th>
                        <th className="px-5 py-3 font-medium">ユーザー</th>
                        <th className="px-5 py-3 font-medium">ステータス</th>
                        <th className="px-5 py-3 font-medium">友だち追加日</th>
                        <th className="px-5 py-3 font-medium">操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredFollowers.map((f) => (
                        <tr key={f.id} className={`border-b border-gray-100 hover:bg-gray-50 transition ${selectedIds.has(f.id) ? "bg-blue-50/50" : ""}`}>
                          <td className="px-3 py-3">
                            <input
                              type="checkbox"
                              checked={selectedIds.has(f.id)}
                              onChange={() => toggleSelect(f.id)}
                              className="accent-blue-600 w-4 h-4 cursor-pointer"
                            />
                          </td>
                          <td className="px-5 py-3">
                            <div className="flex items-center gap-3">
                              {f.picture_url ? (
                                <img src={f.picture_url} alt="" className="w-9 h-9 rounded-full object-cover" />
                              ) : (
                                <div className="w-9 h-9 rounded-full bg-gray-200 flex items-center justify-center text-gray-400">{Icons.user}</div>
                              )}
                              <div>
                                <div className="font-medium text-gray-800">{f.display_name ?? "名前なし"}</div>
                                <div className="text-xs text-gray-400 font-mono">{f.line_user_id.slice(0, 12)}...</div>
                              </div>
                            </div>
                          </td>
                          <td className="px-5 py-3"><StatusBadge status={f.status} /></td>
                          <td className="px-5 py-3 text-gray-500">{fmtShort(f.followed_at)}</td>
                          <td className="px-5 py-3">
                            <button
                              onClick={() => { setAccountSubView("chat"); openChat(f); }}
                              className="px-3 py-1 bg-[#06C755] hover:bg-[#05a648] text-white text-xs font-medium rounded-md transition"
                            >
                              チャット
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </main>
          </>
        )}

        {/* ============================================================ */}
        {/* アカウント詳細: ステップ配信 */}
        {/* ============================================================ */}
        {mainView === "account-detail" && accountSubView === "step" && (
          <>
            <header className="bg-white border-b border-gray-200 px-6 py-3 flex-shrink-0">
              <h1 className="text-base font-bold text-gray-800">ステップ配信</h1>
            </header>
            <main className="flex-1 flex items-center justify-center">
              <div className="text-center text-gray-400">
                <p className="text-lg mb-1">ステップ配信</p>
                <p className="text-sm">この機能は準備中です</p>
              </div>
            </main>
          </>
        )}

        {/* ============================================================ */}
        {/* アカウント詳細: 予約配信 */}
        {/* ============================================================ */}
        {mainView === "account-detail" && accountSubView === "schedule" && (
          <>
            <header className="bg-white border-b border-gray-200 px-6 py-3 flex-shrink-0">
              <h1 className="text-base font-bold text-gray-800">予約配信</h1>
            </header>
            <main className="flex-1 flex items-center justify-center">
              <div className="text-center text-gray-400">
                <p className="text-lg mb-1">予約配信</p>
                <p className="text-sm">この機能は準備中です</p>
              </div>
            </main>
          </>
        )}

        {/* ============================================================ */}
        {/* アカウント詳細: 友だち追加ページ */}
        {/* ============================================================ */}
        {mainView === "account-detail" && accountSubView === "friend-page" && (
          <>
            <header className="bg-white border-b border-gray-200 px-6 py-3 flex-shrink-0">
              <h1 className="text-base font-bold text-gray-800">友だち追加ページ</h1>
            </header>
            <main className="flex-1 overflow-y-auto p-6">
              {selectedAccount?.basic_id ? (
                <div className="bg-white rounded-lg border border-gray-200 p-6 max-w-md">
                  <div className="text-center">
                    <div className="bg-white rounded-xl p-3 inline-block border border-gray-200 mb-4">
                      <img
                        src={`https://qr-official.line.me/gs/M_${selectedAccount.basic_id}_GW.png`}
                        alt="QRコード"
                        className="w-48 h-48"
                      />
                    </div>
                    <p className="text-sm font-medium text-gray-800 mb-1">{selectedAccount.account_name}</p>
                    <p className="text-xs text-gray-400 mb-3">@{selectedAccount.basic_id}</p>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <input
                          readOnly
                          value={`https://line.me/R/ti/p/@${selectedAccount.basic_id}`}
                          className="flex-1 border border-gray-200 rounded-md px-3 py-1.5 text-xs font-mono text-blue-600 bg-gray-50"
                        />
                        <button
                          onClick={() => navigator.clipboard.writeText(`https://line.me/R/ti/p/@${selectedAccount.basic_id}`)}
                          className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs rounded-md transition"
                        >
                          コピー
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-white rounded-lg border border-gray-200 p-10 text-center text-gray-400 max-w-md">
                  <p>Basic IDが未設定です。アカウント設定から設定してください。</p>
                </div>
              )}
            </main>
          </>
        )}

        {/* ============================================================ */}
        {/* アカウント詳細: ラベル管理 */}
        {/* ============================================================ */}
        {mainView === "account-detail" && accountSubView === "labels" && (
          <>
            <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between flex-shrink-0">
              <h1 className="text-base font-bold text-gray-800">ラベル管理</h1>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => { setNewLabelName(""); setShowAddLabel(true); }}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-md transition"
                >
                  {Icons.plus}
                  追加
                </button>
                <button className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-medium rounded-md transition">
                  {Icons.folder}
                  グループ管理
                </button>
                <button className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-500 hover:bg-orange-600 text-white text-xs font-medium rounded-md transition">
                  {Icons.sort}
                  並び替え
                </button>
              </div>
            </header>
            <main className="flex-1 overflow-y-auto p-6">
              {/* ラベル追加モーダル */}
              {showAddLabel && (
                <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
                  <div className="bg-white rounded-xl shadow-xl w-full max-w-sm mx-4">
                    <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
                      <h3 className="font-bold text-gray-800">ラベルを追加</h3>
                      <button onClick={() => setShowAddLabel(false)} className="text-gray-400 hover:text-gray-600">{Icons.close}</button>
                    </div>
                    <div className="p-5">
                      <label className="text-xs text-gray-500 block mb-1.5 font-medium">ラベル名</label>
                      <input
                        type="text"
                        value={newLabelName}
                        onChange={(e) => setNewLabelName(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) createLabel(); }}
                        placeholder="例: VIP顧客、要フォロー、成約済み"
                        autoFocus
                        className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
                      />
                    </div>
                    <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-200">
                      <button onClick={() => setShowAddLabel(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition">キャンセル</button>
                      <button
                        onClick={createLabel}
                        disabled={!newLabelName.trim()}
                        className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition"
                      >
                        作成
                      </button>
                    </div>
                  </div>
                </div>
              )}

              <div className="max-w-5xl">
                {labels.length === 0 ? (
                  <div className="bg-white rounded-lg border border-gray-200 p-16 text-center text-gray-400">
                    <p className="text-lg mb-2">ラベルがありません</p>
                    <p className="text-sm">「+ 追加」ボタンからラベルを作成してください</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {labels.map((label) => {
                      const isExpanded = expandedLabelId === label.id;
                      const assignedFollowers = followers.filter((f) =>
                        label.assigned_users.includes(f.line_user_id)
                      ).sort((a, b) => new Date(b.followed_at).getTime() - new Date(a.followed_at).getTime());

                      return (
                        <div key={label.id} className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                          {/* ラベル行 */}
                          <div className="flex items-center justify-between px-5 py-3.5">
                            <div className="flex items-center gap-3">
                              <span
                                className="w-4 h-4 rounded-full flex-shrink-0"
                                style={{ backgroundColor: label.color }}
                              />
                              <span className="text-sm font-medium text-gray-800">{label.name}</span>
                              <span className="text-xs text-gray-400">{label.assigned_users.length} 人</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => setExpandedLabelId(isExpanded ? null : label.id)}
                                className={`px-3 py-1.5 text-xs font-medium rounded-md transition ${
                                  isExpanded
                                    ? "bg-blue-100 text-blue-700 hover:bg-blue-200"
                                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                                }`}
                              >
                                付与者 {label.assigned_users.length > 0 && `(${label.assigned_users.length})`}
                                <span className="ml-1">{isExpanded ? "▲" : "▼"}</span>
                              </button>
                              <button
                                onClick={() => deleteLabel(label.id)}
                                className="px-2 py-1.5 text-xs text-red-400 hover:text-red-600 hover:bg-red-50 rounded-md transition"
                              >
                                削除
                              </button>
                            </div>
                          </div>

                          {/* 付与者リスト（展開時） */}
                          {isExpanded && (
                            <div className="border-t border-gray-200">
                              {/* 付与ボタン付きフォロワー一覧 */}
                              <div className="px-5 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                                <span className="text-xs font-medium text-gray-500">
                                  付与済み: {assignedFollowers.length} 人
                                </span>
                                <span className="text-xs text-gray-400">
                                  最新の付与者から表示
                                </span>
                              </div>

                              {assignedFollowers.length === 0 ? (
                                <div className="px-5 py-6 text-center text-sm text-gray-400">
                                  このラベルが付与されたユーザーはいません
                                </div>
                              ) : (
                                <div className="divide-y divide-gray-100">
                                  {assignedFollowers.map((f) => (
                                    <div key={f.id} className="flex items-center justify-between px-5 py-2.5 hover:bg-gray-50">
                                      <div className="flex items-center gap-3">
                                        {f.picture_url ? (
                                          <img src={f.picture_url} alt="" className="w-8 h-8 rounded-full object-cover" />
                                        ) : (
                                          <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-gray-400">
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                                          </div>
                                        )}
                                        <div>
                                          <span className="text-sm text-gray-800">{f.display_name ?? "名前なし"}</span>
                                          <span className="text-xs text-gray-400 ml-2">{fmtShort(f.followed_at)}</span>
                                        </div>
                                      </div>
                                      <button
                                        onClick={() => toggleLabelUser(label.id, f.line_user_id)}
                                        className="text-xs text-red-400 hover:text-red-600 hover:bg-red-50 px-2 py-1 rounded transition"
                                      >
                                        解除
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              )}

                              {/* 未付与のフォロワーを追加するセクション */}
                              {followers.filter((f) => !label.assigned_users.includes(f.line_user_id)).length > 0 && (
                                <>
                                  <div className="px-5 py-2.5 bg-gray-50 border-t border-gray-200">
                                    <span className="text-xs font-medium text-gray-500">未付与のユーザー</span>
                                  </div>
                                  <div className="divide-y divide-gray-100 max-h-60 overflow-y-auto">
                                    {followers
                                      .filter((f) => !label.assigned_users.includes(f.line_user_id))
                                      .map((f) => (
                                        <div key={f.id} className="flex items-center justify-between px-5 py-2.5 hover:bg-gray-50">
                                          <div className="flex items-center gap-3">
                                            {f.picture_url ? (
                                              <img src={f.picture_url} alt="" className="w-8 h-8 rounded-full object-cover" />
                                            ) : (
                                              <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-gray-400">
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                                              </div>
                                            )}
                                            <span className="text-sm text-gray-600">{f.display_name ?? "名前なし"}</span>
                                          </div>
                                          <button
                                            onClick={() => toggleLabelUser(label.id, f.line_user_id)}
                                            className="text-xs text-blue-600 hover:text-blue-800 hover:bg-blue-50 px-2 py-1 rounded transition"
                                          >
                                            + 付与
                                          </button>
                                        </div>
                                      ))}
                                  </div>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </main>
          </>
        )}

        {/* ============================================================ */}
        {/* アカウント管理（設定） */}
        {/* ============================================================ */}
        {mainView === "settings" && (
          <>
            <header className="bg-white border-b border-gray-200 px-6 py-3 flex-shrink-0">
              <h1 className="text-base font-bold text-gray-800">アカウント管理</h1>
            </header>
            <main className="flex-1 overflow-y-auto p-6">
              <div className="max-w-4xl space-y-6">
                {/* 登録フォーム */}
                <div className="bg-white rounded-lg border border-gray-200 p-6">
                  <h3 className="text-sm font-bold text-gray-800 mb-4">
                    {editingId ? "アカウント編集" : "新規アカウント登録"}
                  </h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs text-gray-500 block mb-1 font-medium">アカウント名</label>
                      <input type="text" value={form.account_name} onChange={(e) => setForm({ ...form, account_name: e.target.value })} placeholder="ハピネスサロン音声相談LINE" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400" />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 block mb-1 font-medium">グループ名</label>
                      <input type="text" value={form.group_name} onChange={(e) => setForm({ ...form, group_name: e.target.value })} placeholder="ハピネスサロン" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400" />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 block mb-1 font-medium">チャネルID <span className="text-red-500">*</span></label>
                      <input type="text" value={form.channel_id} onChange={(e) => setForm({ ...form, channel_id: e.target.value })} placeholder="2009751642" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400" />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 block mb-1 font-medium">Basic ID</label>
                      <input type="text" value={form.basic_id} onChange={(e) => setForm({ ...form, basic_id: e.target.value })} placeholder="576ergby (@除く)" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400" />
                    </div>
                    <div className="col-span-2">
                      <label className="text-xs text-gray-500 block mb-1 font-medium">チャネルシークレット <span className="text-red-500">*</span></label>
                      <input type="password" value={form.channel_secret} onChange={(e) => setForm({ ...form, channel_secret: e.target.value })} placeholder="LINE Developersからコピー" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400" />
                    </div>
                    <div className="col-span-2">
                      <label className="text-xs text-gray-500 block mb-1 font-medium">チャネルアクセストークン <span className="text-red-500">*</span></label>
                      <input type="password" value={form.channel_access_token} onChange={(e) => setForm({ ...form, channel_access_token: e.target.value })} placeholder="発行済みトークン" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400" />
                    </div>
                  </div>
                  {saveMsg && (
                    <div className={`mt-4 px-4 py-2.5 rounded-lg text-sm ${saveMsg.ok ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-600 border border-red-200"}`}>
                      {saveMsg.text}
                    </div>
                  )}
                  <div className="flex gap-2 mt-5">
                    <button onClick={saveAccount} disabled={saving} className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition">
                      {saving ? "保存中..." : editingId ? "更新" : "登録"}
                    </button>
                    {editingId && (
                      <button onClick={resetForm} className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg text-sm transition">キャンセル</button>
                    )}
                  </div>
                </div>

                {/* 登録済みアカウント */}
                {accounts.length > 0 && (
                  <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                    <div className="px-5 py-3 bg-gray-50 border-b border-gray-200">
                      <h3 className="text-sm font-bold text-gray-700">登録済みアカウント</h3>
                    </div>
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-200 text-gray-500 text-left bg-gray-50/50">
                          <th className="px-5 py-3 font-medium">アカウント名</th>
                          <th className="px-5 py-3 font-medium">グループ</th>
                          <th className="px-5 py-3 font-medium">チャネルID</th>
                          <th className="px-5 py-3 font-medium">Basic ID</th>
                          <th className="px-5 py-3 font-medium">状態</th>
                          <th className="px-5 py-3 font-medium">操作</th>
                        </tr>
                      </thead>
                      <tbody>
                        {accounts.map((acc) => (
                          <tr key={acc.id} className="border-b border-gray-100 hover:bg-gray-50 transition">
                            <td className="px-5 py-3">
                              <div className="flex items-center gap-2">
                                <div className="w-7 h-7 rounded-full bg-[#06C755] flex items-center justify-center flex-shrink-0">
                                  <span className="text-white text-xs font-bold">L</span>
                                </div>
                                <span className="font-medium text-gray-800">{acc.account_name ?? "未設定"}</span>
                              </div>
                            </td>
                            <td className="px-5 py-3 text-gray-500">{acc.group_name ?? "—"}</td>
                            <td className="px-5 py-3 font-mono text-gray-500">{acc.channel_id}</td>
                            <td className="px-5 py-3 text-gray-500">{acc.basic_id ? `@${acc.basic_id}` : "未設定"}</td>
                            <td className="px-5 py-3">
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${acc.is_active ? "bg-green-100 text-green-600" : "bg-gray-100 text-gray-400"}`}>
                                {acc.is_active ? "有効" : "無効"}
                              </span>
                            </td>
                            <td className="px-5 py-3">
                              <button onClick={() => startEdit(acc)} className="text-blue-600 hover:text-blue-800 text-xs font-medium">編集</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </main>
          </>
        )}
      </div>
    </div>
  );
}

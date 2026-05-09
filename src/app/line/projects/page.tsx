"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";

interface Scenario {
  id: string;
  project_id: string;
  code: string | null;
  name: string;
  distribute_enabled: boolean | null;
  distribute_count: number | null;
  reserve_count: number | null;
  ban_sync_enabled: boolean | null;
  sort_order: number | null;
}

interface ScenarioForm {
  id: string;
  code: string;
  name: string;
  distribute_enabled: boolean;
  distribute_count: number;
  reserve_count: number;
  ban_sync_enabled: boolean;
  sort_order: number;
}

// 段階8-2-C: scenario 削除モーダルで表示する依存件数。
// /api/line/scenarios/dependents の GET レスポンス形式と一致。
interface ScenarioDependents {
  followers: number;
  accounts: number;
  inflow_routes: number;
  step_sequences: number;
  rich_menus: number;
  labels: number;
  action_rules: number;
  others: number;
}

interface Project {
  id: string;
  name: string;
  description: string | null;
  color: string;
  sort_order: number;
  code: string | null;
  scenarios?: Scenario[]; // 段階5 案B:line_scenarios 利用可能時のみ含まれる
}

// 段階8-2-F:distribute_* / ban_sync_enabled は段階5-step05-finalize で line_projects から DROP 済み。
// シナリオ単位(line_scenarios)で管理されるため、ProjectForm からも削除。
interface ProjectForm {
  name: string;
  description: string;
  color: string;
  sort_order: number;
  code: string;
}

interface ProjectAccountSummary {
  main: number;
  distribute: number;
  standby: number;
  other: number;
}

const DEFAULT_COLORS = [
  "#06C755", "#3B82F6", "#EF4444", "#F59E0B", "#8B5CF6", "#EC4899",
  "#14B8A6", "#F97316", "#6366F1", "#84CC16",
];

const emptyProjectForm: ProjectForm = {
  name: "",
  description: "",
  color: "#06C755",
  sort_order: 0,
  code: "",
};

const SCENARIO_CODE_PATTERN = /^[a-zA-Z0-9_-]+$/;
const PROJECT_CODE_PATTERN = /^[a-zA-Z0-9_-]+$/;

// 段階8-2-F:案件編集モーダルから新規シナリオを追加するときに scenariosForm に積む空行。
// id を負の数値文字列(__new_<n>__)で識別し、saveProject 時に id 未付与の行を POST に振り分ける。
function makeNewScenarioFormRow(nextSortOrder: number): ScenarioForm {
  return {
    id: `__new_${Date.now()}_${Math.random().toString(36).slice(2, 6)}__`,
    code: "",
    name: "",
    distribute_enabled: false,
    distribute_count: 1,
    reserve_count: 0,
    ban_sync_enabled: false,
    sort_order: nextSortOrder,
  };
}

function isNewScenarioRow(s: { id: string }) {
  return s.id.startsWith("__new_");
}

export default function LineProjects() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [userName, setUserName] = useState("");
  const [projectUnread, setProjectUnread] = useState<Record<string, { unread_count: number; unread_users: number }>>({});

  // 案件管理モーダル
  const [showProjectModal, setShowProjectModal] = useState(false);
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [projectForm, setProjectForm] = useState<ProjectForm>(emptyProjectForm);
  const [projectSaving, setProjectSaving] = useState(false);
  const [projectMsg, setProjectMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // 管理モード（編集/削除ボタンの表示）
  const [manageMode, setManageMode] = useState(false);

  // 編集中の案件のアカウント集計
  const [accountSummary, setAccountSummary] = useState<ProjectAccountSummary | null>(null);

  // 段階5 案B:編集中の案件に紐付く scenarios のフォーム値(scenarios が無い環境では空配列)
  const [scenariosForm, setScenariosForm] = useState<ScenarioForm[]>([]);

  // 段階8-2-C: scenario 削除モーダル
  const [deleteScenarioTarget, setDeleteScenarioTarget] = useState<ScenarioForm | null>(null);
  const [deleteScenarioDependents, setDeleteScenarioDependents] = useState<ScenarioDependents | null>(null);
  const [deleteScenarioInputName, setDeleteScenarioInputName] = useState("");
  const [deleteScenarioBusy, setDeleteScenarioBusy] = useState(false);
  const [deleteScenarioError, setDeleteScenarioError] = useState<string | null>(null);

  // スマホ用ハンバーガーメニュー
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // メニュー外クリックで閉じる
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMobileMenuOpen(false);
      }
    };
    if (mobileMenuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [mobileMenuOpen]);

  const fetchProjects = useCallback(async () => {
    try {
      const res = await fetch("/api/line/projects");
      if (res.ok) setProjects(await res.json());
    } catch { /* */ }
  }, []);

  useEffect(() => {
    const init = async () => {
      const supabase = createClient();

      const { data: { user } } = await supabase.auth.getUser();
      setUserName(user?.email ?? "ゲスト");

      // 権限フィルタ付きで閲覧可能案件を取得
      const url = user?.id
        ? `/api/line/user-projects?user_id=${user.id}`
        : `/api/line/user-projects`;
      const res = await fetch(url);
      if (res.ok) {
        setProjects(await res.json());
      }

      // 未読件数を取得
      const meta = (user?.user_metadata ?? {}) as Record<string, unknown>;
      const isCloser = !!(meta.is_closer) && !(meta.is_admin);
      const unreadUrl = isCloser && user?.id
        ? `/api/line/project-unread?closer_id=${user.id}`
        : "/api/line/project-unread";
      try {
        const unreadRes = await fetch(unreadUrl);
        if (unreadRes.ok) setProjectUnread(await unreadRes.json());
      } catch { /* */ }

      setLoading(false);
    };
    init();
  }, [router]);

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/line/login");
  };

  const selectProject = (project: Project) => {
    sessionStorage.setItem("line_project", JSON.stringify(project));
    router.push("/line/dashboard");
  };

  const openCreateProject = () => {
    setEditingProjectId(null);
    setProjectForm({
      ...emptyProjectForm,
      sort_order: projects.length > 0 ? Math.max(...projects.map((p) => p.sort_order)) + 10 : 10,
    });
    setProjectMsg(null);
    setScenariosForm([]); // 新規 project は scenarios 無しで開始
    setShowProjectModal(true);
  };

  const openEditProject = async (p: Project) => {
    setEditingProjectId(p.id);
    setProjectForm({
      name: p.name,
      description: p.description ?? "",
      color: p.color,
      sort_order: p.sort_order,
      code: p.code ?? "",
    });
    // 段階5 案B:scenarios が API から返ってくれば編集フォームに展開、なければ空配列
    setScenariosForm(
      (p.scenarios ?? []).map((s) => ({
        id: s.id,
        code: s.code ?? "",
        name: s.name,
        distribute_enabled: !!s.distribute_enabled,
        distribute_count: s.distribute_count ?? 1,
        reserve_count: s.reserve_count ?? 0,
        ban_sync_enabled: !!s.ban_sync_enabled,
        sort_order: s.sort_order ?? 0,
      })),
    );
    setProjectMsg(null);
    setAccountSummary(null);
    setShowProjectModal(true);
    // 登録済みアカウント数を集計
    try {
      const res = await fetch(`/api/line/accounts?project_id=${encodeURIComponent(p.id)}`);
      if (res.ok) {
        const rows = (await res.json()) as Array<{ role?: string | null }>;
        const summary: ProjectAccountSummary = { main: 0, distribute: 0, standby: 0, other: 0 };
        for (const r of rows) {
          if (r.role === "main") summary.main++;
          else if (r.role === "distribute") summary.distribute++;
          else if (r.role === "standby") summary.standby++;
          else summary.other++;
        }
        setAccountSummary(summary);
      }
    } catch { /* noop */ }
  };

  const saveProject = async () => {
    if (!projectForm.name.trim()) {
      setProjectMsg({ ok: false, text: "案件名を入力してください" });
      return;
    }
    // 段階8-2-F:案件コードを必須化(中継URL /line/r/{案件コード}/{流入コード} の必須要素)
    const trimmedProjectCode = projectForm.code.trim();
    if (!trimmedProjectCode) {
      setProjectMsg({ ok: false, text: "案件コードを入力してください" });
      return;
    }
    if (!PROJECT_CODE_PATTERN.test(trimmedProjectCode)) {
      setProjectMsg({ ok: false, text: "案件コードは半角英数・ハイフン・アンダースコアのみ使用できます" });
      return;
    }
    // 段階8-2-F:新規シナリオ行のバリデーション(編集時のみ。新規 project 作成時は scenariosForm 空)
    const newScenarioRows = scenariosForm.filter((s) => isNewScenarioRow(s));
    for (const sc of newScenarioRows) {
      if (!sc.code.trim()) {
        setProjectMsg({ ok: false, text: "新規シナリオの code を入力してください" });
        return;
      }
      if (!SCENARIO_CODE_PATTERN.test(sc.code.trim())) {
        setProjectMsg({ ok: false, text: `シナリオコード「${sc.code}」は半角英数・ハイフン・アンダースコアのみ使用できます` });
        return;
      }
      if (!sc.name.trim()) {
        setProjectMsg({ ok: false, text: "新規シナリオの name を入力してください" });
        return;
      }
    }
    setProjectSaving(true);
    setProjectMsg(null);
    try {
      let projectIdForScenarioInsert: string | null = editingProjectId;
      if (editingProjectId) {
        // 段階5 案B:既存 scenario 行のみ scenarios 配列で送信(新規行は別途 POST に分離)
        const existingScenarios = scenariosForm.filter((s) => !isNewScenarioRow(s));
        const putBody: Record<string, unknown> = { id: editingProjectId, ...projectForm };
        if (existingScenarios.length > 0) {
          putBody.scenarios = existingScenarios.map((s) => ({
            id: s.id,
            code: s.code,
            name: s.name,
            distribute_enabled: s.distribute_enabled,
            distribute_count: s.distribute_count,
            reserve_count: s.reserve_count,
            ban_sync_enabled: s.ban_sync_enabled,
            sort_order: s.sort_order,
          }));
        }
        const res = await fetch("/api/line/projects", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(putBody),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setProjectMsg({ ok: false, text: data.error ?? "更新失敗" });
          return;
        }
      } else {
        const res = await fetch("/api/line/projects", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(projectForm),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setProjectMsg({ ok: false, text: data.error ?? "作成失敗" });
          return;
        }
        const created = (await res.json().catch(() => ({}))) as { project?: { id?: string } };
        projectIdForScenarioInsert = created.project?.id ?? null;
      }

      // 段階8-2-F:新規シナリオ行を順次 POST(エラーは即時表示、成功した分は再 fetch で反映)
      if (projectIdForScenarioInsert && newScenarioRows.length > 0) {
        for (const sc of newScenarioRows) {
          const r = await fetch("/api/line/scenarios", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              project_id: projectIdForScenarioInsert,
              code: sc.code.trim(),
              name: sc.name.trim(),
              distribute_enabled: sc.distribute_enabled,
              distribute_count: sc.distribute_count,
              reserve_count: sc.reserve_count,
              ban_sync_enabled: sc.ban_sync_enabled,
              sort_order: sc.sort_order,
            }),
          });
          if (!r.ok) {
            const data = await r.json().catch(() => ({}));
            setProjectMsg({ ok: false, text: `シナリオ作成失敗(${sc.code}): ${data.error ?? r.status}` });
            await fetchProjects();
            return;
          }
        }
      }

      await fetchProjects();
      setShowProjectModal(false);
    } catch (e) {
      setProjectMsg({ ok: false, text: (e as Error).message });
    } finally {
      setProjectSaving(false);
    }
  };

  const deleteProject = async (p: Project) => {
    if (!confirm(`案件「${p.name}」を削除しますか？\n※紐付くユーザー権限も削除されます。LINEアカウント・フォロワー等は残ります。`)) return;
    const res = await fetch("/api/line/projects", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: p.id }),
    });
    if (res.ok) {
      fetchProjects();
    } else {
      const data = await res.json().catch(() => ({}));
      alert(`削除失敗: ${data.error ?? res.status}`);
    }
  };

  // 段階8-2-C: scenario 削除モーダルを開いて依存件数を取得
  const openDeleteScenarioModal = async (sc: ScenarioForm) => {
    setDeleteScenarioTarget(sc);
    setDeleteScenarioInputName("");
    setDeleteScenarioError(null);
    setDeleteScenarioDependents(null);
    try {
      const res = await fetch(`/api/line/scenarios/dependents?id=${encodeURIComponent(sc.id)}`);
      if (res.ok) {
        setDeleteScenarioDependents(await res.json());
      } else {
        const data = await res.json().catch(() => ({}));
        setDeleteScenarioError(`依存件数取得失敗: ${data.error ?? res.status}`);
      }
    } catch (e) {
      setDeleteScenarioError(`依存件数取得エラー: ${(e as Error).message}`);
    }
  };

  const closeDeleteScenarioModal = () => {
    setDeleteScenarioTarget(null);
    setDeleteScenarioDependents(null);
    setDeleteScenarioInputName("");
    setDeleteScenarioError(null);
  };

  const confirmDeleteScenario = async () => {
    if (!deleteScenarioTarget) return;
    if (deleteScenarioInputName !== deleteScenarioTarget.name) return;
    setDeleteScenarioBusy(true);
    setDeleteScenarioError(null);
    try {
      const res = await fetch("/api/line/scenarios", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: deleteScenarioTarget.id }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setDeleteScenarioError(`削除失敗: ${data.error ?? res.status}`);
        return;
      }
      // ローカル scenariosForm から該当 scenario を除去(編集中モーダルの整合)
      setScenariosForm((prev) => prev.filter((s) => s.id !== deleteScenarioTarget.id));
      // projects 全体を再取得(scenarios 配列の最新化)
      await fetchProjects();
      closeDeleteScenarioModal();
      alert("削除完了");
    } catch (e) {
      setDeleteScenarioError(`削除エラー: ${(e as Error).message}`);
    } finally {
      setDeleteScenarioBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#1e2744] flex items-center justify-center">
        <div className="text-white/50 text-sm">読み込み中...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#1e2744]">
      <header className="border-b border-white/10 px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between">
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-[#06C755] flex items-center justify-center flex-shrink-0">
            <svg className="w-4 h-4 sm:w-5 sm:h-5 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63h2.386c.346 0 .627.285.627.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.06-.023.136-.033.194-.033.195 0 .375.104.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63.346 0 .628.285.628.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.282.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314" /></svg>
          </div>
          <div>
            <h1 className="text-sm sm:text-lg font-bold text-white">LINE ハーネス</h1>
            <p className="text-[10px] sm:text-xs text-white/40 hidden sm:block">案件を選択してください</p>
          </div>
        </div>

        {/* PC: 通常ボタン表示 */}
        <div className="hidden md:flex items-center gap-2">
          <button
            onClick={openCreateProject}
            className="px-3 py-1.5 text-xs bg-[#06C755] hover:bg-[#05a648] text-white rounded-md transition font-medium"
          >
            + 新規案件
          </button>
          <button
            onClick={() => setManageMode((m) => !m)}
            className={`px-3 py-1.5 text-xs rounded-md transition border ${
              manageMode
                ? "bg-white/15 text-white border-white/30"
                : "text-white/70 hover:text-white hover:bg-white/10 border-white/10"
            }`}
          >
            {manageMode ? "管理モード終了" : "管理モード"}
          </button>
          <button
            onClick={() => router.push("/line/users")}
            className="px-3 py-1.5 text-xs text-white/80 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 rounded-md transition"
          >
            ユーザー管理
          </button>
          <span className="text-xs text-white/50 ml-2">{userName}</span>
          <button
            onClick={handleLogout}
            className="px-3 py-1.5 text-xs text-white/60 hover:text-white hover:bg-white/10 rounded-md transition"
          >
            ログアウト
          </button>
        </div>

        {/* スマホ: ハンバーガーメニュー */}
        <div className="md:hidden relative" ref={menuRef}>
          <button
            onClick={() => setMobileMenuOpen((v) => !v)}
            className="w-9 h-9 flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 rounded-lg transition"
            aria-label="メニュー"
          >
            {mobileMenuOpen ? (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            )}
          </button>
          {mobileMenuOpen && (
            <div className="absolute right-0 top-full mt-2 w-52 bg-[#2a3558] border border-white/15 rounded-xl shadow-xl shadow-black/30 z-50 overflow-hidden">
              <div className="px-4 py-2.5 border-b border-white/10">
                <p className="text-xs text-white/50 truncate">{userName}</p>
              </div>
              <div className="py-1">
                <button
                  onClick={() => { openCreateProject(); setMobileMenuOpen(false); }}
                  className="w-full text-left px-4 py-2.5 text-sm text-[#06C755] hover:bg-white/5 transition flex items-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                  新規案件
                </button>
                <button
                  onClick={() => { setManageMode((m) => !m); setMobileMenuOpen(false); }}
                  className="w-full text-left px-4 py-2.5 text-sm text-white/80 hover:bg-white/5 transition flex items-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                  {manageMode ? "管理モード終了" : "管理モード"}
                </button>
                <button
                  onClick={() => { router.push("/line/users"); setMobileMenuOpen(false); }}
                  className="w-full text-left px-4 py-2.5 text-sm text-white/80 hover:bg-white/5 transition flex items-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
                  ユーザー管理
                </button>
              </div>
              <div className="border-t border-white/10 py-1">
                <button
                  onClick={() => { handleLogout(); setMobileMenuOpen(false); }}
                  className="w-full text-left px-4 py-2.5 text-sm text-white/50 hover:bg-white/5 transition flex items-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
                  ログアウト
                </button>
              </div>
            </div>
          )}
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-3 sm:px-6 py-6 sm:py-10">
        <h2 className="text-white text-base sm:text-lg font-bold mb-4 sm:mb-6">案件一覧</h2>

        {projects.length === 0 ? (
          <div className="bg-white/5 rounded-xl border border-white/10 p-8 sm:p-12 text-center">
            <p className="text-white/50 text-sm mb-2">案件が登録されていません</p>
            <p className="text-white/30 text-xs">「+ 新規案件」から追加してください</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-3 lg:gap-4">
            {projects.map((project, i) => (
              <div
                key={project.id}
                className="group relative bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 rounded-lg sm:rounded-xl p-3 sm:p-4 transition-all hover:shadow-lg hover:shadow-black/20 hover:-translate-y-0.5"
              >
                <button
                  onClick={() => selectProject(project)}
                  className="text-left w-full"
                >
                  <div className="flex items-center gap-2 sm:gap-3">
                    <div
                      className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg flex-shrink-0 flex items-center justify-center text-base sm:text-lg"
                      style={{ backgroundColor: project.color || DEFAULT_COLORS[i % DEFAULT_COLORS.length] }}
                    >
                      <span className="text-white font-bold">
                        {project.name.charAt(0)}
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="text-white font-bold text-xs sm:text-sm truncate group-hover:text-[#06C755] transition-colors">
                        {project.name}
                      </h3>
                      {projectUnread[project.id] && projectUnread[project.id].unread_count > 0 && (
                        <p className="text-[10px] sm:text-xs text-[#06C755] mt-0.5">
                          新着: {projectUnread[project.id].unread_count}件（{projectUnread[project.id].unread_users}人）
                        </p>
                      )}
                    </div>
                  </div>
                </button>
                {manageMode && (
                  <div className="absolute top-1.5 right-1.5 sm:top-2 sm:right-2 flex gap-1">
                    <button
                      onClick={(e) => { e.stopPropagation(); openEditProject(project); }}
                      className="px-1.5 py-0.5 sm:px-2 sm:py-1 text-[9px] sm:text-[10px] bg-blue-500/80 hover:bg-blue-500 text-white rounded"
                    >
                      編集
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); deleteProject(project); }}
                      className="px-1.5 py-0.5 sm:px-2 sm:py-1 text-[9px] sm:text-[10px] bg-red-500/80 hover:bg-red-500 text-white rounded"
                    >
                      削除
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </main>

      {/* 案件作成/編集モーダル */}
      {showProjectModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
              <h3 className="font-bold text-gray-800">
                {editingProjectId ? "案件編集" : "新規案件作成"}
              </h3>
              <button
                onClick={() => setShowProjectModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="text-xs text-gray-500 block mb-1 font-medium">
                  案件名 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={projectForm.name}
                  onChange={(e) => setProjectForm({ ...projectForm, name: e.target.value })}
                  placeholder="例: MARI"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1 font-medium">
                  案件コード <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={projectForm.code}
                  onChange={(e) => setProjectForm({ ...projectForm, code: e.target.value.replace(/[^a-zA-Z0-9_-]/g, "") })}
                  placeholder="例: mari"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
                />
                <p className="text-[10px] text-gray-400 mt-1">
                  中継URL <code className="font-mono">/line/r/&#123;案件コード&#125;/&#123;流入コード&#125;</code> に使われます。半角英数・ハイフン・アンダースコアのみ。必須
                </p>
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1 font-medium">説明</label>
                <textarea
                  value={projectForm.description}
                  onChange={(e) => setProjectForm({ ...projectForm, description: e.target.value })}
                  rows={2}
                  placeholder="例: MARI案件"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-2 font-medium">カラー</label>
                <div className="flex flex-wrap gap-2 mb-2">
                  {DEFAULT_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setProjectForm({ ...projectForm, color: c })}
                      className={`w-8 h-8 rounded-full border-2 transition ${
                        projectForm.color === c ? "border-gray-800 scale-110" : "border-transparent"
                      }`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-gray-400">カスタム:</span>
                  <input
                    type="color"
                    value={projectForm.color}
                    onChange={(e) => setProjectForm({ ...projectForm, color: e.target.value })}
                    className="w-10 h-8 rounded cursor-pointer border border-gray-200"
                  />
                  <input
                    type="text"
                    value={projectForm.color}
                    onChange={(e) => setProjectForm({ ...projectForm, color: e.target.value })}
                    className="w-24 border border-gray-200 rounded px-2 py-1 text-xs font-mono"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-500 block mb-1 font-medium">並び順</label>
                <input
                  type="number"
                  value={projectForm.sort_order}
                  onChange={(e) => setProjectForm({ ...projectForm, sort_order: Number(e.target.value) })}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
                />
                <p className="text-[10px] text-gray-400 mt-1">小さい順に並びます（例: 10, 20, 30...）</p>
              </div>

              {/* ============================================================ */}
              {/* 段階8-2-F:project レベルの distribute_* / ban_sync_enabled UI を完全削除。 */}
              {/*   これらカラムは段階5-step05-finalize で line_projects から DROP 済み。 */}
              {/*   設定はシナリオ単位(下のシナリオ設定セクション)で行う。 */}
              {/* ============================================================ */}

              {/* ============================================================ */}
              {/* シナリオ設定セクション(段階8-2-F:新規シナリオ追加可能化) */}
              {/* 編集モード(editingProjectId あり)のみ表示。新規 project 作成時は */}
              {/* project 行が無い段階で scenarios を作れないため非表示。 */}
              {/* ============================================================ */}
              {editingProjectId && (
                <div className="pt-3 border-t border-gray-200">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-xs font-medium text-gray-700">シナリオ設定</div>
                    <button
                      type="button"
                      onClick={() => {
                        const nextSort =
                          scenariosForm.length === 0
                            ? 0
                            : Math.max(...scenariosForm.map((s) => s.sort_order)) + 1;
                        setScenariosForm([...scenariosForm, makeNewScenarioFormRow(nextSort)]);
                      }}
                      className="px-2 py-1 text-[11px] bg-[#06C755] hover:bg-[#05a648] text-white rounded font-medium"
                    >
                      ＋ 新規シナリオ追加
                    </button>
                  </div>
                  <p className="text-[10px] text-gray-500 mb-3">
                    案件に紐付くシナリオごとに分散/同期設定を編集できます。<br />
                    sort_order=0 は LIFF URL の主シナリオ用に予約されています。
                  </p>
                  {scenariosForm.length === 0 && (
                    <div className="bg-yellow-50 border border-yellow-200 rounded-md p-3 mb-3 text-[11px] text-yellow-800">
                      この案件にはシナリオが登録されていません。「＋ 新規シナリオ追加」から作成してください。
                    </div>
                  )}
                  <div className="space-y-3">
                    {scenariosForm.map((sc, idx) => (
                      <div key={sc.id} className="bg-gray-50 border border-gray-200 rounded-md p-3 space-y-2">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-gray-500 font-medium">
                            #{sc.sort_order}
                          </span>
                          <input
                            type="text"
                            value={sc.name}
                            onChange={(e) => {
                              const next = [...scenariosForm];
                              next[idx] = { ...next[idx], name: e.target.value };
                              setScenariosForm(next);
                            }}
                            className="flex-1 border border-gray-200 rounded px-2 py-1 text-xs bg-white"
                            placeholder="シナリオ名"
                          />
                          <input
                            type="text"
                            value={sc.code}
                            onChange={(e) => {
                              const next = [...scenariosForm];
                              next[idx] = { ...next[idx], code: e.target.value };
                              setScenariosForm(next);
                            }}
                            className="w-32 border border-gray-200 rounded px-2 py-1 text-xs bg-white font-mono"
                            placeholder="code"
                          />
                          {/* 段階8-2-C: scenario 削除ボタン(管理モード時のみ表示、project 削除と同パターン) */}
                          {manageMode && (
                            <button
                              type="button"
                              onClick={() => openDeleteScenarioModal(sc)}
                              className="px-2 py-1 text-[10px] bg-red-500/80 hover:bg-red-500 text-white rounded whitespace-nowrap"
                            >
                              削除
                            </button>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-[11px]">
                          <label className="flex items-center gap-1 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={sc.ban_sync_enabled}
                              onChange={(e) => {
                                const next = [...scenariosForm];
                                next[idx] = { ...next[idx], ban_sync_enabled: e.target.checked };
                                setScenariosForm(next);
                              }}
                              className="w-3 h-3"
                            />
                            <span className="text-gray-700">BAN対策同期</span>
                          </label>
                          <label className="flex items-center gap-1 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={sc.distribute_enabled}
                              onChange={(e) => {
                                const next = [...scenariosForm];
                                next[idx] = { ...next[idx], distribute_enabled: e.target.checked };
                                setScenariosForm(next);
                              }}
                              className="w-3 h-3"
                            />
                            <span className="text-gray-700">分散登録</span>
                          </label>
                        </div>
                        {sc.distribute_enabled && (
                          <div className="grid grid-cols-2 gap-2 ml-4">
                            <div>
                              <label className="text-[10px] text-gray-500 block mb-0.5">分散本数</label>
                              <select
                                value={sc.distribute_count}
                                onChange={(e) => {
                                  const next = [...scenariosForm];
                                  next[idx] = { ...next[idx], distribute_count: Number(e.target.value) };
                                  setScenariosForm(next);
                                }}
                                className="w-full border border-gray-200 rounded px-2 py-1 text-xs bg-white"
                              >
                                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                                  <option key={n} value={n}>{n} 本</option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className="text-[10px] text-gray-500 block mb-0.5">予備本数</label>
                              <select
                                value={sc.reserve_count}
                                onChange={(e) => {
                                  const next = [...scenariosForm];
                                  next[idx] = { ...next[idx], reserve_count: Number(e.target.value) };
                                  setScenariosForm(next);
                                }}
                                className="w-full border border-gray-200 rounded px-2 py-1 text-xs bg-white"
                              >
                                {[0, 1, 2, 3, 4, 5].map((n) => (
                                  <option key={n} value={n}>{n} 本</option>
                                ))}
                              </select>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {projectMsg && (
                <div className={`px-3 py-2 rounded-md text-xs ${
                  projectMsg.ok
                    ? "bg-green-50 text-green-700 border border-green-200"
                    : "bg-red-50 text-red-700 border border-red-200"
                }`}>
                  {projectMsg.text}
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-200">
              <button
                onClick={() => setShowProjectModal(false)}
                className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition"
              >
                キャンセル
              </button>
              <button
                onClick={saveProject}
                disabled={projectSaving || !projectForm.name.trim() || !projectForm.code.trim()}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition"
              >
                {projectSaving ? "保存中..." : editingProjectId ? "更新" : "作成"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 段階8-2-C: scenario 削除確認モーダル */}
      {deleteScenarioTarget && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="px-5 py-4 border-b border-gray-200">
              <h3 className="text-base font-bold text-gray-800">
                シナリオ「{deleteScenarioTarget.name}」を削除
              </h3>
            </div>
            <div className="px-5 py-4 space-y-3">
              <p className="text-xs text-gray-600">以下のデータが影響を受けます:</p>
              {deleteScenarioDependents ? (
                <ul className="text-xs space-y-1 text-gray-700">
                  <li>・友達: <strong>{deleteScenarioDependents.followers}</strong> 件 <span className="text-gray-400">(紐付けのみ消失)</span></li>
                  <li>・アカウント: <strong>{deleteScenarioDependents.accounts}</strong> 件 <span className="text-gray-400">(紐付けのみ消失)</span></li>
                  <li>・流入経路: <strong>{deleteScenarioDependents.inflow_routes}</strong> 件 <span className="text-gray-400">(紐付けのみ消失)</span></li>
                  <li>・ステップ配信: <strong>{deleteScenarioDependents.step_sequences}</strong> 件 <span className="text-red-600">(削除)</span></li>
                  <li>・リッチメニュー: <strong>{deleteScenarioDependents.rich_menus}</strong> 件 <span className="text-red-600">(削除)</span></li>
                  <li>・ラベル: <strong>{deleteScenarioDependents.labels}</strong> 件 <span className="text-red-600">(削除)</span></li>
                  <li>・アクションルール: <strong>{deleteScenarioDependents.action_rules}</strong> 件 <span className="text-red-600">(削除)</span></li>
                  <li>・その他: <strong>{deleteScenarioDependents.others}</strong> 件 <span className="text-gray-400">(配信定義 / 設定資産等)</span></li>
                </ul>
              ) : (
                <div className="text-xs text-gray-400">読み込み中...</div>
              )}
              <div className="space-y-1 pt-2">
                <label className="text-xs text-gray-600 block">
                  確認のため、シナリオ名「<span className="font-mono font-medium text-gray-800">{deleteScenarioTarget.name}</span>」を入力:
                </label>
                <input
                  type="text"
                  value={deleteScenarioInputName}
                  onChange={(e) => setDeleteScenarioInputName(e.target.value)}
                  placeholder={deleteScenarioTarget.name}
                  className="w-full border border-gray-200 rounded px-2 py-1.5 text-xs bg-white focus:border-red-400 focus:outline-none focus:ring-1 focus:ring-red-400"
                  autoFocus
                />
              </div>
              {deleteScenarioError && (
                <div className="px-3 py-2 rounded-md text-xs bg-red-50 text-red-700 border border-red-200">
                  {deleteScenarioError}
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-200">
              <button
                onClick={closeDeleteScenarioModal}
                className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition"
              >
                キャンセル
              </button>
              <button
                onClick={confirmDeleteScenario}
                disabled={
                  deleteScenarioBusy ||
                  deleteScenarioInputName !== deleteScenarioTarget.name
                }
                className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition"
              >
                {deleteScenarioBusy ? "削除中..." : "削除"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

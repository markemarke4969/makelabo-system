"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";

interface Project {
  id: string;
  name: string;
  description: string | null;
  color: string;
  sort_order: number;
}

const DEFAULT_COLORS = [
  "#06C755", "#3B82F6", "#EF4444", "#F59E0B", "#8B5CF6", "#EC4899",
];

export default function LineProjects() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [userName, setUserName] = useState("");

  useEffect(() => {
    const init = async () => {
      const supabase = createClient();

      // 認証チェック（ログインしてなくてもOK）
      const { data: { user } } = await supabase.auth.getUser();
      setUserName(user?.email ?? "ゲスト");

      // 権限フィルタ付き案件一覧を取得
      const url = user?.id
        ? `/api/line/user-projects?user_id=${user.id}`
        : `/api/line/user-projects`;
      const res = await fetch(url);
      if (res.ok) {
        setProjects(await res.json());
      }
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
    // sessionStorageに選択した案件を保存
    sessionStorage.setItem("line_project", JSON.stringify(project));
    router.push("/line/dashboard");
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
      {/* ヘッダー */}
      <header className="border-b border-white/10 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-[#06C755] flex items-center justify-center">
            <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63h2.386c.346 0 .627.285.627.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.06-.023.136-.033.194-.033.195 0 .375.104.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63.346 0 .628.285.628.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.282.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314" /></svg>
          </div>
          <div>
            <h1 className="text-lg font-bold text-white">LINE ハーネス</h1>
            <p className="text-xs text-white/40">案件を選択してください</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-xs text-white/50">{userName}</span>
          <button
            onClick={handleLogout}
            className="px-3 py-1.5 text-xs text-white/60 hover:text-white hover:bg-white/10 rounded-md transition"
          >
            ログアウト
          </button>
        </div>
      </header>

      {/* 案件カード */}
      <main className="max-w-4xl mx-auto px-6 py-10">
        <h2 className="text-white text-lg font-bold mb-6">案件一覧</h2>

        {projects.length === 0 ? (
          <div className="bg-white/5 rounded-xl border border-white/10 p-12 text-center">
            <p className="text-white/50 text-sm mb-2">案件が登録されていません</p>
            <p className="text-white/30 text-xs">管理者に案件の登録を依頼してください</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map((project, i) => (
              <button
                key={project.id}
                onClick={() => selectProject(project)}
                className="group bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 rounded-xl p-5 text-left transition-all hover:shadow-lg hover:shadow-black/20 hover:-translate-y-0.5"
              >
                {/* アイコン */}
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center mb-4 text-xl"
                  style={{ backgroundColor: project.color || DEFAULT_COLORS[i % DEFAULT_COLORS.length] }}
                >
                  <span className="text-white font-bold">
                    {project.name.charAt(0)}
                  </span>
                </div>
                <h3 className="text-white font-bold text-base mb-1 group-hover:text-[#06C755] transition-colors">
                  {project.name}
                </h3>
                {project.description && (
                  <p className="text-white/40 text-xs leading-relaxed">{project.description}</p>
                )}
              </button>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

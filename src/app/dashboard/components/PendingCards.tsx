"use client";

interface PendingItem {
  id: string; customer_name: string; closer_name: string;
  interview_date: string; next_action_date: string;
  contact_date: string; contact_method: string; result: string;
  memo: string; days_elapsed: number; is_overdue: boolean;
}

interface Props { items: PendingItem[] }

const SAMPLE: PendingItem = {
  id: "sample", customer_name: "（サンプル）山田太郎", closer_name: "西垣",
  interview_date: "2026-03-15", next_action_date: "2026-04-05",
  contact_date: "2026-03-28", contact_method: "LINE", result: "継続保留",
  memo: "融資審査待ち。4/5に再連絡予定。", days_elapsed: 5, is_overdue: false,
};

export default function PendingCards({ items }: Props) {
  const display = items.length > 0 ? items : [SAMPLE];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {display.map((item) => (
        <div key={item.id}
          className={`rounded-2xl border-2 bg-[#13162a] p-5 ${item.is_overdue ? "border-red-500/60" : "border-[#2a2f45]"}`}>
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <p className="text-lg font-bold text-white">{item.customer_name}</p>
            {item.is_overdue ? (
              <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-red-500/20 text-red-400 border border-red-500/30">🚨 期限超過</span>
            ) : (
              <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-yellow-500/10 text-yellow-400 border border-yellow-500/20">保留中</span>
            )}
          </div>

          {/* KPI cells */}
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div className="rounded-xl p-3 bg-gradient-to-br from-blue-500/20 to-transparent border border-blue-500/20">
              <p className="text-xs text-blue-300/80 mb-1 font-medium">経過日数</p>
              <p className={`text-xl font-bold ${item.days_elapsed > 7 ? "text-red-300" : item.days_elapsed > 3 ? "text-yellow-300" : "text-emerald-300"}`}>
                {item.days_elapsed}日
              </p>
            </div>
            <div className="rounded-xl p-3 bg-gradient-to-br from-cyan-500/20 to-transparent border border-cyan-500/20">
              <p className="text-xs text-cyan-300/80 mb-1 font-medium">担当</p>
              <p className="text-xl font-bold text-cyan-300">{item.closer_name}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 mb-3">
            <div className="bg-[#1e2235]/80 rounded-xl p-2.5 border border-[#2a2f45]/50">
              <p className="text-xs text-[#9aa0b8] mb-1 font-medium">面談日</p>
              <p className="text-sm font-bold text-white">{item.interview_date || "-"}</p>
            </div>
            <div className="bg-[#1e2235]/80 rounded-xl p-2.5 border border-[#2a2f45]/50">
              <p className="text-xs text-[#9aa0b8] mb-1 font-medium">再架電予定</p>
              <p className={`text-sm font-bold ${item.is_overdue ? "text-red-400" : "text-white"}`}>{item.next_action_date || "-"}</p>
            </div>
            <div className="bg-[#1e2235]/80 rounded-xl p-2.5 border border-[#2a2f45]/50">
              <p className="text-xs text-[#9aa0b8] mb-1 font-medium">最終連絡</p>
              <p className="text-sm font-bold text-white">{item.contact_date || "-"}</p>
            </div>
            <div className="bg-[#1e2235]/80 rounded-xl p-2.5 border border-[#2a2f45]/50">
              <p className="text-xs text-[#9aa0b8] mb-1 font-medium">連絡方法</p>
              <p className="text-sm font-bold text-white">{item.contact_method || "-"}</p>
            </div>
          </div>

          <div className="bg-[#1e2235]/80 rounded-xl p-2.5 border border-[#2a2f45]/50 mb-3">
            <p className="text-xs text-[#9aa0b8] mb-1 font-medium">ステータス</p>
            <p className="text-sm font-bold text-white">{item.result || "-"}</p>
          </div>

          {item.memo && (
            <div className="rounded-xl p-2.5 bg-[#0f1117] border border-[#2a2f45]/30">
              <p className="text-[10px] text-[#6b7194]">{item.memo}</p>
            </div>
          )}

          {item.id === "sample" && <p className="mt-2 text-[9px] text-[#4f8ff7] italic">* サンプルデータ</p>}
        </div>
      ))}
    </div>
  );
}

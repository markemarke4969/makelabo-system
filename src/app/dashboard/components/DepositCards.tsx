"use client";

interface DepositItem {
  id: string; customer_name: string; closer_name: string;
  deal_amount: number; deal_date: string; next_payment_date: string;
  unpaid_days: number; last_deposit_date: string; status: string;
  deposited_amount: number; remaining_amount: number; is_overdue: boolean;
}

interface Props { items: DepositItem[] }

function yen(n: number) { return `¥${Math.round(n || 0).toLocaleString()}`; }

const SAMPLE: DepositItem = {
  id: "sample", customer_name: "（サンプル）佐藤花子", closer_name: "ケーマ",
  deal_amount: 2640000, deal_date: "2026-03-10",
  next_payment_date: "2026-04-10", unpaid_days: 0,
  last_deposit_date: "", status: "pending",
  deposited_amount: 0, remaining_amount: 2640000, is_overdue: false,
};

export default function DepositCards({ items }: Props) {
  const display = items.length > 0 ? items : [SAMPLE];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {display.map((item) => (
        <div key={item.id}
          className={`rounded-2xl border-2 bg-[#13162a] p-5 ${item.is_overdue ? "border-red-500/60" : "border-[#2a2f45]"}`}>
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-lg font-bold text-white">{item.customer_name}</p>
              <p className="text-xs text-[#9aa0b8]">担当: {item.closer_name}</p>
            </div>
            {item.is_overdue ? (
              <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-red-500/20 text-red-400 border border-red-500/30">🚨 未入金</span>
            ) : item.status === "completed" ? (
              <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">入金済</span>
            ) : item.status === "partial" ? (
              <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-yellow-500/10 text-yellow-400 border border-yellow-500/20">一部入金</span>
            ) : (
              <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20">入金待ち</span>
            )}
          </div>

          {/* Amount card */}
          <div className="rounded-xl p-3 bg-gradient-to-br from-blue-500/20 to-transparent border border-blue-500/20 mb-3">
            <p className="text-xs text-blue-300/80 mb-1 font-medium">成約金額</p>
            <p className="text-2xl font-bold text-blue-300">{yen(item.deal_amount)}</p>
          </div>

          {/* Progress bar */}
          <div className="mb-3">
            <div className="flex justify-between text-xs text-[#6b7194] mb-1">
              <span>入金進捗</span>
              <span className="text-white font-medium">
                {item.deal_amount > 0 ? Math.round((item.deposited_amount / item.deal_amount) * 100) : 0}%
              </span>
            </div>
            <div className="w-full bg-[#0f1117] rounded-full h-2">
              <div className="h-2 rounded-full bg-gradient-to-r from-emerald-500 to-blue-500"
                style={{ width: `${item.deal_amount > 0 ? Math.min((item.deposited_amount / item.deal_amount) * 100, 100) : 0}%` }} />
            </div>
            <div className="flex justify-between text-[10px] mt-1">
              <span className="text-emerald-400">入金済 {yen(item.deposited_amount)}</span>
              <span className="text-red-400">残 {yen(item.remaining_amount)}</span>
            </div>
          </div>

          {/* Detail grid */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-[#1e2235]/80 rounded-xl p-2.5 border border-[#2a2f45]/50">
              <p className="text-xs text-[#9aa0b8] mb-1 font-medium">成約日</p>
              <p className="text-sm font-bold text-white">{item.deal_date || "-"}</p>
            </div>
            <div className="bg-[#1e2235]/80 rounded-xl p-2.5 border border-[#2a2f45]/50">
              <p className="text-xs text-[#9aa0b8] mb-1 font-medium">約束日</p>
              <p className={`text-sm font-bold ${item.is_overdue ? "text-red-400" : "text-white"}`}>{item.next_payment_date || "-"}</p>
            </div>
            <div className="bg-[#1e2235]/80 rounded-xl p-2.5 border border-[#2a2f45]/50">
              <p className="text-xs text-[#9aa0b8] mb-1 font-medium">未入金日数</p>
              <p className={`text-sm font-bold ${item.unpaid_days > 0 ? "text-red-400" : "text-emerald-400"}`}>
                {item.unpaid_days > 0 ? `${item.unpaid_days}日` : "-"}
              </p>
            </div>
            <div className="bg-[#1e2235]/80 rounded-xl p-2.5 border border-[#2a2f45]/50">
              <p className="text-xs text-[#9aa0b8] mb-1 font-medium">最終入金</p>
              <p className="text-sm font-bold text-white">{item.last_deposit_date || "-"}</p>
            </div>
          </div>

          {item.id === "sample" && <p className="mt-3 text-[9px] text-[#4f8ff7] italic">* サンプルデータ</p>}
        </div>
      ))}
    </div>
  );
}

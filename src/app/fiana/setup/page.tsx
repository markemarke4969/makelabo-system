"use client";

import { Suspense, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";
import { isDemoMode, saveDemoProfile } from "@/lib/fiana-demo";
import { DEPOSIT_OPTIONS, formatJPYPlain } from "@/lib/fiana-config";

export default function FianaSetupPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <FianaSetup />
    </Suspense>
  );
}

function FianaSetup() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [customAmount, setCustomAmount] = useState("");
  const [useCustom, setUseCustom] = useState(false);
  const [saving, setSaving] = useState(false);
  const [demo, setDemo] = useState(false);

  useEffect(() => {
    if (isDemoMode()) {
      setDemo(true);
    } else {
      const checkAuth = async () => {
        const supabase = createClient();
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session) {
          router.replace("/fiana/register");
        }
      };
      checkAuth();
    }

    // 診断結果からの推奨金額を自動選択
    const suggested = searchParams.get("suggested");
    if (suggested) {
      const amount = parseInt(suggested, 10);
      const matchIndex = DEPOSIT_OPTIONS.findIndex((o) => o.amount === amount);
      if (matchIndex !== -1) {
        setSelectedIndex(matchIndex);
      }
    }
  }, [router, searchParams]);

  const getSelectedDeposit = () => {
    if (useCustom && customAmount) {
      const amount = parseInt(customAmount, 10);
      if (amount < 100000) return { amount, lot: 0.01, profitPer5pips: 50 };
      if (amount < 300000) return { amount, lot: 0.01, profitPer5pips: 50 };
      if (amount < 500000) return { amount, lot: 0.03, profitPer5pips: 150 };
      if (amount < 1000000) return { amount, lot: 0.05, profitPer5pips: 250 };
      if (amount < 3000000) return { amount, lot: 0.1, profitPer5pips: 500 };
      return { amount, lot: 0.3, profitPer5pips: 1500 };
    }
    if (selectedIndex !== null) {
      return DEPOSIT_OPTIONS[selectedIndex];
    }
    return null;
  };

  const selected = getSelectedDeposit();

  const handleConfirm = async () => {
    if (!selected) return;
    setSaving(true);

    try {
      const today = new Date().toISOString().split("T")[0];

      if (demo) {
        saveDemoProfile({
          virtual_deposit: selected.amount,
          lot_size: selected.lot,
          trial_start_date: today,
        });
        router.push("/fiana/dashboard");
        return;
      }

      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (session) {
        await supabase
          .from("fiana_profiles")
          .update({
            virtual_deposit: selected.amount,
            lot_size: selected.lot,
            trial_start_date: today,
          })
          .eq("user_id", session.user.id);
      }

      router.push("/fiana/dashboard");
    } catch {
      router.push("/fiana/dashboard");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen px-4 py-8">
      <div className="max-w-md mx-auto fiana-slide-up">
        {/* ヘッダー */}
        <div className="text-center mb-8">
          <div className="text-4xl mb-3">💰</div>
          <h1 className="text-xl font-bold text-white mb-2">
            仮想入金額を設定
          </h1>
          <p className="text-gray-400 text-sm leading-relaxed">
            実際のお金は一切かかりません。
            <br />
            シミュレーションの基準となる金額を選んでください。
          </p>
        </div>

        {/* 金額選択 */}
        <div className="space-y-3 mb-4">
          {DEPOSIT_OPTIONS.map((option, index) => (
            <button
              key={option.amount}
              onClick={() => {
                setSelectedIndex(index);
                setUseCustom(false);
              }}
              className={`w-full text-left px-5 py-4 rounded-xl border transition-all ${
                !useCustom && selectedIndex === index
                  ? "border-indigo-500 bg-indigo-500/10"
                  : "border-white/10 bg-white/5 hover:border-white/20"
              }`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-lg font-bold text-white">
                    {option.label}
                  </span>
                  <span className="text-sm text-gray-500 ml-2">
                    ({option.lot}lot)
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-sm text-green-400 font-medium">
                    5pips: +¥{option.profitPer5pips.toLocaleString()}
                  </span>
                </div>
              </div>
            </button>
          ))}
        </div>

        {/* 自由入力 */}
        <div className="mb-6">
          <button
            onClick={() => {
              setUseCustom(true);
              setSelectedIndex(null);
            }}
            className={`w-full text-left px-5 py-4 rounded-xl border transition-all ${
              useCustom
                ? "border-indigo-500 bg-indigo-500/10"
                : "border-white/10 bg-white/5 hover:border-white/20"
            }`}
          >
            <span className="text-base font-bold text-gray-300">
              自由入力
            </span>
          </button>
          {useCustom && (
            <div className="mt-2 px-1">
              <div className="flex items-center gap-2">
                <span className="text-gray-400 text-lg">¥</span>
                <input
                  type="number"
                  value={customAmount}
                  onChange={(e) => setCustomAmount(e.target.value)}
                  placeholder="金額を入力"
                  min={10000}
                  className="fiana-input flex-1"
                />
              </div>
            </div>
          )}
        </div>

        {/* 選択確認 */}
        {selected && (
          <div className="fiana-card p-4 mb-6">
            <div className="text-center">
              <p className="text-sm text-indigo-400 mb-1">シミュレーション設定</p>
              <p className="text-2xl font-bold text-white">
                {formatJPYPlain(selected.amount)}
              </p>
              <p className="text-sm text-gray-400 mt-1">
                lotサイズ: {selected.lot} / 5pips利益: +¥
                {selected.profitPer5pips.toLocaleString()}
              </p>
            </div>
          </div>
        )}

        {/* 注意書き */}
        <div className="rounded-xl p-4 mb-6 text-sm text-gray-400 leading-relaxed bg-white/5 border border-white/10">
          <p className="font-medium text-gray-300 mb-1">ご注意</p>
          <ul className="space-y-1 list-disc list-inside">
            <li>実際のお金は動きません（仮想シミュレーションです）</li>
            <li>入金額に応じてlotサイズが変わり、利益額が変動します</li>
            <li>30日間の無料体験後にロックがかかります</li>
          </ul>
        </div>

        {/* 確定ボタン */}
        <button
          onClick={handleConfirm}
          disabled={!selected || saving}
          className={`w-full py-4 font-bold text-lg rounded-xl transition-all ${
            selected ? "fiana-btn" : "bg-gray-700 text-gray-500 cursor-not-allowed"
          }`}
        >
          {saving ? "設定中..." : "この金額でシミュレーション開始 →"}
        </button>
      </div>
    </div>
  );
}

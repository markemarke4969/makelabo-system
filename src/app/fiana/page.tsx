"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";
import { isDemoMode, getDemoProfile } from "@/lib/fiana-demo";

export default function FianaEntry() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const check = async () => {
      // デモモードチェック
      if (isDemoMode()) {
        const demo = getDemoProfile();
        if (!demo || !demo.diagnosis_type) {
          router.replace("/fiana/shindan");
        } else if (!demo.virtual_deposit) {
          router.replace("/fiana/setup");
        } else {
          router.replace("/fiana/dashboard");
        }
        return;
      }

      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        router.replace("/fiana/register");
        return;
      }

      const { data: profile } = await supabase
        .from("fiana_profiles")
        .select("diagnosis_type, virtual_deposit")
        .eq("user_id", session.user.id)
        .single();

      if (!profile || !profile.diagnosis_type) {
        router.replace("/fiana/shindan");
      } else if (!profile.virtual_deposit) {
        router.replace("/fiana/setup");
      } else {
        router.replace("/fiana/dashboard");
      }
    };

    check().finally(() => setChecking(false));
  }, [router]);

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="fiana-heading text-3xl font-bold fiana-text-glow mb-6">FIANA</h1>
          <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-400 text-lg">読み込み中...</p>
        </div>
      </div>
    );
  }

  return null;
}

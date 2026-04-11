// ========================================
// デモモード用ヘルパー
// ========================================
// Supabase未設定時にアプリ全体をプレビューできるようにする

const DEMO_KEY = "fiana_demo_mode";

export function isDemoMode(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(DEMO_KEY) === "1";
}

export function enableDemoMode() {
  localStorage.setItem(DEMO_KEY, "1");
}

export function disableDemoMode() {
  localStorage.removeItem(DEMO_KEY);
  localStorage.removeItem("fiana_demo_profile");
}

export interface DemoProfile {
  user_id: string;
  diagnosis_type: string;
  diagnosis_label: string;
  diagnosis_answers: string[];
  virtual_deposit: number;
  lot_size: number;
  trial_start_date: string;
  birthday?: string;
  mbti?: string;
  animal_type?: string;
  deposit_hint?: number;
  current_assets?: number;
}

export function getDemoProfile(): DemoProfile | null {
  if (typeof window === "undefined") return null;
  const stored = localStorage.getItem("fiana_demo_profile");
  if (stored) return JSON.parse(stored);
  return null;
}

export function saveDemoProfile(profile: Partial<DemoProfile>) {
  const existing = getDemoProfile() || {
    user_id: "demo-user-001",
    diagnosis_type: "",
    diagnosis_label: "",
    diagnosis_answers: [],
    virtual_deposit: 0,
    lot_size: 0,
    trial_start_date: "",
  };
  const merged = { ...existing, ...profile };
  localStorage.setItem("fiana_demo_profile", JSON.stringify(merged));
}

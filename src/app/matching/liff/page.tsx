import { Suspense } from "react";
import LiffClient from "./LiffClient";

function LiffFallback() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 to-black flex items-center justify-center px-6">
      <div className="max-w-sm w-full text-center">
        <div className="mb-6 flex justify-center">
          <div className="w-12 h-12 border-4 border-white/20 border-t-[#06C755] rounded-full animate-spin" />
        </div>
        <p className="text-white text-base font-medium">
          LINEへの接続を準備しています...
        </p>
      </div>
    </div>
  );
}

export default function MatchingLiffPage() {
  return (
    <Suspense fallback={<LiffFallback />}>
      <LiffClient />
    </Suspense>
  );
}

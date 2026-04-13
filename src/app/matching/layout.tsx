import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "AI副業マッチング診断",
  description: "12問の質問であなたに最適な副業をAIがマッチングします",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#0f172a",
};

export default function MatchingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="matching-theme min-h-screen bg-[#0f172a] text-gray-100">
      {children}
    </div>
  );
}

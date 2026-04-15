import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "AI副業マッチング診断",
  description: "12問の質問であなたに最適な副業をAIがマッチングします",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#4CAF82",
};

export default function MatchingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="matching-theme min-h-screen bg-[#FAFAF8] text-[#333333]">
      {children}
    </div>
  );
}

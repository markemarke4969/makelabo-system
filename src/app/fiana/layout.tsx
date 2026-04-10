import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "FIANA - 投資体験シミュレーター",
  description:
    "あなたに合った投資スタイルを診断し、30日間の無料シミュレーション体験ができます。",
};

export default function FianaLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="fiana-dark fiana-body min-h-screen relative" style={{ background: "var(--fiana-bg)" }}>
      {/* Background gradient layer */}
      <div
        className="fixed inset-0 z-0 pointer-events-none"
        style={{
          background: `
            radial-gradient(ellipse at top, rgba(99,102,241,0.08) 0%, transparent 50%),
            radial-gradient(ellipse at bottom right, rgba(139,92,246,0.06) 0%, transparent 50%),
            radial-gradient(ellipse at bottom left, rgba(59,130,246,0.04) 0%, transparent 40%)
          `,
        }}
      />
      {/* Content */}
      <div className="relative z-10">
        {children}
      </div>
    </div>
  );
}

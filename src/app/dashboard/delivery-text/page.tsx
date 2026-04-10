"use client";

import Link from "next/link";

const SAMPLE_DELIVERIES = [
  {
    day: 1,
    title: "ウェビナー開催のお知らせ",
    open_rate: 0,
    click_rate: 0,
    send_count: 0,
    body: `【ウェビナー開催のお知らせ】

こんにちは！

いよいよ明日、特別ウェビナーを開催します。

▼ウェビナー内容
・月収100万円ロードマップの全貌
・実績者3名のリアルインタビュー
・初心者が最初にやるべき3つのこと
・限定特典のご案内

▼日時
2026年4月1日（水）20:00〜

▼参加方法
下記URLからお申し込みください。

定員に達し次第、締め切りとなります。
お早めにお申し込みください！

━━━━━━━━━━━━
※このメールはサンプルです`,
  },
  {
    day: 2,
    title: "本日20時スタート！",
    open_rate: 0,
    click_rate: 0,
    send_count: 0,
    body: `【本日20時スタート！】

こんにちは！

本日20時より、特別ウェビナーを開催します。

前回参加された方からは
「具体的なステップが分かった！」
「実績者の話が刺さった」
と大好評でした。

▼本日のウェビナーで得られること
・最短で成果を出すための3ステップ
・よくある失敗パターンとその回避法
・参加者限定の特別オファー

▼参加はこちらから
下記URLをクリックしてご参加ください。

開始5分前にはスタンバイをお願いします！

━━━━━━━━━━━━
※このメールはサンプルです`,
  },
  {
    day: 3,
    title: "見逃し配信のご案内",
    open_rate: 0,
    click_rate: 0,
    send_count: 0,
    body: `【見逃し配信のご案内】

こんにちは！

先日のウェビナーはご覧いただけましたか？

まだご覧になっていない方のために、
期間限定で見逃し配信をご用意しました。

▼ウェビナーのハイライト
・参加者の92%が「参考になった」と回答
・実績者インタビューが特に好評
・限定特典は本日23:59まで

▼見逃し配信はこちら
下記URLから48時間限定でご視聴いただけます。

お早めにご確認ください！

━━━━━━━━━━━━
※このメールはサンプルです`,
  },
];

export default function DeliveryTextListPage() {
  return (
    <div className="min-h-screen bg-[#0f1117] text-white p-6 md:p-10 max-w-3xl mx-auto space-y-6">
      <Link href="/dashboard?tab=webinar" className="text-xs text-[#4f8ff7] hover:underline">
        ← ウェビナー詳細に戻る
      </Link>

      <h1 className="text-xl font-bold text-white">配信文一覧</h1>

      <div className="space-y-5">
        {SAMPLE_DELIVERIES.map(d => (
          <div key={d.day} className="bg-[#1e2235] rounded-2xl border border-[#2a2f45] p-5 space-y-4">
            <h2 className="text-base font-bold text-white">{d.day}日目 — {d.title}</h2>

            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-xl p-3 bg-gradient-to-br from-cyan-500/15 to-transparent border border-cyan-500/20 text-center">
                <p className="text-[10px] text-cyan-300/80 mb-0.5 font-medium">開封率</p>
                <p className="text-xl font-bold text-cyan-300">{d.open_rate}%</p>
              </div>
              <div className="rounded-xl p-3 bg-gradient-to-br from-blue-500/15 to-transparent border border-blue-500/20 text-center">
                <p className="text-[10px] text-blue-300/80 mb-0.5 font-medium">クリック率</p>
                <p className="text-xl font-bold text-blue-300">{d.click_rate}%</p>
              </div>
              <div className="rounded-xl p-3 bg-gradient-to-br from-purple-500/15 to-transparent border border-purple-500/20 text-center">
                <p className="text-[10px] text-purple-300/80 mb-0.5 font-medium">配信人数</p>
                <p className="text-xl font-bold text-purple-300">{d.send_count.toLocaleString()}</p>
              </div>
            </div>

            <pre className="text-sm text-[#9aa0b8] leading-relaxed whitespace-pre-wrap bg-[#13162a] rounded-xl p-5 border border-[#2a2f45]/50 max-h-[400px] overflow-y-auto">
              {d.body}
            </pre>
          </div>
        ))}
      </div>

      <p className="text-xs text-[#6b7194]">*サンプルデータです</p>
    </div>
  );
}

@AGENTS.md

# 副業診断アプリ × LINEハーネス連携プロジェクト ルールブック

## 1. プロジェクト概要
- 副業診断アプリ(matching/):広告→診断→16タイプ判定→AI生成結果→LINE登録→クローザー対応
- LINEハーネス(line/):LINE公式アカウント一元管理 CRM/MA(全案件共通)
- 同居リポジトリ(makelabo-system/app)、同居 Supabase インスタンス
- 将来的にリポジトリ分離予定(優先度C)

## 2. 役割分担
- **ClaudeCode(VSCode 拡張)**:makelabo-system のコード実装・push 担当
- **Claude デスクトップアプリ**:ClaudeCode への作業指示文作成・全体進行サポート
- **石井(ユーザー)**:ClaudeCode に指示を渡す・Vercel/Supabase 手動操作・社内コミュニケーション

## 3. 絶対NG ルール

### モジュール境界(構想第17章)
- **supabase**:`line_*` はハーネス領域・`matching_*` は副業診断領域
  - line 側から matching テーブルを直接触らない(HTTP lookup API のみ)
  - matching 側から line テーブルを直接触らない(HTTP 公開IF のみ)
- **vercel env**:`LINE_*` / `MATCHING_*` / `NEXT_PUBLIC_MATCHING_*` の三分類厳守

### ファイル投入
- marketlab / makelabo-system へのファイル追加・更新は必ず **`git clone` 経由**
- `gh api contents` 直接 PUT は Usage Policy 誤検知の原因となるため **使用禁止**

### GitHub 認証
- **marketlab repo** → `gh auth lmsml0712-droid`
- **makelabo-system repo** → `gh auth markemarke4969`
- push 前に必ず `gh auth switch` + `gh auth setup-git`

### Supabase 接続
- module top-level で `createClient` を直接呼ばない
  (Next.js 16 の Preview ビルドで env 未設定によりビルド失敗するため)
- 代わりに `@/lib/supabase` の `supabaseAdmin`(lazy proxy)を使用

## 4. 取得する顧客情報

| タイミング | 取得情報 |
|---|---|
| 診断フォーム(Q1-Q12) | 名前・性別・職業・年代・生年月日・家族構成・12 問回答 |
| 結果ページ | (取得なし・CTA ボタンのみ) |
| LINE 登録後アンケート | 電話番号のみ |

## 5. 取得しないもの(重要)
- **メールアドレス** → 取得しない
- **住所** → 取得しない
- **出身地** → 取得しない
- **メール配信機能(Resend / SendGrid 等)** → 導入しない
- **顧客接点は LINE のみ**

## 6. 環境変数一覧

### matching テリトリー
- `MATCHING_PUBLIC_LOOKUP_TOKEN`:`GET /api/matching/diagnoses/[id]/ai-sections` Bearer
- `NEXT_PUBLIC_MATCHING_BRIDGE_URL`:中継URL
- `MATCHING_AI_TIMEOUT_MS`:Claude API タイムアウト(任意)

### line テリトリー
- `LINE_INFLOW_LOOKUP_TOKEN`:`GET /api/line/inflow-lookup` Bearer
- `LINE_MATCHING_LOOKUP_TOKEN`:matching API 呼出用(`MATCHING_PUBLIC_LOOKUP_TOKEN` と同値・PR#2-B で投入予定)
- `MATCHING_LINE_INFLOW_LOOKUP_TOKEN`:ハーネス側呼出用(`LINE_INFLOW_LOOKUP_TOKEN` と同値・PR#2-B で投入予定)

### 共通
- `ANTHROPIC_API_KEY`
- `CRON_SECRET`

## 7. PR シリーズ進捗

- ✅ PR#1'(中継URL 直リンク化)
- ✅ PR#2-A(matching: AI セクション永続化+公開 lookup API、PR #49 merged)
- ✅ PR-Harness(line: external_ref 追加+inflow-lookup API、PR #50 merged)
- ⏳ **PR#2-B(line: webhook 拡張+シナリオシード 3 通)← 次着手**
- ⏸ PR#2-C(matching: 結果ページのティザー化)
- ⏸ PR#2-D(matching: cron 自動再試行)
- ⏸ PR#3(ダッシュボード本格版・成約管理機能追加)

## 8. Plan-Then-GO 原則
- 実装前に必ず Plan Mode で調査報告
- 石井さんの明示承認なしに次 PR に着手しない
- 推測で進めず、判断に迷ったら手を止めて確認

## 9. 関連ドキュメント
- **副業診断アプリ構想.md**:
  https://github.com/marketLab-tech/marketlab/blob/main/04_システム構築録/共通システム/副業診断アプリ/副業診断アプリ構想.md
- **LINEハーネス構想.md**:
  https://github.com/marketLab-tech/marketlab/blob/main/04_システム構築録/共通システム/LINEハーネス/LINEハーネス構想.md
- **開発ログ**:
  https://github.com/marketLab-tech/marketlab/tree/main/04_システム構築録/共通システム/

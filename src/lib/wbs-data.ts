// ============================================================
// WBS タスクデータ（CSV から抽出）
// 案件: 新競艇 / 新競馬（同じテンプレート構造）
// ============================================================

export type ManualVideo = { label: string; url: string };

export type WbsTask = {
  id: string;
  project: "新競艇" | "新競馬";
  category: "新規FE" | "アップセル" | "動画コンテンツ";
  phase: string;
  phaseTab: string;
  task: string;
  dueDate: string;
  department: string;
  workDays: number;
  done: boolean;
  memo: string;
  videos: ManualVideo[];
  /** 発射日から何日前か（正=発射前、負=発射後） null=期日なし */
  offsetFromLaunch: number | null;
  /** どちらの発射日を基準にするか */
  launchRef: "fe" | "upsell";
  /** マニュアル紐付け: 期日をこのタスク名から取得 */
  linkedTo?: string;
  /** マニュアル紐付けアイテムか */
  isManualLink?: boolean;
};

// ============================================================
// 動画コンテンツCSVから抽出した全動画ライブラリ
// ============================================================
const V = {
  // --- メイン動画（タイトル列 + URL列）---
  日報報告の着眼点: { label: "【1の補足】日報報告の着眼点について", url: "https://vimeo.com/1136874374/c4b36bdc2b" },
  代表佐々木チャット: { label: "代表佐々木のチャット発言に対して気にすること", url: "https://vimeo.com/1136880943/1e10841268" },
  週報配信の考え方: { label: "エバー後の週報配信についての考え方", url: "https://vimeo.com/1136883205/051aca16da" },
  VSL教育の濃度: { label: "【Cwで良いなと思った事】VSL教育の濃度について", url: "https://vimeo.com/1136890579/ee1ef87cd6" },
  キャラ解像度: { label: "キャラの解像度を上げる考え方について", url: "https://vimeo.com/1136949266/47c2720956" },
  面談予約1週間以上: { label: "面談予約が1週間以上になるケースの対策", url: "https://vimeo.com/1136961620/65362caae7" },
  小道具確認: { label: "ファネル撮影前の小道具確認の重要性", url: "https://vimeo.com/1136965508/de8641a90f" },
  ファネルヘッド方向性: { label: "ファネルのヘッドの方向性、ボリューム、権威性", url: "https://vimeo.com/1136968071/e73fa6927a" },
  権威性社会的証明: { label: "【1】権威性と社会的証明の大事さ", url: "https://vimeo.com/1136973520/50ad234c35" },
  権威性ひねりだし: { label: "【1の補足】権威性と社会的証明、そのひねりだし方", url: "https://vimeo.com/1136980154/c8c7b6f69e" },
  外部協業注意点: { label: "マケラボが外部の会社と協業する際の注意点", url: "https://vimeo.com/1138096940/5822965a01" },
  売上変動月ランキング: { label: "年間通じて売上変動が多そうな月ランキング3選", url: "https://vimeo.com/1138100921/af552dbe2a" },
  CW数値報告の見方: { label: "広告部署から上がるCW数値報告の見方・考え方", url: "https://vimeo.com/1138107234/a4c4c56b70" },
  デザイン見比べ: { label: "パリッとしたデザインとのぺっとしたデザインを見比べ", url: "https://vimeo.com/1138111255/096c84ee96" },
  立ち上げ準備まとめ: { label: "フェーズ：立ち上げ準備をまとめた動画", url: "https://vimeo.com/1139206257/79d0cd9aed" },
  マスタ全体見方: { label: "マーケ責任者マニュアル 全体的な見方と活用の仕方", url: "https://vimeo.com/1139207678/8846525948" },
  撮影前フェーズ解説: { label: "【撮影前】フェーズの項目を動画で詳細解説", url: "https://vimeo.com/1139210407/d7ca4db0f9" },
  撮影中撮影後解説: { label: "【撮影中】【撮影後】項目を動画で解説", url: "https://vimeo.com/1139214162/2e15c1382c" },
  ローンチ発射解説: { label: "ローンチ発射に向けて 解説", url: "https://vimeo.com/1139217219/80be0ef483" },
  ローンチ開始解説: { label: "ローンチ開始の解説", url: "https://vimeo.com/1139220045/55823b1167" },
  撮影スケジュール表: { label: "撮影スケジュール表フォーマット解説", url: "https://vimeo.com/1139225256/11afeac2e9" },
  タスク表説明: { label: "タスク表の説明動画", url: "https://vimeo.com/1139226295/21db024c59" },

  // --- 追加コンテンツ列 ---
  日報着眼点補足: { label: "【1の補足】日報報告の着眼点について（追加）", url: "https://vimeo.com/1137144829/f7b6f9fa4a" },
  ホルダー棚卸し: { label: "初回ホルダー棚卸しについて", url: "https://vimeo.com/1137149308/116a9fec5e" },
  ファネルシナリオ1話: { label: "【1話】ファネルシナリオを実際の案件で解説", url: "https://vimeo.com/1137164182/579894a160" },
  ファネルシナリオ2話: { label: "【2話】ファネルシナリオを実際の案件で解説", url: "https://vimeo.com/1137172961/3fa70c1101" },
  台本1話解説: { label: "シンニチファネル動画台本1話解説", url: "https://vimeo.com/1137178926/47bd5a6441" },
  台本2話解説: { label: "シンニチファネル動画台本2話解説", url: "https://vimeo.com/1137356297/2b92b246af" },
  台本3話解説: { label: "シンニチファネル動画台本3話解説", url: "https://vimeo.com/1137362736/953f3f23a5" },
  ファネル1話視聴解説: { label: "ファネル1話視聴ページをハピネスサロンで解説", url: "https://vimeo.com/1137373224/9bc2acad05" },
  ファネル23話視聴解説: { label: "ファネル2,3話視聴ページをハピネスサロンで解説", url: "https://vimeo.com/1137375483/f552b5f9c1" },
  個別相談レター解説: { label: "個別相談レターをハピネスサロンで解説", url: "https://vimeo.com/1137376110/d8ad5649d4" },
  オプチャロンチ戦略: { label: "【売上5倍増】初回オプチャロンチ2か月前からの戦略", url: "https://vimeo.com/1137967398/0f269963cf" },
  再販ローンチ考え方: { label: "成功させる再販ローンチの考え方・盛り上げ方", url: "https://vimeo.com/1138074900/b2548ff215" },
  セールスシナリオ共通点: { label: "セールスシナリオの共通点をハピシナリオで解説", url: "https://vimeo.com/1138082108/9130c1a112" },
  テストロンチ活用: { label: "テスト結果を本ロンチに生かす為の考え方・戦略", url: "https://vimeo.com/1141581194/f4e93ab835" },
  プレスリリース: { label: "発射2か月前から準備するプレスリリースについて", url: "https://vimeo.com/1141585108/673bf75742" },
  アップセルシナリオルール: { label: "【超大事！】アップセルシナリオ作成ルールと期日", url: "https://vimeo.com/1141961267/b462b5b1c1" },
  BEローンチティザ戦略: { label: "BE作成後ローンチティザ全体戦略【動画・広告・全体】", url: "https://vimeo.com/1141987131/ec66b7522f" },

  // --- CSV後半セクション（共通マニュアル）---
  レベ勢意識改革: { label: "レベ勢の意識改革", url: "https://vimeo.com/1149809973/27f920c958" },
  初回コミュロンチ接触頻度: { label: "初回無料コミュロンチ 接触頻度", url: "https://vimeo.com/1149821227/2728ddb5a4" },
  ホルダーオプチャ運営: { label: "ホルダーオプチャ運営マインドセット", url: "https://vimeo.com/1148616980/ceb66e91b3" },
  ティザー意図と目的: { label: "ティザーの意図と目的", url: "https://vimeo.com/1149618180/9e6a0c7101" },
  意思決定メンション作法: { label: "意思決定の下処理と統括へのメンション作法", url: "https://vimeo.com/1153110269/c2271d12a1" },
  優先度思考法: { label: "優先度の勘違いが組織を壊す「上司の一言を最優先にする思考法」", url: "https://vimeo.com/1153117296/542a529e67" },
  BAND誘導マーケ: { label: "BAND誘導マーケについて", url: "https://vimeo.com/1154301256/c99fa4fc77" },
  スマイルシステム: { label: "スマイルシステムについて", url: "https://vimeo.com/1157577079/c32a9df542" },
} as const satisfies Record<string, ManualVideo>;

// ============================================================
// フェーズ → タブ マッピング
// ============================================================
const PHASE_TAB_MAP: Record<string, string> = {
  "立ち上げ準備": "立ち上げ準備",
  "ローンチ制作準備キックオフMTG": "立ち上げ準備",
  "宮さんとすり合わせ": "立ち上げ準備",
  "ローンチ台本作成": "ローンチ台本作成",
  "ティザー台本作成": "ローンチ台本作成",
  "デザイナー依頼": "ローンチ台本作成",
  "UP企画": "ローンチ台本作成",
  "UP台本": "ローンチ台本作成",
  "撮影前": "撮影前",
  "撮影本番": "撮影前",
  "撮影後": "撮影前",
  "UP撮影": "撮影前",
  "セールスレター作成": "発射直前",
  "ファネルページ作成": "発射直前",
  "ステップ作成": "発射直前",
  "リッチ作成": "発射直前",
  "ローンチ発射に向けて": "発射直前",
  "配信準備": "発射直前",
  "営業連携": "発射直前",
  "ローンチ開始": "販売開始",
  "UP発射": "販売開始",
  "再販準備": "販売開始",
  "再販実行": "販売開始",
  "FEエバー化": "販売開始",
  "ＦＥエバー化": "販売開始",
};

export const PHASE_TABS = [
  "立ち上げ準備",
  "ローンチ台本作成",
  "撮影前",
  "発射直前",
  "販売開始",
] as const;

export type PhaseTab = (typeof PHASE_TABS)[number];

function toTab(phase: string): string {
  return PHASE_TAB_MAP[phase] ?? "立ち上げ準備";
}

type RawTask = {
  phase: string; task: string; due: string; dept: string; days: number;
  videos?: ManualVideo[];
  isManualLink?: boolean;
  linkedTo?: string;
};

// ============================================================
// 新規FE タスク（動画URLをCSVから正確にマッピング）
// ============================================================
const FE_TASKS_RAW: RawTask[] = [
  // ── 立ち上げ準備 ──
  { phase: "立ち上げ準備", task: "チャット3つ作成（統括・Pサブ・ホルダ依頼）", due: "2026-03-12", dept: "責任者", days: 1,
    videos: [V.マスタ全体見方, V.意思決定メンション作法] },
  { phase: "立ち上げ準備", task: "関係者アサイン（統括勢・決済チーム）", due: "2026-03-12", dept: "責任者", days: 1,
    videos: [V.立ち上げ準備まとめ] },
  { phase: "立ち上げ準備", task: "マスタ管理簿作成、権限付与", due: "2026-03-12", dept: "サブ", days: 0,
    videos: [V.タスク表説明] },
  { phase: "立ち上げ準備", task: "契約書締結", due: "2026-03-19", dept: "責任者", days: 5,
    videos: [V.外部協業注意点] },
  { phase: "立ち上げ準備", task: "ヒアリングシートをホルダーへ記入依頼", due: "2026-03-19", dept: "責任者", days: 5,
    videos: [V.ホルダー棚卸し, V.ホルダーオプチャ運営] },
  { phase: "立ち上げ準備", task: "ヒアリングシートを元に方向性検討", due: "2026-03-22", dept: "責任者", days: 3,
    videos: [V.キャラ解像度, V.ホルダー棚卸し] },
  { phase: "立ち上げ準備", task: "決済関係の必要物をホルダーへ案内", due: "2026-03-17", dept: "決済チーム", days: 3 },

  // ── ローンチ制作準備キックオフMTG ──
  { phase: "ローンチ制作準備キックオフMTG", task: "キックオフMTG実施", due: "2026-03-22", dept: "責任者", days: 1,
    videos: [V.立ち上げ準備まとめ, V.ホルダー棚卸し, V.優先度思考法] },
  { phase: "ローンチ制作準備キックオフMTG", task: "コンセプト・ブランディング・オファー全体像決定", due: "2026-03-22", dept: "責任者", days: 1,
    videos: [V.キャラ解像度, V.ファネルヘッド方向性] },
  { phase: "ローンチ制作準備キックオフMTG", task: "シナリオ作成期日確定", due: "2026-03-22", dept: "責任者", days: 1,
    videos: [V.タスク表説明] },
  { phase: "ローンチ制作準備キックオフMTG", task: "実績者・撮影日・スタジオ選定", due: "2026-03-22", dept: "責任者", days: 1,
    videos: [V.撮影前フェーズ解説] },
  { phase: "ローンチ制作準備キックオフMTG", task: "デザイナー・編集者・撮影同行者スケ確保", due: "2026-03-22", dept: "責任者", days: 1,
    videos: [V.撮影スケジュール表] },
  { phase: "ローンチ制作準備キックオフMTG", task: "動画部署ティザー開始日確定", due: "2026-03-22", dept: "責任者", days: 1,
    videos: [V.ティザー意図と目的] },
  { phase: "ローンチ制作準備キックオフMTG", task: "権威性を決め完成日を決める", due: "2026-03-22", dept: "責任者", days: 1,
    videos: [V.権威性社会的証明, V.権威性ひねりだし] },

  // ── ローンチ台本作成 ──
  { phase: "ローンチ台本作成", task: "総合シート作成、案件ドライブ作成、権限付与", due: "2026-03-23", dept: "プロモーター", days: 1,
    videos: [V.マスタ全体見方] },
  { phase: "ローンチ台本作成", task: "マインドマップ作成をプロモーターへ依頼", due: "2026-03-27", dept: "責任者", days: 4 },
  { phase: "ローンチ台本作成", task: "シナリオの要素をフィアナシナリオで学習", due: "2026-03-24", dept: "責任者", days: 2,
    videos: [V.台本1話解説, V.台本2話解説, V.台本3話解説, V.ファネルシナリオ1話, V.ファネルシナリオ2話] },
  { phase: "ローンチ台本作成", task: "シナリオ作成（第1話〜第3話、FEセールス）", due: "2026-04-16", dept: "プロモーター", days: 20,
    videos: [V.台本1話解説, V.台本2話解説, V.台本3話解説, V.セールスシナリオ共通点] },
  { phase: "ローンチ台本作成", task: "シナリオチェック（チェックリスト）修正込み", due: "2026-04-21", dept: "責任者", days: 5,
    videos: [V.台本1話解説, V.台本2話解説, V.台本3話解説] },
  { phase: "ティザー台本作成", task: "ティザー動画の台本作成", due: "2026-04-26", dept: "プロモーター", days: 5,
    videos: [V.ティザー意図と目的, V.オプチャロンチ戦略, V.BEローンチティザ戦略] },
  { phase: "デザイナー依頼", task: "FVデザイン・決済ページをデザイナー依頼", due: "2026-03-30", dept: "デザイナー", days: 7,
    videos: [V.デザイン見比べ, V.ファネルヘッド方向性] },

  // ── 撮影前 ──
  { phase: "撮影前", task: "撮影日の最終チェック", due: "2026-04-11", dept: "責任者", days: 3,
    videos: [V.撮影前フェーズ解説, V.撮影スケジュール表] },
  { phase: "撮影前", task: "会場予約の最終チェック", due: "2026-04-11", dept: "責任者", days: 3,
    videos: [V.撮影前フェーズ解説] },
  { phase: "撮影前", task: "カメラマン・TOMIさん・インタビュアー・実績者アサインチェック", due: "2026-04-11", dept: "広告部署", days: 1,
    videos: [V.撮影前フェーズ解説] },
  { phase: "撮影前", task: "シナリオ第1話と第2話を広告部署へ共有", due: "2026-04-17", dept: "広告部署", days: 1,
    videos: [V.CW数値報告の見方] },
  { phase: "撮影前", task: "LPのFVを広告部署へ共有", due: "2026-04-24", dept: "責任者", days: 0,
    videos: [V.ファネルヘッド方向性, V.デザイン見比べ] },
  { phase: "撮影前", task: "小道具・服装を出演者全員に伝える", due: "2026-04-21", dept: "責任者", days: 1,
    videos: [V.小道具確認] },
  { phase: "撮影前", task: "出演者全員に台本を共有", due: "2026-04-28", dept: "責任者", days: 0,
    videos: [V.撮影前フェーズ解説] },
  { phase: "撮影前", task: "撮影前日か初日に親睦会", due: "2026-05-02", dept: "", days: 0 },
  { phase: "撮影前", task: "撮影スケジュール表の作成", due: "2026-04-21", dept: "責任者", days: 1,
    videos: [V.撮影スケジュール表] },

  // ── 撮影本番・撮影後 ──
  { phase: "撮影本番", task: "ダイジェスト撮影場所の想定＆指示出し", due: "2026-05-01", dept: "責任者", days: 3,
    videos: [V.撮影中撮影後解説] },
  { phase: "撮影後", task: "動画編集スケジュール確認", due: "2026-05-01", dept: "責任者", days: 1,
    videos: [V.撮影中撮影後解説] },
  { phase: "撮影後", task: "ホルダーの人柄を各部署に連携", due: "", dept: "責任者", days: 0,
    videos: [V.キャラ解像度] },
  { phase: "撮影後", task: "発射日の確定", due: "2026-05-01", dept: "責任者", days: 0,
    videos: [V.撮影中撮影後解説] },
  { phase: "撮影後", task: "ティザー・オプチャフローチャート作成", due: "2026-05-06", dept: "責任者", days: 3,
    videos: [V.ティザー意図と目的, V.初回コミュロンチ接触頻度] },
  { phase: "撮影後", task: "動画納品", due: "2026-05-29", dept: "", days: 28,
    videos: [V.撮影中撮影後解説] },

  // ── 発射直前：セールスレター ──
  { phase: "セールスレター作成", task: "セールスレター解説動画を視聴", due: "2026-05-07", dept: "責任者", days: 0,
    videos: [V.個別相談レター解説] },
  { phase: "セールスレター作成", task: "セールスレター作成", due: "2026-05-14", dept: "プロモーター", days: 7,
    videos: [V.個別相談レター解説, V.ファネルヘッド方向性] },
  { phase: "セールスレター作成", task: "セールスレターのデザイン", due: "2026-05-21", dept: "デザイナー", days: 7,
    videos: [V.デザイン見比べ] },

  // ── 発射直前：ファネルページ ──
  { phase: "ファネルページ作成", task: "ファネルページ解説動画を視聴", due: "2026-05-14", dept: "責任者", days: 1,
    videos: [V.ファネル1話視聴解説, V.ファネル23話視聴解説, V.ファネルシナリオ1話, V.ファネルシナリオ2話] },
  { phase: "ファネルページ作成", task: "ファネルページ作成", due: "2026-05-24", dept: "プロモーター", days: 10,
    videos: [V.ファネル1話視聴解説, V.ファネル23話視聴解説, V.ファネルヘッド方向性] },
  { phase: "ファネルページ作成", task: "ファネル文面チェック（責任者・広告部署）", due: "2026-05-27", dept: "責任者", days: 3,
    videos: [V.ファネル1話視聴解説, V.ファネル23話視聴解説] },
  { phase: "ファネルページ作成", task: "ファネルページのデザイン", due: "2026-06-03", dept: "デザイナー", days: 7,
    videos: [V.デザイン見比べ, V.ファネルヘッド方向性] },

  // ── 発射直前：ステップ・リッチ ──
  { phase: "ステップ作成", task: "ステップ学習（フィアナを元に）", due: "2026-05-27", dept: "責任者", days: 1,
    videos: [V.セールスシナリオ共通点, V.週報配信の考え方] },
  { phase: "ステップ作成", task: "ステップの作成", due: "2026-06-06", dept: "プロモーター", days: 10,
    videos: [V.セールスシナリオ共通点] },
  { phase: "ステップ作成", task: "ステップの設置", due: "", dept: "サブ", days: 0 },
  { phase: "リッチ作成", task: "リッチ画像の作成", due: "2026-06-16", dept: "デザイナー", days: 10,
    videos: [V.デザイン見比べ] },
  { phase: "リッチ作成", task: "リッチメニューの作成", due: "2026-06-19", dept: "デザイナー", days: 3,
    videos: [V.デザイン見比べ] },
  { phase: "リッチ作成", task: "リッチメニューの設置", due: "", dept: "サブ", days: 3 },

  // ── 発射直前：ローンチ発射に向けて ──
  { phase: "ローンチ発射に向けて", task: "無料オプチャの盛り上げ", due: "2026-05-26", dept: "責任者", days: 0,
    videos: [V.オプチャロンチ戦略, V.初回コミュロンチ接触頻度, V.BAND誘導マーケ] },
  { phase: "ローンチ発射に向けて", task: "Amazon電子書籍出版してNo1を総なめ", due: "2026-05-11", dept: "責任者", days: 0 },
  { phase: "ローンチ発射に向けて", task: "PR Timesプレスリリース申請", due: "2026-05-11", dept: "ホルダー", days: 0,
    videos: [V.プレスリリース] },
  { phase: "ローンチ発射に向けて", task: "決済の準備確認", due: "2026-05-11", dept: "決済チーム", days: 0 },
  { phase: "ローンチ発射に向けて", task: "クローザーへ商品の落とし込み", due: "2026-05-26", dept: "営業リーダー", days: 0,
    videos: [V.面談予約1週間以上] },
  { phase: "ローンチ発射に向けて", task: "クラウドサインの準備", due: "2026-05-26", dept: "ホルダー", days: 0 },
  { phase: "ローンチ発射に向けて", task: "購入後の導線チェック", due: "2026-06-05", dept: "責任者＆ホルダー", days: 0,
    videos: [V.ローンチ発射解説] },
  { phase: "ローンチ発射に向けて", task: "全部署統括MTG＆落とし込み", due: "2026-07-03", dept: "責任者", days: 0,
    videos: [V.ローンチ発射解説, V.優先度思考法, V.意思決定メンション作法] },
  { phase: "ローンチ発射に向けて", task: "購入者ラベル付けクローザー共有", due: "2026-07-03", dept: "クローザー", days: 0 },

  // ── 販売開始 ──
  { phase: "ローンチ開始", task: "ファネルのコメントチェック＆返信", due: "", dept: "CS", days: 0,
    videos: [V.ローンチ開始解説, V.代表佐々木チャット] },
  { phase: "ローンチ開始", task: "顧客の声・買わない理由の収集", due: "2026-07-10", dept: "P", days: 0,
    videos: [V.ローンチ開始解説, V.VSL教育の濃度] },
  { phase: "ローンチ開始", task: "顧客の声をファネルや配信・レターに反映", due: "", dept: "責任者", days: 0,
    videos: [V.ローンチ開始解説, V.週報配信の考え方] },
  { phase: "ローンチ開始", task: "販売ライブLP配信タイミング決定", due: "", dept: "サブ", days: 0,
    videos: [V.ローンチ開始解説] },
  { phase: "ローンチ開始", task: "アーカイブ配信", due: "2026-07-11", dept: "サブ", days: 0,
    videos: [V.ローンチ開始解説] },
  { phase: "ローンチ開始", task: "オプト数・配信数・クリック率を毎日報告", due: "", dept: "サブ", days: 0,
    videos: [V.日報報告の着眼点, V.日報着眼点補足, V.CW数値報告の見方] },
  { phase: "ローンチ開始", task: "オプチャ監視（販売ライブ後）", due: "", dept: "クローザー", days: 0,
    videos: [V.ローンチ開始解説] },

  // ── マニュアル紐付けタスク ──
  { phase: "立ち上げ準備", task: "② 批判記事対応", due: "", dept: "", days: 0,
    isManualLink: true, linkedTo: "チャット3つ作成（統括・Pサブ・ホルダ依頼）" },
  { phase: "撮影前", task: "① 撮影データ受け取り", due: "", dept: "", days: 0,
    isManualLink: true, linkedTo: "撮影日の最終チェック" },
  { phase: "立ち上げ準備", task: "③ 初回経費ルール", due: "", dept: "", days: 0,
    isManualLink: true, linkedTo: "契約書締結" },
];

// ============================================================
// アップセル タスク
// ============================================================
const UP_TASKS_RAW: RawTask[] = [
  { phase: "UP企画", task: "BEコンセプト・オファー決定", due: "2026-05-27", dept: "", days: 0,
    videos: [V.アップセルシナリオルール, V.BEローンチティザ戦略] },
  { phase: "UP企画", task: "宮さんとすり合わせ", due: "2026-05-30", dept: "", days: 0 },
  { phase: "UP台本", task: "動画台本作成（第1話〜第3話）", due: "2026-06-01", dept: "", days: 21,
    videos: [V.アップセルシナリオルール, V.台本1話解説, V.台本2話解説, V.台本3話解説] },
  { phase: "UP台本", task: "台本チェック（責任者）", due: "2026-06-22", dept: "", days: 3,
    videos: [V.アップセルシナリオルール] },
  { phase: "UP撮影", task: "撮影スケジュール調整", due: "2026-06-23", dept: "", days: 0,
    videos: [V.撮影スケジュール表] },
  { phase: "UP撮影", task: "動画撮影（本番）", due: "2026-07-01", dept: "", days: 0,
    videos: [V.撮影中撮影後解説] },
  { phase: "UP撮影", task: "動画編集（簡易編集）", due: "2026-07-02", dept: "", days: 0,
    videos: [V.撮影中撮影後解説] },
  { phase: "UP撮影", task: "セールスレター（LP）原稿作成", due: "2026-06-26", dept: "", days: 7,
    videos: [V.個別相談レター解説, V.ファネルヘッド方向性] },
  { phase: "UP撮影", task: "レターチェック", due: "2026-07-03", dept: "", days: 2,
    videos: [V.個別相談レター解説] },
  { phase: "UP撮影", task: "レターデザイン依頼", due: "2026-07-05", dept: "", days: 0,
    videos: [V.デザイン見比べ] },
  { phase: "UP撮影", task: "デザイン納品・実装", due: "2026-07-06", dept: "", days: 7,
    videos: [V.デザイン見比べ] },
  { phase: "UP撮影", task: "ファネルページ原稿作成", due: "2026-07-06", dept: "", days: 3,
    videos: [V.ファネル1話視聴解説, V.ファネル23話視聴解説] },
  { phase: "UP撮影", task: "ファネルチェック", due: "2026-07-09", dept: "", days: 0,
    videos: [V.ファネル1話視聴解説] },
  { phase: "UP撮影", task: "ファネルデザイン依頼", due: "2026-07-10", dept: "", days: 7,
    videos: [V.デザイン見比べ] },
  { phase: "UP撮影", task: "ファネル納品実装", due: "2026-07-18", dept: "", days: 0 },
  { phase: "UP撮影", task: "販売ライブリンク・サムネ依頼", due: "2026-07-11", dept: "", days: 0,
    videos: [V.デザイン見比べ] },
  { phase: "UP撮影", task: "販売ライブリンク・サムネ納品", due: "2026-07-16", dept: "", days: 0 },
  { phase: "配信準備", task: "ステップメール原稿作成", due: "2026-07-11", dept: "", days: 5,
    videos: [V.セールスシナリオ共通点, V.週報配信の考え方] },
  { phase: "配信準備", task: "ステップチェック", due: "2026-07-16", dept: "", days: 2,
    videos: [V.セールスシナリオ共通点] },
  { phase: "配信準備", task: "リッチ画像依頼", due: "2026-07-18", dept: "", days: 1,
    videos: [V.デザイン見比べ] },
  { phase: "配信準備", task: "リッチメニュー画像納品", due: "2026-07-21", dept: "", days: 3 },
  { phase: "配信準備", task: "ステップ設置・配信設定", due: "2026-07-24", dept: "", days: 3 },
  { phase: "配信準備", task: "制作物完全納期", due: "2026-07-27", dept: "", days: 0 },
  { phase: "営業連携", task: "クローザー商品共有資料作成", due: "2026-07-27", dept: "", days: 0,
    videos: [V.面談予約1週間以上] },
  { phase: "営業連携", task: "クローザー商品共有MTG", due: "2026-07-31", dept: "", days: 0,
    videos: [V.面談予約1週間以上] },
  { phase: "UP発射", task: "販売開始（オファー解禁）", due: "2026-08-10", dept: "", days: 0,
    videos: [V.ローンチ開始解説] },
  { phase: "UP発射", task: "日次数値報告（営業・マーケ）", due: "", dept: "", days: 0,
    videos: [V.日報報告の着眼点, V.日報着眼点補足, V.CW数値報告の見方] },
  { phase: "UP発射", task: "最終〆切リマインド配信", due: "", dept: "", days: 0 },
  { phase: "UP発射", task: "販売終了・リンク封鎖", due: "", dept: "", days: 0 },
];

// ============================================================
// 動画コンテンツ タスク（学習タスク）
// ============================================================
const VIDEO_TASKS_RAW: RawTask[] = [
  { phase: "立ち上げ準備", task: "ホルダーの棚卸しする際に意識すること（動画学習）", due: "", dept: "責任者", days: 0,
    videos: [V.ホルダー棚卸し, V.キャラ解像度] },
  { phase: "立ち上げ準備", task: "ブランディング、コンセプトの考え方・決め方（動画学習）", due: "", dept: "責任者", days: 0,
    videos: [V.キャラ解像度, V.ファネルヘッド方向性, V.権威性社会的証明, V.権威性ひねりだし] },
  { phase: "ローンチ台本作成", task: "シナリオの基礎基本（動画学習）", due: "", dept: "責任者", days: 0,
    videos: [V.台本1話解説, V.台本2話解説, V.台本3話解説, V.ファネルシナリオ1話, V.ファネルシナリオ2話] },
  { phase: "ローンチ台本作成", task: "ファネルページの基礎基本（動画学習）", due: "", dept: "責任者", days: 0,
    videos: [V.ファネル1話視聴解説, V.ファネル23話視聴解説, V.ファネルヘッド方向性] },
  { phase: "ローンチ台本作成", task: "セールスレターの基礎基本（動画学習）", due: "", dept: "責任者", days: 0,
    videos: [V.個別相談レター解説, V.ファネルヘッド方向性] },
  { phase: "ローンチ台本作成", task: "ステップの基礎基本（動画学習）", due: "", dept: "責任者", days: 0,
    videos: [V.セールスシナリオ共通点, V.週報配信の考え方] },
  { phase: "ローンチ台本作成", task: "売上を最大化させる初回ローンチのティザーの考え方（動画学習）", due: "", dept: "責任者", days: 0,
    videos: [V.オプチャロンチ戦略, V.再販ローンチ考え方, V.ティザー意図と目的, V.BEローンチティザ戦略] },
  { phase: "撮影前", task: "フェーズ：立ち上げ準備をまとめた動画（撮影）", due: "", dept: "動画部署", days: 0,
    videos: [V.立ち上げ準備まとめ] },
  { phase: "撮影前", task: "撮影前フェーズの項目を動画で解説（撮影）", due: "", dept: "動画部署", days: 0,
    videos: [V.撮影前フェーズ解説, V.小道具確認] },
  { phase: "撮影前", task: "撮影中・撮影後項目を動画で解説（撮影）", due: "", dept: "動画部署", days: 0,
    videos: [V.撮影中撮影後解説] },
  { phase: "ローンチ発射に向けて", task: "ローンチ開始の解説動画", due: "", dept: "動画部署", days: 0,
    videos: [V.ローンチ開始解説, V.ローンチ発射解説] },
  { phase: "ローンチ発射に向けて", task: "撮影スケジュール表フォーマット解説", due: "", dept: "動画部署", days: 0,
    videos: [V.撮影スケジュール表] },
  { phase: "ローンチ発射に向けて", task: "タスク表の説明動画", due: "", dept: "動画部署", days: 0,
    videos: [V.タスク表説明, V.マスタ全体見方] },
  // 追加学習コンテンツ（CSV後半セクション）
  { phase: "立ち上げ準備", task: "レベ勢の意識改革（動画学習）", due: "", dept: "責任者・P", days: 0,
    videos: [V.レベ勢意識改革] },
  { phase: "立ち上げ準備", task: "意思決定の下処理と統括へのメンション作法（動画学習）", due: "", dept: "全員", days: 0,
    videos: [V.意思決定メンション作法] },
  { phase: "立ち上げ準備", task: "優先度の勘違いが組織を壊す（動画学習）", due: "", dept: "全員", days: 0,
    videos: [V.優先度思考法] },
  { phase: "ローンチ発射に向けて", task: "初回無料コミュロンチ接触頻度（動画学習）", due: "", dept: "責任者・ホルダー・P", days: 0,
    videos: [V.初回コミュロンチ接触頻度] },
  { phase: "ローンチ発射に向けて", task: "ホルダーオプチャ運営マインドセット（動画学習）", due: "", dept: "責任者・ホルダー", days: 0,
    videos: [V.ホルダーオプチャ運営] },
  { phase: "ローンチ発射に向けて", task: "ティザーの意図と目的（動画学習）", due: "", dept: "責任者", days: 0,
    videos: [V.ティザー意図と目的] },
  { phase: "ローンチ発射に向けて", task: "テスト結果を本ロンチに生かす戦略（動画学習）", due: "", dept: "責任者", days: 0,
    videos: [V.テストロンチ活用] },
  { phase: "ローンチ発射に向けて", task: "BAND誘導マーケについて（動画学習）", due: "", dept: "責任者", days: 0,
    videos: [V.BAND誘導マーケ] },
  { phase: "ローンチ発射に向けて", task: "スマイルシステムについて（動画学習）", due: "", dept: "責任者", days: 0,
    videos: [V.スマイルシステム] },
];

// ============================================================
// オフセット計算ヘルパー
// ============================================================
const ORIG_FE_LAUNCH = "2026-07-10";
const ORIG_UP_LAUNCH = "2026-08-10";

function daysDiff(from: string, to: string): number {
  return Math.round((new Date(to).getTime() - new Date(from).getTime()) / 86400000);
}

function addDaysUtil(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

// ============================================================
// ビルダー
// ============================================================
function buildTasks(
  project: "新競艇" | "新競馬",
  raw: RawTask[],
  category: WbsTask["category"],
  idPrefix: string,
  launchRef: "fe" | "upsell",
): WbsTask[] {
  const origLaunch = launchRef === "upsell" ? ORIG_UP_LAUNCH : ORIG_FE_LAUNCH;
  return raw
    .filter(r => r.task.trim() !== "")
    .map((r, i) => ({
      id: `${project}-${idPrefix}-${i}`,
      project,
      category,
      phase: r.phase,
      phaseTab: toTab(r.phase),
      task: r.task,
      dueDate: r.due,
      department: r.dept,
      workDays: r.days,
      done: false,
      memo: "",
      videos: r.videos ?? [],
      offsetFromLaunch: r.due ? daysDiff(r.due, origLaunch) : null,
      launchRef,
      ...(r.isManualLink ? { isManualLink: true, linkedTo: r.linkedTo } : {}),
    }));
}

function generateAllTasks(): WbsTask[] {
  const tasks: WbsTask[] = [];
  for (const proj of ["新競艇", "新競馬"] as const) {
    tasks.push(...buildTasks(proj, FE_TASKS_RAW, "新規FE", "fe", "fe"));
    tasks.push(...buildTasks(proj, UP_TASKS_RAW, "アップセル", "up", "upsell"));
    tasks.push(...buildTasks(proj, VIDEO_TASKS_RAW, "動画コンテンツ", "vid", "fe"));
  }
  return tasks;
}

export const WBS_ALL_TASKS: WbsTask[] = generateAllTasks();

export const WBS_PROJECTS = ["新競艇", "新競馬"] as const;
export type WbsProject = (typeof WBS_PROJECTS)[number];

export const WBS_PROJECT_COLORS: Record<string, string> = {
  "新競艇": "#4f8ff7",
  "新競馬": "#fbbf24",
};

// CSVから: FE目標発射日 2026/07/10, アップセル目標発射日 2026/08/10
export const WBS_LAUNCH_DATES: Record<string, { fe: string; upsell: string }> = {
  "新競艇": { fe: "2026-07-10", upsell: "2026-08-10" },
  "新競馬": { fe: "2026-07-10", upsell: "2026-08-10" },
};

// ============================================================
// 発射日変更 → 全タスク期日の逆算再計算
// ============================================================
export function recalcTaskDates(
  tasks: WbsTask[],
  project: WbsProject,
  feLaunch: string,
  upLaunch: string,
): WbsTask[] {
  // 第1パス: 通常タスクの期日を逆算
  let updated = tasks.map(t => {
    if (t.project !== project) return t;
    if (t.isManualLink) return t; // 第2パスで処理
    if (t.offsetFromLaunch === null) return t;
    const ref = t.launchRef === "upsell" ? upLaunch : feLaunch;
    if (!ref) return { ...t, dueDate: "" };
    return { ...t, dueDate: addDaysUtil(ref, -t.offsetFromLaunch) };
  });

  // 第2パス: マニュアル紐付けタスクの期日を解決
  updated = updated.map(t => {
    if (t.project !== project || !t.isManualLink || !t.linkedTo) return t;
    const linked = updated.find(
      u => u.project === project && u.task === t.linkedTo && !u.isManualLink,
    );
    return { ...t, dueDate: linked?.dueDate ?? "" };
  });

  return updated;
}

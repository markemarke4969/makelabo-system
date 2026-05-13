// ============================================================
// PR#2-C: 副業診断 結果ページ ティザー化ユーティリティ
// ============================================================
// 結果ページ(matching/result/page.tsx)の AI 3 セクション(strengthSection /
// animalSection / riskSection)を「冒頭 1 段落 + 末尾フェードアウト +
// 続きは LINE で」のティザー表示に切り替える。
//
// 構想第14章「結果ページ=ティザー、LINE=フル版」の実装層。
// DB スキーマ・API・LINE 配信には一切影響しない(表示時の slice のみ)。
//
// フィーチャーフラグ:
//   - NEXT_PUBLIC_MATCHING_RESULT_TEASER=off で強制 OFF(フル本文表示)
//   - URL クエリ ?fulltext=1 でユーザー単位の強制 OFF
//   - 未設定 or "on" でティザー有効(本番デフォルト)
//
// 注:NEXT_PUBLIC_* はビルド時固定のため、env 変更だけでは反映されない。
//   緊急ロールバックは git revert を推奨。
// ============================================================

// ティザーで表示する段落数。本番運用後のフィードバック次第で 2 に上げる調整は
// この定数の変更のみで完結する。
export const TEASER_PARAGRAPH_COUNT = 1;

/**
 * 結果ページのティザー表示が有効か判定する。
 * クライアントサイド(URL クエリ参照)を含むので useTeaserEnabled は React Hook
 * ではなく純粋関数として扱う(SSR 時は env のみで判定、クライアント側 hydration
 * 後は URL クエリも考慮)。
 */
export function isTeaserEnabled(): boolean {
  const env = process.env.NEXT_PUBLIC_MATCHING_RESULT_TEASER;
  // env === "off" なら強制 OFF
  if (env === "off") return false;
  // URL クエリ ?fulltext=1 で強制 OFF(クライアントサイドのみ)
  if (typeof window !== "undefined") {
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get("fulltext") === "1") return false;
    } catch {
      // URL parse 失敗時はティザー有効(安全側)
    }
  }
  return true;
}

/**
 * AI セクション本文(段落区切り \n\n)を段落配列に分割。
 * ティザー有効時は冒頭 TEASER_PARAGRAPH_COUNT 段落だけ返す。
 *
 * Edge case:
 *   - 段落数が TEASER_PARAGRAPH_COUNT 以下のとき:全文を返す
 *     (ティザー目的を満たさない、フォールバック)
 *   - 空文字 / null:空配列を返す
 */
export interface SectionSplitResult {
  paragraphs: string[];
  /** ティザー化により切り捨てられた段落が存在するか */
  truncated: boolean;
}

export function splitSectionForDisplay(
  section: string | null | undefined,
  teaserEnabled: boolean,
): SectionSplitResult {
  if (!section) return { paragraphs: [], truncated: false };
  const all = section.split("\n\n").filter((p) => p.trim().length > 0);
  if (!teaserEnabled) {
    return { paragraphs: all, truncated: false };
  }
  if (all.length <= TEASER_PARAGRAPH_COUNT) {
    // 段落数が足りない(prompt 不遵守の稀ケース)→ 全文表示にフォールバック
    return { paragraphs: all, truncated: false };
  }
  return {
    paragraphs: all.slice(0, TEASER_PARAGRAPH_COUNT),
    truncated: true,
  };
}

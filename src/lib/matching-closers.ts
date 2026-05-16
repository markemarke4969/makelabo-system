// PR#3-C: クローザー名マスタ取得ユーティリティ(クライアント側 fetch)
// GET /api/matching/closers を呼んで active=true 行を返す。

export interface Closer {
  id: string;
  name: string;
  company: string | null;
  sort_order: number;
}

export async function fetchClosers(): Promise<Closer[]> {
  try {
    const resp = await fetch("/api/matching/closers");
    if (!resp.ok) return [];
    const data = (await resp.json()) as Closer[];
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

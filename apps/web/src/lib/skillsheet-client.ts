/**
 * スキルシート取得クライアント（ブラウザ側）。
 *
 * 認証は HttpOnly session cookie を使うため、閲覧コードは保存しない。
 * GitHub トークンや DB 接続情報は Route Handler のサーバ側だけで扱う。
 */
export class AuthError extends Error {
  constructor() {
    super('Unauthorized');
    this.name = 'AuthError';
  }
}

export interface SheetMeta {
  path: string;
  title: string;
  sha: string;
}

export interface SkillSheetContent {
  title: string;
  content: string;
  sha?: string;
  lastModified?: string;
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    credentials: 'include',
    headers: { Accept: 'application/json' },
  });

  if (res.status === 401) throw new AuthError();
  if (!res.ok) throw new Error(`${url} returned ${res.status}`);
  return (await res.json()) as T;
}

export async function listSheets(): Promise<SheetMeta[]> {
  return fetchJson<SheetMeta[]>('/api/sheets');
}

export async function fetchSheet(path: string): Promise<SkillSheetContent> {
  const params = new URLSearchParams({ path });
  const data = await fetchJson<SkillSheetContent>(`/api/sheets/content?${params.toString()}`);
  if (typeof data.content !== 'string' || data.content.length === 0) {
    throw new Error('/api/sheets/content returned empty content');
  }
  return data;
}

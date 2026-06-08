/**
 * スキルシート取得クライアント（ブラウザ側）。
 *
 * 正本は NeonDB。Route Handler `/api/skillsheet` がサーバ側で DB 読み取り＋
 * （DB 未設定/失敗時は）GitHub ソースへのフォールバックまで担う。GitHub トークンは
 * サーバ側のみで扱い、ブラウザには一切露出しない。
 *
 * 閲覧コードは sessionStorage 経由で受け取り、`x-viewer-code` ヘッダでサーバ認可を通す。
 */
export interface SkillSheetContent {
  title: string;
  content: string;
}

export async function fetchSkillSheet(viewerCode?: string): Promise<SkillSheetContent> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (viewerCode) headers['x-viewer-code'] = viewerCode;

  const res = await fetch('/api/skillsheet', { headers });
  if (!res.ok) throw new Error(`/api/skillsheet returned ${res.status}`);

  const data = (await res.json()) as { title?: string; content?: string };
  if (typeof data.content !== 'string' || data.content.length === 0) {
    throw new Error('/api/skillsheet returned empty content');
  }
  return { title: data.title ?? 'エンジニアスキルシート', content: data.content };
}

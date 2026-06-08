/**
 * スキルシート取得クライアント。
 *
 * 正本は NeonDB（`/api/skillsheet` 経由）。ただし DATABASE_URL 未設定の本番や、
 * `/api` の無いローカル dev では既存の GitHub 直接取得へフォールバックして
 * 表示を止めない（移行期間の安全策）。
 */
import { fetchSkillSheet as fetchSkillSheetFromGitHub } from './github-client';

interface SkillSheetContent {
  content: string;
  source: 'api' | 'github';
}

async function fetchFromApi(): Promise<string> {
  // /view と同じ共有コードでサーバ側認可を通す（無認可の直接GETを防止）
  const headers: Record<string, string> = { Accept: 'application/json' };
  const viewerCode = import.meta.env.VITE_VIEWER_CODE;
  if (viewerCode) headers['x-viewer-code'] = viewerCode;
  const res = await fetch('/api/skillsheet', { headers });
  if (!res.ok) throw new Error(`/api/skillsheet returned ${res.status}`);
  const data = (await res.json()) as { content?: string };
  if (typeof data.content !== 'string' || data.content.length === 0) {
    throw new Error('/api/skillsheet returned empty content');
  }
  return data.content;
}

export async function fetchSkillSheet(): Promise<SkillSheetContent> {
  try {
    return { content: await fetchFromApi(), source: 'api' };
  } catch (apiError) {
    // 本番 env 未設定・ローカル dev 等では GitHub 直接取得へフォールバック
    console.error('skillsheet: falling back to GitHub source:', apiError);
    const data = await fetchSkillSheetFromGitHub();
    return { content: data.content, source: 'github' };
  }
}

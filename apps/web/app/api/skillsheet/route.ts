import { fetchMarkdownFromGitHub, getSkillSheet, TITLE } from '@skillsheet/db';

// DB アクセスを伴うため Node ランタイム・毎リクエスト動的実行（キャッシュさせない）。
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * サーバ側の閲覧認可チェック。
 * VIEWER_CODE（サーバ専用 env）と `x-viewer-code` ヘッダを照合する。
 * VIEWER_CODE 未設定の環境では認可無効とみなしスキップする。
 */
function isAuthorized(req: Request): boolean {
  const code = process.env.VIEWER_CODE ?? process.env.VITE_VIEWER_CODE;
  if (!code) return true;
  return req.headers.get('x-viewer-code') === code;
}

export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const sheet = await getSkillSheet();
    return Response.json(sheet);
  } catch (dbError) {
    // DATABASE_URL 未設定 / DB 到達不可: サーバ側で GitHub ソースへフォールバック（トークン非露出）。
    console.error('GET /api/skillsheet: DB read failed, falling back to GitHub:', dbError);
    try {
      const content = await fetchMarkdownFromGitHub();
      return Response.json({ title: TITLE, content, blocks: [] });
    } catch (githubError) {
      console.error('GET /api/skillsheet: GitHub fallback failed:', githubError);
      return Response.json({ error: 'Failed to load skill sheet' }, { status: 500 });
    }
  }
}

import { toNextJsHandler } from 'better-auth/next-js';

import { getAuth } from '@/lib/auth';

export async function GET(req: Request) {
  return toNextJsHandler(await getAuth()).GET(req);
}

// 本番 token endpoint の 500 原因を特定するため、一時的に内部エラーをレスポンスに含める。
// Issue #331 検証完了後に元に戻す。
export async function POST(req: Request) {
  try {
    return await toNextJsHandler(await getAuth()).POST(req);
  } catch (e) {
    const message = e instanceof Error ? `${e.name}: ${e.message}\n${e.stack ?? ''}` : String(e);
    return new Response(JSON.stringify({ error: 'internal_error', diagnostic: message }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });
  }
}

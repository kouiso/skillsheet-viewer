import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

/**
 * 現在のリクエストパス（+ クエリ）を `x-skillsheet-pathname` ヘッダーへ載せる。
 *
 * Server Component / layout（例: viewer-gate.ts の requireViewer）は Next.js の
 * 標準 API だけでは自分がどの URL で呼ばれたかを知る手段がない
 * （params は自セグメント配下の動的パラメータしか持たず、layout には子の
 * searchParams すら渡らない）。Proxy（旧 middleware）でヘッダーへ焼き込み、
 * next/headers の headers() 経由で読むのが Next.js App Router での定石。
 *
 * `new Headers(request.headers)` で受信ヘッダーを複製したあとに
 * `.set()` で上書きしているため、クライアントが同名ヘッダーを偽装して
 * 送ってきても最終的にはここで計算した値で必ず上書きされる。
 *
 * Next.js 16 で `middleware.ts`（関数名 `middleware`）は非推奨になり、
 * `proxy.ts`（関数名 `proxy`）に置き換わった。
 */
export function middleware(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-skillsheet-pathname', request.nextUrl.pathname + request.nextUrl.search);

  return NextResponse.next({
    request: { headers: requestHeaders },
  });
}

export const config = {
  // 閲覧ゲート（requireViewer）が実際に呼ばれる範囲だけに絞る。
  // /compare は #145 で削除済み（死にコードだった上、DBシートを受け付けなかった）。
  matcher: ['/view/:path*'],
};

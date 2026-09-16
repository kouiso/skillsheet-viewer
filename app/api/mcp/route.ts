import { createMcpRequestHandler } from '@/server/mcp/handler';

export const runtime = 'nodejs';

/**
 * Remote MCP サーバーの唯一のエンドポイント（Issue #305）。
 * ステートレスな POST のみを受け付ける（SSE・GET/DELETE のセッション管理は提供しない）。
 *
 * MCP_ENABLED が有効でない環境、または resource URL を解決できない環境では
 * ハンドラを組み立てず 404 を返す — MCP を無効化しても通常画面・tRPC は影響を受けない。
 */
let handler: Promise<((request: Request) => Promise<Response>) | null> | undefined;

function getHandler(): Promise<((request: Request) => Promise<Response>) | null> {
  handler ??= createMcpRequestHandler();
  return handler;
}

export async function POST(request: Request): Promise<Response> {
  const h = await getHandler();
  if (!h) {
    return new Response('Not Found', { status: 404 });
  }
  return h(request);
}

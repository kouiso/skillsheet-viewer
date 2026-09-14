/**
 * app/api/mcp/route.ts の公開制御テスト（Issue #305, node 環境）。
 * MCP ハンドラが組み立てられない環境では 404、ある環境では委譲する。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/server/mcp/handler', () => ({
  createMcpRequestHandler: vi.fn(),
}));

import { createMcpRequestHandler } from '@/server/mcp/handler';

const post = () =>
  new Request('http://localhost:3106/api/mcp', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  });

describe('POST /api/mcp', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.mocked(createMcpRequestHandler).mockReset();
  });

  it('MCP ハンドラが無い環境（MCP_ENABLED 無効など）では 404', async () => {
    vi.mocked(createMcpRequestHandler).mockReturnValue(null);
    const { POST } = await import('./route');
    const res = await POST(post());
    expect(res.status).toBe(404);
  });

  it('MCP ハンドラがある環境ではリクエストを委譲する', async () => {
    const inner = vi.fn(async () => new Response('mcp-ok', { status: 200 }));
    vi.mocked(createMcpRequestHandler).mockReturnValue(inner);
    const { POST } = await import('./route');
    const res = await POST(post());
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('mcp-ok');
    expect(inner).toHaveBeenCalledTimes(1);
  });
});

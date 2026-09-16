/**
 * POST /api/mcp の認可境界テスト（Issue #305, node 環境）。
 *
 * JWT 署名検証（requireMcpAuth）と認可ディスパッチ（createMcpDispatch）を分離して
 * あるため、ここでは両方を個別に検証する:
 *   - requireMcpAuth 側: トークンなし/不正 → 401 + RFC 9728 チャレンジ
 *   - createMcpDispatch 側: sub 不一致 → 403、スコープ不足 → insufficient_scope、
 *     正常系は MCP ハンドラへ委譲されツール結果が返る
 */
import type { McpHttpHandler } from '@modelcontextprotocol/server';
import { isInsufficientScopeError } from 'better-auth/oauth2';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { listOwnerSheetsMock, getOwnerSheetMock } = vi.hoisted(() => ({
  listOwnerSheetsMock: vi.fn(),
  getOwnerSheetMock: vi.fn(),
}));

vi.mock('@/server/sheet-service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/server/sheet-service')>();
  return {
    ...actual,
    listOwnerSheets: listOwnerSheetsMock,
    getOwnerSheet: getOwnerSheetMock,
  };
});

import { isMcpEnabled } from '@/lib/mcp-config';

import { createMcpDispatch, createMcpRequestHandler, createSkillsheetMcpHandler } from './handler';

const OWNER_ID = 'owner-user-1';
const RESOURCE = 'http://localhost:3106/api/mcp';

function mcpRequest(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request('http://localhost:3106/api/mcp', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      authorization: 'Bearer test-token',
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

function toolsCall(name: string, args: Record<string, unknown> = {}) {
  return { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } };
}

/** SSE レスポンスの data: 行から JSON-RPC メッセージを取り出す。 */
async function readSseJson(res: Response): Promise<Record<string, unknown>> {
  const text = await res.text();
  const dataLine = text.split('\n').find((l) => l.startsWith('data:'));
  expect(dataLine, `SSE data 行が無い: ${text}`).toBeTruthy();
  return JSON.parse((dataLine as string).slice('data:'.length).trim()) as Record<string, unknown>;
}

describe('createMcpDispatch', () => {
  let mcpHandler: McpHttpHandler;
  let dispatch: ReturnType<typeof createMcpDispatch>;

  beforeEach(() => {
    vi.stubEnv('SKILLSHEET_OWNER_ID', OWNER_ID);
    listOwnerSheetsMock.mockReset();
    getOwnerSheetMock.mockReset();
    mcpHandler = createSkillsheetMcpHandler();
    dispatch = createMcpDispatch(mcpHandler, RESOURCE);
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await mcpHandler.close();
  });

  it('token sub がオーナー ID と一致しない場合は 403 を返す', async () => {
    const res = await dispatch(mcpRequest(toolsCall('list_sheets')), {
      sub: 'other-user',
      scope: 'skillsheet:read skillsheet:write',
    });
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ error: 'forbidden' });
  });

  it('スコープ無しの token で読み取りツールを呼ぶと insufficient_scope 例外になる', async () => {
    await expect(dispatch(mcpRequest(toolsCall('list_sheets')), { sub: OWNER_ID, scope: '' })).rejects.toSatisfy(
      isInsufficientScopeError,
    );
  });

  it('skillsheet:read だけの token で書き込みツールを呼ぶと insufficient_scope 例外になる', async () => {
    await expect(
      dispatch(mcpRequest(toolsCall('update_stats', { sheetId: 'x' })), { sub: OWNER_ID, scope: 'skillsheet:read' }),
    ).rejects.toSatisfy(isInsufficientScopeError);
  });

  it('skillsheet:write だけの token で読み取りツールを呼ぶと insufficient_scope 例外になる', async () => {
    // 読み書きスコープは分離する（write が read を包含しない）— Issue #305 の権限分離。
    await expect(
      dispatch(mcpRequest(toolsCall('list_sheets')), { sub: OWNER_ID, scope: 'skillsheet:write' }),
    ).rejects.toSatisfy(isInsufficientScopeError);
  });

  it('バッチ内に権限の無い tools/call が 1 件でもあれば拒否する', async () => {
    const batch = [toolsCall('list_sheets'), toolsCall('add_project_item', { sheetId: 'x' })];
    await expect(dispatch(mcpRequest(batch), { sub: OWNER_ID, scope: 'skillsheet:read' })).rejects.toSatisfy(
      isInsufficientScopeError,
    );
  });

  it('正常系: オーナー + skillsheet:read で list_sheets が実行される', async () => {
    listOwnerSheetsMock.mockResolvedValue([
      { id: 'sheet-1', title: 'エンジニアスキルシート', updatedAt: new Date('2026-01-01T00:00:00Z') },
    ]);
    const res = await dispatch(mcpRequest(toolsCall('list_sheets')), { sub: OWNER_ID, scope: 'skillsheet:read' });
    expect(res.status).toBe(200);
    const msg = await readSseJson(res);
    const result = msg.result as { content: { type: string; text: string }[] };
    expect(result.content[0].text).toContain('sheet-1');
    expect(listOwnerSheetsMock).toHaveBeenCalledTimes(1);
  });

  it('initialize などツール以外のメソッドにはツールスコープを要求しない', async () => {
    const res = await dispatch(
      mcpRequest({
        jsonrpc: '2.0',
        id: 0,
        method: 'initialize',
        params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'test', version: '0' } },
      }),
      { sub: OWNER_ID, scope: 'skillsheet:read' },
    );
    expect(res.status).toBe(200);
    const msg = await readSseJson(res);
    expect(msg.result).toMatchObject({ serverInfo: { name: 'skillsheet-viewer' } });
  });
});

describe('createMcpRequestHandler（MCP 公開制御）', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('MCP_ENABLED 未設定では null を返す（route 側で 404）', () => {
    vi.stubEnv('MCP_ENABLED', '');
    vi.stubEnv('MCP_RESOURCE_URL', RESOURCE);
    expect(createMcpRequestHandler()).toBeNull();
  });

  it('MCP_ENABLED 未設定でも Vercel 本番では有効になる（Issue #331）', () => {
    vi.stubEnv('MCP_ENABLED', undefined as unknown as string);
    vi.stubEnv('VERCEL_ENV', 'production');
    expect(isMcpEnabled()).toBe(true);
  });

  it('Vercel 本番でも MCP_ENABLED=false なら無効のまま', () => {
    vi.stubEnv('MCP_ENABLED', 'false');
    vi.stubEnv('VERCEL_ENV', 'production');
    expect(isMcpEnabled()).toBe(false);
  });

  it('MCP_ENABLED 未設定の preview では無効のまま', () => {
    vi.stubEnv('MCP_ENABLED', undefined as unknown as string);
    vi.stubEnv('VERCEL_ENV', 'preview');
    expect(isMcpEnabled()).toBe(false);
  });

  it('MCP_ENABLED=true でも resource が解決できなければ null を返す', () => {
    vi.stubEnv('MCP_ENABLED', 'true');
    vi.stubEnv('MCP_RESOURCE_URL', '');
    vi.stubEnv('BETTER_AUTH_URL', '');
    expect(createMcpRequestHandler()).toBeNull();
  });
});

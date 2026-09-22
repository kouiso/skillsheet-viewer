/**
 * MCP ツールのエラーマッピングテスト（Issue #305, node 環境）。
 * サービス層の業務エラーが isError 結果・規定コードへ変換されることを、
 * 実際の MCP JSON-RPC 往復（stateless legacy）で確認する。
 */
import type { McpHttpHandler } from '@modelcontextprotocol/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SkillSheetNotFoundError } from '@/db';
import { DocumentError } from '@/db/document-service';

const { updateStatsItemMock } = vi.hoisted(() => ({
  updateStatsItemMock: vi.fn(),
}));

vi.mock('@/server/sheet-service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/server/sheet-service')>();
  return { ...actual, updateStatsItem: updateStatsItemMock };
});

import { createMcpDispatch, createSkillsheetMcpHandler } from './handler';

const OWNER_ID = 'owner-user-1';
const RESOURCE = 'http://localhost:3106/api/mcp';
const SHEET_ID = '11111111-2222-4333-8444-555555555555';

function callTool(name: string, args: Record<string, unknown>) {
  return new Request('http://localhost:3106/api/mcp', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      authorization: 'Bearer test-token',
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }),
  });
}

async function readResult(res: Response): Promise<{ isError?: boolean; content: { text: string }[] }> {
  const text = await res.text();
  const dataLine = text.split('\n').find((l) => l.startsWith('data:'));
  expect(dataLine, `SSE data 行が無い: ${text}`).toBeTruthy();
  const msg = JSON.parse((dataLine as string).slice('data:'.length).trim());
  return msg.result;
}

const OWNER_CLAIMS = { sub: OWNER_ID, scope: 'skillsheet:read skillsheet:write' };

describe('MCP ツールのエラーマッピング', () => {
  let mcpHandler: McpHttpHandler;
  let dispatch: ReturnType<typeof createMcpDispatch>;

  beforeEach(() => {
    vi.stubEnv('SKILLSHEET_OWNER_ID', OWNER_ID);
    updateStatsItemMock.mockReset();
    mcpHandler = createSkillsheetMcpHandler();
    dispatch = createMcpDispatch(mcpHandler, RESOURCE);
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await mcpHandler.close();
  });

  it('SheetServiceError(BAD_REQUEST) は isError + BAD_REQUEST になる', async () => {
    const { SheetServiceError } = await import('@/server/sheet-service');
    updateStatsItemMock.mockRejectedValue(
      new SheetServiceError('BAD_REQUEST', '更新するフィールドが指定されていません'),
    );
    const res = await dispatch(
      callTool('update_stats', {
        sheetId: SHEET_ID,
        index: 0,
        expectedLabel: 'x',
        expectedRevision: '1',
        fields: {},
      }),
      OWNER_CLAIMS,
    );
    const result = await readResult(res);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('BAD_REQUEST');
  });

  it('SkillSheetNotFoundError は isError + NOT_FOUND になる', async () => {
    updateStatsItemMock.mockRejectedValue(new SkillSheetNotFoundError(SHEET_ID));
    const res = await dispatch(
      callTool('update_stats', {
        sheetId: SHEET_ID,
        index: 0,
        expectedLabel: 'x',
        expectedRevision: '1',
        fields: { value: '1' },
      }),
      OWNER_CLAIMS,
    );
    const result = await readResult(res);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('NOT_FOUND');
  });

  it('DocumentError(CONFLICT) は isError + CONFLICT になる', async () => {
    updateStatsItemMock.mockRejectedValue(new DocumentError('CONFLICT'));
    const res = await dispatch(
      callTool('update_stats', {
        sheetId: SHEET_ID,
        index: 0,
        expectedLabel: 'x',
        expectedRevision: '1',
        fields: { value: '1' },
      }),
      OWNER_CLAIMS,
    );
    const result = await readResult(res);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('CONFLICT');
  });

  it('未知ツール名は JSON-RPC エラーで応答する', async () => {
    const res = await dispatch(callTool('no_such_tool', {}), OWNER_CLAIMS);
    const text = await res.text();
    const dataLine = text.split('\n').find((l) => l.startsWith('data:'));
    expect(dataLine, `SSE data 行が無い: ${text}`).toBeTruthy();
    const msg = JSON.parse((dataLine as string).slice('data:'.length).trim());
    // SDK が -32602 (invalid params / tool not found) 等のエラーを返す
    expect(msg.error ?? msg.result?.isError).toBeTruthy();
  });
});

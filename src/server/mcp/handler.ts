// クライアントバンドルに巻き込まれた瞬間にビルドを失敗させる。
import 'server-only';

/**
 * POST /api/mcp のリクエストハンドラ（Issue #305）。
 *
 * 構成: requireMcpAuth（Better Auth の JWT 検証: 署名・iss・aud・exp）の内側で
 *   1. token の sub が SKILLSHEET_OWNER_ID と一致するか確認（不一致は 403）
 *   2. tools/call の対象ツールに必要なスコープを token の scope から確認
 *      （不足は createInsufficientScopeError → 403 insufficient_scope チャレンジ）
 *   3. 検証済み claims を AuthInfo として MCP ハンドラへ引き渡す
 *
 * ステートレス前提（SSE / Redis / MCP セッション保存なし）。createMcpHandler は
 * リクエストごとに新しい McpServer インスタンスを組み立てる。
 */

import { requireMcpAuth } from '@better-auth/mcp';
import { createMcpHandler, type McpHttpHandler, McpServer } from '@modelcontextprotocol/server';

import { getAuth, isMcpOauthReady } from '@/lib/auth';
import { isMcpEnabled, MCP_SCOPES, resolveMcpResource } from '@/lib/mcp-config';

import { d1Auth, isD1Runtime } from '../d1-runtime';
import { createMcpDispatch as createDispatch } from './dispatch';
import { registerSkillsheetTools } from './tool';

/** 既存Node呼出元のowner既定値を保ち、Workerには明示注入も許す。 */
export function createMcpDispatch(
  handler: McpHttpHandler,
  resource: string,
  owner = process.env.SKILLSHEET_OWNER_ID ?? '',
) {
  return createDispatch(handler, resource, owner);
}

/** リクエスト単位で McpServer を組み立てる MCP ハンドラ（ステートレス）。 */
export function createSkillsheetMcpHandler(): McpHttpHandler {
  return createMcpHandler(
    () => {
      const server = new McpServer({ name: 'skillsheet-viewer', version: '1.0.0' });
      registerSkillsheetTools(server);
      return server;
    },
    { legacy: 'stateless' },
  );
}

/**
 * MCP リクエストハンドラを組み立てる。MCP 無効環境・resource 未解決の場合は
 * null を返し、呼び出し側（route.ts）で 404 を返す。
 */
export async function createMcpRequestHandler(): Promise<((request: Request) => Promise<Response>) | null> {
  if (!isMcpEnabled()) return null;
  const resource = resolveMcpResource();
  if (!resource) return null;

  if (isD1Runtime()) return (request) => d1Auth(request);

  const auth = await getAuth();
  // OAuth init に失敗してフォールバックした環境では MCP 経路を立てない。
  if (!isMcpOauthReady()) return null;

  const dispatch = createMcpDispatch(createSkillsheetMcpHandler(), resource);
  return requireMcpAuth(auth, dispatch, { resource, challengeScopes: [...MCP_SCOPES] });
}

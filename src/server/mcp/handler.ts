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
import { type AuthInfo, createMcpHandler, type McpHttpHandler, McpServer } from '@modelcontextprotocol/server';
import { createInsufficientScopeError } from 'better-auth/oauth2';

import { getAuth } from '@/lib/auth';
import { isMcpEnabled, MCP_READ_SCOPE, MCP_SCOPES, MCP_WRITE_SCOPE, resolveMcpResource } from '@/lib/mcp-config';

import { READ_TOOLS, registerSkillsheetTools, WRITE_TOOLS } from './tools';

/** 検証済みアクセストークンの claims（jose JWTPayload 相当の形で受け取る）。 */
interface AccessTokenClaims {
  sub?: string;
  exp?: number;
  [key: string]: unknown;
}

/** tools/call の対象ツールに必要なスコープを返す。ツール呼び出し以外・未知ツールは null。 */
function requiredScopeForMessage(message: unknown): string | null {
  if (typeof message !== 'object' || message === null) return null;
  const { method, params } = message as { method?: unknown; params?: { name?: unknown } };
  if (method !== 'tools/call' || typeof params?.name !== 'string') return null;
  if ((READ_TOOLS as readonly string[]).includes(params.name)) return MCP_READ_SCOPE;
  if ((WRITE_TOOLS as readonly string[]).includes(params.name)) return MCP_WRITE_SCOPE;
  // 未知ツール名はここでは判定しない。MCP 層が JSON-RPC エラーで応答する。
  return null;
}

/** JSON-RPC のバッチ（配列）と単発の両方をメッセージ列へ正規化する。 */
function toMessageList(parsedBody: unknown): unknown[] {
  if (Array.isArray(parsedBody)) return parsedBody;
  if (parsedBody === undefined || parsedBody === null) return [];
  return [parsedBody];
}

function forbidden(message: string): Response {
  return new Response(JSON.stringify({ error: 'forbidden', error_description: message }), {
    status: 403,
    headers: { 'content-type': 'application/json' },
  });
}

/**
 * 認証後のディスパッチ。sub 照合・ツール単位のスコープ検査・AuthInfo 引き渡しを行う。
 * JWT 検証（requireMcpAuth）と分離してあり、テストではここを直接検証できる。
 */
export function createMcpDispatch(
  mcpHandler: McpHttpHandler,
  resource: string,
): (request: Request, claims: AccessTokenClaims) => Promise<Response> {
  return async (request, claims) => {
    // この MCP サーバーはオーナー本人のデータを読み書きするため、
    // token sub とオーナー ID の一致は最終関門として必ずここで確認する。
    if (claims.sub !== process.env.SKILLSHEET_OWNER_ID) {
      return forbidden('token subject is not the skill sheet owner');
    }

    const scopes = new Set(
      String(claims.scope ?? '')
        .split(' ')
        .filter(Boolean),
    );

    // tools/call の対象ツールごとに必要スコープを確認する。body はここで 1 度だけ
    // 読み、下層には parsedBody として渡して二重パースを避ける。パース不能な body は
    // SDK 側の JSON-RPC パースエラーに任せるため、ここでは握り潰す。
    let parsedBody: unknown;
    try {
      parsedBody = await request.clone().json();
    } catch {
      parsedBody = undefined;
    }
    for (const message of toMessageList(parsedBody)) {
      const required = requiredScopeForMessage(message);
      if (required && !scopes.has(required)) {
        throw createInsufficientScopeError([required]);
      }
    }

    const token = /^Bearer (.+)$/i.exec(request.headers.get('authorization') ?? '')?.[1] ?? '';
    const authInfo: AuthInfo = {
      token,
      clientId: typeof claims.client_id === 'string' ? claims.client_id : '',
      scopes: [...scopes],
      expiresAt: claims.exp,
      resource: new URL(resource),
      extra: { sub: claims.sub },
    };
    return mcpHandler.fetch(request, { authInfo, parsedBody });
  };
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
export function createMcpRequestHandler(): ((request: Request) => Promise<Response>) | null {
  if (!isMcpEnabled()) return null;
  const resource = resolveMcpResource();
  if (!resource) return null;

  const dispatch = createMcpDispatch(createSkillsheetMcpHandler(), resource);
  return requireMcpAuth(getAuth(), dispatch, { resource, challengeScopes: [...MCP_SCOPES] });
}

import type { AuthInfo, McpHttpHandler } from '@modelcontextprotocol/server';
import { createInsufficientScopeError } from 'better-auth/oauth2';
import { READ_TOOLS, WRITE_TOOLS } from './tool-core';

// 既存MCPのread/write権限を独立に維持する。writeはreadを包含しない。
const MCP_READ_SCOPE = 'skillsheet:read';
const MCP_WRITE_SCOPE = 'skillsheet:write';

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
  owner: string,
): (request: Request, claims: AccessTokenClaims) => Promise<Response> {
  return async (request, claims) => {
    // この MCP サーバーはオーナー本人のデータを読み書きするため、
    // token sub とオーナー ID の一致は最終関門として必ずここで確認する。
    if (!owner || claims.sub !== owner) {
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

    const token = /^(?:Bearer|DPoP) (.+)$/i.exec(request.headers.get('authorization') ?? '')?.[1] ?? '';
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

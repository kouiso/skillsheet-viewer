import { getAuth } from '@/lib/auth';
import { isMcpEnabled } from '@/lib/mcp-config';

export const runtime = 'nodejs';

/**
 * OAuth ディスカバリ系の well-known エンドポイントを Better Auth のハンドラへ
 * そのまま委譲する（Issue #305）。
 *
 * mcp() / oauthProvider プラグインが onRequest フックで処理するもの:
 *   - /.well-known/oauth-protected-resource[/<resource path>]  … RFC 9728
 *   - /.well-known/oauth-authorization-server[/<issuer path>]  … RFC 8414
 *   - /<issuer path>/.well-known/openid-configuration          … OIDC Discovery
 *
 * MCP_ENABLED でない環境では OAuth プラグイン自体を載せていないため、
 * フォールスルーして Better Auth 側が 404 を返す。それ以外のパスも同じく 404。
 */
export async function GET(request: Request): Promise<Response> {
  if (!isMcpEnabled()) {
    return new Response('Not Found', { status: 404 });
  }
  return getAuth().handler(request);
}

export async function HEAD(request: Request): Promise<Response> {
  return GET(request);
}

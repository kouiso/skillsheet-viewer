import 'server-only';

/**
 * Remote MCP サーバー（Issue #305）の公開設定。
 *
 * `MCP_ENABLED` が `'true'` の環境だけ `POST /api/mcp` と Better Auth の
 * OAuth 2.1 Provider エンドポイント（`/api/auth/oauth2/*`、`.well-known`）を公開する。
 * 未設定・それ以外の値では MCP 関連の入口を一切作らない（閲覧面・tRPC には影響しない）。
 */

/** リソース上で意味を持つスコープはこの 2 つだけに限定する（設計: Issue #305）。 */
export const MCP_READ_SCOPE = 'skillsheet:read';
export const MCP_WRITE_SCOPE = 'skillsheet:write';
export const MCP_SCOPES = [MCP_READ_SCOPE, MCP_WRITE_SCOPE] as const;

export function isMcpEnabled(): boolean {
  return process.env.MCP_ENABLED === 'true';
}

/**
 * アクセストークンの `aud` となる protected resource identifier（RFC 8707/9728）。
 *
 * デプロイごとに URL が変わると既存トークンの aud と一致しなくなり全滅するため、
 * 本番では `MCP_RESOURCE_URL` で固定する。未設定時は `BETTER_AUTH_URL` + `/api/mcp`
 * にフォールバック（ローカル開発向け）。どちらも無い場合は MCP を構成できないので
 * `undefined` を返し、呼び出し側はプラグインを載せない判断をする。
 */
export function resolveMcpResource(): string | undefined {
  const explicit = process.env.MCP_RESOURCE_URL;
  if (explicit) {
    return explicit;
  }
  const base = process.env.BETTER_AUTH_URL;
  if (!base) {
    return undefined;
  }
  return new URL('/api/mcp', base).toString();
}

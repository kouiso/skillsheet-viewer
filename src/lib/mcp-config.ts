import 'server-only';

/**
 * Remote MCP サーバー（Issue #305）の公開設定。
 *
 * `MCP_ENABLED` が `'true'` の環境、または未設定の Vercel 本番デプロイ
 * （`VERCEL_ENV === 'production'`）で `POST /api/mcp` と Better Auth の
 * OAuth 2.1 Provider エンドポイント（`/api/auth/oauth2/*`、`.well-known`）を公開する。
 * `'false'` は常に無効化する逃げ道として残す。preview・開発環境は明示設定のみ有効。
 * OAuth プラグインの init 失敗（対象 DB に `0006` 未適用など）は getAuth が
 * プラグイン無しへフォールバックするため `/api/auth/*` は壊れず、`/api/mcp` は
 * 404 に留まる（Issue #331）。
 */

/** リソース上で意味を持つスコープはこの 2 つだけに限定する（設計: Issue #305）。 */
export const MCP_READ_SCOPE = 'skillsheet:read';
export const MCP_WRITE_SCOPE = 'skillsheet:write';
export const MCP_SCOPES = [MCP_READ_SCOPE, MCP_WRITE_SCOPE] as const;

export function isMcpEnabled(): boolean {
  const flag = process.env.MCP_ENABLED;
  if (flag === 'true') return true;
  if (flag === 'false') return false;
  // Issue #331: Vercel 本番はダッシュボード未設定でも既定で有効にする。
  // init 失敗時のフォールバックは getAuth 側が担う。
  return process.env.VERCEL_ENV === 'production';
}

/**
 * アクセストークンの `aud` となる protected resource identifier（RFC 8707/9728）。
 *
 * デプロイごとに URL が変わると既存トークンの aud と一致しなくなり全滅するため、
 * 安定した URL の順で解決する: `MCP_RESOURCE_URL`（明示）→ Vercel 本番の固定ドメイン
 * `VERCEL_PROJECT_PRODUCTION_URL` → `BETTER_AUTH_URL`（ローカル開発向け）。
 * デプロイ固有の `VERCEL_URL` は aud が毎回変わるため使わない。
 * どれも無い場合は MCP を構成できないので `undefined` を返し、
 * 呼び出し側はプラグインを載せない判断をする。
 */
export function resolveMcpResource(): string | undefined {
  const explicit = process.env.MCP_RESOURCE_URL;
  if (explicit) {
    return explicit;
  }
  const prodHost = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (prodHost) {
    return new URL('/api/mcp', `https://${prodHost}`).toString();
  }
  const base = process.env.BETTER_AUTH_URL;
  if (!base) {
    return undefined;
  }
  return new URL('/api/mcp', base).toString();
}

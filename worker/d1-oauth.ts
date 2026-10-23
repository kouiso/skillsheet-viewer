import { createHash } from 'node:crypto';
import { createResourceServerChallenge } from '@better-auth/oauth-provider';
import { createMcpHandler, type McpHttpHandler, McpServer } from '@modelcontextprotocol/server';
import {
  enforceDpopBinding,
  isInsufficientScopeError,
  parseAccessTokenAuthorization,
  verifyJwsAccessToken,
} from 'better-auth/oauth2';
import { APIError } from 'better-call';
import type { D1Binding } from '../src/db/d1/binding';
import { createD1DocumentStore } from '../src/db/d1/document-store';
import { d1Timestamp } from '../src/db/d1/value';
import { createMcpDispatch } from '../src/server/mcp/dispatch';
import { registerSkillsheetTools } from '../src/server/mcp/tool-core';
import { createSheetService } from '../src/server/sheet-service-core';

const MCP_SCOPES = ['skillsheet:read', 'skillsheet:write'] as const;

export const tokenHash = (token: string) => {
  // base64url末尾の未使用bitが違うだけの署名aliasでも失効を共有する。
  const parts = token.split('.');
  const canonical =
    parts.length === 3 && parts.every((part) => /^[A-Za-z0-9_-]+={0,2}$/.test(part))
      ? parts.map((part) => Buffer.from(part, 'base64url').toString('base64url')).join('.')
      : token;
  return createHash('sha256').update(canonical).digest('hex');
};
const invalid = () =>
  new APIError('UNAUTHORIZED', { error: 'invalid_token', error_description: 'access token is inactive' });

/** 公式JWS/DPoP検証をローカル公開鍵で実行。discovery・grant・秘密鍵生成はしない。 */
export async function verifyD1OAuth(request: Request, db: D1Binding, owner: string, issuer: string, resource: string) {
  const authorization = parseAccessTokenAuthorization(request.headers.get('authorization'));
  if (!authorization || authorization.scheme === 'Unknown' || !authorization.token) throw invalid();
  if (
    authorization.token.split('.').length !== 3 ||
    !authorization.token.split('.').every((part) => /^[A-Za-z0-9_-]+$/.test(part))
  )
    throw invalid();
  // 公式jwt()の既定30日graceと一致。失効済み鍵を永久に信頼しない。
  const publicKeys = await db
    .prepare('SELECT id,public_key,alg FROM jwks WHERE expires_at IS NULL OR expires_at>?')
    .bind(d1Timestamp(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)))
    .all();
  if (!publicKeys.success || publicKeys.results.length === 0) throw invalid();
  const claims = await verifyJwsAccessToken(authorization.token, {
    verifyOptions: { issuer, audience: resource, requiredClaims: ['sub', 'exp', 'iat'] },
    jwksFetch: async () => ({
      keys: publicKeys.results.map((row) => ({
        ...JSON.parse(String(row.public_key)),
        kid: row.id,
        ...(row.alg ? { alg: row.alg } : {}),
      })),
    }),
  });
  // ownerのuser grantだけを受ける。sid無し/別user sessionは黙って本人扱いにしない。
  if (
    claims.sub !== owner ||
    typeof claims.sid !== 'string' ||
    typeof claims.azp !== 'string' ||
    (claims.client_id !== undefined && claims.client_id !== claims.azp)
  )
    throw invalid();
  const active = await db
    .prepare(`SELECT 1 AS active FROM oauth_client c
    JOIN session s ON s.id=?1 AND s.user_id=?2 JOIN "user" u ON u.id=s.user_id
    WHERE c.client_id=?3 AND COALESCE(c.disabled,0)=0 AND s.expires_at>?4
    AND EXISTS(SELECT 1 FROM oauth_resource WHERE identifier=?5)
    AND NOT EXISTS(SELECT 1 FROM d1_oauth_revocation WHERE token_hash=?6)
    AND NOT EXISTS(SELECT 1 FROM d1_oauth_family WHERE client_id=?3 AND user_id=?2 AND revoked_through>=?7)`)
    .bind(
      claims.sid,
      owner,
      claims.azp,
      d1Timestamp(),
      resource,
      tokenHash(authorization.token),
      typeof claims.iat === 'number' ? claims.iat : 0,
    )
    .all();
  if (!active.success || active.results.length !== 1) throw invalid();
  await enforceDpopBinding({
    payload: claims,
    authorization,
    proofJwt: request.headers.get('dpop'),
    method: request.method,
    url: request.url,
    replayStore: {
      async reserve({ key, expiresAt, now }) {
        // 期限切れの同じkeyだけ置換可能。全deploymentで同時再送の勝者は一つ。
        const result = await db
          .prepare(`INSERT INTO d1_dpop_replay(key,expires_at) VALUES(?1,?2)
          ON CONFLICT(key) DO UPDATE SET expires_at=excluded.expires_at WHERE d1_dpop_replay.expires_at<=?3`)
          .bind(tokenHash(key), d1Timestamp(expiresAt), d1Timestamp(now))
          .all();
        return result.success && result.meta.changes === 1;
      },
    },
  });
  return claims;
}

export async function handleD1Mcp(request: Request, db: D1Binding, owner: string, issuer: string, resource: string) {
  try {
    const claims = await verifyD1OAuth(request, db, owner, issuer, resource);
    if (
      typeof claims.scope !== 'string' ||
      !/^[\x21\x23-\x5b\x5d-\x7e]+(?: [\x21\x23-\x5b\x5d-\x7e]+)*$/.test(claims.scope)
    )
      throw invalid();
    const service = createSheetService(createD1DocumentStore(db, owner), owner);
    const mcpHandler: McpHttpHandler = createMcpHandler(
      () => {
        const server = new McpServer({ name: 'skillsheet-viewer', version: '1.0.0' });
        registerSkillsheetTools(server, service);
        return server;
      },
      { legacy: 'stateless' },
    );
    return await createMcpDispatch(mcpHandler, resource, owner)(request, claims);
  } catch (error) {
    const challenge = createResourceServerChallenge(isInsufficientScopeError(error) ? error : invalid(), resource, {
      challengeScopes: [...MCP_SCOPES],
    });
    if (!challenge) throw error;
    return Response.json(
      { jsonrpc: '2.0', id: null, error: { code: -32000, message: challenge.message } },
      {
        status: challenge.statusCode,
        headers: { ...Object.fromEntries(new Headers(challenge.headers)), 'cache-control': 'no-store' },
      },
    );
  }
}

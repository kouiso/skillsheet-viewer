import { Buffer } from 'node:buffer';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { cimd } from '@better-auth/cimd';
import { mcp } from '@better-auth/mcp';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { jwt } from 'better-auth/plugins';
import { drizzle } from 'drizzle-orm/d1';
import * as authSchema from '../src/db/d1/auth-schema';
import { executeD1Auxiliary } from '../src/db/d1/auxiliary-store';
import type { D1Binding } from '../src/db/d1/binding';
import { createD1DocumentStore } from '../src/db/d1/document-store';
import { d1Timestamp } from '../src/db/d1/value';
import { createD1Gateway } from '../src/server/d1-gateway';
import { createCimdTransport } from './cimd-transport';
import { handleD1Mcp, tokenHash } from './d1-oauth';
import { consistentOAuth } from './oauth-consistency';

const MCP_SCOPES = ['skillsheet:read', 'skillsheet:write'] as const;

export interface D1WorkerEnv {
  DB: D1Binding;
  SKILLSHEET_OWNER_ID: string;
  D1_GATEWAY_SERVICE_TOKEN: string;
  BETTER_AUTH_SECRET: string;
  SESSION_SECRET: string;
  APP_ORIGINS: string;
  MCP_ENABLED?: string;
  MCP_RESOURCE_URL?: string;
  BETTER_AUTH_URL?: string;
  D1_CIMD_TRANSPORT_URL?: string;
}

function equal(a: string, b: string) {
  return timingSafeEqual(createHash('sha256').update(a).digest(), createHash('sha256').update(b).digest());
}
function viewerCookie(cookie: string, secret: string) {
  const token = cookie
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith('session='))
    ?.slice(8);
  if (!token || !secret) return false;
  const index = token.lastIndexOf('.');
  if (index < 0) return false;
  const payload = token.slice(0, index),
    signature = token.slice(index + 1);
  if (!equal(signature, createHmac('sha256', secret).update(payload).digest('base64url'))) return false;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return typeof data.exp === 'number' && data.exp > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

export function createWorkerAuth(env: D1WorkerEnv, origin: string) {
  const oauth = env.MCP_ENABLED === 'true';
  const issuer = oauth ? `${new URL(env.BETTER_AUTH_URL ?? '').origin}/api/auth` : undefined;
  // D1はinteractive transaction不可。文書は専用batch、Better Authは公式sqlite adapter。
  return betterAuth({
    logger: { disabled: true },
    secret: env.BETTER_AUTH_SECRET,
    baseURL: origin,
    trustedOrigins: JSON.parse(env.APP_ORIGINS) as string[],
    database: drizzleAdapter(drizzle(env.DB as Parameters<typeof drizzle>[0], { schema: authSchema }), {
      provider: 'sqlite',
      schema: authSchema,
    }),
    emailAndPassword: { enabled: true, requireEmailVerification: false, disableSignUp: true },
    session: { cookieCache: { enabled: true, maxAge: 60 * 60 * 24 * 7 } },
    plugins: oauth
      ? [
          jwt({
            jwt: { issuer },
            disableSettingJwtHeader: true,
            adapter: {
              // 承認済みの鍵移送がない環境で自動発行しない。テストは合成公開鍵をseedする。
              async createJwk() {
                throw new Error('EXISTING_SIGNING_KEY_REQUIRED');
              },
            },
          }),
          mcp({
            loginPage: '/login',
            consentPage: '/consent',
            resource: env.MCP_RESOURCE_URL ?? '',
            scopes: [...MCP_SCOPES],
          }),
          cimd({
            fetchClientMetadataResource: createCimdTransport(
              env.D1_CIMD_TRANSPORT_URL ?? '',
              env.D1_GATEWAY_SERVICE_TOKEN,
              JSON.parse(env.APP_ORIGINS),
            ),
            metadataProfile: 'mcp-2026-07-28',
          }),
        ]
      : [],
  });
}

export default {
  async fetch(request: Request, env: D1WorkerEnv): Promise<Response> {
    const deny = (status = 403) =>
      Response.json(
        { error: status === 503 ? 'CONFIGURATION_REQUIRED' : 'ACCESS_DENIED' },
        {
          status,
          headers: { 'cache-control': 'no-store' },
        },
      );
    if (
      !env.DB ||
      !env.SKILLSHEET_OWNER_ID ||
      !env.D1_GATEWAY_SERVICE_TOKEN ||
      !env.BETTER_AUTH_SECRET ||
      !env.SESSION_SECRET
    )
      return deny(503);
    if (env.MCP_ENABLED === 'true' && (!env.MCP_RESOURCE_URL || !env.BETTER_AUTH_URL || !env.D1_CIMD_TRANSPORT_URL))
      return deny(503);
    const authenticateService = async (r: Request) =>
      equal(r.headers.get('x-skillsheet-service-token') ?? '', env.D1_GATEWAY_SERVICE_TOKEN);
    if (!(await authenticateService(request))) return deny();
    let origins: unknown;
    try {
      origins = JSON.parse(env.APP_ORIGINS);
    } catch {
      return deny(503);
    }
    const origin = request.headers.get('x-skillsheet-app-origin');
    if (!Array.isArray(origins) || !origin || !origins.includes(origin) || new URL(origin).origin !== origin)
      return deny();
    let auth: ReturnType<typeof createWorkerAuth>;
    try {
      auth = createWorkerAuth(env, origin);
    } catch {
      return deny(503);
    }
    const url = new URL(request.url);
    if (url.pathname === '/api/mcp') {
      if (env.MCP_ENABLED !== 'true') return deny(404);
      if (!['GET', 'POST', 'DELETE'].includes(request.method)) return deny();
      return handleD1Mcp(
        new Request(new URL(url.pathname + url.search, origin), request),
        env.DB,
        env.SKILLSHEET_OWNER_ID,
        `${new URL(env.BETTER_AUTH_URL ?? '').origin}/api/auth`,
        env.MCP_RESOURCE_URL ?? '',
      );
    }
    const discovery = [
      '/.well-known/oauth-protected-resource/api/mcp',
      '/.well-known/oauth-authorization-server/api/auth',
    ].includes(url.pathname);
    if (url.pathname.startsWith('/api/auth/') || discovery) {
      if (!['GET', 'POST', 'HEAD'].includes(request.method) || (discovery && request.method === 'POST')) return deny();
      if (discovery && env.MCP_ENABLED !== 'true') return deny(404);
      // allowlist済みのアプリoriginだけを採用。Origin headerは利用者の値を保ち、BAのCSRF検査を通す。
      return consistentOAuth(
        new Request(new URL(url.pathname + url.search, origin), request),
        env.DB,
        env.SKILLSHEET_OWNER_ID,
        (r) => auth.handler(r),
      );
    }
    const connection = createD1DocumentStore(env.DB, env.SKILLSHEET_OWNER_ID);
    return createD1Gateway({
      owner: env.SKILLSHEET_OWNER_ID,
      connection,
      authenticateService,
      async authenticateUser(r) {
        const session = await auth.api.getSession({ headers: r.headers, query: { disableCookieCache: true } });
        if (session?.user?.id === env.SKILLSHEET_OWNER_ID) return { role: 'editor', userId: session.user.id };
        if (viewerCookie(r.headers.get('cookie') ?? '', env.SESSION_SECRET)) return { role: 'viewer' };
        return null;
      },
      async executeAuxiliary(r) {
        if (r.operation === 'oauth.revoke') {
          const result = await env.DB.prepare(
            'INSERT INTO d1_oauth_revocation(token_hash,revoked_at) VALUES(?,?) ON CONFLICT(token_hash) DO NOTHING',
          )
            .bind(tokenHash(r.token), d1Timestamp())
            .all();
          if (!result.success) throw new Error('REVOCATION_FAILED');
          return { status: 'OK' };
        }
        return executeD1Auxiliary(env.DB, env.SKILLSHEET_OWNER_ID, r);
      },
    })(request);
  },
};

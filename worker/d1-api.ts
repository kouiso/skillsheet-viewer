import { Buffer } from 'node:buffer';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { drizzle } from 'drizzle-orm/d1';
import * as authSchema from '../src/db/d1/auth-schema';
import { executeD1Auxiliary } from '../src/db/d1/auxiliary-store';
import type { D1Binding } from '../src/db/d1/binding';
import { createD1DocumentStore } from '../src/db/d1/document-store';
import { createD1Gateway } from '../src/server/d1-gateway';

export interface D1WorkerEnv {
  DB: D1Binding;
  SKILLSHEET_OWNER_ID: string;
  D1_GATEWAY_SERVICE_TOKEN: string;
  BETTER_AUTH_SECRET: string;
  SESSION_SECRET: string;
  APP_ORIGINS: string;
  MCP_ENABLED?: string;
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
    // OAuthのgrant/署名鍵を新規作成しない。MCPを黙って別認証へ落とさない。
    if (env.MCP_ENABLED === 'true') return deny(503);
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
    const auth = createWorkerAuth(env, origin);
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/auth/')) {
      if (!['GET', 'POST'].includes(request.method)) return deny();
      // allowlist済みのアプリoriginだけを採用。Origin headerは利用者の値を保ち、BAのCSRF検査を通す。
      return auth.handler(new Request(new URL(url.pathname + url.search, origin), request));
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
      executeAuxiliary: (r) => executeD1Auxiliary(env.DB, env.SKILLSHEET_OWNER_ID, r),
    })(request);
  },
};

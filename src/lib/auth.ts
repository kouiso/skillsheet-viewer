// クライアントバンドルに巻き込まれた瞬間にビルドを失敗させる。
// これまでは「Client Component から import しないこと」というコメントだけが頼りで、
// 誤って読み込んでも誰も気づけなかった（秘密情報の露出・巨大ドライバの同梱に直結する）。
// Better Auth の構成。BETTER_AUTH_SECRET を読む。
import 'server-only';

/**
 * Better Auth サーバー設定。
 * email/password 認証のみ有効。DB は既存の Neon（Drizzle）を共用。
 *
 * 環境変数:
 *   BETTER_AUTH_SECRET  — 32 文字以上のランダム文字列（`openssl rand -base64 32` で生成）
 *   BETTER_AUTH_URL     — デプロイ先の URL（省略時はリクエストの origin から推定）
 *
 * Server-only. Never import from Client Components.
 */

import { cimd } from '@better-auth/cimd';
import { fetchClientMetadataResource } from '@better-auth/cimd/node';
import { mcp } from '@better-auth/mcp';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { jwt } from 'better-auth/plugins';
import { createDb } from '@/db';
import * as schema from '@/db/schema';
import { isMcpEnabled, MCP_SCOPES, resolveMcpResource } from '@/lib/mcp-config';

// BETTER_AUTH_URL が未設定でも Vercel 本番では VERCEL_PROJECT_PRODUCTION_URL から
// baseURL を導出する。baseURL が空だと oauth-provider プラグイン init の
// `new URL(issuer)` が投げ、MCP OAuth 経路が立ち上がらない（Issue #331）。
function resolveAuthBaseURL(): string | undefined {
  if (process.env.BETTER_AUTH_URL) return process.env.BETTER_AUTH_URL;
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  return undefined;
}

// Lazy singleton — DATABASE_URL is only available at request time (Vercel runtime),
// not during `next build` static analysis.
// Use a helper function so TypeScript infers the concrete return type correctly.
function createAuth(withMcpOauth: boolean) {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) throw new Error('BETTER_AUTH_SECRET is not set');

  // Remote MCP（Issue #305）: MCP_ENABLED かつ resource が確定できる環境でのみ
  // OAuth 2.1 Provider を構成する。resource が取れない環境でプラグインを載せると
  // aud 不一致のトークンを発行しかねないため、構成自体を省略する。
  const mcpResource = withMcpOauth ? resolveMcpResource() : undefined;

  return betterAuth({
    secret,
    baseURL: resolveAuthBaseURL(),
    database: drizzleAdapter(createDb(url), {
      provider: 'pg',
      // スキーマ全件を渡す。OAuth 系テーブル（oauth_client 等）もモデル名=export 名で
      // アダプタが解決する。
      schema,
    }),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false,
      // 単一オーナー運用。公開サインアップ endpoint (/api/auth/sign-up/email) を塞ぎ、
      // 第三者が自己登録して編集者になる権限昇格を防ぐ。オーナーアカウントは
      // SKILLSHEET_OWNER_ID に対応する既存アカウントを利用する（ブートストラップは setup.md 参照）。
      disableSignUp: true,
    },
    session: {
      cookieCache: {
        enabled: true,
        maxAge: 60 * 60 * 24 * 7,
      },
    },
    plugins: mcpResource
      ? [
          // JWT アクセストークン署名用（mcp() の access token は JWKS 検証を前提とする）。
          jwt(),
          // OAuth 2.1 Provider 本体。oauthProvider() と併用不可のため mcp() が兼ねる。
          // resource は発行トークンの aud に固定され、RFC 9728 metadata にも載る。
          mcp({
            loginPage: '/login',
            consentPage: '/consent',
            resource: mcpResource,
            scopes: [...MCP_SCOPES],
          }),
          // MCP 2026-07-28 プロファイル: client_id = HTTPS URL の Client ID Metadata
          // Document による動的クライアント登録（DCR は開けない）。
          // fetch は DNS ピン留め・RFC6890 拒否・リダイレクト不追従の公式 Node transport。
          cimd({
            fetchClientMetadataResource,
            metadataProfile: 'mcp-2026-07-28',
          }),
        ]
      : [],
  });
}

type Auth = ReturnType<typeof createAuth>;

let _init: Promise<Auth> | undefined;
let _mcpOauthReady = false;

/**
 * Better Auth の遅延シングルトン。
 *
 * OAuth プラグインは init 時に `oauth_resource` へ seed を書き込む（doc/06）。
 * 対象 DB に `0006` が未適用だと init が例外となり `/api/auth/*` 全般が 500 化する
 * ため、init 失敗時は OAuth プラグイン無しで再構成してログイン等を生かす。
 * その場合 MCP 側は `isMcpOauthReady()` が false になり `/api/mcp` は 404 を返す。
 */
export function getAuth(): Promise<Auth> {
  _init ??= (async () => {
    const wantMcp = isMcpEnabled() && resolveMcpResource() !== undefined;
    if (!wantMcp) return createAuth(false);
    try {
      const auth = createAuth(true);
      await auth.$context;
      _mcpOauthReady = true;
      return auth;
    } catch (e) {
      console.error('[auth] OAuth provider の初期化に失敗。MCP 無しで再構成する', e);
      const auth = createAuth(false);
      await auth.$context;
      return auth;
    }
  })();
  return _init;
}

/** OAuth Provider の init が完了しているか。MCP route は false なら 404 を返す。 */
export function isMcpOauthReady(): boolean {
  return _mcpOauthReady;
}

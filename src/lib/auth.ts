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

// Lazy singleton — DATABASE_URL is only available at request time (Vercel runtime),
// not during `next build` static analysis.
// Use a helper function so TypeScript infers the concrete return type correctly.
function createAuth() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) throw new Error('BETTER_AUTH_SECRET is not set');

  // Remote MCP（Issue #305）: MCP_ENABLED かつ resource が確定できる環境でのみ
  // OAuth 2.1 Provider を構成する。resource が取れない環境でプラグインを載せると
  // aud 不一致のトークンを発行しかねないため、構成自体を省略する。
  const mcpResource = isMcpEnabled() ? resolveMcpResource() : undefined;

  return betterAuth({
    secret,
    baseURL: process.env.BETTER_AUTH_URL,
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

let _instance: ReturnType<typeof createAuth> | undefined;

export function getAuth(): ReturnType<typeof createAuth> {
  if (!_instance) {
    _instance = createAuth();
  }
  return _instance;
}

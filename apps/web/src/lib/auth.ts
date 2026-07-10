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

import { account, createDb, session, user, verification } from '@skillsheet/db';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';

// Lazy singleton — DATABASE_URL is only available at request time (Vercel runtime),
// not during `next build` static analysis.
// Use a helper function so TypeScript infers the concrete return type correctly.
function createAuth() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) throw new Error('BETTER_AUTH_SECRET is not set');
  return betterAuth({
    secret,
    baseURL: process.env.BETTER_AUTH_URL,
    database: drizzleAdapter(createDb(url), {
      provider: 'pg',
      schema: { user, session, account, verification },
    }),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false,
      // 単一オーナー運用。公開サインアップ endpoint (/api/auth/sign-up/email) を塞ぎ、
      // 第三者が自己登録して編集者になる権限昇格を防ぐ。オーナーアカウントは
      // SKILLSHEET_OWNER_ID に対応する既存アカウントを利用する（ブートストラップは SETUP.md 参照）。
      disableSignUp: true,
    },
    session: {
      cookieCache: {
        enabled: true,
        maxAge: 60 * 60 * 24 * 7,
      },
    },
  });
}

let _instance: ReturnType<typeof createAuth> | undefined;

export function getAuth(): ReturnType<typeof createAuth> {
  if (!_instance) {
    _instance = createAuth();
  }
  return _instance;
}

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
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';

import { createDb } from '@skillsheet/db';

function getAuthDb() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  return createDb(url);
}

export const auth = betterAuth({
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL,
  database: drizzleAdapter(getAuthDb(), {
    provider: 'pg',
  }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
  },
  session: {
    cookieCache: {
      enabled: true,
      maxAge: 60 * 60 * 24 * 7,
    },
  },
});

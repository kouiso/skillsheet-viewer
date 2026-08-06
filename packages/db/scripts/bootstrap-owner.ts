/**
 * 単一オーナー運用のオーナーアカウント（Better Auth の user / account）をブートストラップする。
 *
 * `apps/web/src/lib/auth.ts` は `emailAndPassword.disableSignUp: true` のため、
 * UI からのサインアップができない。新規環境では `/login` を一度も通せず `/builder` に
 * 到達できないため、このスクリプトで最初のオーナーアカウントを直接作成する（#153 X-1）。
 *
 * 実装は Better Auth 自身の `/sign-up/email` エンドポイント実装
 * （node_modules/better-auth/dist/api/routes/sign-up.mjs）と同じ手順を踏む:
 *   1. `auth.$context` から `AuthContext`（`ctx`）を取得する
 *   2. `ctx.password.hash(password)` でパスワードハッシュを生成する
 *   3. `ctx.internalAdapter.createUser(...)` で `user` 行を作る
 *   4. `ctx.internalAdapter.linkAccount({ providerId: 'credential', ... })` で
 *      `account` 行（`provider_id = 'credential'`）を作る
 *
 * 生SQLでの直接INSERTではなく `internalAdapter` 経由にしているのは、ID生成・
 * タイムスタンプ・将来の追加フィールドなど Better Auth 内部の規約に自動的に追従させるため。
 *
 * 実行（新規オーナー作成、`apps/web/.env.local` の DATABASE_URL / BETTER_AUTH_SECRET を使用）:
 *   pnpm --filter @skillsheet/db exec tsx scripts/bootstrap-owner.ts --email=owner@example.com --password='Str0ng-Pass!'
 *
 * 環境変数での指定も可（CLI引数が優先）:
 *   SKILLSHEET_OWNER_EMAIL=owner@example.com SKILLSHEET_OWNER_PASSWORD='Str0ng-Pass!' \
 *     pnpm --filter @skillsheet/db exec tsx scripts/bootstrap-owner.ts
 *
 * 既に同じ email のユーザーが存在する場合は「新規作成」ではなく「パスワードの再発行」を行う
 * （dogfooding 時に実際に必要になったユースケース。既存 user.id はそのまま維持される）。
 *
 * 出力される `user.id` を `.env`（および Vercel の環境変数）の `SKILLSHEET_OWNER_ID` に設定する。
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';

import { createDb } from '../src/client';
import { account, session, user, verification } from '../src/schema';

const USAGE = `使い方:
  pnpm --filter @skillsheet/db exec tsx scripts/bootstrap-owner.ts --email=<email> --password=<password> [--name=<name>]

  もしくは環境変数 SKILLSHEET_OWNER_EMAIL / SKILLSHEET_OWNER_PASSWORD / SKILLSHEET_OWNER_NAME でも指定可能（CLI引数が優先）。
  DATABASE_URL / BETTER_AUTH_SECRET は apps/web/.env.local から読み込む。`;

// apps/web/.env.local から DATABASE_URL / BETTER_AUTH_SECRET を読み込む
// （packages/db には .env が無く、この2値は Web 側の .env.local にのみ存在するため。
// 他の packages/db/scripts と同じ読み込み方式）。
function loadWebEnvLocal(): void {
  const here = dirname(fileURLToPath(import.meta.url));
  const envPath = resolve(here, '../../../apps/web/.env.local');
  if (!existsSync(envPath)) {
    throw new Error(`apps/web/.env.local が見つかりません: ${envPath}`);
  }
  const content = readFileSync(envPath, 'utf-8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}
loadWebEnvLocal();

function parseArg(flag: string): string | undefined {
  const prefix = `--${flag}=`;
  const found = process.argv.find((a) => a.startsWith(prefix));
  return found ? found.slice(prefix.length) : undefined;
}

async function main() {
  const email = parseArg('email') ?? process.env.SKILLSHEET_OWNER_EMAIL;
  const password = parseArg('password') ?? process.env.SKILLSHEET_OWNER_PASSWORD;
  const name = parseArg('name') ?? process.env.SKILLSHEET_OWNER_NAME ?? 'Owner';

  if (!email || !password) {
    console.error(USAGE);
    throw new Error('email / password が指定されていません');
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is not set（apps/web/.env.local を確認してください）');
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) throw new Error('BETTER_AUTH_SECRET is not set（apps/web/.env.local を確認してください）');

  // apps/web/src/lib/auth.ts と同じ最小構成（email/password のみ）。
  // このスクリプトは internalAdapter を直接叩くため disableSignUp の値自体は挙動に影響しない。
  const auth = betterAuth({
    secret,
    baseURL: process.env.BETTER_AUTH_URL,
    database: drizzleAdapter(createDb(databaseUrl), {
      provider: 'pg',
      schema: { user, session, account, verification },
    }),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false,
      disableSignUp: true,
    },
  });

  const ctx = await auth.$context;

  const normalizedEmail = email.toLowerCase();
  const minLen = ctx.password.config.minPasswordLength;
  const maxLen = ctx.password.config.maxPasswordLength;
  if (password.length < minLen || password.length > maxLen) {
    throw new Error(`パスワードの長さが不正です（${minLen}〜${maxLen}文字である必要があります）`);
  }

  const hash = await ctx.password.hash(password);
  const existing = await ctx.internalAdapter.findUserByEmail(normalizedEmail);

  let userId: string;
  if (existing?.user) {
    // 既存オーナーのパスワード再発行（dogfooding で実際に使ったユースケース）。
    // user.id は変わらないため SKILLSHEET_OWNER_ID の再設定は不要。
    userId = existing.user.id;
    await ctx.internalAdapter.updatePassword(userId, hash);
    console.log(`既存ユーザーのパスワードを再発行しました: email=${normalizedEmail} user.id=${userId}`);
  } else {
    const createdUser = await ctx.internalAdapter.createUser({
      email: normalizedEmail,
      name,
      image: null,
      // 単一オーナー運用でありメール確認フローが存在しないため、最初から検証済みにする。
      emailVerified: true,
    });
    userId = createdUser.id;
    try {
      await ctx.internalAdapter.linkAccount({
        userId,
        providerId: 'credential',
        accountId: userId,
        password: hash,
      });
    } catch (e) {
      // credential account の作成に失敗した場合、ログインできない user だけが残る事故を防ぐため
      // 作成した user を削除してロールバックする。
      await ctx.internalAdapter.deleteUser(userId).catch(() => {});
      throw e;
    }
    console.log(`オーナーアカウントを作成しました: email=${normalizedEmail} user.id=${userId}`);
  }

  console.log('');
  console.log('この user.id を .env（および Vercel の環境変数）の SKILLSHEET_OWNER_ID に設定してください:');
  console.log(userId);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

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
 * 実行（新規オーナー作成、リポジトリルートの `.env`（無ければ `apps/web/.env.local`）の
 * DATABASE_URL / BETTER_AUTH_SECRET を使用）:
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
import { createInternalAdapter } from 'better-auth/db';

import { createDb } from '../src/client';
import { account, session, user, verification } from '../src/schema';

const USAGE = `使い方:
  pnpm --filter @skillsheet/db exec tsx scripts/bootstrap-owner.ts --email=<email> --password=<password> [--name=<name>]

  もしくは環境変数 SKILLSHEET_OWNER_EMAIL / SKILLSHEET_OWNER_PASSWORD / SKILLSHEET_OWNER_NAME でも指定可能（CLI引数が優先）。
  DATABASE_URL / BETTER_AUTH_SECRET はリポジトリルートの .env（無ければ apps/web/.env.local）から読み込む。
  どちらも無くても、実行環境の環境変数に既に設定済みなら（CI/Vercel 等）そのまま使う。`;

export function parseEnvFile(content: string): Record<string, string> {
  const result: Record<string, string> = {};
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
    result[key] = value;
  }
  return result;
}

// DATABASE_URL / BETTER_AUTH_SECRET を .env ファイルから読み込む。
//
// SETUP.md はリポジトリルートの `.env`（`cp .env.example .env`）を案内しているが、
// 他の packages/db/scripts は `apps/web/.env.local` を読む方式のみだった。この不一致で、
// SETUP.md の手順どおりに進めると「apps/web/.env.local が見つかりません」で止まっていた
// （レビュー指摘）。両方の場所を候補にして先に見つかった方を使い、既存の process.env の
// 値は上書きしない。どちらの候補ファイルも無くても、必須の環境変数が実行環境
// （CI/Vercel 等）に既に設定済みなら、そのまま処理を継続する（ファイルが無いことだけを
// 理由に fail-fast しない）。
function loadBootstrapEnv(): void {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [resolve(here, '../../../.env'), resolve(here, '../../../apps/web/.env.local')];
  const envPath = candidates.find((p) => existsSync(p));
  if (!envPath) return;
  const parsed = parseEnvFile(readFileSync(envPath, 'utf-8'));
  for (const [key, value] of Object.entries(parsed)) {
    if (process.env[key] === undefined) process.env[key] = value;
  }
}
loadBootstrapEnv();

function parseArg(flag: string): string | undefined {
  const prefix = `--${flag}=`;
  const found = process.argv.find((a) => a.startsWith(prefix));
  return found ? found.slice(prefix.length) : undefined;
}

// Better Auth（/sign-in/email）は zod の z.email() で検証しており、この正規表現と
// 同じものを使う（node_modules/zod の v4/core/regexes.js の email 定義）。ここで
// 弾かないと、`owner@example`（TLD無し）のような値でも user/account 行が作成され、
// 「作成成功」の出力が出るのに /login では Better Auth 側の検証で弾かれて
// ログインできない、という事故になる（レビュー指摘）。
export const EMAIL_PATTERN =
  /^(?!\.)(?!.*\.\.)([A-Za-z0-9_'+.-]*)[A-Za-z0-9_+-]@([A-Za-z0-9][A-Za-z0-9-]*\.)+[A-Za-z]{2,}$/;

async function main() {
  const email = parseArg('email') ?? process.env.SKILLSHEET_OWNER_EMAIL;
  const password = parseArg('password') ?? process.env.SKILLSHEET_OWNER_PASSWORD;
  const name = parseArg('name') ?? process.env.SKILLSHEET_OWNER_NAME ?? 'Owner';

  if (!email || !password) {
    console.error(USAGE);
    throw new Error('email / password が指定されていません');
  }
  if (!EMAIL_PATTERN.test(email)) {
    // Better Auth 自身の /sign-in/email がこの形式を弾くため、ここで先に弾かないと
    // 「作成成功」の出力が出るのに実際は /login からログインできないオーナーができる。
    throw new Error(`email の形式が不正です: ${email}`);
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is not set（.env または apps/web/.env.local を確認してください）');
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) throw new Error('BETTER_AUTH_SECRET is not set（.env または apps/web/.env.local を確認してください）');

  // apps/web/src/lib/auth.ts と同じ最小構成（email/password のみ）。
  // このスクリプトは internalAdapter を直接叩くため disableSignUp の値自体は挙動に影響しない。
  const auth = betterAuth({
    secret,
    baseURL: process.env.BETTER_AUTH_URL,
    database: drizzleAdapter(createDb(databaseUrl), {
      provider: 'pg',
      schema: { user, session, account, verification },
      // transaction: true を渡さないと better-auth の drizzleAdapter は
      // ctx.adapter.transaction を「コールバックをそのまま呼ぶだけ」の no-op に
      // フォールバックし、実DBトランザクションにならない（下の createUser/linkAccount の
      // ロールバック保証が成立しない）。
      transaction: true,
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
  // includeAccounts を付けないと existing.accounts が常に空配列になり、credential
  // アカウントの有無を判定できない（デフォルトで account は join されない）。
  const existing = await ctx.internalAdapter.findUserByEmail(normalizedEmail, { includeAccounts: true });

  let userId: string;
  if (existing?.user) {
    userId = existing.user.id;
    const hasCredentialAccount = existing.accounts.some((a) => a.providerId === 'credential');
    if (hasCredentialAccount) {
      // 既存オーナーのパスワード再発行（dogfooding で実際に使ったユースケース）。
      // user.id は変わらないため SKILLSHEET_OWNER_ID の再設定は不要。
      await ctx.internalAdapter.updatePassword(userId, hash);
      console.log(`既存ユーザーのパスワードを再発行しました: email=${normalizedEmail} user.id=${userId}`);
    } else {
      // user 行はあるが credential アカウントが無い（過去の実行が linkAccount で
      // 失敗したまま残った等）。updatePassword は対象の credential 行が無いと
      // 黙って0行更新のまま成功したように返るため、ここで判定して linkAccount で
      // 新規作成する（このまま updatePassword を呼ぶと「再発行成功」の出力が出るのに
      // 実際はパスワードが設定されずログインできない）。
      await ctx.internalAdapter.linkAccount({
        userId,
        providerId: 'credential',
        accountId: userId,
        password: hash,
      });
      console.log(
        `既存ユーザーに credential アカウントを作成しパスワードを設定しました: email=${normalizedEmail} user.id=${userId}`,
      );
    }
  } else {
    // createUser と linkAccount を同一トランザクションで実行し、どちらかが失敗したら
    // 両方ロールバックする（以前は linkAccount 失敗時に user を補償削除していたが、
    // その削除自体が失敗すると credential の無い user だけが残る事故があった）。
    // ctx.adapter.transaction はトランザクションスコープのアダプタを渡すコールバックを
    // 取る公式 API（better-auth/db の createInternalAdapter と組み合わせて使う）。
    userId = await ctx.adapter.transaction(async (tx) => {
      const txInternalAdapter = createInternalAdapter(tx, ctx);
      const createdUser = await txInternalAdapter.createUser({
        email: normalizedEmail,
        name,
        image: null,
        // 単一オーナー運用でありメール確認フローが存在しないため、最初から検証済みにする。
        emailVerified: true,
      });
      await txInternalAdapter.linkAccount({
        userId: createdUser.id,
        providerId: 'credential',
        accountId: createdUser.id,
        password: hash,
      });
      return createdUser.id;
    });
    console.log(`オーナーアカウントを作成しました: email=${normalizedEmail} user.id=${userId}`);
  }

  console.log('');
  console.log('この user.id を .env（および Vercel の環境変数）の SKILLSHEET_OWNER_ID に設定してください:');
  console.log(userId);
}

// import.meta.url を直接実行チェックに使う。テストからこのモジュールを import した
// ときに main()（実DB接続・Better Auth 初期化）が副作用として走らないようにする。
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}

import { betterAuth } from 'better-auth';
import { memoryAdapter } from 'better-auth/adapters/memory';
import { describe, expect, it } from 'vitest';

import { provisionOwner } from './bootstrap-owner';

/**
 * オーナー作成の経路そのものを動かすテスト。
 *
 * 以前は純粋なヘルパ（parseEnvFile / EMAIL_PATTERN / promptHiddenPassword）しか
 * テストしておらず、better-auth 1.6.25 で `auth.$context` が `hooks` を公開しなくなった際に
 * 「hooksEntries is not iterable」で作成経路が丸ごと落ちても誰も気づけなかった。
 * その結果、新しい環境ではオーナーを1人も作れず /builder に永久に入れない状態になっていた。
 *
 * 実DBを用意しなくても壊れを検知できるよう、better-auth 同梱のメモリアダプタで
 * 本物の internalAdapter / transaction / パスワードハッシュを通す。
 */
function createAuth() {
  const db: Record<string, unknown[]> = { user: [], session: [], account: [], verification: [] };
  return betterAuth({
    secret: 'test-secret-value-at-least-32-characters-long',
    database: memoryAdapter(db),
    emailAndPassword: { enabled: true, requireEmailVerification: false, disableSignUp: true },
  });
}

describe('provisionOwner', () => {
  it('新規オーナーを作成し、credential アカウントにパスワードを設定する', async () => {
    const ctx = await createAuth().$context;

    const result = await provisionOwner(ctx, {
      email: 'Owner@Example.com',
      password: 'Str0ng-Pass!2026',
      name: 'Owner',
    });

    expect(result.action).toBe('created');
    expect(result.userId).toBeTruthy();

    const found = await ctx.internalAdapter.findUserByEmail('owner@example.com', { includeAccounts: true });
    expect(found?.user.id).toBe(result.userId);
    // メール確認フローが無い運用なので、最初から検証済みで作られること。
    expect(found?.user.emailVerified).toBe(true);

    const credential = found?.accounts.find((a) => a.providerId === 'credential');
    expect(credential).toBeTruthy();
    // 平文が入っていないこと、かつ実際に検証を通ること。
    expect(credential?.password).not.toBe('Str0ng-Pass!2026');
    await expect(ctx.password.verify({ hash: credential?.password ?? '', password: 'Str0ng-Pass!2026' })).resolves.toBe(
      true,
    );
  });

  it('同じメールで再実行するとパスワードを再発行し、user.id は変わらない', async () => {
    const ctx = await createAuth().$context;
    const first = await provisionOwner(ctx, { email: 'owner@example.com', password: 'First-Pass!2026', name: 'Owner' });

    const second = await provisionOwner(ctx, {
      email: 'owner@example.com',
      password: 'Second-Pass!2026',
      name: 'Owner',
    });

    expect(second.action).toBe('reissued');
    expect(second.userId).toBe(first.userId);

    const found = await ctx.internalAdapter.findUserByEmail('owner@example.com', { includeAccounts: true });
    const credential = found?.accounts.find((a) => a.providerId === 'credential');
    await expect(ctx.password.verify({ hash: credential?.password ?? '', password: 'Second-Pass!2026' })).resolves.toBe(
      true,
    );
    await expect(ctx.password.verify({ hash: credential?.password ?? '', password: 'First-Pass!2026' })).resolves.toBe(
      false,
    );
  });

  it('短すぎるパスワードは作成前に弾く', async () => {
    const ctx = await createAuth().$context;
    await expect(provisionOwner(ctx, { email: 'owner@example.com', password: 'short', name: 'Owner' })).rejects.toThrow(
      /パスワードの長さが不正/,
    );
  });
});

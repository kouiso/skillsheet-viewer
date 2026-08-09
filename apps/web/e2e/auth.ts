import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import type { Page } from '@playwright/test';

export const authFile = path.resolve('playwright', '.auth', 'user.json');

// Playwright の storageState はファイルが存在しないと起動時に失敗する。
// 最初のテストがログインするまで空の状態を置いておき、ログイン成功後に上書きする。
if (!existsSync(path.dirname(authFile))) {
  mkdirSync(path.dirname(authFile), { recursive: true });
}
if (!existsSync(authFile)) {
  writeFileSync(authFile, JSON.stringify({ cookies: [], origins: [] }), 'utf-8');
}

export async function login(page: Page) {
  const email = process.env.E2E_EMAIL ?? 'e2e-owner@example.test';
  const password = process.env.E2E_PASSWORD ?? 'E2e-test-pass-99';

  // storageState から復元済みの場合は /builder のまま、未認証の場合は
  // /login へリダイレクトされる。/login にアクセスすると 429 でブロック
  // される可能性があるため、必ず /builder から始める。
  await page.goto('/builder', { waitUntil: 'networkidle' });

  if (page.url().includes('/login')) {
    await page.getByLabel('メールアドレス').fill(email);
    await page.getByLabel('パスワード').fill(password);
    await page.getByRole('button', { name: 'ログイン' }).click();
    await page.waitForURL('/builder');
    // 以降のテストで storageState を使い回し、Better Auth の sign-in レートリミットを回避する。
    await page.context().storageState({ path: authFile });
  }
}

import fs from 'node:fs';
import path from 'node:path';
import { expect, type Page, test } from '@playwright/test';

const email = process.env.E2E_EMAIL ?? 'e2e-owner@example.test';
const password = process.env.E2E_PASSWORD ?? 'E2e-test-pass-99';
const reportDir = '/home/ubuntu/dogfood-report/playwright-screenshots';

async function login(page: Page) {
  await page.goto('/login');
  await page.getByLabel('メールアドレス').fill(email);
  await page.getByLabel('パスワード').fill(password);
  await page.getByRole('button', { name: 'ログイン' }).click();
  await page.waitForURL('/builder');
}

test('repro: console-dashboard template should seed profile/stats/project blocks', async ({ page }) => {
  fs.mkdirSync(reportDir, { recursive: true });
  await login(page);

  await page.getByRole('button', { name: '新規シート' }).click();
  await expect(page.getByText('新規シートを作成')).toBeVisible();
  await page.locator('#new-sheet-title').fill('Repro Dashboard');
  await page.locator('#new-sheet-template').selectOption('console-dashboard');
  await page.getByRole('button', { name: '作成' }).click();
  await page.waitForURL(/\/builder\?sheet=/);

  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(reportDir, 'Z-repro-console-dashboard-light.png'), fullPage: true });

  // テンプレート「ダッシュボード（プロフィール・統計・案件）」なら
  // プロフィール / 統計 / 案件 ブロックが表示されることを期待する
  await expect(page.getByText('プロフィール', { exact: false }).first()).toBeVisible();
  await expect(page.getByText('統計', { exact: false }).first()).toBeVisible();
  await expect(page.getByText('案件', { exact: false }).first()).toBeVisible();
});

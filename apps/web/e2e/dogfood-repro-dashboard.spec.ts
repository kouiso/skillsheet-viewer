import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { expect, type Page, test } from '@playwright/test';
import { deleteSheet, listSheets } from '@skillsheet/db';

const email = process.env.E2E_EMAIL ?? 'e2e-owner@example.test';
const password = process.env.E2E_PASSWORD ?? 'E2e-test-pass-99';
const reportDir = path.join(process.cwd(), 'test-results', 'dogfood-screenshots');

// 実行ごとに一意な prefix にする。固定 prefix だと、CI で別の PR/ブランチの実行が
// 同じ共有 DB に対して同時に走った場合、beforeAll/afterAll の一括掃除が
// 他の実行が作成中・編集中のシートを削除してしまう（CodeRabbit 指摘）。
const REPRO_TITLE_PREFIX = `Repro Dashboard ${randomUUID().slice(0, 8)}`;
let reproSheetId = '';

async function login(page: Page) {
  await page.goto('/login');
  await page.getByLabel('メールアドレス').fill(email);
  await page.getByLabel('パスワード').fill(password);
  await page.getByRole('button', { name: 'ログイン' }).click();
  await page.waitForURL('/builder');
}

async function cleanupSheetsByPrefix(prefix: string) {
  const sheets = await listSheets();
  const matched = sheets.filter((s) => s.title.startsWith(prefix));
  const failures: { id: string; error: unknown }[] = [];
  await Promise.all(
    matched.map(async (s) => {
      try {
        await deleteSheet(s.id);
      } catch (err) {
        failures.push({ id: s.id, error: err });
      }
    }),
  );
  if (failures.length > 0) {
    console.warn('repro-dashboard cleanup failed:', failures);
  }
}

test.beforeAll(async () => {
  // 前回の実行が残った Repro Dashboard シートを掃除する
  await cleanupSheetsByPrefix(REPRO_TITLE_PREFIX);
});

test.afterAll(async () => {
  if (reproSheetId) {
    await deleteSheet(reproSheetId);
  }
  // 万が一のために再掃除
  await cleanupSheetsByPrefix(REPRO_TITLE_PREFIX);
});

test('repro: console-dashboard template should seed profile/stats/project blocks', async ({ page }) => {
  fs.mkdirSync(reportDir, { recursive: true });
  await login(page);

  await page.getByRole('button', { name: '新規シート' }).click();
  await expect(page.getByText('新規シートを作成')).toBeVisible();
  await page.locator('#new-sheet-title').fill(`${REPRO_TITLE_PREFIX} ${Date.now()}`);
  await page.locator('#new-sheet-template').selectOption('console-dashboard');
  await page.getByRole('button', { name: '作成' }).click();
  await page.waitForURL(/\/builder\?sheet=/);

  const url = page.url();
  reproSheetId = new URL(url).searchParams.get('sheet') ?? '';
  expect(reproSheetId).toMatch(/^[0-9a-f-]{36}$/);

  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(reportDir, 'Z-repro-console-dashboard-light.png'), fullPage: true });

  // テンプレート「ダッシュボード（プロフィール・統計・案件）」なら
  // プロフィール / 統計 / 案件 ブロックが表示されることを期待する
  await expect(page.getByText('プロフィール', { exact: false }).first()).toBeVisible();
  await expect(page.getByText('統計', { exact: false }).first()).toBeVisible();
  await expect(page.getByText('案件', { exact: false }).first()).toBeVisible();
});

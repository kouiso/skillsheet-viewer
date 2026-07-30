import process from 'node:process';
import { expect, type Page, test } from '@playwright/test';
import { listSheets, saveSkillSheetBlocks } from '@skillsheet/db';

const email = process.env.E2E_EMAIL ?? 'e2e-owner@example.test';
const password = process.env.E2E_PASSWORD ?? 'E2e-test-pass-99';

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function resetE2ESheet() {
  const sheets = await listSheets();
  const sheet = sheets.find((s) => s.title === 'E2E Test Sheet');
  if (!sheet) throw new Error('E2E Test Sheet not found');
  const initialBlocks = [{ type: 'markdown' as const, data: { markdown: 'E2E テスト用' as const } }];
  await saveSkillSheetBlocks(sheet.title, initialBlocks, sheet.id);
}

async function login(page: Page) {
  await page.goto('/login');
  await page.getByLabel('メールアドレス').fill(email);
  await page.getByLabel('パスワード').fill(password);
  await page.getByRole('button', { name: 'ログイン' }).click();
  await page.waitForURL('/builder');
}

async function openProjectEditor(page: Page) {
  await page.goto('/builder');
  await page.getByRole('button', { name: '案件エディタ' }).click();
  await page.getByRole('button', { name: '＋ 会社' }).click();
  await expect(page.getByRole('textbox', { name: '会社名' })).toBeVisible();
}

async function waitForAutosave(page: Page, label: string, timeout = 10_000) {
  const indicator = page.locator('[data-slot="autosave-indicator"]');
  await expect(indicator).toContainText(label, { timeout });
  return indicator;
}

test.describe('builder autosave', () => {
  test.beforeEach(async () => {
    await resetE2ESheet();
  });

  test('正常系：会社名を編集すると自動保存され「保存済み（自動）」が表示される', async ({ page }) => {
    await login(page);
    await openProjectEditor(page);
    const unique = `E2E正常系 ${Date.now()}`;
    await page.getByRole('textbox', { name: '会社名' }).fill(unique);
    await waitForAutosave(page, '保存済み（自動）');
    await page.screenshot({ path: 'test-results/playwright/autosave-normal.png' });
  });

  test('失敗系：オフライン時は「自動保存に失敗」になり、復帰後に再保存される', async ({ page }) => {
    await login(page);
    await openProjectEditor(page);
    await page.getByRole('textbox', { name: '会社名' }).fill(`E2E失敗系 ${Date.now()}`);
    await waitForAutosave(page, '保存済み（自動）');

    await page.context().setOffline(true);
    await page.getByRole('textbox', { name: '会社名' }).fill(`E2E失敗系 オフライン ${Date.now()}`);
    await waitForAutosave(page, '自動保存に失敗');
    await page.screenshot({ path: 'test-results/playwright/autosave-failure.png' });

    await page.context().setOffline(false);
    await page.getByRole('textbox', { name: '会社名' }).fill(`E2E失敗系 復帰 ${Date.now()}`);
    await waitForAutosave(page, '保存済み（自動）');
    await page.screenshot({ path: 'test-results/playwright/autosave-recovery.png' });
  });

  test('競合系：別セッションで保存後に編集すると「競合」が表示される', async ({ browser }) => {
    const contextA = await browser.newContext();
    const pageA = await contextA.newPage();

    try {
      await login(pageA);
      const storage = await contextA.storageState();
      const contextB = await browser.newContext({ storageState: storage });
      const pageB = await contextB.newPage();

      try {
        await openProjectEditor(pageA);
        const companyName = `E2E競合系 ${Date.now()}`;
        const inputA = pageA.getByRole('textbox', { name: '会社名' });
        await inputA.fill(companyName);
        await expect(inputA).toHaveValue(companyName);
        await waitForAutosave(pageA, '保存済み（自動）');

        // セッション B は A と同じ cookie を使う（Better Auth の sign-in レートリミットを回避）
        await pageB.goto('/builder');
        await pageB.getByRole('button', { name: '案件エディタ' }).click();
        const rowPattern = new RegExp(`^${escapeRegExp(companyName)}(?!.*を)`);
        await pageB.getByRole('button', { name: rowPattern }).click();
        const inputB = pageB.getByRole('textbox', { name: '会社名' });
        await expect(inputB).toHaveValue(companyName);
        await inputB.fill(`${companyName} updated`);
        await expect(inputB).toHaveValue(`${companyName} updated`);
        await waitForAutosave(pageB, '保存済み（自動）');

        // セッション A でさらに編集すると expectedUpdatedAt が古いため競合
        await pageA.bringToFront();
        const inputA2 = pageA.getByRole('textbox', { name: '会社名' });
        await inputA2.fill(`${companyName} conflict`);
        await expect(inputA2).toHaveValue(`${companyName} conflict`);
        await waitForAutosave(pageA, '競合');
        await pageA.screenshot({ path: 'test-results/playwright/autosave-conflict.png' });
      } finally {
        await contextB.close();
      }
    } finally {
      await contextA.close();
    }
  });
});

import { test, expect, type Page } from '@playwright/test';
import process from 'node:process';
import { createConsoleDemoSheet } from '@skillsheet/db';

const email = process.env.E2E_EMAIL ?? 'e2e-owner@example.test';
const password = process.env.E2E_PASSWORD ?? 'E2e-test-pass-99';

let viewSheetId = '';

const viewports = [
  { name: 'sp-narrow', width: 320, height: 800 },
  { name: 'sp', width: 375, height: 812 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1280, height: 800 },
] as const;

type Theme = 'light' | 'dark';

async function setTheme(page: Page, theme: Theme) {
  await page.evaluate((t) => {
    localStorage.setItem('theme-mode', t);
  }, theme);
}

async function authViewer(page: Page, route: string) {
  await page.goto(`/viewer-auth?next=${encodeURIComponent(route)}`);
  await page.getByLabel('認証コード').fill(process.env.VIEWER_CODE ?? 'viewer-code-local');
  await page.getByRole('button', { name: '認証' }).click();
  await page.waitForURL(route);
}

async function capturePage(page: Page, route: string, viewport: (typeof viewports)[number], theme: Theme, name: string) {
  await page.setViewportSize({ width: viewport.width, height: viewport.height });
  await page.goto(route, { waitUntil: 'networkidle' });

  const errors: string[] = [];
  const warnings: string[] = [];
  const consoleHandler = (msg: { type: () => string; text: () => string }) => {
    const type = msg.type();
    const text = msg.text();
    if (type === 'error') errors.push(text);
    if (type === 'warning') warnings.push(text);
  };
  page.on('console', consoleHandler);

  await setTheme(page, theme);
  await page.reload({ waitUntil: 'networkidle' });

  const overflow = await page.evaluate(() => {
    const html = document.documentElement;
    return {
      scrollWidth: html.scrollWidth,
      clientWidth: html.clientWidth,
      hasOverflow: html.scrollWidth > html.clientWidth,
    };
  });

  await page.screenshot({
    path: `test-results/playwright/audit-${name}-${theme}-${viewport.name}.png`,
    fullPage: true,
  });

  page.off('console', consoleHandler);

  return { overflow, errors, warnings, path: `test-results/playwright/audit-${name}-${theme}-${viewport.name}.png` };
}
async function login(page: Page) {
  await page.goto('/login');
  await page.getByLabel('メールアドレス').fill(email);
  await page.getByLabel('パスワード').fill(password);
  await page.getByRole('button', { name: 'ログイン' }).click();
  await page.waitForURL('/builder');
}

test.describe('Claude Design 全画面監査', () => {
  test.beforeAll(async () => {
    viewSheetId = await createConsoleDemoSheet();
  });

  test('viewer /view/db/:id ダッシュボード', async ({ page }) => {
    const route = `/view/db/${viewSheetId}`;
    await authViewer(page, route);
    for (const viewport of viewports) {
      for (const theme of ['light', 'dark'] as const) {
        const result = await capturePage(page, route, viewport, theme, `viewer-${viewport.name}`);
        expect(result.overflow.hasOverflow, `横スクロール: ${viewport.name} / ${theme}`).toBe(false);
        expect(result.errors, `console.error: ${viewport.name} / ${theme}`).toEqual([]);
      }
    }
  });

  test('/login', async ({ page }) => {
    for (const viewport of viewports) {
      for (const theme of ['light', 'dark'] as const) {
        const result = await capturePage(page, '/login', viewport, theme, `login-${viewport.name}`);
        expect(result.overflow.hasOverflow, `横スクロール: ${viewport.name} / ${theme}`).toBe(false);
        expect(result.errors, `console.error: ${viewport.name} / ${theme}`).toEqual([]);
      }
    }
  });

  test('/viewer-auth', async ({ page }) => {
    for (const viewport of viewports) {
      for (const theme of ['light', 'dark'] as const) {
        const result = await capturePage(page, '/viewer-auth', viewport, theme, `viewer-auth-${viewport.name}`);
        expect(result.overflow.hasOverflow, `横スクロール: ${viewport.name} / ${theme}`).toBe(false);
        expect(result.errors, `console.error: ${viewport.name} / ${theme}`).toEqual([]);
      }
    }
  });

  test('builder /builder（編集画面）', async ({ page }) => {
    await login(page);
    for (const viewport of viewports) {
      for (const theme of ['light', 'dark'] as const) {
        const result = await capturePage(page, '/builder', viewport, theme, `builder-${viewport.name}`);
        expect(result.overflow.hasOverflow, `横スクロール: ${viewport.name} / ${theme}`).toBe(false);
        expect(result.errors, `console.error: ${viewport.name} / ${theme}`).toEqual([]);
      }
    }
  });

  test('builder /builder/preview（プレビュー）', async ({ page }) => {
    await login(page);
    for (const viewport of viewports) {
      for (const theme of ['light', 'dark'] as const) {
        const result = await capturePage(page, '/builder/preview', viewport, theme, `preview-${viewport.name}`);
        expect(result.overflow.hasOverflow, `横スクロール: ${viewport.name} / ${theme}`).toBe(false);
        expect(result.errors, `console.error: ${viewport.name} / ${theme}`).toEqual([]);
      }
    }
  });
});

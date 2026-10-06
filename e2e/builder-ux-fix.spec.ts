import { expect, test } from '@playwright/test';
import { TEMPLATES } from '../app/builder/sheet-template';
import { authFile, login } from './auth';
import { createSheet, deleteSheet } from './document-fixture';
import { selectBlock } from './workspace';

test.use({ storageState: authFile });

test.describe.configure({ mode: 'serial' });

const getFullTemplateBlocks = () => {
  const full = TEMPLATES.find((t) => t.id === 'full');
  if (!full) throw new Error('full template not found');
  return full.blocks;
};

const getDashboardTemplateBlocks = () => {
  const dashboard = TEMPLATES.find((t) => t.id === 'console-dashboard');
  if (!dashboard) throw new Error('console-dashboard template not found');
  return dashboard.blocks;
};

test('keyboard reorder moves one item at a time', async ({ page }) => {
  const title = `Keyboard reorder test ${Date.now()}`;
  const sheetId = await createSheet(title, getFullTemplateBlocks());
  try {
    const logs: string[] = [];
    page.on('console', (msg) => logs.push(msg.text()));
    await login(page);
    await page.goto(`/builder?sheet=${sheetId}`, { waitUntil: 'networkidle' });

    const outline = page.locator('nav[aria-label="ブロック一覧"]:visible');
    // 選択ボタンのラベル列を使い、見えていない編集フォームには依存しない。
    const labels = () =>
      outline.locator('button[aria-label*=":"]').evaluateAll((els) => els.map((el) => el.getAttribute('aria-label')));
    await expect(outline.locator('button[aria-label*=":"]')).toHaveCount(7);
    const before = await labels();
    await outline.locator('button[aria-label*=":"]').nth(1).click();
    const down = outline.getByRole('button', { name: /を下へ移動$/ });
    await down.focus();
    await page.keyboard.press('Enter');
    const expected = [...before];
    [expected[1], expected[2]] = [expected[2], expected[1]];
    await expect.poll(labels).toEqual(expected);
    await expect(page.locator('[data-slot="autosave-indicator"]')).toContainText('保存済み（自動）');
    await page.reload({ waitUntil: 'networkidle' });
    await expect.poll(labels).toEqual(expected);
  } finally {
    await deleteSheet(sheetId);
  }
});

test('profile custom row draft survives tab switch', async ({ page }) => {
  const title = `Custom row draft test ${Date.now()}`;
  const sheetId = await createSheet(title, getDashboardTemplateBlocks());
  try {
    const logs: string[] = [];
    page.on('console', (msg) => logs.push(msg.text()));
    await login(page);
    await page.goto(`/builder?sheet=${sheetId}`, { waitUntil: 'networkidle' });

    await page.getByRole('button', { name: '項目を追加' }).click();
    const customLabel = page.locator('input[placeholder="項目名（例: 得意分野）"]').first();
    const customValue = page.locator('input[placeholder="値"]').first();
    await customLabel.fill('得意分野');
    await customValue.fill('性能改善');

    await selectBlock(page, '統計');
    await selectBlock(page, 'プロフィール');

    await expect(customLabel).toHaveValue('得意分野');
    await expect(customValue).toHaveValue('性能改善');
  } finally {
    await deleteSheet(sheetId);
  }
});

test('preview does not horizontally overflow at 320px', async ({ page }) => {
  const title = `Overflow test ${Date.now()}`;
  const sheetId = await createSheet(title, getDashboardTemplateBlocks());
  try {
    await login(page);
    await page.setViewportSize({ width: 320, height: 800 });
    await page.goto(`/view/db/${sheetId}`, { waitUntil: 'networkidle' });

    const hasHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    expect(hasHorizontalOverflow).toBe(false);
  } finally {
    await deleteSheet(sheetId);
  }
});

test.describe('mobile project editor', () => {
  test.use({
    viewport: { width: 375, height: 812 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
    storageState: authFile,
  });

  test('row action buttons stay visible and have 44px tap target on touch devices', async ({ page }) => {
    const title = `Touch target test ${Date.now()}`;
    const sheetId = await createSheet(title, getDashboardTemplateBlocks());
    try {
      await login(page);
      await page.goto(`/builder?sheet=${sheetId}`, { waitUntil: 'networkidle' });
      await page.getByRole('button', { name: 'アウトラインを開く', exact: true }).click();
      await page.getByRole('button', { name: '＋ 会社' }).click();
      await page.getByRole('button', { name: 'アウトラインを開く', exact: true }).click();
      await page.waitForSelector('.co-head-row');

      const eye = page.locator('.co-head-row .row-eye').first();
      const del = page.locator('.co-head-row .co-del').first();
      await expect(eye).toBeVisible();
      await expect(del).toBeVisible();

      const tapTarget = await page.evaluate((selector) => {
        const el = document.querySelector(selector);
        if (!el) return null;
        const rect = el.getBoundingClientRect();
        const before = window.getComputedStyle(el, '::before');
        return {
          elementWidth: rect.width,
          elementHeight: rect.height,
          top: before.top,
          right: before.right,
          bottom: before.bottom,
          left: before.left,
          position: window.getComputedStyle(el).position,
        };
      }, '.co-head-row .row-eye');

      expect(tapTarget).not.toBeNull();
      expect(tapTarget?.position).toBe('relative');
      expect(tapTarget?.left).toBe('-11px');
      expect(tapTarget?.top).toBe('-11px');
      expect(tapTarget?.right).toBe('-11px');
      expect(tapTarget?.bottom).toBe('-11px');
      // 22px の見た目に -11px の inset があるため、タップ領域は 44px 四方になる。
      expect((tapTarget?.elementWidth ?? 0) + 22).toBeGreaterThanOrEqual(44);
      expect((tapTarget?.elementHeight ?? 0) + 22).toBeGreaterThanOrEqual(44);
    } finally {
      await deleteSheet(sheetId);
    }
  });
});

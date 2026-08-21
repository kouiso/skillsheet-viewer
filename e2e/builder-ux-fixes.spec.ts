import { expect, type Locator, test } from '@playwright/test';
import { createSheet, deleteSheet } from '@/db';
import { TEMPLATES } from '../app/builder/templates';
import { authFile, login } from './auth';

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

async function getBlockValues(handles: Locator) {
  return handles.evaluateAll((els) =>
    els.map((el) => {
      const block = el.parentElement;
      const input = block?.querySelector('textarea, input');
      if (input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement) {
        return input.value;
      }
      return block?.textContent?.trim().slice(0, 30) ?? '';
    }),
  );
}

test('keyboard reorder moves one item at a time', async ({ page }) => {
  const title = `Keyboard reorder test ${Date.now()}`;
  const sheetId = await createSheet(title, getFullTemplateBlocks());
  try {
    const logs: string[] = [];
    page.on('console', (msg) => logs.push(msg.text()));
    await login(page);
    await page.goto(`/builder?sheet=${sheetId}`, { waitUntil: 'networkidle' });

    const handles = page.getByRole('button', { name: 'ブロックを並べ替え' });
    await expect(handles).toHaveCount(7);

    const before = await getBlockValues(handles);

    // Focus the drag handle and move the block down one position with ArrowDown.
    await handles.nth(1).focus();
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(200);

    const after = await getBlockValues(handles);
    console.log('before:', before);
    console.log('after:', after);
    console.log('browser logs:', logs);

    // The block originally at index 1 should now be at index 2.
    expect(after[1]).not.toBe(before[1]);
    expect(after[2]).toBe(before[1]);
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

    await page.getByRole('button', { name: '案件エディタ' }).click();
    await page.getByRole('button', { name: 'ブロック編集' }).click();

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
      await page.getByRole('button', { name: '案件エディタ' }).click();
      await page.getByRole('button', { name: 'ナビを展開' }).click();
      await page.getByRole('button', { name: '＋ 会社' }).click();
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

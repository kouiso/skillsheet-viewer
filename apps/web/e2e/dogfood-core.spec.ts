import fs from 'node:fs';
import path from 'node:path';
import { expect, type Page, test } from '@playwright/test';
import { buildConsoleDemoBlocks, createSheet, deleteSheet } from '@skillsheet/db';

const email = process.env.E2E_EMAIL ?? 'e2e-owner@example.test';
const password = process.env.E2E_PASSWORD ?? 'E2e-test-pass-99';
const viewerCode = process.env.VIEWER_CODE ?? 'viewer-code-local';
const reportDir = path.join(process.cwd(), 'test-results', 'dogfood-screenshots');

const viewports = [
  { name: 'sp-narrow', width: 320, height: 800 },
  { name: 'sp', width: 375, height: 812 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1280, height: 900 },
] as const;

type Theme = 'light' | 'dark';

async function login(page: Page) {
  await page.goto('/login');
  await page.getByLabel('メールアドレス').fill(email);
  await page.getByLabel('パスワード').fill(password);
  await page.getByRole('button', { name: 'ログイン' }).click();
  await page.waitForURL('/builder');
}

async function setTheme(page: Page, theme: Theme) {
  await page.evaluate((t) => localStorage.setItem('theme-mode', t), theme);
}

async function capture(page: Page, fileName: string, fullPage = true) {
  const target = path.join(reportDir, fileName);
  await page.screenshot({ path: target, fullPage });
  return target;
}

function collectErrors(page: Page) {
  const errors: string[] = [];
  const warnings: string[] = [];
  const handler = (msg: { type: () => string; text: () => string }) => {
    const type = msg.type();
    const text = msg.text();
    if (type === 'error') errors.push(text);
    if (type === 'warning') warnings.push(text);
  };
  page.on('console', handler);
  return { errors, warnings, off: () => page.off('console', handler) };
}

test.describe.configure({ mode: 'serial' });

let richSheetId = '';
let richSheetTitle = '';
let newSheetId = '';

async function revalidateCache() {
  const baseURL = process.env.PLAYWRIGHT_BASEURL ?? 'http://127.0.0.1:3210';
  const secret = process.env.REVALIDATE_SECRET ?? 'revalidate-local';
  const res = await fetch(`${baseURL}/api/revalidate`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${secret}` },
  });
  if (!res.ok) {
    console.warn('revalidate failed:', res.status, await res.text());
  }
}

test.beforeAll(async () => {
  fs.mkdirSync(reportDir, { recursive: true });
  richSheetTitle = `Dogfood Core Sheet ${Date.now()}`;
  richSheetId = await createSheet(richSheetTitle, buildConsoleDemoBlocks());
  // DB に直接 insert したため、/view の unstable_cache を即無効化する
  await revalidateCache();
});

test.afterAll(async () => {
  try {
    if (newSheetId) await deleteSheet(newSheetId);
  } catch {}
  try {
    if (richSheetId) await deleteSheet(richSheetId);
  } catch {}
});

test('editor: create new sheet from full template and edit blocks', async ({ page }) => {
  const { errors, warnings, off } = collectErrors(page);
  await login(page);

  // 新規シート作成（フルスキルシート）
  await page.getByRole('button', { name: '新規シート' }).click();
  await expect(page.getByText('新規シートを作成')).toBeVisible();
  await page.locator('#new-sheet-title').fill('Dogfood フルスキルシート');
  await page.locator('#new-sheet-template').selectOption('full');
  await page.getByRole('button', { name: '作成' }).click();
  await page.waitForURL(/\/builder\?sheet=/);
  const url = page.url();
  newSheetId = new URL(url).searchParams.get('sheet') ?? '';
  expect(newSheetId).toMatch(/^[0-9a-f-]{36}$/);

  await capture(page, 'A-editor-new-sheet-initial-light.png');

  // タイトル編集
  await page.locator('#sheet-title').fill('Dogfood フルスキルシート 編集済');

  // スキルブロックに 1 行追加
  await page.getByRole('button', { name: 'スキルを追加' }).first().click();
  const skillInputs = page.getByLabel(/スキル\d+の名称/);
  await skillInputs.last().fill('Playwright');

  // 職務経歴ブロック追加
  await page.getByRole('button', { name: '職務経歴' }).click();
  await page.getByLabel('会社名').last().fill('Dogfood 株式会社');
  await page.getByLabel('職種').last().fill('QA エンジニア');
  await page.getByLabel('業務内容').last().fill('E2E 自動化テストの設計・実装');

  // 保存
  await page.getByRole('button', { name: '保存' }).first().click();
  await expect(page.getByText(/保存済|保存しました/)).toBeVisible({ timeout: 15000 });

  await capture(page, 'A-editor-after-save-light.png');

  // プレビューを別ウィンドウで開く
  const [previewPage] = await Promise.all([
    page.waitForEvent('popup'),
    page.getByRole('button', { name: 'プレビューを別ウィンドウで開く' }).click(),
  ]);
  await previewPage.waitForURL('/builder/preview');
  await previewPage.waitForLoadState('networkidle');
  await capture(previewPage, 'A-preview-light.png');
  const previewText = await previewPage.locator('body').innerText();
  expect(previewText).toContain('Dogfood フルスキルシート 編集済');
  expect(previewText).toContain('Playwright');
  await previewPage.close();

  off();
  expect(errors).toEqual([]);
  expect(warnings).toEqual([]);
});

test('editor: edit all block types on dashboard sheet', async ({ page }) => {
  const { errors, warnings, off } = collectErrors(page);
  await login(page);
  await page.goto(`/builder?sheet=${richSheetId}`);
  await page.waitForLoadState('networkidle');

  // プロフィールブロック編集
  await page.getByLabel('名前').fill('Dogfood 太郎');
  await page.getByLabel('肩書き').fill('スキルシート検証エンジニア');
  await page.getByLabel('所属会社').fill('Dogfood 株式会社');
  await page.getByLabel('自己PR').fill('細部まで丁寧に確認します');
  await page.getByLabel('強み').fill('自動化テスト\n品質保証\nドッグフーディング');
  await page.getByLabel('年齢').fill('30');
  await page.getByLabel('勤務形態').fill('フルリモート');
  await page.getByLabel('最寄り駅').fill('渋谷駅');
  await page.getByLabel('学歴').fill('大学卒');

  await capture(page, 'B-editor-profile-light.png');

  // 案件エディタタブで会社・案件追加
  await page.getByRole('button', { name: '案件エディタ' }).click();
  await page.getByRole('button', { name: '＋ 会社' }).click();
  await page.locator('input[aria-label="会社名"]').first().fill('Dogfood クライアント');

  await page.getByRole('button', { name: '＋ 案件を追加' }).click();
  await page.getByLabel('案件タイトル').fill('スキルシート可視化');
  await page.locator('select[aria-label="役割"]').selectOption('SE');

  // 期間：ネイティブ month 入力へ直接値をセット
  const startMonth = page.locator('input[type="month"]').first();
  await startMonth.evaluate((el: HTMLInputElement) => {
    el.value = '2024-01';
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });

  await page.getByLabel('チーム規模').fill('5');
  await page.getByLabel('担当業務').fill('・E2E 自動化\n・CI 構築');

  await capture(page, 'B-editor-project-light.png');

  // 保存
  await page.getByRole('button', { name: '保存' }).first().click();
  await expect(page.getByText(/保存済|保存しました/)).toBeVisible({ timeout: 15000 });

  await capture(page, 'B-editor-after-save-light.png');

  off();
  expect(errors).toEqual([]);
  expect(warnings).toEqual([]);
});

test('viewer: auth, list, detail, PDF download, theme and viewports', async ({ browser }) => {
  const context = await browser.newContext({});
  const page = await context.newPage();
  const { errors, warnings, off } = collectErrors(page);

  // 閲覧者認証
  await page.goto('/viewer-auth');
  await page.getByLabel('認証コード').fill(viewerCode);
  await page.getByRole('button', { name: '認証' }).click();
  await page.waitForURL('/view');
  await expect(page.getByRole('button', { name: new RegExp(richSheetTitle) }).first()).toBeVisible();
  await capture(page, 'C-viewer-list-light.png');

  // 詳細へ
  await page
    .getByRole('button', { name: new RegExp(richSheetTitle) })
    .first()
    .click();
  await page.waitForURL(/\/view\/db\//);
  await capture(page, 'C-viewer-detail-light.png');

  // PDF ダウンロード
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'PDFダウンロード' }).click(),
  ]);
  const downloadPath = await download.path();
  expect(downloadPath).toBeTruthy();
  if (!downloadPath) {
    throw new Error('PDF download path is missing');
  }
  const stats = fs.statSync(downloadPath);
  expect(stats.size).toBeGreaterThan(0);

  // テーマ・viewport ループ
  for (const theme of ['light', 'dark'] as const) {
    await setTheme(page, theme);
    for (const viewport of viewports) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.reload({ waitUntil: 'networkidle' });
      await page.waitForTimeout(800);
      await capture(page, `C-viewer-detail-${theme}-${viewport.name}.png`);

      const overflow = await page.evaluate(() => {
        const html = document.documentElement;
        return {
          scrollWidth: html.scrollWidth,
          clientWidth: html.clientWidth,
          hasOverflow: html.scrollWidth > html.clientWidth,
        };
      });
      expect(overflow.hasOverflow, `横スクロール: ${theme} / ${viewport.name}`).toBe(false);

      // tap target 44px 以上を簡易チェック
      const smallTargets = await page.evaluate(() =>
        [...document.querySelectorAll('button, a, [role="button"], input, select, textarea')]
          .map((el) => ({
            w: el.getBoundingClientRect().width,
            h: el.getBoundingClientRect().height,
            tag: el.tagName,
          }))
          .filter((r) => r.w > 0 && r.h > 0 && (r.w < 44 || r.h < 44)),
      );
      if (smallTargets.length > 0) {
        console.warn(`small tap targets ${theme}/${viewport.name}:`, smallTargets.slice(0, 5));
      }
    }
  }

  // テーマ切り替え確認
  await setTheme(page, 'dark');
  await page.reload({ waitUntil: 'networkidle' });
  const themeMode = await page.evaluate(() => localStorage.getItem('theme-mode'));
  expect(themeMode).toBe('dark');

  off();
  expect(errors).toEqual([]);
  expect(warnings).toEqual([]);
});

import { execSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { expect, type Page, test } from '@playwright/test';
import { createRealVolumeDemoSheet, deleteSheet, getSkillSheetById, listSheets } from '@skillsheet/db';
import { authFile, login } from './auth';

test.use({ storageState: authFile });

const viewerCode = process.env.VIEWER_CODE ?? 'viewer-code-local';
const revalidateSecret = process.env.REVALIDATE_SECRET ?? 'revalidate-local';
const baseURL = process.env.PLAYWRIGHT_BASEURL ?? 'http://127.0.0.1:3210';
const reportDir = path.join(process.cwd(), 'test-results', 'adversarial', 'screenshots');
const tmpDir = path.join(process.cwd(), 'test-results', 'adversarial', 'tmp');

const viewports = [
  { name: 'sp-narrow', width: 320, height: 812 },
  { name: 'sp', width: 375, height: 812 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1280, height: 800 },
  { name: 'fhd', width: 1920, height: 1080 },
] as const;

type Theme = 'light' | 'dark';

test.setTimeout(180_000);

const RUN_ID = randomUUID().slice(0, 8);
const SHEET_PREFIX = `Adversarial ${RUN_ID}`;
let richSheetId = '';
const createdSheetIds: string[] = [];

async function cleanupSheets() {
  const sheets = await listSheets();
  const matched = sheets.filter((s) => s.title.startsWith(SHEET_PREFIX));
  await Promise.all(
    matched.map(async (s) => {
      try {
        await deleteSheet(s.id);
      } catch (err) {
        console.warn('cleanup failed:', s.id, err);
      }
    }),
  );
}

async function setTheme(page: Page, theme: Theme) {
  await page.evaluate((t) => localStorage.setItem('theme-mode', t), theme);
  await page.reload({ waitUntil: 'networkidle' });
}

async function capture(page: Page, fileName: string, fullPage = true) {
  const target = path.join(reportDir, fileName);
  fs.mkdirSync(path.dirname(target), { recursive: true });
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

async function waitForAutosave(page: Page, label: string, timeout = 15_000) {
  const indicator = page.locator('[data-slot="autosave-indicator"]');
  await expect(indicator).toContainText(label, { timeout });
  return indicator;
}

test.beforeAll(async () => {
  fs.mkdirSync(reportDir, { recursive: true });
  fs.mkdirSync(tmpDir, { recursive: true });
  await cleanupSheets();
  richSheetId = await createRealVolumeDemoSheet();
});

test.afterAll(async () => {
  await cleanupSheets();
});

test('A. rapid edit/save cycles', async ({ page }) => {
  const { errors, warnings, off } = collectErrors(page);
  await login(page);

  await page.getByRole('button', { name: '新規シート' }).click();
  await expect(page.getByText('新規シートを作成')).toBeVisible();
  await page.locator('#new-sheet-title').fill(`${SHEET_PREFIX} rapid`);
  await page.locator('#new-sheet-template').selectOption('full');
  await page.getByRole('button', { name: '作成' }).click();
  await page.waitForURL(/\/builder\?sheet=/);
  const newId = new URL(page.url()).searchParams.get('sheet') ?? '';
  createdSheetIds.push(newId);

  // rapid skill rows add/remove
  const addSkill = page.getByRole('button', { name: 'スキルを追加' }).first();
  for (let i = 0; i < 5; i++) await addSkill.click();
  const skills = page.getByLabel(/スキル\d+の名称/);
  const skillCount = await skills.count();
  expect(skillCount).toBeGreaterThanOrEqual(5);

  // rapid table row/column (use the add-button, not the palette chip)
  await page.getByRole('button', { name: 'テーブル' }).nth(1).click();
  const addRow = page.getByRole('button', { name: '行を追加' }).first();
  for (let i = 0; i < 3; i++) await addRow.click();

  // rapid column add / remove on first table block
  await page.getByLabel('列を追加').first().click();
  await page.getByRole('button', { name: '行を追加' }).first().click();

  // switch tabs 5 times
  for (let i = 0; i < 5; i++) {
    await page.getByRole('button', { name: '案件エディタ' }).click();
    await page.getByRole('button', { name: /^ブロック/ }).click();
  }

  // add experience and immediately delete
  await page.getByRole('button', { name: '職務経歴' }).click();
  await expect(page.getByLabel('会社名').last()).toBeVisible();

  // save
  await page.getByRole('button', { name: '保存' }).first().click();
  await expect(page.getByText(/保存済|保存しました/)).toBeVisible({ timeout: 15_000 });

  // preview popup
  const [popup] = await Promise.all([
    page.waitForEvent('popup'),
    page.getByRole('button', { name: 'プレビューを別ウィンドウで開く' }).click(),
  ]);
  await popup.waitForURL('/builder/preview');
  await popup.waitForLoadState('networkidle');
  await capture(popup, 'A-preview-rapid.png');
  const previewText = await popup.locator('body').innerText();
  expect(previewText).toContain(`${SHEET_PREFIX} rapid`);
  await popup.close();

  off();
  expect(errors).toEqual([]);
  expect(warnings).toEqual([]);
});

test('B. extreme input edge cases', async ({ page }) => {
  const { errors, warnings, off } = collectErrors(page);
  await login(page);

  await page.getByRole('button', { name: '新規シート' }).click();
  await page.locator('#new-sheet-title').fill(`${SHEET_PREFIX} extreme`);
  await page.locator('#new-sheet-template').selectOption('console-dashboard');
  await page.getByRole('button', { name: '作成' }).click();
  await page.waitForURL(/\/builder\?sheet=/);
  const newId = new URL(page.url()).searchParams.get('sheet') ?? '';
  createdSheetIds.push(newId);

  const longName = `${'A'.repeat(200)}全角テスト🚀<script>alert(1)</script>`;
  const longDesc = `${'D'.repeat(1000)}\n絵文字🎉\n<script>console.log("xss")</script>\n&lt;html&gt;`;

  // profile
  await page.getByLabel('名前').fill(longName);
  await page.getByLabel('自己PR').fill(longDesc);

  // skill block
  await page.getByRole('button', { name: 'スキル一覧' }).click();
  await page.getByRole('button', { name: 'スキルを追加' }).first().click();
  await page
    .getByLabel(/スキル\d+の名称/)
    .last()
    .fill(longName);

  // project editor
  await page.getByRole('button', { name: '案件エディタ' }).click();
  await page.getByRole('button', { name: '＋ 会社' }).click();
  await page.locator('input[aria-label="会社名"]').first().fill(longName);
  await page.getByRole('button', { name: '＋ 案件を追加' }).click();
  await page.getByLabel('案件タイトル').fill(longName);
  // required empty -> should show validation error then refill
  await page.getByLabel('案件タイトル').fill('');
  await expect(page.getByText('必須項目です')).toBeVisible();
  await page.getByLabel('案件タイトル').fill(longName);
  await expect(page.getByText('必須項目です')).not.toBeVisible();

  await page.getByLabel('担当業務').fill(longDesc);
  await page.getByLabel('コメント').fill(longDesc);

  // start month
  const startMonth = page.locator('input[type="month"]').first();
  await startMonth.evaluate((el: HTMLInputElement) => {
    el.value = '2020-01';
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });

  await page.getByRole('button', { name: '保存' }).first().click();
  await expect(page.getByText(/保存済|保存しました/)).toBeVisible({ timeout: 15_000 });

  await capture(page, 'B-extreme-inputs.png');

  // preview
  const [popup] = await Promise.all([
    page.waitForEvent('popup'),
    page.getByRole('button', { name: 'プレビューを別ウィンドウで開く' }).click(),
  ]);
  await popup.waitForURL('/builder/preview');
  await popup.waitForLoadState('networkidle');
  const previewText = await popup.locator('body').innerText();
  expect(previewText).toContain('A'.repeat(50));
  expect(previewText).not.toContain('alert(1)');
  await popup.close();

  // DB persisted
  const sheet = await getSkillSheetById(newId);
  const skillBlock = sheet.blocks.find((b) => b.type === 'skills');
  expect(skillBlock).toBeTruthy();

  off();
  expect(errors).toEqual([]);
  expect(warnings).toEqual([]);
});

test('C. viewport sweep builder and viewer', async ({ browser }) => {
  const editorContext = await browser.newContext({ storageState: authFile });
  const editorPage = await editorContext.newPage();
  const { errors: eErrors, warnings: eWarnings, off: eOff } = collectErrors(editorPage);
  await login(editorPage);

  const viewerContext = await browser.newContext();
  const viewerPage = await viewerContext.newPage();
  const { errors: vErrors, warnings: vWarnings, off: vOff } = collectErrors(viewerPage);
  await viewerPage.goto('/viewer-auth', { waitUntil: 'networkidle' });
  await viewerPage.getByLabel('認証コード').fill(viewerCode);
  await viewerPage.getByRole('button', { name: '認証' }).click();
  await viewerPage.waitForURL('/view');

  for (const theme of ['light', 'dark'] as const) {
    for (const viewport of viewports) {
      // builder: load page, set theme and reload so ThemeModeProvider reads it
      await editorPage.setViewportSize({ width: viewport.width, height: viewport.height });
      await editorPage.goto(`/builder?sheet=${richSheetId}`, { waitUntil: 'networkidle' });
      await setTheme(editorPage, theme);
      await editorPage.waitForTimeout(400);
      const bOverflow = await editorPage.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      );
      expect(bOverflow, `builder overflow ${theme}/${viewport.name}`).toBe(false);
      await capture(editorPage, `C-builder-${theme}-${viewport.name}.png`);

      // viewer
      await viewerPage.setViewportSize({ width: viewport.width, height: viewport.height });
      await viewerPage.goto(`/view/db/${richSheetId}`, { waitUntil: 'networkidle' });
      await setTheme(viewerPage, theme);
      await viewerPage.waitForTimeout(400);
      const vOverflow = await viewerPage.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      );
      expect(vOverflow, `viewer overflow ${theme}/${viewport.name}`).toBe(false);
      await capture(viewerPage, `C-viewer-${theme}-${viewport.name}.png`);
    }
  }

  eOff();
  vOff();
  expect(eErrors).toEqual([]);
  expect(eWarnings).toEqual([]);
  expect(vErrors).toEqual([]);
  expect(vWarnings).toEqual([]);

  await editorContext.close();
  await viewerContext.close();
});

test('D. network throttling and offline', async ({ page }) => {
  const { errors, warnings, off } = collectErrors(page);
  await login(page);

  await page.getByRole('button', { name: '新規シート' }).click();
  await page.locator('#new-sheet-title').fill(`${SHEET_PREFIX} network`);
  await page.locator('#new-sheet-template').selectOption('blank');
  await page.getByRole('button', { name: '作成' }).click();
  await page.waitForURL(/\/builder\?sheet=/);
  const newId = new URL(page.url()).searchParams.get('sheet') ?? '';
  createdSheetIds.push(newId);

  await page.getByRole('button', { name: '案件エディタ' }).click();
  await page.getByRole('button', { name: '＋ 会社' }).click();
  const companyInput = page.locator('input[aria-label="会社名"]').first();

  // slow 3G on trpc
  await page.route('**/api/trpc/**', async (route) => {
    await new Promise((r) => setTimeout(r, 3000));
    await route.continue();
  });

  await companyInput.fill('Slow company');
  await waitForAutosave(page, '保存済み（自動）', 20_000);
  await capture(page, 'D-autosave-slow3g.png');

  // offline
  await page.unroute('**/api/trpc/**');
  await page.context().setOffline(true);
  await companyInput.fill('Offline company');
  await waitForAutosave(page, '自動保存に失敗', 20_000);
  await capture(page, 'D-autosave-offline.png');

  // recovery
  await page.context().setOffline(false);
  await companyInput.fill('Recovered company');
  await waitForAutosave(page, '保存済み（自動）', 20_000);
  await capture(page, 'D-autosave-recovered.png');

  off();
  const nonNetworkErrors = errors.filter((e) => !/net::ERR_|Failed to load resource/.test(e));
  expect(nonNetworkErrors).toEqual([]);
  expect(warnings).toEqual([]);
});

test('E. auth edge cases', async ({ browser }) => {
  const anonContext = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const page = await anonContext.newPage();
  const { errors, warnings, off } = collectErrors(page);

  // invalid code
  await page.goto('/viewer-auth');
  await page.getByLabel('認証コード').fill('wrong-code');
  await page.getByRole('button', { name: '認証' }).click();
  await expect(page.getByText('認証コードが正しくありません')).toBeVisible();
  await capture(page, 'E-invalid-code.png');

  // reload should clear error
  await page.reload({ waitUntil: 'networkidle' });
  await expect(page.getByText('認証コードが正しくありません')).not.toBeVisible();

  // empty code
  await page.getByLabel('認証コード').fill('');
  await page.getByRole('button', { name: '認証' }).click();
  // html5 required prevents submit
  await expect(page).toHaveURL(/viewer-auth/);

  // direct access to /view/db/:id without auth should redirect to viewer-auth
  await page.goto(`/view/db/${richSheetId}`, { waitUntil: 'commit' });
  await expect(page).toHaveURL(/viewer-auth/);
  await capture(page, 'E-unauth-viewer.png');

  // viewer authed trying /builder
  await page.goto('/viewer-auth');
  await page.getByLabel('認証コード').fill(viewerCode);
  await page.getByRole('button', { name: '認証' }).click();
  await page.waitForURL(/\/(view|view\/db)/);
  await page.goto('/builder');
  await expect(page).toHaveURL(/login/);
  await capture(page, 'E-viewer-to-login.png');

  off();
  const nonAuthErrors = errors.filter((e) => !/401|net::ERR_|Failed to load resource/.test(e));
  expect(nonAuthErrors).toEqual([]);
  expect(warnings).toEqual([]);

  await anonContext.close();
});

test('F. PDF stress', async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  const { errors, warnings, off } = collectErrors(page);

  await page.goto('/viewer-auth');
  await page.getByLabel('認証コード').fill(viewerCode);
  await page.getByRole('button', { name: '認証' }).click();
  await page.waitForURL('/view');

  await page.goto(`/view/db/${richSheetId}`, { waitUntil: 'networkidle' });
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'PDFダウンロード' }).click();
  const download = await downloadPromise;
  const pdfPath = path.join(tmpDir, `stress-${RUN_ID}.pdf`);
  await download.saveAs(pdfPath);
  expect(fs.existsSync(pdfPath)).toBe(true);
  expect(fs.statSync(pdfPath).size).toBeGreaterThan(0);

  // page count
  const pdfinfo = execSync(`pdfinfo "${pdfPath}"`, { encoding: 'utf-8' });
  const pagesMatch = pdfinfo.match(/Pages:\s+(\d+)/);
  const pageCount = pagesMatch ? Number(pagesMatch[1]) : 0;
  expect(pageCount).toBeGreaterThanOrEqual(2);

  // render pages
  const ppmBase = path.join(tmpDir, `stress-${RUN_ID}`);
  execSync(`pdftoppm -png -r 150 "${pdfPath}" "${ppmBase}"`);
  const pngs = fs.readdirSync(tmpDir).filter((f) => f.startsWith(`stress-${RUN_ID}-`) && f.endsWith('.png'));
  expect(pngs.length).toBe(pageCount);
  // all same size
  const sizes = new Set<string>();
  for (const f of pngs) {
    const imgPath = path.join(tmpDir, f);
    const size = execSync(`identify -format '%wx%h' "${imgPath}"`, { encoding: 'utf-8' }).trim();
    sizes.add(size);
    fs.copyFileSync(imgPath, path.join(reportDir, f));
  }
  expect(sizes.size).toBe(1);

  // extract text and check all project titles present
  const txtPath = path.join(tmpDir, `stress-${RUN_ID}.txt`);
  execSync(`pdftotext -layout "${pdfPath}" "${txtPath}"`);
  const text = fs.readFileSync(txtPath, 'utf-8');

  const sheet = await getSkillSheetById(richSheetId);
  const projectBlock = sheet.blocks.find((b) => b.type === 'project');
  expect(projectBlock).toBeTruthy();
  const projectItems = (projectBlock?.data as { items?: { title: string }[] })?.items ?? [];
  const missing = projectItems.filter((item) => !text.includes(item.title));
  expect(missing, `Missing project titles in PDF: ${missing.map((i) => i.title).join(', ')}`).toHaveLength(0);

  off();
  expect(errors).toEqual([]);
  expect(warnings).toEqual([]);

  await context.close();
});

test('G. dark mode visual regression', async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto('/viewer-auth');
  await page.getByLabel('認証コード').fill(viewerCode);
  await page.getByRole('button', { name: '認証' }).click();
  await page.waitForURL('/view');
  await page.goto(`/view/db/${richSheetId}`, { waitUntil: 'networkidle' });

  for (let i = 0; i < 3; i++) {
    await page.getByRole('button', { name: 'テーマ切り替え' }).click();
    await page.reload({ waitUntil: 'networkidle' });
    const theme = await page.evaluate(() => localStorage.getItem('theme-mode'));
    await page.waitForTimeout(400);
    await capture(page, `G-theme-${i}-${theme ?? 'unknown'}.png`);
  }

  const htmlClass = await page.evaluate(() => document.documentElement.classList.contains('dark'));
  expect(htmlClass).toBe(true);

  await context.close();
});

test('H. mobile tap target verification', async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  const allViolations: { viewport: string; url: string; tag: string; ariaLabel: string; w: number; h: number }[] = [];

  const routes = [
    { url: '/viewer-auth', auth: false },
    { url: '/login', auth: false },
    { url: `/view/db/${richSheetId}`, auth: true },
  ];

  for (const route of routes) {
    for (const viewport of viewports) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      if (route.auth) {
        await page.goto('/viewer-auth', { waitUntil: 'networkidle' });
        await page.getByLabel('認証コード').fill(viewerCode);
        await page.getByRole('button', { name: '認証' }).click();
        await page.waitForURL('/view');
      }
      await page.goto(route.url, { waitUntil: 'networkidle' });
      await page.waitForTimeout(300);

      const violations = await page.evaluate(() =>
        [...document.querySelectorAll('button, a, [role="button"], input, select, textarea, [role="switch"]')]
          .map((el) => {
            const r = el.getBoundingClientRect();
            const style = window.getComputedStyle(el);
            const visible = r.width > 0 && r.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
            return {
              tag: el.tagName,
              ariaLabel: (el.getAttribute('aria-label') ?? '').slice(0, 40),
              w: r.width,
              h: r.height,
              visible,
              small: visible && (r.width < 44 || r.height < 44),
            };
          })
          .filter((x) => x.small),
      );
      for (const v of violations) {
        allViolations.push({
          viewport: viewport.name,
          url: route.url,
          tag: v.tag,
          ariaLabel: v.ariaLabel,
          w: v.w,
          h: v.h,
        });
      }
      await capture(page, `H-tap-${route.url.replace(/\//g, '-')}-${viewport.name}.png`);
    }
  }

  if (allViolations.length > 0) {
    fs.writeFileSync(
      path.join(reportDir, 'H-tap-violations.json'),
      JSON.stringify(allViolations.slice(0, 50), null, 2),
    );
  }
  expect(allViolations, `tap target violations: ${JSON.stringify(allViolations.slice(0, 10))}`).toHaveLength(0);

  await context.close();
});

test('I. data freshness / revalidate', async ({ page, browser }) => {
  const { errors, warnings, off } = collectErrors(page);
  await login(page);

  await page.getByRole('button', { name: '新規シート' }).click();
  const title = `${SHEET_PREFIX} fresh`;
  await page.locator('#new-sheet-title').fill(title);
  await page.locator('#new-sheet-template').selectOption('console-dashboard');
  await page.getByRole('button', { name: '作成' }).click();
  await page.waitForURL(/\/builder\?sheet=/);
  const newId = new URL(page.url()).searchParams.get('sheet') ?? '';
  createdSheetIds.push(newId);

  const updatedTitle = `${title} updated`;
  await page.locator('#sheet-title').fill(updatedTitle);
  await page.getByRole('button', { name: '保存' }).first().click();
  await expect(page.getByText(/保存しました|保存済み/)).toBeVisible({ timeout: 30_000 });

  off();
  expect(errors.filter((e) => !/net::ERR_|Failed to load resource/.test(e))).toEqual([]);
  expect(warnings).toEqual([]);

  // call revalidate
  const res = await fetch(`${baseURL}/api/revalidate`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${revalidateSecret}` },
  });
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.revalidated).toContain('db-sheet');

  // verify viewer list updated
  const viewerContext = await browser.newContext();
  const vPage = await viewerContext.newPage();
  await vPage.goto('/viewer-auth');
  await vPage.getByLabel('認証コード').fill(viewerCode);
  await vPage.getByRole('button', { name: '認証' }).click();
  await vPage.waitForURL('/view');
  await expect(vPage.getByRole('button', { name: updatedTitle })).toBeVisible({ timeout: 30_000 });
  await vPage.goto(`/view/db/${newId}`, { waitUntil: 'networkidle' });
  await expect(vPage).toHaveTitle(new RegExp(updatedTitle));
  await capture(vPage, 'I-revalidate-viewer.png');

  await viewerContext.close();
});

import process from 'node:process';
import { expect, type Page, test } from '@playwright/test';
import { isProjectBlockData } from '@/db';
import { REAL_VOLUME_COMPANY_COUNT, REAL_VOLUME_DEMO_TITLE, REAL_VOLUME_PROJECT_COUNT } from '@/db/fixture';
import { authFile, login } from './auth';
import { createRealVolumeDemoSheet, deleteSheet, getSkillSheetById } from './document-fixture';

test.use({ storageState: authFile });

let viewSheetId = '';

const viewports = [
  { name: 'sp-narrow', width: 320, height: 800 },
  { name: 'sp', width: 375, height: 812 },
  // iPhone 12 以降の論理幅。375 と 768 の間が空いていて、実機で出る折り返し崩れや
  // 横スクロールを CI が見ていなかった。
  { name: 'sp-390', width: 390, height: 844 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1280, height: 800 },
] as const;

type Theme = 'light' | 'dark';

// globals.css: body { background-color: var(--background) }。light は #f6f8f8、
// dark は #0a0d0f。computed style は rgb() 形式で返る。
const THEME_BACKGROUND: Record<Theme, string> = {
  light: 'rgb(246, 248, 248)',
  dark: 'rgb(10, 13, 15)',
};

const hasDarkClass = (page: Page) => page.evaluate(() => document.documentElement.classList.contains('dark'));

/**
 * 指定テーマへ切り替える。
 * dark への遷移はページ上の「テーマ切り替え」ボタンを実際にクリックする（#374。
 * localStorage 直書きだと ThemeModeProvider の保存経路を通らず、
 * 「トグルで dark にしてもリロードで light に戻る」退行を検出できない）。
 * light は監査の初期状態（ベースライン）として localStorage へ直接置く。
 * トグルボタンを持たないページ（/login・/viewer-auth・/builder/preview）では
 * dark も「ユーザーが以前選択した保存値」として localStorage へ置き、
 * 復元経路の確認はリロード後のアサートで行う。
 */
async function applyTheme(page: Page, theme: Theme) {
  const themeToggle = page.getByRole('button', { name: 'テーマ切り替え' });
  if (theme === 'dark' && (await themeToggle.count()) > 0) {
    if (!(await hasDarkClass(page))) {
      await themeToggle.click();
      await expect.poll(() => hasDarkClass(page), { message: 'トグルで dark になること' }).toBe(true);
    }
    return;
  }
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

/**
 * viewport/テーマ設定 → reload → スクリーンショット・console計測の共通部分。
 * ページ側は既に対象ルートを表示済みであることが前提（goto は呼び出し側の責務）。
 */
async function measureAndCapture(page: Page, viewport: (typeof viewports)[number], theme: Theme, name: string) {
  await page.setViewportSize({ width: viewport.width, height: viewport.height });

  const errors: string[] = [];
  const warnings: string[] = [];
  const consoleHandler = (msg: { type: () => string; text: () => string }) => {
    const type = msg.type();
    const text = msg.text();
    if (type === 'error') errors.push(text);
    if (type === 'warning') warnings.push(text);
  };
  page.on('console', consoleHandler);

  await applyTheme(page, theme);
  await page.reload({ waitUntil: 'networkidle' });
  // 各ページの framer-motion 等アニメーションが完了してからスクリーンショットを取得する
  await page.waitForTimeout(1200);

  // #374: リロード後もテーマが維持されること。
  // html.dark の有無・localStorage の保存値・解決済みの body 背景色を確認する
  // （トグル → リロードで light に戻る、保存値が上書きされる退行の検出）。
  const themeState = await page.evaluate(() => ({
    dark: document.documentElement.classList.contains('dark'),
    stored: localStorage.getItem('theme-mode'),
    bodyBackground: getComputedStyle(document.body).backgroundColor,
  }));
  expect(themeState.dark, `${name}/${viewport.name}/${theme}: html.dark の有無`).toBe(theme === 'dark');
  expect(themeState.stored, `${name}/${viewport.name}/${theme}: localStorage theme-mode の保持`).toBe(theme);
  expect(themeState.bodyBackground, `${name}/${viewport.name}/${theme}: 背景色が ${theme} テーマの値であること`).toBe(
    THEME_BACKGROUND[theme],
  );

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

async function capturePage(
  page: Page,
  route: string,
  viewport: (typeof viewports)[number],
  theme: Theme,
  name: string,
) {
  await page.setViewportSize({ width: viewport.width, height: viewport.height });
  await page.goto(route, { waitUntil: 'networkidle' });
  return measureAndCapture(page, viewport, theme, name);
}

test.describe('Claude Design 全画面監査', () => {
  test.beforeAll(async () => {
    // #143 / #153 X-2: 合成デモシート（createConsoleDemoSheet, 11案件）では実データ
    // （19社/32案件）でのみ発生する 320px 横スクロールを検出できなかった。実データ相当の
    // ボリュームを持つフィクスチャに差し替える。
    viewSheetId = await createRealVolumeDemoSheet();
  });

  test.afterAll(async () => {
    if (viewSheetId) await deleteSheet(viewSheetId);
  });

  test('フィクスチャの件数が元データ（19社/32案件）と一致する', async () => {
    const sheet = await getSkillSheetById(viewSheetId);
    const projectBlock = sheet.blocks.find((b) => b.type === 'project');
    expect(projectBlock, 'project ブロックが存在すること').toBeTruthy();
    if (!projectBlock || !isProjectBlockData(projectBlock.data)) {
      throw new Error('project ブロックのデータが不正です');
    }
    expect(projectBlock.data.companies.length, `会社数が元データ(${REAL_VOLUME_COMPANY_COUNT}社)と一致`).toBe(
      REAL_VOLUME_COMPANY_COUNT,
    );
    expect(projectBlock.data.items.length, `案件数が元データ(${REAL_VOLUME_PROJECT_COUNT}案件)と一致`).toBe(
      REAL_VOLUME_PROJECT_COUNT,
    );
  });

  test('viewer /view/db/:id が320pxで横スクロールしない（#143 回帰検出）', async ({ page }) => {
    const route = `/view/db/${viewSheetId}`;
    await authViewer(page, route);
    const narrow = viewports.find((v) => v.width === 320);
    if (!narrow) throw new Error('320px の viewport 定義が見つかりません');
    const result = await capturePage(page, route, narrow, 'light', 'regression-143-320');
    expect(
      result.overflow.scrollWidth,
      `320px で scrollWidth(${result.overflow.scrollWidth}) が clientWidth(${result.overflow.clientWidth}) を超えないこと（#143）`,
    ).toBeLessThanOrEqual(result.overflow.clientWidth);
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

  test('/view シート一覧', async ({ page }) => {
    for (const viewport of viewports) {
      for (const theme of ['light', 'dark'] as const) {
        const result = await capturePage(page, '/view', viewport, theme, `view-list-${viewport.name}`);
        expect(result.overflow.hasOverflow, `横スクロール: ${viewport.name} / ${theme}`).toBe(false);
        expect(result.errors, `console.error: ${viewport.name} / ${theme}`).toEqual([]);
      }
    }
  });

  test('/ トップ（/view へリダイレクト）', async ({ page }) => {
    for (const viewport of viewports) {
      for (const theme of ['light', 'dark'] as const) {
        const result = await capturePage(page, '/', viewport, theme, `top-${viewport.name}`);
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
    // 実データ相当ボリュームのフィクスチャ（viewSheetId）を編集画面で開いた状態にする。
    await page.goto(`/builder?sheet=${viewSheetId}`, { waitUntil: 'networkidle' });

    // 「プレビューを別ウィンドウで開く」ボタンから実際に window.open() させ、
    // window.opener を持つ本物のポップアップとしてプレビューを開く。直接
    // page.goto('/builder/preview') すると window.opener が無く、
    // preview-client.tsx の hadOpenerRef ガードにより localStorage のシードが
    // 読み込まれず、実データではなく空のプレビューを監査してしまう（レビュー指摘）。
    const [popup] = await Promise.all([
      page.waitForEvent('popup'),
      page.getByRole('button', { name: 'プレビューを別ウィンドウで開く' }).click(),
    ]);
    await popup.waitForLoadState('networkidle');

    // 監査対象が実際に19社/32案件のフィクスチャであり、空のプレビューではないことを
    // キャプチャ開始前に確認する。
    await expect(popup.getByRole('heading', { name: new RegExp(REAL_VOLUME_DEMO_TITLE) })).toBeVisible();

    for (const viewport of viewports) {
      for (const theme of ['light', 'dark'] as const) {
        const result = await measureAndCapture(popup, viewport, theme, `preview-${viewport.name}`);
        expect(result.overflow.hasOverflow, `横スクロール: ${viewport.name} / ${theme}`).toBe(false);
        expect(result.errors, `console.error: ${viewport.name} / ${theme}`).toEqual([]);
      }
    }
  });
});

import process from 'node:process';
import { expect, type Page, test } from '@playwright/test';
import { createRealVolumeDemoSheet } from '@/db/fixture';
import { authFile } from './auth';

test.use({ storageState: authFile });

let viewSheetId = '';

async function authViewer(page: Page, route: string) {
  await page.goto(`/viewer-auth?next=${encodeURIComponent(route)}`);
  await page.getByLabel('認証コード').fill(process.env.VIEWER_CODE ?? 'viewer-code-local');
  await page.getByRole('button', { name: '認証' }).click();
  await page.waitForURL(route);
}

async function setTheme(page: Page, theme: 'light' | 'dark') {
  await page.evaluate((t) => {
    localStorage.setItem('theme-mode', t);
  }, theme);
}

test.describe('ビューアトップバー（#397）', () => {
  test.beforeAll(async () => {
    viewSheetId = await createRealVolumeDemoSheet();
  });

  // #397: 390px で表示切替ピルが2段に折れてヘッダーが ~177px に膨らみ、
  // scroll-mt-40(=160px) でアンカー到着した会社見出しを 7px 隠していた回帰。
  // ピル行は折り返さず横スクロールにして、ヘッダーを 120px 以下に収める。
  test('390px でヘッダーが120px以下かつ会社見出しが隠れない', async ({ page }) => {
    const route = `/view/db/${viewSheetId}`;
    await authViewer(page, route);
    await page.setViewportSize({ width: 390, height: 844 });

    for (const theme of ['light', 'dark'] as const) {
      await setTheme(page, theme);
      await page.goto(route, { waitUntil: 'networkidle' });
      await page.waitForTimeout(1200);

      const header = page.locator('header');
      const heading = page.locator('h2[id^="company-"][id$="-heading"]').first();
      await expect(heading).toBeVisible();

      const headerBox = await header.boundingBox();
      expect(headerBox, 'ヘッダーの boundingBox が取れること').not.toBeNull();
      expect(
        headerBox?.height ?? 0,
        `390px/${theme}: ヘッダー高さ ${headerBox?.height}px が 120px 以下であること`,
      ).toBeLessThanOrEqual(120);

      // 会社セクションへアンカー到着させる（scroll-mt-40 が効く到達点）。
      // ヘッダーが 160px を超えると見出し上端がヘッダー下に潜る。
      await heading.evaluate((el) => {
        el.scrollIntoView({ block: 'start' });
      });
      await page.waitForTimeout(300);

      const overlap = await page.evaluate(() => {
        const h = document.querySelector('header');
        const h2 = document.querySelector('h2[id^="company-"][id$="-heading"]');
        if (!h || !h2) return { hiddenPx: -1 };
        const hiddenPx = Math.max(0, h.getBoundingClientRect().bottom - h2.getBoundingClientRect().top);
        return { hiddenPx };
      });
      console.log(`[397] 390px/${theme}: header=${headerBox?.height}px hidden=${overlap.hiddenPx}px`);
      expect(overlap.hiddenPx, `390px/${theme}: 会社見出しがヘッダーに隠れないこと（0px）`).toBe(0);

      await page.screenshot({ path: `test-results/playwright/397-header-${theme}-sp390.png` });
    }
  });

  // #397: 1280px の出力ボタンは絵だけのアイコンで要約版がメニューだと分からない。
  // 「ダウンロード / Excel / 要約版 / テーマ」の4コントロールに文字を付け、
  // ダウンロードは PDF・Excel・要約版を選べるメニューにする。
  test('1280px で出力コントロールに文字が付きダウンロードがメニューになる', async ({ page }) => {
    const route = `/view/db/${viewSheetId}`;
    await authViewer(page, route);
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(route, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);

    // デスクトップ側のアイコン群（sm:flex）内のコントロールだけを見る。
    const desktopBar = page.locator('header div.hidden.sm\\:flex');
    await expect(desktopBar).toBeVisible();

    // 4 コントロールがそれぞれ可視テキストを持つ（アイコンのみでない）。
    // 「ダウンロード」は他ボタンの accessible name の部分文字列になるため exact で取る。
    const downloadTrigger = desktopBar.getByRole('button', { name: 'ダウンロード', exact: true });
    const excelButton = desktopBar.getByRole('button', { name: 'Excelダウンロード', exact: true });
    const digestTrigger = desktopBar.getByRole('button', { name: '要約版をダウンロード', exact: true });
    const themeButton = desktopBar.getByRole('button', { name: 'テーマ切り替え', exact: true });
    for (const [locator, text] of [
      [downloadTrigger, 'ダウンロード'],
      [excelButton, 'Excel'],
      [digestTrigger, '要約版'],
      [themeButton, 'テーマ'],
    ] as const) {
      await expect(locator).toBeVisible();
      await expect(locator, `ボタン内に可視テキスト「${text}」`).toContainText(text);
    }

    // メニューだと分かる affordance: Popover トリガー属性 + ▾ アイコン。
    await expect(downloadTrigger).toHaveAttribute('aria-haspopup', 'dialog');
    await expect(digestTrigger).toHaveAttribute('aria-haspopup', 'dialog');
    await expect(downloadTrigger.locator('svg')).toHaveCount(2); // Download + ChevronDown
    await expect(digestTrigger.locator('svg')).toHaveCount(2); // FileMinus + ChevronDown

    for (const theme of ['light', 'dark'] as const) {
      await setTheme(page, theme);
      await page.reload({ waitUntil: 'networkidle' });
      await page.waitForTimeout(1200);
      await page.screenshot({ path: `test-results/playwright/397-header-${theme}-desktop.png` });
    }

    // ダウンロードメニューを開くと PDF / Excel / 要約版の選択肢が出る（メニュー内に限定）。
    await setTheme(page, 'light');
    await page.reload({ waitUntil: 'networkidle' });
    await downloadTrigger.click();
    const popover = page.locator('[data-radix-popper-content-wrapper]');
    await expect(popover.getByRole('button', { name: 'PDFダウンロード' })).toBeVisible();
    await expect(popover.getByRole('button', { name: 'Excelダウンロード' })).toBeVisible();
    await expect(popover.getByRole('button', { name: 'PDF（要約版）ダウンロード' })).toBeVisible();
    await expect(popover.getByRole('button', { name: 'Excel（要約版）ダウンロード' })).toBeVisible();
    await page.screenshot({ path: 'test-results/playwright/397-download-menu-desktop-light.png' });
  });
});

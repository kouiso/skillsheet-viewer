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
  // ラベル付与でデスクトップも2段化（126px）し同じ欠陥を再発させたため、
  // 実際のアンカー遷移（location.hash）後の位置関係を 390/1024/1280/1440 で検証する。
  // scrollIntoView は h2 の scroll-mt（160px/76px）を必ず潜り抜ける実測距離を取れない
  // ——hash 遷移はブラウザの純正経路なので scroll-mt 効果込みで測れる。
  test('アンカー遷移後にヘッダーが会社見出しと目次を隠さない', async ({ page }) => {
    const route = `/view/db/${viewSheetId}`;
    await authViewer(page, route);

    const jumpToFirstCompany = async () => {
      const headingId = await page.locator('h2[id^="company-"][id$="-heading"]').first().getAttribute('id');
      expect(headingId, '会社見出し h2 の id が取れること').toBeTruthy();
      await page.evaluate((id) => {
        location.hash = `#${id}`;
      }, headingId as string);
      // アンカー遷移のスクロールと描画の安定待ち
      await page.waitForTimeout(400);
    };

    const measure = () =>
      page.evaluate(() => {
        const h = document.querySelector('header')?.getBoundingClientRect();
        const h2 = document.querySelector('h2[id^="company-"][id$="-heading"]')?.getBoundingClientRect();
        return { headerBottom: h?.bottom ?? -1, headerHeight: h?.height ?? -1, h2Top: h2?.top ?? -1 };
      });

    // 目次サイドバー（table-of-contents.tsx のデスクトップ aside）
    const toc = page.locator('aside').filter({ has: page.getByRole('button', { name: /目次/ }) });

    // 390px: ヘッダー ≤120px かつ会社見出しを隠さない（#397 本体の条件）
    await page.setViewportSize({ width: 390, height: 844 });
    for (const theme of ['light', 'dark'] as const) {
      await setTheme(page, theme);
      await page.goto(route, { waitUntil: 'networkidle' });
      await page.waitForTimeout(1200);
      await jumpToFirstCompany();

      const m = await measure();
      console.log(`[397] 390px/${theme}: header=${m.headerHeight}px bottom=${m.headerBottom} h2Top=${m.h2Top}`);
      expect(m.headerHeight, `390px/${theme}: ヘッダー高さが 120px 以下`).toBeLessThanOrEqual(120);
      expect(
        m.headerBottom,
        `390px/${theme}: 会社見出しがヘッダーに隠れない（header.bottom ${m.headerBottom} <= h2.top ${m.h2Top}）`,
      ).toBeLessThanOrEqual(m.h2Top);

      await page.screenshot({ path: `test-results/playwright/397-header-${theme}-sp390.png` });
    }

    // デスクトップ: ラベル付きでも1段（≤76px）。会社見出しも目次も隠さない。
    for (const width of [1024, 1280, 1440]) {
      for (const theme of ['light', 'dark'] as const) {
        await page.setViewportSize({ width, height: 800 });
        await setTheme(page, theme);
        await page.goto(route, { waitUntil: 'networkidle' });
        await page.waitForTimeout(1200);
        await jumpToFirstCompany();

        const m = await measure();
        const tocBox = await toc.boundingBox();
        console.log(
          `[397] ${width}px/${theme}: header=${m.headerHeight}px bottom=${m.headerBottom} h2Top=${m.h2Top} tocTop=${tocBox?.y ?? -1}`,
        );
        expect(m.headerHeight, `${width}px/${theme}: デスクトップヘッダーが1段（≤76px）`).toBeLessThanOrEqual(76);
        expect(
          m.headerBottom,
          `${width}px/${theme}: 会社見出しがヘッダーに隠れない（header.bottom ${m.headerBottom} <= h2.top ${m.h2Top}）`,
        ).toBeLessThanOrEqual(m.h2Top);
        if (width === 1280) {
          expect(tocBox, '1280px: 目次サイドバーが存在する').not.toBeNull();
          expect(
            tocBox?.y ?? -1,
            `1280px/${theme}: 目次がヘッダーに隠れない（toc.top ${tocBox?.y ?? -1} >= header.bottom ${m.headerBottom}）`,
          ).toBeGreaterThanOrEqual(m.headerBottom);
          await page.screenshot({ path: `test-results/playwright/397-header-${theme}-desktop.png` });
        }
      }
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

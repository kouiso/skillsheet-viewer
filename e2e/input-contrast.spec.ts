import { expect, type Locator, test } from '@playwright/test';
import { contrastRatio, readContrastColors } from './contrast';
import { hasStableOpaquePaint } from './paint-stability';

// 輝度・実効色の計算は e2e/contrast.ts に集約（#369 の文字コントラスト計測と共有）。
// 半透明色は evaluate 内で実効色へ合成済みなので、ここでは比率を取るだけ。
async function borderContrast(input: Locator) {
  const { background, borders, unsupported } = await input.evaluate(readContrastColors);
  expect(unsupported, '境界線の背景が計測可能であること').toEqual([]);
  if (!background) return 0;
  return Math.min(...borders.map((border) => (border.color === null ? 0 : contrastRatio(border.color, background))));
}

for (const theme of ['light', 'dark'] as const) {
  for (const width of [390, 1280]) {
    for (const route of ['/login', '/viewer-auth']) {
      test(`${route}: ${theme} ${width}pxで入力境界を識別できる`, async ({ browser }) => {
        const context = await browser.newContext({ viewport: { width, height: 900 } });
        try {
          await context.addInitScript((value) => localStorage.setItem('theme-mode', value), theme);
          const page = await context.newPage();
          await page.goto(route);
          await expect
            .poll(() => page.locator('html').evaluate((element) => element.classList.contains('dark')))
            .toBe(theme === 'dark');
          const inputs = page.locator('input:visible');
          await expect(inputs.first()).toBeVisible();
          expect(await inputs.count()).toBeGreaterThan(0);
          for (const input of await inputs.all()) {
            // toBeVisibleはopacity:0も可視と扱う。祖先のfadeが完了してから確定色を測る。
            await expect
              .poll(() => input.evaluate(hasStableOpaquePaint), {
                message: '入力欄と祖先の登場モーションが完了すること',
              })
              .toBe(true);
            await expect.poll(() => borderContrast(input)).toBeGreaterThanOrEqual(3);
            await input.hover();
            await expect.poll(() => input.evaluate(hasStableOpaquePaint)).toBe(true);
            await expect.poll(() => borderContrast(input)).toBeGreaterThanOrEqual(3);
            await page.mouse.move(0, 0);
            await input.focus();
            await expect.poll(() => input.evaluate(hasStableOpaquePaint)).toBe(true);
            await expect.poll(() => borderContrast(input)).toBeGreaterThanOrEqual(3);
            await input.evaluate((element) => element.blur());
          }
        } finally {
          await context.close();
        }
      });
    }
  }
}

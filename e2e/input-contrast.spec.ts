import { expect, type Locator, test } from '@playwright/test';
import { contrastRatio, readBorderColors } from './contrast';

// 輝度・実効色の計算は e2e/contrast.ts に集約（#369 の文字コントラスト計測と共有）。
// 半透明色は evaluate 内で実効色へ合成済みなので、ここでは比率を取るだけ。
async function borderContrast(input: Locator) {
  const { background, borders } = await input.evaluate(readBorderColors);
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
            await expect.poll(() => borderContrast(input)).toBeGreaterThanOrEqual(3);
            await input.hover();
            await expect.poll(() => borderContrast(input)).toBeGreaterThanOrEqual(3);
            await page.mouse.move(0, 0);
            await input.focus();
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

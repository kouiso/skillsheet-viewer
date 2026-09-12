import { expect, type Locator, test } from '@playwright/test';

async function borderContrast(input: Locator) {
  return input.evaluate((element) => {
    const style = getComputedStyle(element);
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('色の計測用Canvasを作成できません');
    const luminance = (color: string) => {
      context.clearRect(0, 0, 1, 1);
      context.fillStyle = color;
      context.fillRect(0, 0, 1, 1);
      const rgba = context.getImageData(0, 0, 1, 1).data;
      if (rgba[3] !== 255) throw new Error('半透明色はこの境界線検査の対象外です');
      return [0.2126, 0.7152, 0.0722].reduce((sum, weight, index) => {
        const channel = rgba[index] / 255;
        return sum + weight * (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
      }, 0);
    };
    const background = luminance(style.backgroundColor);
    return Math.min(
      ...(['top', 'right', 'bottom', 'left'] as const).map((side) => {
        const width = Number.parseFloat(style.getPropertyValue(`border-${side}-width`));
        const lineStyle = style.getPropertyValue(`border-${side}-style`);
        if (width < 1 || lineStyle === 'none' || lineStyle === 'hidden') return 0;
        const border = luminance(style.getPropertyValue(`border-${side}-color`));
        return (Math.max(border, background) + 0.05) / (Math.min(border, background) + 0.05);
      }),
    );
  });
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

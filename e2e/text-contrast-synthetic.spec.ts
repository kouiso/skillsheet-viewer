import { readFileSync } from 'node:fs';
import process from 'node:process';
import { expect, test } from '@playwright/test';
import { authFile } from './auth';
import { contrastRatio, readContrastColors, requiredTextRatio } from './contrast';
import { createSheet, deleteSheet } from './document-fixture';
import {
  buildContrastSyntheticBlocks,
  CONTRAST_SYNTHETIC_SKILL,
  CONTRAST_SYNTHETIC_TITLE,
} from './fixture/contrast-synthetic-sheet';

// #369: doc/text-contrast-verification.md の証跡（架空シートへ低コントラストを入れた検出試験）を
// 再現・検証する。記録した result.json と計測結果がずれたら失敗する。
// CONTRAST_EVIDENCE_OUT を指定したときだけ、同じ手順の画像を書き出す（証跡の撮り直し用）。
type Recorded = {
  theme: string;
  width: number;
  measured: number;
  baselineViolations: number;
  mutationDetected: number;
};
const recorded = JSON.parse(readFileSync('doc/contrast-evidence/result.json', 'utf8')) as Recorded[];
const out = process.env.CONTRAST_EVIDENCE_OUT;

test.use({ storageState: authFile });
let sheetId = '';
test.beforeAll(async () => {
  sheetId = await createSheet(`${CONTRAST_SYNTHETIC_TITLE} ${Date.now()}`, buildContrastSyntheticBlocks());
});
test.afterAll(async () => {
  if (sheetId) await deleteSheet(sheetId);
});

for (const theme of ['light', 'dark'] as const) {
  for (const width of [390, 1280] as const) {
    test(`架空シート ${theme} ${width}px: 通常0件・見出しを背景色にすると1件検出（記録と一致）`, async ({
      browser,
    }) => {
      const expected = recorded.find((r) => r.theme === theme && r.width === width);
      expect(expected, 'result.json に条件の記録があること').toBeDefined();
      const context = await browser.newContext({
        viewport: { width, height: 900 },
        storageState: authFile,
        reducedMotion: 'reduce',
      });
      try {
        await context.addInitScript((t) => localStorage.setItem('theme-mode', t), theme);
        const page = await context.newPage();
        const route = `/view/db/${sheetId}`;
        await page.goto(`/viewer-auth?next=${encodeURIComponent(route)}`);
        await page.getByLabel('認証コード').fill(process.env.VIEWER_CODE ?? 'viewer-code-local');
        await page.getByRole('button', { name: '認証' }).click();
        await page.waitForURL(route);
        await expect
          .poll(() => page.locator('html').evaluate((element) => element.classList.contains('dark')))
          .toBe(theme === 'dark');
        await page.waitForLoadState('networkidle');
        await page.locator(`[title="${CONTRAST_SYNTHETIC_SKILL}"]`).first().waitFor();
        const violations = (result: Awaited<ReturnType<typeof readContrastColors>>) =>
          result.samples.filter(
            (s) => contrastRatio(s.color, s.background) < requiredTextRatio(s.fontSize, s.fontWeight),
          ).length;

        const normal = await page.evaluate(readContrastColors, undefined);
        expect(normal.unsupported).toEqual([]);
        expect(normal.measured).toBe(expected?.measured);
        expect(violations(normal)).toBe(expected?.baselineViolations);
        if (out) await page.screenshot({ path: `${out}/${theme}-${width}-normal.png` });

        await page
          .locator('h1')
          .first()
          .evaluate((element) => {
            const color = getComputedStyle(document.body).backgroundColor;
            element.style.color = color;
            element.style.webkitTextFillColor = color;
          });
        const mutated = await page.evaluate(readContrastColors, undefined);
        expect(violations(mutated)).toBe(expected?.mutationDetected);
        if (out) await page.screenshot({ path: `${out}/${theme}-${width}-mutated.png` });
      } finally {
        await context.close();
      }
    });
  }
}

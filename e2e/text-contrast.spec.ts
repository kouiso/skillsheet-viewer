import process from 'node:process';
import { expect, type Page, test } from '@playwright/test';
import { createRealVolumeDemoSheet } from '@/db/fixture';
import { authFile } from './auth';
import { contrastRatio, readContrastColors, requiredTextRatio } from './contrast';

// #369: 閲覧画面（/view/db/:id）の本文・メタ文字のコントラストを機械ゲート化する。
// これまで入力境界（input-contrast.spec.ts）だけが機械計測で、採用担当者が実際に
// 読む本文は未監視だった。WCAG AA — 通常文字 4.5:1 / 大きい文字 3:1。
test.use({ storageState: authFile });

let viewSheetId = '';

async function authViewer(page: Page, route: string) {
  await page.goto(`/viewer-auth?next=${encodeURIComponent(route)}`);
  await page.getByLabel('認証コード').fill(process.env.VIEWER_CODE ?? 'viewer-code-local');
  await page.getByRole('button', { name: '認証' }).click();
  await page.waitForURL(route);
}

test.describe('/view/db/:id の文字コントラスト', () => {
  test.beforeAll(async () => {
    // 実データ相当ボリューム（19社/32案件）のフィクスチャ — design-audit.spec.ts と同じ
    // ものを使い、合成サンプルに無いメタ文字（期間・スキル凡例・数値ラベル）も対象にする。
    viewSheetId = await createRealVolumeDemoSheet();
  });

  for (const theme of ['light', 'dark'] as const) {
    for (const width of [390, 1280] as const) {
      test(`${theme} ${width}px で本文・メタ文字が AA コントラストを満たす`, async ({ browser }) => {
        const context = await browser.newContext({
          viewport: { width, height: 900 },
          storageState: authFile,
          // framer-motion の fadeup が計測中の不透明度を下げて偽陽性を出すのを防ぐ。
          // 色には影響しないので計測結果は変わらない。
          reducedMotion: 'reduce',
        });
        try {
          await context.addInitScript((t) => localStorage.setItem('theme-mode', t), theme);
          const page = await context.newPage();
          const route = `/view/db/${viewSheetId}`;
          await authViewer(page, route);
          // theme-mode が実際に html.dark へ反映されるまで待つ（入力 spec と同じ手順）。
          await expect
            .poll(() => page.locator('html').evaluate((element) => element.classList.contains('dark')))
            .toBe(theme === 'dark');
          await page.waitForLoadState('networkidle');
          // シート本文が描画されるまで待つ（networkidle だけだと RSC ストリーム後の
          // クライアント描画を待てないことがある）。フィクスチャ固有のスキル名を見る。
          await page.locator('[title="TypeScript/JavaScript"]').first().waitFor();

          // 半透明の固定ヘッダーはスクロール下の内容でコントラストが変わる。
          await expect(page.locator('header')).toHaveCSS(
            'background-color',
            theme === 'dark' ? 'rgb(10, 13, 15)' : 'rgb(246, 248, 248)',
          );
          await expect(page.locator('header')).toHaveCSS('backdrop-filter', 'none');
          await expect(page.locator('header fieldset')).toHaveCSS('mask-image', 'none');
          const result = await page.evaluate(readContrastColors, undefined);
          expect(result.unsupported, '未対応の背景を合格として扱わないこと').toEqual([]);
          // 計測対象がゼロだと「違反ゼロ」で vacuous pass する。フィクスチャの
          // 文字量から数十要素は必ずあるはずなので下限で枯れを検出する。
          expect(result.measured, '計測対象のテキスト要素が存在すること').toBeGreaterThan(30);

          const violations = result.samples
            .map((sample) => ({
              ...sample,
              required: requiredTextRatio(sample.fontSize, sample.fontWeight),
              ratio: contrastRatio(sample.color, sample.background),
            }))
            .filter((sample) => sample.ratio < sample.required);

          // 監視が効いている証跡を CI ログに残す（違反ゼロ＝ vacuous pass の区別用）。
          const minRatio = Math.min(...result.samples.map((s) => contrastRatio(s.color, s.background)));
          console.log(
            `[text-contrast] ${theme} ${width}px: measured=${result.measured}, min-ratio=${minRatio.toFixed(2)}`,
          );

          const describe = (v: (typeof violations)[number]) =>
            `${v.path}  "${v.text}"  ratio=${v.ratio.toFixed(2)} < ${v.required}  ` +
            `(${v.fontSize}px/${v.fontWeight}, color=${JSON.stringify(v.color)}, ` +
            `bg=${JSON.stringify(v.background)}${v.assumedBase ? ' assumed-base' : ''})`;
          expect(
            violations,
            `AA 未満の文字が ${violations.length} 件:\n${violations.map(describe).join('\n')}`,
          ).toEqual([]);
          // 技術候補の分類見出しはaria-hiddenでも視覚表示されるため計測対象に含める。
          await page.getByRole('combobox', { name: '技術を選ぶ' }).focus();
          const options = page.getByRole('listbox', { name: '技術の候補' });
          await expect(options).toBeVisible();
          const optionColors = await options.evaluate(readContrastColors);
          expect(optionColors.unsupported).toEqual([]);
          expect(optionColors.measured).toBeGreaterThan(0);
          expect(
            optionColors.samples.filter(
              (sample) =>
                contrastRatio(sample.color, sample.background) < requiredTextRatio(sample.fontSize, sample.fontWeight),
            ),
          ).toEqual([]);
          // 案件のない一覧は共通Header経路。こちらも内容に左右されない不透明面を保つ。
          await page.goto('/view');
          await expect(page.getByRole('textbox', { name: 'シート名で検索' })).toBeVisible();
          // ストリーミングの隠し重複と可視ヘッダーを区別する。可視2件をfirstで隠さない。
          const listHeaders = page.locator('header:visible');
          await expect(listHeaders).toHaveCount(1);
          for (const header of await listHeaders.all()) {
            await expect(header).toHaveCSS(
              'background-color',
              theme === 'dark' ? 'rgb(15, 19, 22)' : 'rgb(255, 255, 255)',
            );
            await expect(header).toHaveCSS('backdrop-filter', 'none');
          }
        } finally {
          await context.close();
        }
      });
    }
  }
});

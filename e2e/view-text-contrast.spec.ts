import process from 'node:process';
import { expect, type Page, test } from '@playwright/test';
import { createRealVolumeDemoSheet } from '@/db/fixture';
import { authFile } from './auth';

/**
 * 閲覧画面の本文・メタ文字を機械検査する。
 *
 * これまで自動ゲートは `input-contrast.spec.ts`（/login と /viewer-auth の入力欄の境界線だけ）
 * しかなく、採用担当が実際に読む /view/db/:id の文字は人の目でしか見ていなかった。
 * 実データ相当（19社/32案件）を描画して、可視テキストを全ノード走査で計測する。
 */

test.use({ storageState: authFile });

let viewSheetId = '';

const viewports = [
  { name: 'sp', width: 375, height: 812 },
  { name: 'sp-390', width: 390, height: 844 },
  { name: 'desktop', width: 1280, height: 800 },
] as const;

/**
 * 12px 未満のまま残していると分かっている表示。ここに無い小さい文字が増えたら落とす。
 * 部分一致なので、将来 12px へ上げた分を消しても検査は通る（減る方向は常に安全）。
 */
const KNOWN_SMALL_TEXT = [
  // 工程ステッパーの 7 列ラベル。320px で語中折れを起こすため 11px のまま。
  'font-mono text-[11px] leading-tight',
  // 案件カードの通し番号バッジ（データではなく並び順の目印）。
  'bg-primary-dark px-1.5 py-px font-mono text-[11px]',
  // 会社セクションの区分バッジ。
  'bg-accent-soft px-2 py-0.5 text-[11px]',
  // 工程カバレッジの工程名。4 列グリッドの幅に収めるため 11.5px のまま。
  'text-[11.5px] leading-tight',
];

interface MeasuredText {
  tag: string;
  /** その文字に効いているクラス。素の親に class が無いときは祖先まで遡る。 */
  cls: string;
  text: string;
  fontSize: number;
  ratio: number;
  required: number;
  /** 祖先の背景がグラデーションで、背景色を 1 色に決められなかったもの。 */
  bgUnknown: boolean;
}

function measureText(page: Page): Promise<MeasuredText[]> {
  return page.evaluate(() => {
    const parse = (css: string) => {
      const match = css.match(/rgba?\(([^)]+)\)/);
      if (!match) return null;
      const parts = match[1].split(',').map((value) => Number.parseFloat(value.trim()));
      return { r: parts[0], g: parts[1], b: parts[2], a: parts.length > 3 ? parts[3] : 1 };
    };
    type Rgba = { r: number; g: number; b: number; a: number };
    const over = (fg: Rgba, bg: Rgba): Rgba => ({
      r: fg.r * fg.a + bg.r * (1 - fg.a),
      g: fg.g * fg.a + bg.g * (1 - fg.a),
      b: fg.b * fg.a + bg.b * (1 - fg.a),
      a: 1,
    });
    const luminance = (c: Rgba) => {
      const channel = (value: number) => {
        const s = value / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * channel(c.r) + 0.7152 * channel(c.g) + 0.0722 * channel(c.b);
    };
    const contrast = (a: Rgba, b: Rgba) => {
      const first = luminance(a);
      const second = luminance(b);
      return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
    };
    // 背景は祖先を遡って最初の不透明色まで合成する。途中にグラデーションがあると
    // backgroundColor からは 1 色に決められないので、その旨を返して判定から外す。
    const backgroundOf = (element: Element) => {
      let current: Element | null = element;
      let accumulated: Rgba | null = null;
      let gradient = false;
      while (current) {
        const style = getComputedStyle(current);
        if (style.backgroundImage && style.backgroundImage !== 'none') gradient = true;
        const color = parse(style.backgroundColor);
        if (color && color.a > 0) {
          accumulated = accumulated ? over(accumulated, color) : color;
          if (color.a >= 1) return { color: accumulated, gradient };
        }
        current = current.parentElement;
      }
      return { color: accumulated ?? { r: 255, g: 255, b: 255, a: 1 }, gradient };
    };

    const results = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const seen = new Set<Element>();
    let node = walker.nextNode();
    while (node) {
      const text = node.textContent?.trim() ?? '';
      const element = node.parentElement;
      if (text && element && !seen.has(element)) {
        seen.add(element);
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        const foreground = parse(style.color);
        if (
          style.visibility !== 'hidden' &&
          style.display !== 'none' &&
          rect.width > 0 &&
          rect.height > 0 &&
          foreground
        ) {
          const background = backgroundOf(element);
          const effective = foreground.a < 1 ? over(foreground, background.color) : foreground;
          const fontSize = Number.parseFloat(style.fontSize);
          const weight = Number.parseInt(style.fontWeight, 10) || 400;
          // WCAG の large text は 24px 以上、または 18.66px 以上の bold。
          const large = fontSize >= 24 || (fontSize >= 18.66 && weight >= 700);
          // <ProcessLabelParts> のように class を持たない要素が直接の親になる場合がある。
          // 署名としては効いているクラスが要るので、空なら祖先を遡って最初の class を使う。
          let labelled: Element | null = element;
          while (labelled && !(typeof labelled.className === 'string' && labelled.className.trim())) {
            labelled = labelled.parentElement;
          }
          results.push({
            tag: element.tagName.toLowerCase(),
            cls: labelled && typeof labelled.className === 'string' ? labelled.className : '',
            text: text.slice(0, 40),
            fontSize: Math.round(fontSize * 100) / 100,
            ratio: Math.round(contrast(effective, background.color) * 100) / 100,
            required: large ? 3 : 4.5,
            bgUnknown: background.gradient,
          });
        }
      }
      node = walker.nextNode();
    }
    return results;
  });
}

async function authViewer(page: Page, route: string) {
  await page.goto(`/viewer-auth?next=${encodeURIComponent(route)}`);
  await page.getByLabel('認証コード').fill(process.env.VIEWER_CODE ?? 'viewer-code-local');
  await page.getByRole('button', { name: '認証' }).click();
  await page.waitForURL(route);
}

test.describe('閲覧画面のテキスト可読性', () => {
  test.beforeAll(async () => {
    viewSheetId = await createRealVolumeDemoSheet();
  });

  for (const viewport of viewports) {
    for (const theme of ['light', 'dark'] as const) {
      test(`/view/db/:id ${viewport.name} / ${theme} の文字が AA と最小サイズを満たす`, async ({ page }) => {
        const route = `/view/db/${viewSheetId}`;
        await authViewer(page, route);
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await page.evaluate((value) => localStorage.setItem('theme-mode', value), theme);
        await page.reload({ waitUntil: 'networkidle' });
        await page.waitForTimeout(1200);

        const measured = await measureText(page);
        expect(measured.length, '可視テキストが計測できること').toBeGreaterThan(100);

        const failures = measured
          .filter((item) => !item.bgUnknown && item.ratio < item.required)
          .map((item) => `${item.ratio}:1 < ${item.required}:1 / ${item.fontSize}px / ${item.text} / ${item.cls}`);
        expect(failures, `WCAG AA 未達のテキスト（${viewport.name} / ${theme}）`).toEqual([]);

        const unexpectedSmall = measured
          .filter((item) => item.fontSize < 12 && !KNOWN_SMALL_TEXT.some((known) => item.cls.includes(known)))
          .map((item) => `${item.fontSize}px / ${item.text} / ${item.cls}`);
        expect(unexpectedSmall, `12px 未満の想定外テキスト（${viewport.name} / ${theme}）`).toEqual([]);
      });
    }
  }
});

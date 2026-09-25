import process from 'node:process';
import { expect, type Page, test } from '@playwright/test';
import { createRealVolumeDemoSheet } from '@/db/fixture';
import { authFile } from './auth';

// #393: 閲覧画面で読み手が引っかかる細部 4 件の回帰検査。
// 合成フィクスチャ（real-volume-demo）のみを使う。実データは使わない。
test.use({ storageState: authFile });

let viewSheetId = '';

async function authViewer(page: Page, route: string) {
  await page.goto(`/viewer-auth?next=${encodeURIComponent(route)}`);
  await page.getByLabel('認証コード').fill(process.env.VIEWER_CODE ?? 'viewer-code-local');
  await page.getByRole('button', { name: '認証' }).click();
  await page.waitForURL(route);
}

async function openViewer(page: Page, width: number) {
  const route = `/view/db/${viewSheetId}`;
  await authViewer(page, route);
  await page.setViewportSize({ width, height: 900 });
  await page.reload({ waitUntil: 'networkidle' });
  // フィクスチャ由来の合成スキル名が出るまで待ち、描画完了を確定させる
  await page.locator('[title="TypeScript/JavaScript"]').first().waitFor();
}

test.describe('#393 閲覧画面の細部（読み手の引っかかり）', () => {
  test.beforeAll(async () => {
    viewSheetId = await createRealVolumeDemoSheet();
  });

  for (const width of [390, 1280] as const) {
    test(`案件カードの3欄（担当業務/習得スキル/コメント）が同じ本文サイズ — ${width}px`, async ({ page }) => {
      await openViewer(page, width);
      const sizes = await page.evaluate(() => {
        // 3欄がそろうのはフィクスチャの代表案件（案件01）のみ
        const article = [...document.querySelectorAll('article')].find((a) => a.textContent?.includes('習得スキル'));
        if (!article) return null;
        const out: Record<string, string> = {};
        for (const label of ['担当業務', '習得スキル', 'コメント']) {
          const labelEl = [...article.querySelectorAll('span')].find(
            (s) => s.children.length === 0 && s.textContent?.trim() === label,
          );
          const body = labelEl?.nextElementSibling?.querySelector('.inline-markdown');
          out[label] = body ? getComputedStyle(body).fontSize : 'missing';
        }
        return out;
      });
      expect(sizes, '代表案件カードが見つからない').not.toBeNull();
      expect(sizes?.担当業務).toBe('13.5px');
      expect(sizes?.習得スキル, '習得スキルが本文と同じサイズ').toBe(sizes?.担当業務);
      expect(sizes?.コメント, 'コメントが本文と同じサイズ').toBe(sizes?.担当業務);
    });

    test(`スキル名 'TypeScript/JavaScript' が語中で折れない — ${width}px`, async ({ page }) => {
      await openViewer(page, width);
      const result = await page.evaluate(() => {
        const span = document.querySelector('[title="TypeScript/JavaScript"]');
        if (!span) return null;
        // テキストノードごとのクライアント矩形を取る。語中で折れたテキストノードは
        // 行が分かれて複数の矩形を持つ。区切り直後（wbr）だけで折れるなら全ノード1矩形。
        const fragmentCounts: number[] = [];
        span.childNodes.forEach((node) => {
          if (node.nodeType === Node.TEXT_NODE && node.textContent?.trim()) {
            const range = document.createRange();
            range.selectNodeContents(node);
            fragmentCounts.push(range.getClientRects().length);
          }
        });
        return {
          fragmentCounts,
          overflow: span.scrollWidth > span.clientWidth,
        };
      });
      expect(result, 'スキル名セルが見つからない').not.toBeNull();
      expect(result?.overflow, 'セルからのはみ出し').toBe(false);
      expect(Math.max(...(result?.fragmentCounts ?? [0])), 'いずれかの語が語中で折れた（折れは区切り直後だけ）').toBe(
        1,
      );
    });
  }

  test('タイムラインの全タイトルの左端が揃う — 1280px', async ({ page }) => {
    await openViewer(page, 1280);
    const lefts = await page.evaluate(() => {
      const section = document.querySelector('#section-career-timeline')?.closest('section');
      if (!section) return null;
      const titles = [...section.querySelectorAll<HTMLElement>('.text-\\[14\\.5px\\].font-semibold')];
      return titles.map((el) => el.getBoundingClientRect().left);
    });
    expect(lefts, 'タイムラインのタイトル群が見つからない').not.toBeNull();
    expect(lefts?.length, 'タイトルが2件以上あること').toBeGreaterThan(1);
    const distinct = new Set((lefts ?? []).map((l) => Math.round(l)));
    expect(distinct.size, `タイトルの左端が一意であること（実測: ${lefts?.join(', ')}）`).toBe(1);
  });

  test('目次の項目が「…」省略で切れない — 1280px', async ({ page }) => {
    await openViewer(page, 1280);
    const clipped = await page.evaluate(() => {
      const spans = [...document.querySelectorAll<HTMLElement>('aside li button span:not([aria-hidden])')];
      return spans
        .map((s) => ({
          text: s.textContent ?? '',
          ellipsis: getComputedStyle(s).textOverflow === 'ellipsis',
          clipped: s.scrollWidth > s.clientWidth + 1,
        }))
        .filter((i) => i.ellipsis && i.clipped);
    });
    expect(clipped, '省略記号で切れた目次項目がゼロであること').toEqual([]);
    // 長い会社名が折り返しで全文出ていること（省略なし）
    const longLabel = page.locator('aside li button', { hasText: 'グローバルシステムズグループ' }).first();
    await expect(longLabel).toBeVisible();
  });
});

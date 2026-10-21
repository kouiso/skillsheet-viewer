import process from 'node:process';
import { expect, type Page, test } from '@playwright/test';
import { REAL_VOLUME_PROJECT_COUNT } from '@/db/fixture';
import { authFile } from './auth';
import { createRealVolumeDemoSheet, deleteSheet } from './document-fixture';

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

async function scrollToTop(page: Page) {
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
}

// smooth スクロールが止まるまで待つ。押した直後はまだ動き出していないことがあるので、
// 押す前の位置から動いたうえで、2 フレーム続けて同じ位置にいることを条件にする。
async function waitForScrollToSettle(page: Page, before: number) {
  await expect
    .poll(
      () =>
        page.evaluate(
          (start) =>
            new Promise<boolean>((resolve) => {
              const y0 = window.scrollY;
              requestAnimationFrame(() => {
                const y1 = window.scrollY;
                requestAnimationFrame(() => {
                  resolve(Math.abs(y0 - start) > 1 && y0 === y1 && y1 === window.scrollY);
                });
              });
            }),
          before,
        ),
      { message: 'スクロールが止まらない、または動かない', timeout: 5_000 },
    )
    .toBe(true);
}

async function measureHeading(page: Page, headingId: string) {
  return page.evaluate((id) => {
    const topbar = document.querySelector<HTMLElement>('header.console-topbar');
    const heading = document.getElementById(id);
    if (!topbar || !heading) return null;
    const rect = heading.getBoundingClientRect();
    // 見出しの中央に一番手前で描かれている要素。ヘッダーや別の帯が重なっていれば見出しの外になる。
    const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    return {
      hiddenPx: topbar.getBoundingClientRect().bottom - rect.top,
      onTop: hit !== null && heading.contains(hit),
    };
  }, headingId);
}

function expectHeadingLandedBelowTopbar(measured: Awaited<ReturnType<typeof measureHeading>>, label: string) {
  expect(measured, `${label}: ヘッダーか見出しが見つからない`).not.toBeNull();
  const hiddenPx = measured?.hiddenPx ?? Number.POSITIVE_INFINITY;
  expect(hiddenPx, `${label}: 見出しがヘッダーに隠れた量（px）`).toBeLessThanOrEqual(0.5);
  // 飛んだ先がその会社であること。ヘッダー直下から 48px 以内に見出しが来ていなければ移動していない。
  expect(hiddenPx, `${label}: 見出しがヘッダーの直下に来ていない（px）`).toBeGreaterThanOrEqual(-48);
  expect(measured?.onTop, `${label}: 見出しの上に別の要素が重なっている`).toBe(true);
}

test.describe('#393 閲覧画面の細部（読み手の引っかかり）', () => {
  test.beforeAll(async () => {
    viewSheetId = await createRealVolumeDemoSheet();
  });

  test.afterAll(async () => {
    if (viewSheetId) await deleteSheet(viewSheetId);
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

  for (const width of [390, 1280] as const) {
    // #377: 概要と担当業務が別の欄で、全案件に本文つきで出る。jsdom（project-section.test.tsx）だけでなく実ブラウザでも数える。
    test(`全案件カードに「概要」と「担当業務」が別の欄で本文つきで出る — ${width}px`, async ({ page }) => {
      await openViewer(page, width);
      const counts = await page.evaluate(
        ({ summaryOnly, dutiesOnly }) => {
          const cards = [...document.querySelectorAll('article')].filter((a) =>
            [...a.querySelectorAll('span')].some((s) => s.children.length === 0 && s.textContent?.trim() === '概要'),
          );
          // 欄の本文 = ラベル span の次の兄弟要素（project-card.tsx の CardBlock）。カード全体の文字列では
          // 欄の入れ替わりや片方への混入を見分けられないので、欄ごとに読む。
          const field = (card: Element, label: string) => {
            const labelEl = [...card.querySelectorAll('span')].find(
              (s) => s.children.length === 0 && s.textContent?.trim() === label,
            );
            return labelEl?.nextElementSibling?.textContent?.trim() ?? '';
          };
          return {
            cards: cards.length,
            summary: cards.filter((card) => field(card, '概要').length > 0).length,
            duties: cards.filter((card) => field(card, '担当業務').length > 0).length,
            // 概要の欄は概要の文だけ、担当業務の欄は担当業務の文だけを持つ。
            // 欄の入れ替わり（概要の文が担当業務の欄に出る）も、片方への連結もここで落ちる。
            summaryOnlyInSummary: cards.filter((card) => {
              const text = field(card, '概要');
              return text.includes(summaryOnly) && !text.includes(dutiesOnly);
            }).length,
            dutiesOnlyInDuties: cards.filter((card) => {
              const text = field(card, '担当業務');
              return text.includes(dutiesOnly) && !text.includes(summaryOnly);
            }).length,
          };
        },
        // real-volume-demo.ts の summary だけ・duties だけが持つ文
        { summaryOnly: '要件整理から実装・運用まで一気通貫で対応', dutiesOnly: '関連システムとの連携調整' },
      );
      expect(counts).toEqual({
        cards: REAL_VOLUME_PROJECT_COUNT,
        summary: REAL_VOLUME_PROJECT_COUNT,
        duties: REAL_VOLUME_PROJECT_COUNT,
        summaryOnlyInSummary: REAL_VOLUME_PROJECT_COUNT,
        dutiesOnlyInDuties: REAL_VOLUME_PROJECT_COUNT,
      });
    });
  }

  // #377: スマホ幅でヘッダーが画面を食わず、会社へ飛んだ時に見出しがヘッダーの下へ隠れない。
  // 利用者の操作（目次の項目・「会社から探す」のチップを押す）で飛び、smooth スクロールが止まってから測る。
  test('ヘッダーの高さが 120px 以下で、目次と「会社から探す」から会社へ飛んでも見出しが隠れない — 390px', async ({
    page,
  }) => {
    await openViewer(page, 390);
    const header = page.locator('header.console-topbar');
    const box = await header.boundingBox();
    expect(box, 'ヘッダーが見つからない').not.toBeNull();
    expect(box?.height ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual(120);

    const companies = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('[id^="company-"][id$="-heading"]')].map((heading) => ({
        id: heading.id,
        name: heading.textContent?.trim() ?? '',
      })),
    );
    expect(companies.length, '会社見出しが4件以上ない').toBeGreaterThanOrEqual(4);

    // ダッシュボードの閲覧画面は 390px でも <details> の目次（table-of-contents.tsx の inline）。
    // 項目を押すと skill-sheet-viewer.tsx の scrollToHeading が h2 へ smooth スクロールする。
    await page
      .locator('summary')
      .filter({ hasText: /^目次$/ })
      .click();
    const toc = page.getByRole('navigation', { name: '目次', exact: true });
    for (const [index, company] of companies.slice(1, 4).entries()) {
      await scrollToTop(page);
      const item = toc.getByRole('button', { name: company.name, exact: true });
      await item.scrollIntoViewIfNeeded();
      const before = await page.evaluate(() => window.scrollY);
      await item.click();
      await waitForScrollToSettle(page, before);
      expectHeadingLandedBelowTopbar(await measureHeading(page, company.id), `目次から会社 ${index + 2} 件目`);
    }

    // 「会社から探す」のチップは #company-<id> へのページ内リンク（company-jump-nav.tsx）。
    // 到着位置は section の scroll-margin で決まり、目次とは別の経路なので両方を見る。
    const target = companies[2];
    await scrollToTop(page);
    const jumpNav = page.getByRole('navigation', { name: '会社別ジャンプ' });
    await jumpNav.locator('summary').click();
    const chip = jumpNav.locator(`a[href="#${target.id.replace(/-heading$/, '')}"]`);
    await chip.scrollIntoViewIfNeeded();
    const before = await page.evaluate(() => window.scrollY);
    await chip.click();
    await waitForScrollToSettle(page, before);
    expectHeadingLandedBelowTopbar(await measureHeading(page, target.id), '「会社から探す」から会社 3 件目');
  });

  test('タイムラインの全タイトルの左端が揃い、日付列が最長ラベル幅に収まる — 1280px', async ({ page }) => {
    await openViewer(page, 1280);
    const rows = await page.evaluate(() => {
      const section = document.querySelector('#section-career-timeline')?.closest('section');
      if (!section) return null;
      // 行 = subgrid を引き継ぐコンテナ。日付 span(font-mono)とタイトル div を拾う。
      return [...section.querySelectorAll<HTMLElement>('.sm\\:grid-cols-subgrid')].map((row) => {
        const dateSpan = row.querySelector<HTMLElement>('span.font-mono');
        const title = row.querySelector<HTMLElement>('.text-\\[14\\.5px\\].font-semibold');
        if (!dateSpan || !title) return null;
        // ラベルの本来幅（折り返しなしの max-content）は nowrap にして Range で測る。
        // 折り返した行幅ではなく固有幅を見ないと、280px 上限で折り返す長いラベルを
        // 「列より狭い」と誤判定してしまう。
        const prevWhiteSpace = dateSpan.style.whiteSpace;
        dateSpan.style.whiteSpace = 'nowrap';
        const range = document.createRange();
        range.selectNodeContents(dateSpan);
        const intrinsicWidth = range.getBoundingClientRect().width;
        dateSpan.style.whiteSpace = prevWhiteSpace;
        return {
          dateLeft: dateSpan.getBoundingClientRect().left,
          dateRight: dateSpan.getBoundingClientRect().right,
          dateContentWidth: Math.min(intrinsicWidth, 280),
          titleLeft: title.getBoundingClientRect().left,
        };
      });
    });
    expect(rows, 'タイムラインの行が見つからない').not.toBeNull();
    const valid = (rows ?? []).filter((r): r is NonNullable<typeof r> => r !== null);
    expect(valid.length, 'タイトルが2件以上あること').toBeGreaterThan(1);

    const lefts = valid.map((r) => r.titleLeft);
    const distinct = new Set(lefts.map((l) => Math.round(l)));
    expect(distinct.size, `タイトルの左端が一意であること（実測: ${lefts.join(', ')}）`).toBe(1);

    // F2 回帰防止: 日付ラベル右端とタイトル左端の隙間は列溝 16px（許容 >=12px）。
    for (const [i, r] of valid.entries()) {
      const gap = r.titleLeft - r.dateRight;
      expect(gap, `行${i} の日付→タイトル間隔 >= 12px（実測 ${gap.toFixed(1)}px）`).toBeGreaterThanOrEqual(12);
    }

    // F1: 日付列幅（タイトル左 - 日付左 - 溝16px）= fit-content で最長ラベル幅（上限280）。
    // minmax(0,280px) のように常に上限まで伸びないこと、かつ最長ラベルに収まること（±1px 丸め許容）。
    const colWidths = valid.map((r) => r.titleLeft - r.dateLeft - 16);
    const maxLabel = Math.max(...valid.map((r) => r.dateContentWidth));
    for (const [i, w] of colWidths.entries()) {
      expect(
        w,
        `行${i} の日付列幅 ${w.toFixed(1)}px が最長ラベル幅 ${maxLabel.toFixed(1)}px +1 を超えない`,
      ).toBeLessThanOrEqual(maxLabel + 1);
      expect(
        w,
        `行${i} の日付列幅 ${w.toFixed(1)}px が最長ラベル幅 ${maxLabel.toFixed(1)}px -1 を下回らない`,
      ).toBeGreaterThanOrEqual(maxLabel - 1);
    }
  });

  test('目次の項目が「…」省略で切れない — 1280px', async ({ page }) => {
    await openViewer(page, 1280);
    // 目次項目は非同期投入されるため、省略検査の前に投入を待つ（空集合への vacuous pass 防止）。
    // 長い会社名が折り返しで全文出ていること（省略なし）
    await page
      .locator('summary')
      .filter({ hasText: /^目次$/ })
      .click();
    const toc = page.getByRole('navigation', { name: '目次', exact: true });
    const longLabel = toc.locator('li button', { hasText: 'グローバルシステムズグループ' }).first();
    await expect(longLabel).toBeVisible();
    const clipped = await toc.evaluate((nav) => {
      const spans = [...nav.querySelectorAll<HTMLElement>('li button span:not([aria-hidden])')];
      return (
        spans
          // text-overflow の方式に依らず、横方向の切り詰め（scrollWidth）と
          // line-clamp 系の縦方向の切り詰め（scrollHeight）の両方を検出する
          .map((s) => ({
            text: s.textContent ?? '',
            clipped: s.scrollWidth > s.clientWidth + 1 || s.scrollHeight > s.clientHeight + 1,
          }))
          .filter((i) => i.clipped)
      );
    });
    expect(clipped, '切り詰められた目次項目がゼロであること').toEqual([]);
  });
});

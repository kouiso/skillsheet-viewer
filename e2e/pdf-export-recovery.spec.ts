import { randomUUID } from 'node:crypto';
import { type Browser, expect, type Page, test } from '@playwright/test';
import { getDocument } from 'pdfjs-dist';
import { createSheet, deleteSheet, listSheets } from '@/db';
import { buildConsoleDemoBlocks } from '@/db/fixtures';

const viewerCode = process.env.VIEWER_CODE ?? 'viewer-code-local';
const RUN_ID = randomUUID().slice(0, 8);
const SHEET_PREFIX = `PDF Export Recovery Sheet ${RUN_ID}`;

async function cleanupSheetsByPrefix(prefix: string) {
  const sheets = await listSheets();
  const failures: { id: string; error: unknown }[] = [];
  await Promise.all(
    sheets
      .filter((s) => s.title.startsWith(prefix))
      .map(async (s) => {
        try {
          await deleteSheet(s.id);
        } catch (err) {
          failures.push({ id: s.id, error: err });
        }
      }),
  );
  if (failures.length > 0) {
    throw new Error(`sheet cleanup failed for ${failures.length} sheet(s): ${failures.map((f) => f.id).join(', ')}`);
  }
}

async function revalidateCache() {
  const baseURL = process.env.PLAYWRIGHT_BASEURL ?? 'http://127.0.0.1:3210';
  const secret = process.env.REVALIDATE_SECRET ?? 'revalidate-local';
  const res = await fetch(`${baseURL}/api/revalidate`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${secret}` },
  });
  if (!res.ok) {
    console.warn('revalidate failed:', res.status, await res.text());
  }
}

async function authenticateViewer(page: Page) {
  await page.goto('/viewer-auth');
  await page.getByLabel('認証コード').fill(viewerCode);
  await page.getByRole('button', { name: '認証' }).click();
  await page.waitForURL('/view');
}

/** ページ 1 枚だけのテキストを取り出す。ダウンロード済みファイルへの絶対パスを渡す。 */
async function extractPage1Text(filePath: string): Promise<string> {
  const fs = await import('node:fs/promises');
  const buffer = await fs.readFile(filePath);
  const document = await getDocument({ data: new Uint8Array(buffer) }).promise;
  const page = await document.getPage(1);
  const content = await page.getTextContent();
  return content.items.map((item) => ('str' in item ? item.str : '')).join('');
}

test.describe.configure({ mode: 'serial' });

let sheetId = '';

test.beforeAll(async () => {
  await cleanupSheetsByPrefix(SHEET_PREFIX);
  const title = `${SHEET_PREFIX} ${Date.now()}`;
  // buildConsoleDemoBlocks() はスキルブロック（TypeScript / JavaScript 8年 が最上位）を
  // 持つ唯一の DB フィクスチャで、この 2 件の再現に必要な skills ブロックが無い
  // フィクスチャ（createRealVolumeDemoSheet 等）では意味を持たない。
  sheetId = await createSheet(title, buildConsoleDemoBlocks());
  await revalidateCache();
});

test.afterAll(async () => {
  await cleanupSheetsByPrefix(SHEET_PREFIX);
});

test('PDF 生成がフォント取得失敗のあとリロード無しで回復する', async ({ browser }: { browser: Browser }) => {
  // フォント取得（/fonts/NotoSansJP-*.ttf）だけを落とし、回線復旧後の再クリックで
  // リロード無しに PDF が生成できることを確認する。
  //
  // 赤くなることを確認済み: src/components/pdf/fonts.ts の resetPdfFontsAfterFailure
  // 呼び出しを app/view/[path]/sheet-view-client.tsx の catch から外す（元の
  // `toast.error(...)` だけに戻す）と、2 回目のクリックが同じ失敗を即座に再現し
  // `page.waitForEvent('download')` が timeout する。@react-pdf/font の
  // FontSource.load() が reject 済みの loadResultPromise を永久にキャッシュし、
  // fonts.ts の `registered` フラグだけでは新しい FontSource を作り直せないため。
  test.setTimeout(120_000);

  // fresh context で実行する — 先に成功したフォント取得が HTTP キャッシュに残っていると
  // route が発火しない。
  const context = await browser.newContext({});
  const page = await context.newPage();
  await authenticateViewer(page);

  await page.goto(`/view/db/${sheetId}`, { waitUntil: 'networkidle' });

  const fontGlob = '**/fonts/NotoSansJP-*.ttf';

  // 1 回目: フォント取得だけを落とす（回線不良・5xx の再現）。
  await page.route(fontGlob, (route) => route.abort());
  await page.getByRole('button', { name: 'PDFダウンロード' }).click();
  await expect(page.getByText('PDFの生成に失敗しました')).toBeVisible();

  // 回線復旧。リロードはしない — ユーザーはリロードしろとどこにも言われていない。
  await page.unroute(fontGlob);

  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 60_000 }),
    page.getByRole('button', { name: 'PDFダウンロード' }).click(),
  ]);
  const downloadPath = await download.path();
  expect(
    downloadPath,
    'フォント取得が一度失敗した後、回線復旧後の再クリックでリロード無しに PDF が生成されること',
  ).toBeTruthy();

  await context.close();
});

test('「スキルマトリクス」を OFF にすると PDF 1 ページ目からもスキル情報が消える', async ({
  browser,
}: {
  browser: Browser;
}) => {
  test.setTimeout(120_000);

  // 赤くなることを確認済み: print-view-model.ts の buildSummary で
  // `const flatSkills = showSkills ? ... : [];` を showSkills を見ない形へ戻すと、
  // extractPage1Text の結果に「主力スタック」の見出しと「TypeScript / JavaScript」の
  // チップが残り、下の 2 つの expect が落ちる。
  const context = await browser.newContext({});
  const page = await context.newPage();
  await authenticateViewer(page);

  await page.goto(`/view/db/${sheetId}`, { waitUntil: 'networkidle' });

  // 上部バーの「スキルマトリクス」ピルを OFF にする（既定は全 ON）。
  const skillsToggle = page.getByRole('button', { name: 'スキルマトリクス' });
  await expect(skillsToggle).toHaveAttribute('aria-pressed', 'true');
  await skillsToggle.click();
  await expect(skillsToggle).toHaveAttribute('aria-pressed', 'false');

  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 60_000 }),
    page.getByRole('button', { name: 'PDFダウンロード' }).click(),
  ]);
  const downloadPath = await download.path();
  if (!downloadPath) throw new Error('PDF download path is missing');

  const page1Text = await extractPage1Text(downloadPath);
  expect(page1Text, 'スキルマトリクス OFF で出した PDF の 1 ページ目に主力スタックの見出しが無いこと').not.toContain(
    '主力スタック',
  );
  expect(
    page1Text,
    'スキルマトリクス OFF で出した PDF の 1 ページ目にスキル名チップ（TypeScript）が無いこと',
  ).not.toContain('TypeScript');

  await context.close();
});

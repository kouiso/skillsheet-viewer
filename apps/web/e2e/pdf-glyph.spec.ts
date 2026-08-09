import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { type Browser, expect, type Page, test } from '@playwright/test';
import { buildConsoleDemoBlocks, createSheet, deleteSheet, listSheets } from '@skillsheet/db';
import { getDocument } from 'pdfjs-dist';

const viewerCode = process.env.VIEWER_CODE ?? 'viewer-code-local';
const RUN_ID = randomUUID().slice(0, 8);
const SHEET_PREFIX = `PDF Glyph Sheet ${RUN_ID}`;

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

async function extractTextFromPdf(filePath: string): Promise<string> {
  const buffer = await fs.readFile(filePath);
  const document = await getDocument({ data: new Uint8Array(buffer) }).promise;
  let text = '';
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber++) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    text += content.items.map((item) => ('str' in item ? item.str : '')).join('');
  }
  return text;
}

function distinctJapaneseCodePoints(text: string): Set<string> {
  const found = new Set<string>();
  for (const character of text) {
    const code = character.codePointAt(0) ?? 0;
    if ((code >= 0x3040 && code <= 0x30ff) || (code >= 0x4e00 && code <= 0x9fff)) {
      found.add(character);
    }
  }
  return found;
}

async function authenticateViewer(page: Page) {
  await page.goto('/viewer-auth');
  await page.getByLabel('認証コード').fill(viewerCode);
  await page.getByRole('button', { name: '認証' }).click();
  await page.waitForURL('/view');
}

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  await cleanupSheetsByPrefix(SHEET_PREFIX);
});

test.afterAll(async () => {
  await cleanupSheetsByPrefix(SHEET_PREFIX);
});

test('本番経路のブラウザ toBlob PDF に日本語グリフが描画されている', async ({ browser }: { browser: Browser }) => {
  const title = `${SHEET_PREFIX} ${Date.now()}`;
  const blocks = buildConsoleDemoBlocks();
  await createSheet(title, blocks);

  const context = await browser.newContext({});
  const page = await context.newPage();

  await authenticateViewer(page);
  await expect(page.getByRole('button', { name: new RegExp(title) }).first()).toBeVisible();

  await page
    .getByRole('button', { name: new RegExp(title) })
    .first()
    .click();
  await page.waitForURL(/\/view\/db\//);

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'PDFダウンロード' }).click(),
  ]);

  const downloadPath = await download.path();
  expect(downloadPath, 'PDF ダウンロードでファイルが保存されること').toBeTruthy();
  if (!downloadPath) {
    throw new Error('PDF download path is missing');
  }

  const savedPath = path.join(process.cwd(), 'test-results', 'playwright', `pdf-glyph-${RUN_ID}.pdf`);
  await fs.mkdir(path.dirname(savedPath), { recursive: true });
  await fs.copyFile(downloadPath, savedPath);

  const extracted = await extractTextFromPdf(savedPath);
  const japanese = distinctJapaneseCodePoints(extracted);

  expect(japanese.size, 'PDF テキスト層にひらがな・カタカナ・漢字が含まれること').toBeGreaterThan(0);
  expect(extracted).toContain('日本');
});

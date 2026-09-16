import { chromium } from '@playwright/test';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

const BASE = 'http://127.0.0.1:3103';
const SESSION = process.env.SESSION_COOKIE;
const ROUTE = '/view/db/18a79e66-75e2-47e8-922e-d61342bb5233';

async function extractText(path) {
  const doc = await getDocument({ url: path, isEvalSupported: false }).promise;
  let all = '';
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    all += tc.items.map((i) => i.str).join('');
  }
  return all.replaceAll(/\s/g, '');
}

const browser = await chromium.launch({ args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
await ctx.addCookies([{ name: 'session', value: SESSION, domain: '127.0.0.1', path: '/' }]);
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));

await page.goto(`${BASE}${ROUTE}`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('text=/〜/', { timeout: 40000 });
await page.waitForTimeout(1000);

async function downloadPdf(name) {
  const [dl] = await Promise.all([
    page.waitForEvent('download', { timeout: 90000 }),
    page.locator('button[aria-label="PDFダウンロード"]:visible').click(),
  ]);
  const path = `/tmp/shots-i288/${name}.pdf`;
  await dl.saveAs(path);
  return path;
}

const onPath = await downloadPdf('pdf-duration-on');
await page.getByRole('button', { name: '稼働月数' }).click();
await page.waitForTimeout(500);
const offPath = await downloadPdf('pdf-duration-off');

await browser.close();

const on = await extractText(onPath);
const off = await extractText(offPath);
console.log(
  JSON.stringify(
    {
      on_has_kikan: on.includes('期間：'),
      off_has_kikan: off.includes('期間：'),
      on_kahi: (on.match(/ヶ/g) ?? []).length,
      off_kahi: (off.match(/ヶ/g) ?? []).length,
      on_len: on.length,
      off_len: off.length,
      errors,
    },
    null,
    2,
  ),
);

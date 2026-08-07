// 8 巡目: Codex レビュー（9b5137f）の実測が要る 3 件。
// - B-10 DB シートでも markdown ブロックの見出しから TOC が出るか
// - D-1  PDF 生成時の完了トースト
// - C-6  手動保存のトーストとリロード後の反映
import { chromium } from '<REPO>/node_modules/.pnpm/playwright@1.62.0/node_modules/playwright/index.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';
import { neon } from '<REPO>/packages/db/node_modules/@neondatabase/serverless/index.mjs';

const BASE = 'http://127.0.0.1:3210';
const OUT = '<REPO>/test-results/dogfooding/round8';
const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const SHEET = '18a79e66-75e2-47e8-922e-d61342bb5233';
mkdirSync(OUT, { recursive: true });
const sql = neon(process.env.DATABASE_URL);
const report = {};

const browser = await chromium.launch({ executablePath: EXE });
const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 }, acceptDownloads: true });

const p = await ctx.newPage();
await p.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
await p.locator('input[type=email]').fill(process.env.E2E_EMAIL);
await p.locator('input[type=password]').fill(process.env.E2E_PASSWORD);
await p.getByRole('button', { name: /ログイン/ }).click();
await p.waitForURL(/builder/, { timeout: 30000 });
await p.waitForTimeout(2500);

// ---------- C-6: 手動保存のトーストとリロード反映 ----------
{
  const r = {};
  const testSheet = p.locator('button', { hasText: /^Full \d+$/ }).first();
  await testSheet.click();
  await p.waitForTimeout(2500);
  const url = p.url();
  const id = new URL(url).searchParams.get('sheet');

  const marker = `round8-手動保存-${process.env.ROUND_STAMP}`;
  const ta = p.locator('textarea').first();
  r.textareaFound = await ta.count();
  await ta.fill(`## ${marker}\n\n手動保存の確認用。`);
  await p.waitForTimeout(500);

  await p.getByRole('button', { name: /^保存$/ }).first().click();
  // トーストを掴む（sonner）
  r.toast = await p
    .locator('[data-sonner-toast], [role="status"]')
    .first()
    .innerText()
    .catch(() => null);
  await p.waitForTimeout(2500);
  await p.screenshot({ path: `${OUT}/C-6-toast.png` });

  const rows = await sql`select data from blocks where sheet_id = ${id} and type = 'markdown'`;
  r.inDb = rows.some((x) => JSON.stringify(x.data).includes(marker));

  await p.goto(url, { waitUntil: 'networkidle' });
  await p.waitForTimeout(2500);
  r.afterReloadInTextarea = await p
    .locator('textarea')
    .first()
    .inputValue()
    .then((v) => v.includes(marker))
    .catch(() => false);
  await p.screenshot({ path: `${OUT}/C-6-after-reload.png` });
  r.marker = marker;
  report['C-6'] = r;
}

// ---------- B-10: DB シートの markdown 見出しから TOC が出るか ----------
{
  const r = {};
  // 検証用シートには C-6 で `## round8-…` の markdown ブロックを入れてある
  const testSheet = p.locator('button', { hasText: /^Full \d+$/ }).first();
  await testSheet.click();
  await p.waitForTimeout(2000);
  const id = new URL(p.url()).searchParams.get('sheet');
  r.sheetId = id;

  const mdRows = await sql`select data from blocks where sheet_id = ${id} and type = 'markdown'`;
  r.markdownBlocks = mdRows.length;
  r.headingsInDb = mdRows.filter((x) => /^##\s/m.test(x.data.markdown ?? '')).length;

  const v = await ctx.newPage();
  await v.goto(`${BASE}/view/db/${id}`, { waitUntil: 'networkidle' });
  await v.waitForTimeout(3000);
  const body = await v.evaluate(() => document.body.innerText);
  // TOC は nav 内のリンク群として描画される
  r.tocLinks = await v.locator('nav a[href^="#"]').allInnerTexts().catch(() => []);
  r.tocCount = r.tocLinks.length;
  r.headingIdsOnPage = await v.evaluate(() =>
    Array.from(document.querySelectorAll('h2[id], h3[id]')).map((h) => h.id),
  );
  r.bodyHasMarker = body.includes('round8-手動保存');
  await v.screenshot({ path: `${OUT}/B-10-db-markdown-toc.png`, fullPage: false });
  await v.close();

  // 比較用: 構造化ブロックのみの本シートでは TOC が出ないこと
  const v2 = await ctx.newPage();
  await v2.goto(`${BASE}/view/db/${SHEET}`, { waitUntil: 'networkidle' });
  await v2.waitForTimeout(2500);
  r.dashboardTocCount = await v2.locator('nav a[href^="#"]').count();
  r.dashboardHeadingIds = await v2.evaluate(
    () => document.querySelectorAll('h2[id], h3[id]').length,
  );
  await v2.close();
  report['B-10'] = r;
}

// ---------- D-1: PDF 生成時の完了トースト ----------
{
  const r = {};
  const v = await ctx.newPage();
  await v.goto(`${BASE}/view/db/${SHEET}`, { waitUntil: 'networkidle' });
  await v.waitForTimeout(2500);

  const toasts = [];
  // トーストは短時間で消えるのでポーリングして拾う
  const poll = setInterval(async () => {
    const t = await v
      .locator('[data-sonner-toast]')
      .allInnerTexts()
      .catch(() => []);
    for (const x of t) if (!toasts.includes(x)) toasts.push(x);
  }, 250);

  const dl = v.waitForEvent('download', { timeout: 180000 });
  await v.locator('[aria-label="PDFダウンロード"]').click();
  await v.waitForTimeout(1500);
  await v.screenshot({ path: `${OUT}/D-1-during.png` });
  const file = await dl;
  await v.waitForTimeout(2500);
  clearInterval(poll);

  r.suggestedFilename = file.suggestedFilename();
  r.toasts = toasts;
  await v.screenshot({ path: `${OUT}/D-1-after.png` });
  await v.close();
  report['D-1'] = r;
}

await ctx.close();
await browser.close();
writeFileSync(`${OUT}/round8-report.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));

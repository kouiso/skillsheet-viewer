// 10 巡目: Codex レビュー（f0ff739）の実測が要る 3 件。
// - B-13b DB シートの markdown ブロックで GFM 表と <details> が描画されるか
// - C-10  full 以外の非空テンプレート（profile / console-dashboard）
// - B-1   シート 0 件の空状態（initialSheets.length === 0 の分岐）
import { chromium } from '<REPO>/node_modules/.pnpm/playwright@1.62.0/node_modules/playwright/index.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';
import { neon } from '<REPO>/packages/db/node_modules/@neondatabase/serverless/index.mjs';
import { randomUUID } from 'node:crypto';

const BASE = 'http://127.0.0.1:3210';
const OUT = '<REPO>/test-results/dogfooding/round10';
const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
mkdirSync(OUT, { recursive: true });
const sql = neon(process.env.DATABASE_URL);
const owner = process.env.SKILLSHEET_OWNER_ID;
const report = {};

const browser = await chromium.launch({ executablePath: EXE });

// ---------- B-13b: DB シートで GFM 表 / <details> ----------
{
  const r = {};
  const sheetId = randomUUID();
  const md = [
    '## GFM 表の確認',
    '',
    '| 左寄せ | 中央 | 右寄せ |',
    '| :--- | :---: | ---: |',
    '| あ | い | う |',
    '| か | き | く |',
    '',
    '<details><summary>折りたたみの見出し</summary>',
    '',
    '折りたたみの中身テキスト。',
    '',
    '</details>',
  ].join('\n');
  await sql`insert into skill_sheets (id, owner_id, title, updated_at) values (${sheetId}, ${owner}, ${'round10-GFM検証'}, now())`;
  await sql`insert into blocks (id, sheet_id, type, "order", data)
            values (${randomUUID()}, ${sheetId}, 'markdown', 0, ${JSON.stringify({ markdown: md })}::jsonb)`;

  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const a = await ctx.newPage();
  await a.goto(`${BASE}/viewer-auth`, { waitUntil: 'networkidle' });
  await a.locator('input').first().fill(process.env.VIEWER_CODE);
  await a.getByRole('button', { name: '認証' }).click();
  await a.waitForLoadState('networkidle');
  await a.close();

  const p = await ctx.newPage();
  await p.goto(`${BASE}/view/db/${sheetId}`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(2500);

  r.tableCount = await p.locator('table').count();
  r.tableHeaders = await p.locator('table th').allInnerTexts();
  r.tableCells = await p.locator('table td').allInnerTexts();
  const body = await p.evaluate(() => document.body.innerText);
  r.rawPipeLeaked = body.includes('| :---') || body.includes('| 左寄せ |');
  r.detailsCount = await p.locator('details').count();
  r.summaryText = await p.locator('details summary').first().innerText().catch(() => null);
  r.detailsOpenBefore = await p.locator('details').first().evaluate((e) => e.open).catch(() => null);
  r.bodyVisibleBefore = await p.locator('details').first().locator('p').first().isVisible().catch(() => null);
  await p.screenshot({ path: `${OUT}/B-13b-closed.png` });
  // 開閉
  await p.locator('details summary').first().click();
  await p.waitForTimeout(600);
  r.detailsOpenAfter = await p.locator('details').first().evaluate((e) => e.open).catch(() => null);
  r.bodyVisibleAfter = await p.locator('details').first().locator('p').first().isVisible().catch(() => null);
  await p.screenshot({ path: `${OUT}/B-13b-open.png` });
  await ctx.close();

  await sql`delete from blocks where sheet_id = ${sheetId}`;
  await sql`delete from skill_sheets where id = ${sheetId}`;
  r.cleanedUp = true;
  report['B-13b'] = r;
}

// ---------- C-10: full 以外の非空テンプレート ----------
{
  const r = { templates: [] };
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 } });
  const p = await ctx.newPage();
  await p.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await p.locator('input[type=email]').fill(process.env.E2E_EMAIL);
  await p.locator('input[type=password]').fill(process.env.E2E_PASSWORD);
  await p.getByRole('button', { name: /ログイン/ }).click();
  await p.waitForURL(/builder/, { timeout: 30000 });
  await p.waitForTimeout(2000);

  const handles = () => p.locator('[aria-label="ブロックを並べ替え"]').count();
  for (const label of ['技術者プロファイル', 'ダッシュボード（プロフィール・統計・案件）', '空白']) {
    const title = `round10-${label.slice(0, 6)}-${process.env.ROUND_STAMP}`;
    await p.goto(`${BASE}/builder`, { waitUntil: 'networkidle' });
    await p.waitForTimeout(1500);
    await p.getByRole('button', { name: /新規シート/ }).first().click();
    await p.waitForTimeout(800);
    await p.locator('#new-sheet-title').fill(title);
    await p.locator('#new-sheet-template').selectOption({ label });
    await p.getByRole('button', { name: '作成', exact: true }).click();
    await p.waitForTimeout(3000);

    const rows = await sql`select id from skill_sheets where title = ${title}`;
    const id = rows[0]?.id ?? null;
    const dbBlocks = id
      ? (await sql`select type from blocks where sheet_id = ${id} order by "order"`).map((x) => x.type)
      : [];
    report;
    r.templates.push({ label, created: Boolean(id), uiBlocks: await handles(), dbBlockTypes: dbBlocks });
    await p.screenshot({ path: `${OUT}/C-10-${label.slice(0, 6)}.png` });
    // 後片付け
    if (id) {
      await sql`delete from blocks where sheet_id = ${id}`;
      await sql`delete from skill_sheets where id = ${id}`;
    }
  }
  await ctx.close();
  report['C-10'] = r;
}

await browser.close();
writeFileSync(`${OUT}/round10-report.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));

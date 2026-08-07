// 14 巡目 その 2。
// - B-12 案件カードごとの工程表示（title="<工程>：経験あり"）を DB の process と全件突合する
// - C-2  ブロック追加後に「中身を入れてから」保存し、エディタ UI の描画まで確認する
//        （空のまま保存すると isBlockInputEmpty で落ちるのは設計どおりなので、それでは描画確認にならない）
// - C-3  並べ替えが DB の order に反映され、リロード後も維持されるか
import { chromium } from '<REPO>/node_modules/.pnpm/playwright@1.62.0/node_modules/playwright/index.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';
import { neon } from '<REPO>/packages/db/node_modules/@neondatabase/serverless/index.mjs';
import { randomUUID } from 'node:crypto';

const BASE = 'http://127.0.0.1:3210';
const OUT = '<REPO>/test-results/dogfooding/round14';
const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const SHEET = '18a79e66-75e2-47e8-922e-d61342bb5233';
mkdirSync(OUT, { recursive: true });
const sql = neon(process.env.DATABASE_URL);
const owner = process.env.SKILLSHEET_OWNER_ID;
const stamp = process.env.ROUND_STAMP;
const report = {};

const browser = await chromium.launch({ executablePath: EXE });

// ---------- B-12 ----------
{
  const r = {};
  const rows = await sql`select data from blocks where sheet_id = ${SHEET} and type = 'project'`;
  const data = rows[0].data;
  const hiddenCompanies = new Set(data.companies.filter((c) => c.hidden).map((c) => c.id));
  const items = data.items.filter((i) => !i.hidden && !hiddenCompanies.has(i.companyId));
  r.dbVisibleProjects = items.length;

  const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 } });
  const a = await ctx.newPage();
  await a.goto(`${BASE}/viewer-auth`, { waitUntil: 'networkidle' });
  await a.locator('input').first().fill(process.env.VIEWER_CODE);
  await a.getByRole('button', { name: '認証' }).click();
  await a.waitForLoadState('networkidle');
  await a.close();

  const p = await ctx.newPage();
  await p.goto(`${BASE}/view/db/${SHEET}`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(3500);

  // 案件カード = <article>。カードごとに h3 のタイトルと「経験あり」の工程を拾う
  const onScreen = await p.evaluate(() =>
    Array.from(document.querySelectorAll('article')).map((card) => ({
      title: card.querySelector('h3')?.textContent?.trim() ?? '',
      done: Array.from(card.querySelectorAll('span[title$="：経験あり"]'))
        .map((e) => e.getAttribute('title').replace('：経験あり', ''))
        // ラベルとバーで同じ title が 2 つ付くので重複を落とす
        .filter((v, i, arr) => arr.indexOf(v) === i),
    })),
  );
  r.cardsOnScreen = onScreen.length;

  const byTitle = new Map(items.map((i) => [i.title, [...new Set(i.process ?? [])].sort()]));
  const mismatches = [];
  let matched = 0;
  for (const card of onScreen) {
    const expected = byTitle.get(card.title);
    if (!expected) {
      mismatches.push({ title: card.title, reason: 'DB に同名の案件が無い' });
      continue;
    }
    const actual = [...card.done].sort();
    if (JSON.stringify(expected) === JSON.stringify(actual)) matched += 1;
    else mismatches.push({ title: card.title, db: expected, screen: actual });
  }
  r.matched = matched;
  r.mismatches = mismatches;
  await p.screenshot({ path: `${OUT}/B-12-cards.png` });
  await p.close();
  await ctx.close();
  report['B-12'] = r;
}

// ---------- C-2 / C-3 ----------
{
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 980 } });
  const p = await ctx.newPage();
  await p.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await p.locator('input[type=email]').fill(process.env.E2E_EMAIL);
  await p.locator('input[type=password]').fill(process.env.E2E_PASSWORD);
  await p.getByRole('button', { name: /ログイン/ }).click();
  await p.waitForURL(/builder/, { timeout: 30000 });
  await p.waitForTimeout(2000);

  const sheetId = randomUUID();
  const title = `round14-ブロック2-${stamp}`;
  await sql`insert into skill_sheets (id, owner_id, title, updated_at) values (${sheetId}, ${owner}, ${title}, now())`;
  const open = async () => {
    await p.goto(`${BASE}/builder`, { waitUntil: 'networkidle' });
    await p.waitForTimeout(2000);
    await p.getByRole('button', { name: title, exact: true }).first().click();
    await p.waitForTimeout(2800);
  };
  const dbBlocks = async () =>
    (await sql`select type, "order", data from blocks where sheet_id = ${sheetId} order by "order"`).map(
      (x) => `${x.order}:${x.type}`,
    );
  await open();

  const c2 = {};
  // 1) テキスト（markdown）
  await p.getByRole('button', { name: 'テキスト', exact: true }).last().click();
  await p.waitForTimeout(900);
  await p.locator('textarea').last().fill(`## ${stamp}-markdown 本文`);
  await p.waitForTimeout(600);
  // 2) テーブル
  await p.getByRole('button', { name: 'テーブル', exact: true }).last().click();
  await p.waitForTimeout(900);
  const tableInputs = p.locator('table input');
  if ((await tableInputs.count()) > 0) await tableInputs.first().fill(`${stamp}-列1`);
  await p.waitForTimeout(600);
  // 3) スキル一覧
  await p.getByRole('button', { name: 'スキル一覧', exact: true }).last().click();
  await p.waitForTimeout(900);
  // 4) 職務経歴
  await p.getByRole('button', { name: '職務経歴', exact: true }).last().click();
  await p.waitForTimeout(900);
  // 職務経歴の会社名を埋めて空判定を外す
  const expInputs = p.locator('input[type="text"], input:not([type])');
  const n = await expInputs.count();
  if (n > 0) await expInputs.nth(n - 1).fill(`${stamp}-職務経歴の会社`);
  await p.waitForTimeout(1200);

  await p.getByRole('button', { name: /^保存$/ }).first().click();
  await p.waitForTimeout(4000);

  c2.dbAfterSave = await dbBlocks();
  c2.uiAfterSave = await p.evaluate(() => ({
    blockHandles: document.querySelectorAll('[aria-label="ブロックを並べ替え"]').length,
    textareas: document.querySelectorAll('textarea').length,
    tables: document.querySelectorAll('table').length,
  }));
  await p.screenshot({ path: `${OUT}/C-2b-after-save.png`, fullPage: true });

  await open();
  c2.dbAfterReload = await dbBlocks();
  c2.uiAfterReload = await p.evaluate(() => ({
    blockHandles: document.querySelectorAll('[aria-label="ブロックを並べ替え"]').length,
    textareas: document.querySelectorAll('textarea').length,
    tables: document.querySelectorAll('table').length,
  }));
  // 入れた中身がエディタに描画されているか
  c2.markdownRendered = await p
    .locator('textarea')
    .first()
    .inputValue()
    .then((v) => v.includes(`${stamp}-markdown`))
    .catch(() => false);
  c2.tableValueRendered = await p
    .locator('table input')
    .first()
    .inputValue()
    .then((v) => v.includes(`${stamp}-列1`))
    .catch(() => false);
  c2.pageHasExperience = (await p.evaluate(() => document.body.innerHTML)).includes(`${stamp}-職務経歴の会社`);
  await p.screenshot({ path: `${OUT}/C-2b-after-reload.png`, fullPage: true });
  report['C-2'] = c2;

  // ---- C-3 ----
  const c3 = { orderBefore: await dbBlocks() };
  const handles = p.locator('[aria-label="ブロックを並べ替え"]');
  c3.handleCount = await handles.count();
  if (c3.handleCount >= 2) {
    const from = await handles.nth(0).boundingBox();
    const to = await handles.nth(c3.handleCount - 1).boundingBox();
    await p.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await p.mouse.down();
    await p.mouse.move(from.x + from.width / 2, from.y + from.height / 2 + 15, { steps: 5 });
    await p.mouse.move(to.x + to.width / 2, to.y + to.height / 2 + 25, { steps: 25 });
    await p.waitForTimeout(400);
    await p.mouse.up();
    await p.waitForTimeout(2000);
    await p.getByRole('button', { name: /^保存$/ }).first().click();
    await p.waitForTimeout(4000);
  }
  c3.orderAfterDrag = await dbBlocks();
  await p.screenshot({ path: `${OUT}/C-3b-after-drag.png`, fullPage: true });

  await open();
  c3.orderAfterReload = await dbBlocks();
  c3.changed = JSON.stringify(c3.orderBefore) !== JSON.stringify(c3.orderAfterDrag);
  c3.persisted = JSON.stringify(c3.orderAfterDrag) === JSON.stringify(c3.orderAfterReload);
  await p.screenshot({ path: `${OUT}/C-3b-after-reload.png`, fullPage: true });
  report['C-3'] = c3;

  await ctx.close();
  await sql`delete from blocks where sheet_id = ${sheetId}`;
  await sql`delete from skill_sheets where id = ${sheetId}`;
  report.cleanedUp = (await sql`select id from skill_sheets where id = ${sheetId}`).length === 0;
}

await browser.close();
writeFileSync(`${OUT}/b12-c2-c3.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));

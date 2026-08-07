// 14 巡目: Codex レビュー（c445c6e）の実測が要る 4 件。
// - B-9  4 ビュー全 OFF のときの画面状態
// - B-12 工程ステッパーの表示値が各案件の process と一致するか（全件突合）
// - C-2  ブロック追加後にエディタ UI が実際に描画されているか
// - C-3  並べ替えが保存され、リロード後も順序が維持されるか
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
const viewCtx = await browser.newContext({ viewport: { width: 1400, height: 950 } });
const a = await viewCtx.newPage();
await a.goto(`${BASE}/viewer-auth`, { waitUntil: 'networkidle' });
await a.locator('input').first().fill(process.env.VIEWER_CODE);
await a.getByRole('button', { name: '認証' }).click();
await a.waitForLoadState('networkidle');
await a.close();

// ---------- B-9: 全 OFF の見た目 ----------
{
  const r = {};
  const p = await viewCtx.newPage();
  const errs = [];
  p.on('console', (m) => m.type() === 'error' && errs.push(m.text().slice(0, 120)));
  await p.goto(`${BASE}/view/db/${SHEET}`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(2500);

  const views = ['スキルマトリクス', '工程の俯瞰', '案件詳細', 'タイムライン'];
  r.pressedAtStart = await Promise.all(
    views.map((v) => p.getByRole('button', { name: v }).getAttribute('aria-pressed')),
  );
  for (const v of views) {
    await p.getByRole('button', { name: v }).click();
    await p.waitForTimeout(400);
  }
  r.pressedAfterAllOff = await Promise.all(
    views.map((v) => p.getByRole('button', { name: v }).getAttribute('aria-pressed')),
  );
  await p.waitForTimeout(800);

  r.bodyText = (await p.evaluate(() => document.body.innerText)).replace(/\n+/g, ' / ').slice(0, 300);
  r.mainHeight = await p.evaluate(() => document.querySelector('main')?.getBoundingClientRect().height ?? null);
  r.docHeight = await p.evaluate(() => document.documentElement.scrollHeight);
  r.horizontalScroll = await p.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  // 全 OFF から戻す導線（トグル自体）が残っているか
  r.togglesStillVisible = await p.getByRole('button', { name: 'スキルマトリクス' }).isVisible();
  r.consoleErrors = errs.length;
  await p.screenshot({ path: `${OUT}/B-9-all-off.png`, fullPage: true });

  // 1 つ戻して復帰するか
  await p.getByRole('button', { name: '案件詳細' }).click();
  await p.waitForTimeout(1200);
  r.bodyAfterRestore = (await p.evaluate(() => document.body.innerText)).replace(/\n+/g, ' / ').slice(0, 160);
  r.docHeightAfterRestore = await p.evaluate(() => document.documentElement.scrollHeight);
  await p.screenshot({ path: `${OUT}/B-9-restored.png` });
  await p.close();
  report['B-9'] = r;
}

// ---------- B-12: 工程の表示値と DB の process の突合 ----------
{
  const r = {};
  const rows = await sql`select data from blocks where sheet_id = ${SHEET} and type = 'project'`;
  const items = rows[0].data.items.filter((i) => !i.hidden);
  r.dbProjects = items.length;
  // DB 側の工程の出現集計
  const dbCounts = {};
  for (const it of items) for (const proc of it.process ?? []) dbCounts[proc] = (dbCounts[proc] ?? 0) + 1;
  r.dbProcessCounts = dbCounts;

  const p = await viewCtx.newPage();
  await p.goto(`${BASE}/view/db/${SHEET}`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(3000);

  // 案件カードごとに、工程バーの ON 状態を拾う
  const onScreen = await p.evaluate(() => {
    const out = [];
    for (const card of document.querySelectorAll('[data-project-title]')) {
      const title = card.getAttribute('data-project-title');
      const procs = Array.from(card.querySelectorAll('[data-process][data-process-on="true"]')).map((e) =>
        e.getAttribute('data-process'),
      );
      out.push({ title, procs });
    }
    return out;
  });
  r.cardsWithDataAttr = onScreen.length;

  // data 属性が無い実装なら、工程ステッパー（俯瞰）のラベルと件数を拾う
  r.stepperLabels = await p
    .locator('[class*="proc"] , .pp .lbl')
    .allInnerTexts()
    .then((t) => t.filter(Boolean).slice(0, 40))
    .catch(() => []);
  r.pageText = (await p.evaluate(() => document.body.innerText)).length;
  await p.screenshot({ path: `${OUT}/B-12-stepper.png`, fullPage: false });
  await p.close();
  report['B-12'] = r;
}

// ---------- C-2 / C-3: ビルダー ----------
{
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 980 } });
  const p = await ctx.newPage();
  await p.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await p.locator('input[type=email]').fill(process.env.E2E_EMAIL);
  await p.locator('input[type=password]').fill(process.env.E2E_PASSWORD);
  await p.getByRole('button', { name: /ログイン/ }).click();
  await p.waitForURL(/builder/, { timeout: 30000 });
  await p.waitForTimeout(2000);

  // 検証専用の空シートを作る（本シートに触らない）
  const sheetId = randomUUID();
  const title = `round14-ブロック-${stamp}`;
  await sql`insert into skill_sheets (id, owner_id, title, updated_at) values (${sheetId}, ${owner}, ${title}, now())`;

  await p.goto(`${BASE}/builder`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(2000);
  await p.getByRole('button', { name: title, exact: true }).first().click();
  await p.waitForTimeout(2500);

  const dbBlocks = async () =>
    (await sql`select type, "order" from blocks where sheet_id = ${sheetId} order by "order"`).map(
      (x) => `${x.order}:${x.type}`,
    );

  // ---- C-2: 4 種を追加して、エディタ UI が描画されるか ----
  const c2 = { added: [] };
  for (const label of ['テキスト', 'テーブル', 'スキル一覧', '職務経歴']) {
    await p.getByRole('button', { name: label, exact: true }).first().click();
    await p.waitForTimeout(900);
    c2.added.push(label);
  }
  await p.waitForTimeout(3000);
  c2.dbAfterAdd = await dbBlocks();
  // 追加直後のエディタ UI
  c2.uiAfterAdd = await p.evaluate(() => ({
    textareas: document.querySelectorAll('textarea').length,
    tableEditors: document.querySelectorAll('table').length,
    inputs: document.querySelectorAll('input').length,
    blockHandles: document.querySelectorAll('[aria-label="ブロックを並べ替え"]').length,
  }));
  await p.screenshot({ path: `${OUT}/C-2-after-add.png`, fullPage: true });

  // リロード後のエディタ UI
  await p.goto(`${BASE}/builder`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(2000);
  await p.getByRole('button', { name: title, exact: true }).first().click();
  await p.waitForTimeout(3000);
  c2.uiAfterReload = await p.evaluate(() => ({
    textareas: document.querySelectorAll('textarea').length,
    tableEditors: document.querySelectorAll('table').length,
    inputs: document.querySelectorAll('input').length,
    blockHandles: document.querySelectorAll('[aria-label="ブロックを並べ替え"]').length,
  }));
  c2.dbAfterReload = await dbBlocks();
  await p.screenshot({ path: `${OUT}/C-2-after-reload.png`, fullPage: true });
  report['C-2'] = c2;

  // ---- C-3: 並べ替えが保存され、リロード後も残るか ----
  const c3 = { orderBefore: await dbBlocks() };
  const handles = p.locator('[aria-label="ブロックを並べ替え"]');
  c3.handleCount = await handles.count();
  if (c3.handleCount >= 2) {
    const first = await handles.nth(0).boundingBox();
    const last = await handles.nth(c3.handleCount - 1).boundingBox();
    // 先頭を最後尾へドラッグする
    await p.mouse.move(first.x + first.width / 2, first.y + first.height / 2);
    await p.mouse.down();
    await p.mouse.move(first.x + first.width / 2, first.y + first.height / 2 + 20, { steps: 6 });
    await p.mouse.move(last.x + last.width / 2, last.y + last.height / 2 + 30, { steps: 20 });
    await p.mouse.up();
    await p.waitForTimeout(4000);
  }
  c3.orderAfterDrag = await dbBlocks();
  await p.screenshot({ path: `${OUT}/C-3-after-drag.png`, fullPage: true });

  await p.goto(`${BASE}/builder`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(2000);
  await p.getByRole('button', { name: title, exact: true }).first().click();
  await p.waitForTimeout(3000);
  c3.orderAfterReload = await dbBlocks();
  c3.uiOrderAfterReload = await p
    .locator('[aria-label="ブロックを並べ替え"]')
    .count();
  c3.changed = JSON.stringify(c3.orderBefore) !== JSON.stringify(c3.orderAfterDrag);
  c3.persisted = JSON.stringify(c3.orderAfterDrag) === JSON.stringify(c3.orderAfterReload);
  await p.screenshot({ path: `${OUT}/C-3-after-reload.png`, fullPage: true });
  report['C-3'] = c3;

  await ctx.close();

  // 後片付け
  await sql`delete from blocks where sheet_id = ${sheetId}`;
  await sql`delete from skill_sheets where id = ${sheetId}`;
  report.cleanedUp = (await sql`select id from skill_sheets where id = ${sheetId}`).length === 0;
}

await viewCtx.close();
await browser.close();
writeFileSync(`${OUT}/round14-report.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));

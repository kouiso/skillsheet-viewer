// 5 巡目: Codex レビュー（cf4d57c）の 5 件を実測する。
// - C-2b 中身を入れた markdown / experience が保存・再読込で残るか
// - C-3b パレットチップを D&D でキャンバスへ投入できるか
// - C-11b シート削除後、一覧と再読込後の状態
// - D-5b 会社ではなく「案件自身」の hidden が PDF から消えるか
// B-15a（env 未設定時の HTTP ステータス）は env を外したサーバーが要るので別スクリプト。
import { chromium } from '<REPO>/node_modules/.pnpm/playwright@1.62.0/node_modules/playwright/index.mjs';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { neon } from '<REPO>/packages/db/node_modules/@neondatabase/serverless/index.mjs';

const BASE = 'http://127.0.0.1:3210';
const OUT = '<REPO>/test-results/dogfooding/round5';
const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const SHEET = '18a79e66-75e2-47e8-922e-d61342bb5233';
mkdirSync(OUT, { recursive: true });
const sql = neon(process.env.DATABASE_URL);
const report = { stamp: process.env.ROUND5_STAMP };

const browser = await chromium.launch({ executablePath: EXE });
const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 }, acceptDownloads: true });

const p = await ctx.newPage();
await p.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
await p.locator('input[type=email]').fill(process.env.E2E_EMAIL);
await p.locator('input[type=password]').fill(process.env.E2E_PASSWORD);
await p.getByRole('button', { name: /ログイン/ }).click();
await p.waitForURL(/builder/, { timeout: 30000 });
await p.waitForTimeout(2000);

const handles = () => p.locator('[aria-label="ブロックを並べ替え"]').count();
const save = async () => {
  await p.getByRole('button', { name: /^保存$/ }).first().click();
  await p.waitForTimeout(3000);
};

// 検証用シートへ
const testSheet = p.locator('button', { hasText: /^Full \d+$/ }).first();
if (!(await testSheet.count())) throw new Error('検証用シートが無い');
await testSheet.click();
await p.waitForTimeout(2500);
const sheetUrl = p.url();
const testSheetId = new URL(sheetUrl).searchParams.get('sheet');
const dbCount = async (id) =>
  Number((await sql`select count(*)::int as n from blocks where sheet_id = ${id}`)[0].n);

// ---------- C-2b: 中身入りの markdown / experience ----------
{
  const r = { sheetId: testSheetId };
  r.dbBefore = await dbCount(testSheetId);
  r.uiBefore = await handles();

  // markdown を追加して本文を入れる
  await p.getByRole('button', { name: 'テキスト', exact: true }).last().click();
  await p.waitForTimeout(700);
  const ta = p.locator('textarea').last();
  await ta.fill('## round5 の検証見出し\n\n本文をいれた markdown ブロック。');
  await p.waitForTimeout(400);

  // 職務経歴を追加して会社・職種・業務内容を埋める
  await p.getByRole('button', { name: '職務経歴', exact: true }).last().click();
  await p.waitForTimeout(700);
  const lastBlock = p.locator('[aria-label="ブロックを並べ替え"]').last().locator('xpath=..');
  const inputs = lastBlock.locator('input, textarea');
  const n = await inputs.count();
  r.experienceFields = n;
  for (let i = 0; i < n; i++) {
    await inputs.nth(i).fill(`round5-値${i}`);
    await p.waitForTimeout(150);
  }

  r.uiAfterAdd = await handles();
  await p.screenshot({ path: `${OUT}/C-2b-filled.png` });
  await save();
  r.dbAfterSave = await dbCount(testSheetId);

  await p.goto(sheetUrl, { waitUntil: 'networkidle' });
  await p.waitForTimeout(2500);
  r.uiAfterReload = await handles();
  const body = await p.evaluate(() => document.body.innerText);
  r.markdownTextPresent = body.includes('round5 の検証見出し');
  r.experienceValuePresent = body.includes('round5-値0');
  r.dbTypes = (
    await sql`select type from blocks where sheet_id = ${testSheetId} order by "order"`
  ).map((x) => x.type);
  r.persisted = r.uiAfterReload === r.uiAfterAdd && r.dbAfterSave === r.dbBefore + 2;
  await p.screenshot({ path: `${OUT}/C-2b-after-reload.png` });
  report['C-2b'] = r;
}

// ---------- C-3b: パレットチップの D&D 投入 ----------
{
  const r = {};
  r.uiBefore = await handles();
  // useDraggable は DOM id ではなく aria-roledescription="draggable" を付ける
  const chip = p.locator('button[aria-roledescription="draggable"]').first();
  r.chipFound = await chip.count();
  const canvas = p.locator('[aria-label="ブロックを並べ替え"]').last();

  const cb = await chip.boundingBox();
  const tb = await canvas.boundingBox();
  if (cb && tb) {
    // dnd-kit は pointer イベント列を要求するので、途中点を挟んで動かす
    await p.mouse.move(cb.x + cb.width / 2, cb.y + cb.height / 2);
    await p.mouse.down();
    await p.mouse.move(cb.x + 30, cb.y + 30, { steps: 8 });
    await p.mouse.move(tb.x + tb.width / 2, tb.y + tb.height / 2, { steps: 20 });
    await p.mouse.move(tb.x + tb.width / 2, tb.y + tb.height / 2 + 6, { steps: 6 });
    await p.mouse.up();
    await p.waitForTimeout(1200);
  }
  r.uiAfterDrop = await handles();
  r.inserted = r.uiAfterDrop > r.uiBefore;
  await p.screenshot({ path: `${OUT}/C-3b-after-palette-drop.png` });
  report['C-3b'] = r;
}

// ---------- C-11b: シート削除後の一覧と再読込 ----------
// 注意: 削除ボタンは aria-label がタイトル依存で一意でない。既定タイトルのまま作ると
// 本シートと同名になり .first() が本シート側を掴む。必ず一意なタイトルを付けてから消す。
{
  const r = {};
  const titles = () => p.locator('ul li button span.truncate').allInnerTexts();
  await p.goto(`${BASE}/builder`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(2000);

  const unique = `round5-削除検証-${report.stamp}`;
  await p.getByRole('button', { name: /新規シート/ }).first().click();
  await p.waitForTimeout(800);
  await p.locator('#new-sheet-title').fill(unique);
  await p.getByRole('button', { name: '作成', exact: true }).click();
  await p.waitForTimeout(3000);

  r.created = unique;
  r.openedTitle = await p.locator('#sheet-title').inputValue();
  r.listAfterCreate = await titles();
  r.inListAfterCreate = r.listAfterCreate.includes(unique);

  const rows = await sql`select id, title from skill_sheets where title = ${unique}`;
  r.dbRowsAfterCreate = rows.length;
  if (rows.length !== 1) throw new Error(`一意なはずのシートが ${rows.length} 件`);
  r.targetId = rows[0].id;
  if (r.targetId === SHEET) throw new Error('本シートを消そうとしている');

  const delBtn = p.locator(`[aria-label="「${unique}」を削除"]`);
  r.deleteButtonFound = await delBtn.count();
  p.once('dialog', (d) => d.accept());
  await delBtn.first().click();
  await p.waitForTimeout(3000);
  r.listAfterDelete = await titles();
  r.goneFromList = !r.listAfterDelete.includes(unique);

  await p.reload({ waitUntil: 'networkidle' });
  await p.waitForTimeout(2500);
  r.listAfterReload = await titles();
  r.goneAfterReload = !r.listAfterReload.includes(unique);
  r.dbRowsAfterDelete = Number(
    (await sql`select count(*)::int as n from skill_sheets where id = ${r.targetId}`)[0].n,
  );
  await p.screenshot({ path: `${OUT}/C-11b-after-delete.png` });
  report['C-11b'] = r;
}

// ---------- D-5b: 案件自身の hidden が PDF から消えるか ----------
{
  const r = {};
  await p.goto(`${BASE}/builder?sheet=${SHEET}`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(2500);
  await p.getByRole('button', { name: '案件エディタ', exact: true }).first().click();
  await p.waitForTimeout(1500);

  // 会社行ではなく案件行の目玉ボタン（兄弟が .row-del）
  const projEye = p.locator('div:has(> button.row-del) > button.row-eye[aria-label="閲覧側で非表示にする"]');
  r.projectEyeCount = await projEye.count();
  const projRow = p.locator('div:has(> button.row-del)').first();
  r.targetLabel = (await projRow.innerText()).split('\n').filter(Boolean).slice(0, 3).join(' / ');

  await projEye.first().click();
  await p.waitForTimeout(1200);
  await save();
  await p.screenshot({ path: `${OUT}/D-5b-project-hidden.png` });

  // ビューアで PDF を出す
  const v = await ctx.newPage();
  await v.goto(`${BASE}/view/db/${SHEET}`, { waitUntil: 'networkidle' });
  await v.waitForTimeout(2000);
  const bodyText = await v.evaluate(() => document.body.innerText);
  r.viewerCount = (bodyText.match(/\d+ \/ \d+ 件/) ?? [null])[0];

  const dl = v.waitForEvent('download', { timeout: 120000 });
  await v.locator('[aria-label="PDFダウンロード"]').click();
  const file = await dl;
  const path = `${OUT}/D-5b-project-hidden.pdf`;
  await file.saveAs(path);
  r.pdfBytes = readFileSync(path).length;

  const pdfjs = await import(
    '<SCRATCH>/pdftool/node_modules/pdfjs-dist/legacy/build/pdf.mjs'
  );
  const doc = await pdfjs.getDocument({ data: new Uint8Array(readFileSync(path)) }).promise;
  r.pdfPages = doc.numPages;
  let text = '';
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const c = await page.getTextContent();
    text += c.items.map((x) => x.str).join('');
  }
  writeFileSync(`${OUT}/D-5b-pdf-text.txt`, text);
  r.pdfTextLen = text.length;
  r.hiddenTitleInPdf = null;
  report['D-5b'] = r;
  await v.close();
}

await ctx.close();
await browser.close();
writeFileSync(`${OUT}/round5-report.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));

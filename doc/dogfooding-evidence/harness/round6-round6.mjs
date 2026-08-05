// 6 巡目: Codex レビュー（fd2bf6d）の 3 件を実測する。
// - C-1  ビルダー初期表示のシート一覧・タイトル・ブロック一覧を DB と突合
// - C-4  ブロック削除がリロード後・DB 上でも消えているか
// - C-12a バックアップに「会社 hidden」と「案件単体 hidden」の両方が残るか
import { chromium } from '<REPO>/node_modules/.pnpm/playwright@1.62.0/node_modules/playwright/index.mjs';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { neon } from '<REPO>/packages/db/node_modules/@neondatabase/serverless/index.mjs';

const BASE = 'http://127.0.0.1:3210';
const OUT = '<REPO>/test-results/dogfooding/round6';
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

const handles = () => p.locator('[aria-label="ブロックを並べ替え"]').count();
const save = async () => {
  await p.getByRole('button', { name: /^保存$/ }).first().click();
  await p.waitForTimeout(3000);
};

// ---------- C-1: ビルダー初期表示のシェルを DB と突合 ----------
{
  const r = {};
  await p.goto(`${BASE}/builder?sheet=${SHEET}`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(2500);

  // 画面側
  r.uiSheetList = await p.locator('ul li button span.truncate').allInnerTexts();
  r.uiTitle = await p.locator('#sheet-title').inputValue();
  r.uiBlockCount = await handles();

  // DB 側
  const sheets = await sql`select id, title from skill_sheets`;
  r.dbSheetTitles = sheets.map((s) => s.title);
  r.dbTitleOfActive = sheets.find((s) => s.id === SHEET)?.title ?? null;
  const blocks = await sql`select type from blocks where sheet_id = ${SHEET} order by "order"`;
  r.dbBlockCount = blocks.length;
  r.dbBlockTypes = blocks.map((b) => b.type);

  r.sheetListMatches =
    r.uiSheetList.length === r.dbSheetTitles.length &&
    [...r.uiSheetList].sort().join('|') === [...r.dbSheetTitles].sort().join('|');
  r.titleMatches = r.uiTitle === r.dbTitleOfActive;
  r.blockCountMatches = r.uiBlockCount === r.dbBlockCount;
  await p.screenshot({ path: `${OUT}/C-1-builder-shell.png` });
  report['C-1'] = r;
}

// ---------- C-4: ブロック削除がリロード後・DB でも消えているか ----------
{
  const r = {};
  const testSheet = p.locator('button', { hasText: /^Full \d+$/ }).first();
  await testSheet.click();
  await p.waitForTimeout(2500);
  const url = p.url();
  const id = new URL(url).searchParams.get('sheet');
  const dbCount = async () =>
    Number((await sql`select count(*)::int as n from blocks where sheet_id = ${id}`)[0].n);

  r.sheetId = id;
  r.uiBefore = await handles();
  r.dbBefore = await dbCount();

  // 削除ボタン（ブロック単位）
  const delBtns = p.locator('button[aria-label*="削除"]').filter({ hasNotText: /シート/ });
  const blockDel = p.locator('[aria-label="ブロックを削除"]');
  r.blockDeleteButtons = await blockDel.count();
  if (r.blockDeleteButtons === 0) {
    // ラベルが違う場合に備えて候補を出す
    r.deleteLabelCandidates = await delBtns.evaluateAll((els) =>
      els.slice(0, 8).map((e) => e.getAttribute('aria-label')),
    );
  } else {
    await blockDel.first().click();
    await p.waitForTimeout(800);
  }
  r.uiAfterDelete = await handles();
  await save();
  r.dbAfterSave = await dbCount();

  await p.goto(url, { waitUntil: 'networkidle' });
  await p.waitForTimeout(2500);
  r.uiAfterReload = await handles();
  r.deletedInUi = r.uiAfterDelete === r.uiBefore - 1;
  r.deletedInDb = r.dbAfterSave === r.dbBefore - 1;
  r.stillGoneAfterReload = r.uiAfterReload === r.uiAfterDelete;
  await p.screenshot({ path: `${OUT}/C-4-after-reload.png` });
  report['C-4'] = r;
}

// ---------- C-12a: バックアップに会社 hidden / 案件 hidden の両方が残るか ----------
{
  const r = {};
  await p.goto(`${BASE}/builder?sheet=${SHEET}`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(2500);

  // 現在の hidden 状態を DB から確認（会社側・案件側）
  const [pb] = await sql`select data from blocks where sheet_id = ${SHEET} and type = 'project'`;
  const hiddenCompanies = pb.data.companies.filter((c) => c.hidden).map((c) => c.name);
  const hiddenItems = pb.data.items.filter((i) => i.hidden).map((i) => i.title);
  r.hiddenCompanies = hiddenCompanies;
  r.hiddenItems = hiddenItems;

  // hidden 会社に属する案件のタイトル（バックアップに残るべき）
  const hiddenCompanyIds = new Set(pb.data.companies.filter((c) => c.hidden).map((c) => c.id));
  r.itemsUnderHiddenCompany = pb.data.items
    .filter((i) => hiddenCompanyIds.has(i.companyId))
    .map((i) => i.title);

  const dl = p.waitForEvent('download', { timeout: 60000 });
  await p.getByRole('button', { name: /バックアップ/ }).first().click();
  const file = await dl;
  const path = `${OUT}/C-12a-backup.md`;
  await file.saveAs(path);
  const md = readFileSync(path, 'utf8');
  r.backupBytes = md.length;

  r.companyHiddenNamePresent = hiddenCompanies.map((n) => ({ name: n, present: md.includes(n) }));
  r.itemsUnderHiddenCompanyPresent = r.itemsUnderHiddenCompany.map((t) => ({
    title: t,
    present: md.includes(t),
  }));
  r.itemHiddenPresent = hiddenItems.map((t) => ({ title: t, present: md.includes(t) }));
  report['C-12a'] = r;
}

await ctx.close();
await browser.close();
writeFileSync(`${OUT}/round6-report.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));

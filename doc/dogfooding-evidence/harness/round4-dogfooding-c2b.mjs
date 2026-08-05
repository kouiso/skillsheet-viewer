// C-2 追試: どのブロック種別が保存で落ちるかを 1 種ずつ切り分ける。
// 空の検証用シートを毎回作り直し、1 種だけ追加 → 保存 → 開き直し で残存を見る。
import { chromium } from '<REPO>/node_modules/.pnpm/playwright@1.62.0/node_modules/playwright/index.mjs';
import { writeFileSync } from 'node:fs';
import { neon } from '<REPO>/packages/db/node_modules/@neondatabase/serverless/index.mjs';

const BASE = 'http://127.0.0.1:3210';
const OUT = '<REPO>/test-results/dogfooding/round4';
const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const sql = neon(process.env.DATABASE_URL);

const browser = await chromium.launch({ executablePath: EXE });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const login = await ctx.newPage();
await login.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
await login.locator('input[type=email]').fill(process.env.E2E_EMAIL);
await login.locator('input[type=password]').fill(process.env.E2E_PASSWORD);
await login.getByRole('button', { name: /ログイン/ }).click();
await login.waitForURL(/builder/, { timeout: 30000 });
await login.close();

const p = await ctx.newPage();
const handles = () => p.locator('[aria-label="ブロックを並べ替え"]').count();

await p.goto(`${BASE}/builder`, { waitUntil: 'networkidle' });
await p.waitForTimeout(2000);
const testSheet = p.locator('button', { hasText: /^Full \d+$/ }).first();
await testSheet.click();
await p.waitForTimeout(2500);
const url = p.url();
const sheetId = new URL(url).searchParams.get('sheet');

const dbTypes = async () => {
  const rows = await sql`select type, "order" from blocks where sheet_id = ${sheetId} order by "order"`;
  return rows.map((x) => x.type);
};

const out = { sheetId, results: [] };
for (const label of ['テキスト', 'テーブル', 'スキル一覧', '職務経歴']) {
  await p.goto(url, { waitUntil: 'networkidle' });
  await p.waitForTimeout(2000);
  const before = await handles();
  const dbBefore = await dbTypes();

  await p.getByRole('button', { name: label, exact: true }).last().click();
  await p.waitForTimeout(700);
  const afterAdd = await handles();

  await p.getByRole('button', { name: /^保存$/ }).first().click();
  await p.waitForTimeout(3000);

  await p.goto(url, { waitUntil: 'networkidle' });
  await p.waitForTimeout(2500);
  const afterReload = await handles();
  const dbAfter = await dbTypes();

  out.results.push({
    label,
    before,
    afterAdd,
    afterReload,
    survived: afterReload === afterAdd,
    dbBefore: dbBefore.length,
    dbAfter: dbAfter.length,
    dbAfterTypes: dbAfter,
  });
}

await ctx.close();
await browser.close();
writeFileSync(`${OUT}/C-2-per-type.json`, JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));

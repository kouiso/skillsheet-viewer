// 16 巡目 C-10 追試: main マージ後のツリーで「ダッシュボード」テンプレートを作り直し、
// #158（定義 4 ブロックのうち 3 つが保存されない）が本当に直っているかを実測する。
// コードを読んだ限りでは isBlockInputEmpty が profile/stats/project を「空でない」と
// 扱うよう変わっているが、読みで断定せず実際に作って DB を見る。
import { chromium } from '<REPO>/node_modules/.pnpm/playwright@1.62.0/node_modules/playwright/index.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';
import { neon } from '<REPO>/packages/db/node_modules/@neondatabase/serverless/index.mjs';

const BASE = 'http://127.0.0.1:3210';
const OUT = '<REPO>/test-results/dogfooding/round16';
mkdirSync(OUT, { recursive: true });
const sql = neon(process.env.DATABASE_URL);
const stamp = process.env.ROUND_STAMP;

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await b.newContext({ viewport: { width: 1500, height: 980 } });
const p = await ctx.newPage();
await p.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
await p.locator('input[type=email]').fill(process.env.E2E_EMAIL);
await p.locator('input[type=password]').fill(process.env.E2E_PASSWORD);
await p.getByRole('button', { name: /ログイン/ }).click();
await p.waitForURL(/builder/, { timeout: 30000 });
await p.waitForTimeout(2000);

// 仕様書 C-10 のとおり、初期ブロックを持つテンプレート 3 つを全部作る
const TEMPLATES = [
  { label: '技術者プロファイル', defined: 2 },
  { label: 'フルスキルシート', defined: 5 },
  { label: 'ダッシュボード（プロフィール・統計・案件）', defined: 4 },
];

const results = [];
for (const t of TEMPLATES) {
  const title = `round16-${t.label.slice(0, 6)}-${stamp}`;
  await p.goto(`${BASE}/builder`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(1800);
  await p.getByRole('button', { name: /新規シート/ }).first().click();
  await p.waitForTimeout(800);
  await p.locator('#new-sheet-title').fill(title);
  await p.locator('#new-sheet-template').selectOption({ label: t.label });
  await p.getByRole('button', { name: '作成', exact: true }).click();
  await p.waitForTimeout(3500);

  const rows = await sql`select id from skill_sheets where title = ${title}`;
  const id = rows[0]?.id ?? null;
  const blocks = id
    ? (await sql`select type from blocks where sheet_id = ${id} order by "order"`).map((x) => x.type)
    : [];
  results.push({ label: t.label, defined: t.defined, saved: blocks.length, types: blocks, ok: blocks.length === t.defined });
  await p.screenshot({ path: `${OUT}/C-10-${t.label.slice(0, 6)}.png` });
  if (id) {
    await sql`delete from blocks where sheet_id = ${id}`;
    await sql`delete from skill_sheets where id = ${id}`;
  }
}

await ctx.close();
await b.close();
writeFileSync(`${OUT}/C-10.json`, JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));

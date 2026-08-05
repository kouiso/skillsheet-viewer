// B-2 追試: 仕様書が求めるトップバーの「氏名 + 所属会社」を実際に見る。
// 横スクロール（L-1）だけを記録していると、会社名の欠落を B-2 で取りこぼす。
import { chromium } from '<REPO>/node_modules/.pnpm/playwright@1.62.0/node_modules/playwright/index.mjs';
import { writeFileSync } from 'node:fs';
import { neon } from '<REPO>/packages/db/node_modules/@neondatabase/serverless/index.mjs';

const BASE = 'http://127.0.0.1:3210';
const OUT = '<REPO>/test-results/dogfooding/round12';
const SHEET = '18a79e66-75e2-47e8-922e-d61342bb5233';
const sql = neon(process.env.DATABASE_URL);

const rows = await sql`select data from blocks where sheet_id = ${SHEET} and type = 'profile'`;
const profile = rows[0]?.data ?? null;

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
const a = await ctx.newPage();
await a.goto(`${BASE}/viewer-auth`, { waitUntil: 'networkidle' });
await a.locator('input').first().fill(process.env.VIEWER_CODE);
await a.getByRole('button', { name: '認証' }).click();
await a.waitForLoadState('networkidle');
await a.close();

const p = await ctx.newPage();
await p.goto(`${BASE}/view/db/${SHEET}`, { waitUntil: 'networkidle' });
await p.waitForTimeout(2500);

const header = p.locator('header').first();
const out = {
  dbProfileName: profile?.name ?? null,
  dbProfileCompany: profile?.company ?? null,
  dbProfileKeys: profile ? Object.keys(profile) : [],
  headerText: (await header.innerText()).replace(/\n+/g, ' / '),
  // 氏名 + 会社名は同じ div にまとまっている（viewer-topbar.tsx:60-64）
  brandSpans: await header.locator('div').first().locator('span').allInnerTexts(),
};
out.showsName = Boolean(profile?.name) && out.headerText.includes(profile.name);
out.showsCompany = Boolean(profile?.company) && out.headerText.includes(profile.company);
out.fallbackTitleUsed = out.headerText.includes('エンジニアスキルシート');
await p.screenshot({ path: `${OUT}/B-2-topbar.png`, clip: { x: 0, y: 0, width: 1280, height: 120 } });

await ctx.close();
await b.close();
writeFileSync(`${OUT}/B-2-topbar.json`, JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));

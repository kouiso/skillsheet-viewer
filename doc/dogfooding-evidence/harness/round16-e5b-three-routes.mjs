// 16 巡目 E-5b: DB 取得失敗時の 3 経路を並べて測る。
// /view（一覧）/ /view/db（デフォルト本文）/ /view/db/:id（詳細）は catch の方針が違う。
import { chromium } from '<REPO>/node_modules/.pnpm/playwright@1.62.0/node_modules/playwright/index.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';

const BASE = 'http://127.0.0.1:3214';
const OUT = '<REPO>/test-results/dogfooding/round16';
const SHEET = '18a79e66-75e2-47e8-922e-d61342bb5233';
mkdirSync(OUT, { recursive: true });

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
const a = await ctx.newPage();
await a.goto(`${BASE}/viewer-auth`, { waitUntil: 'networkidle' });
await a.locator('input').first().fill(process.env.VIEWER_CODE);
await a.getByRole('button', { name: '認証' }).click();
await a.waitForLoadState('networkidle');
await a.close();

const out = {};
for (const [label, path] of [
  ['view-list', '/view'],
  ['view-db-default', '/view/db'],
  ['view-db-by-id', `/view/db/${SHEET}`],
]) {
  const p = await ctx.newPage();
  const errs = [];
  p.on('console', (m) => m.type() === 'error' && errs.push(m.text().slice(0, 120)));
  const resp = await p.goto(`${BASE}${path}`, { waitUntil: 'networkidle' }).catch(() => null);
  await p.waitForTimeout(2000);
  out[label] = {
    path,
    status: resp?.status() ?? null,
    text: (await p.evaluate(() => document.body.innerText)).replace(/\n+/g, ' / ').slice(0, 200),
    browserConsoleErrors: errs.length,
  };
  await p.screenshot({ path: `${OUT}/E-5b-${label}.png` });
  await p.close();
}

await ctx.close();
await b.close();
writeFileSync(`${OUT}/E-5b.json`, JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));

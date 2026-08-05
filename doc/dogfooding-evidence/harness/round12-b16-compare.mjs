// B-16 追試: 仕様書のサブステップのうち、いま実測できるものを実際に通す。
// - a/b 欠落時に /view へ戻るか
// - a/b に DB シートの id を渡したときの挙動（U-2 の裏取り）
// 2 枚並列表示と狭幅の縦積みは GitHub 連携 env が本物でないと本文まで到達しないため、
// ここでは到達したページの状態をそのまま記録する（推測で PASS にしない）。
import { chromium } from '<REPO>/node_modules/.pnpm/playwright@1.62.0/node_modules/playwright/index.mjs';
import { writeFileSync } from 'node:fs';

const BASE = 'http://127.0.0.1:3210';
const OUT = '<REPO>/test-results/dogfooding/round12';
const SHEET_A = '18a79e66-75e2-47e8-922e-d61342bb5233';
const SHEET_B = '88883075-035c-4046-9bd4-050e01d26667';

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
const a = await ctx.newPage();
await a.goto(`${BASE}/viewer-auth`, { waitUntil: 'networkidle' });
await a.locator('input').first().fill(process.env.VIEWER_CODE);
await a.getByRole('button', { name: '認証' }).click();
await a.waitForLoadState('networkidle');
await a.close();

const cases = [
  ['no-params', '/compare'],
  ['only-a', `/compare?a=${SHEET_A}`],
  ['db-ids', `/compare?a=${SHEET_A}&b=${SHEET_B}`],
  ['md-paths', '/compare?a=skillsheet.md&b=skillsheet.md'],
];

const out = {};
for (const [label, path] of cases) {
  const p = await ctx.newPage();
  const errs = [];
  p.on('console', (m) => m.type() === 'error' && errs.push(m.text().slice(0, 120)));
  const resp = await p.goto(`${BASE}${path}`, { waitUntil: 'networkidle' }).catch(() => null);
  await p.waitForTimeout(1200);
  const text = await p.evaluate(() => document.body.innerText);
  out[label] = {
    requested: path,
    status: resp?.status() ?? null,
    finalPath: new URL(p.url()).pathname + new URL(p.url()).search,
    redirectedToView: new URL(p.url()).pathname === '/view',
    paneCount: await p.locator('main').count(),
    bodyHead: text.replace(/\n+/g, ' / ').slice(0, 160),
    consoleErrors: errs.length,
  };
  await p.screenshot({ path: `${OUT}/B-16-${label}.png` });
  await p.close();
}

// 狭幅（縦積み）は md-paths のページで確認する。到達した画面の横スクロールも見る。
const n = await ctx.newPage();
await n.setViewportSize({ width: 375, height: 812 });
await n.goto(`${BASE}/compare?a=skillsheet.md&b=skillsheet.md`, { waitUntil: 'networkidle' });
await n.waitForTimeout(1200);
out['narrow-375'] = {
  finalPath: new URL(n.url()).pathname + new URL(n.url()).search,
  bodyHead: (await n.evaluate(() => document.body.innerText)).replace(/\n+/g, ' / ').slice(0, 160),
  horizontalScroll: await n.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth),
};
await n.screenshot({ path: `${OUT}/B-16-narrow-375.png` });
await n.close();

await ctx.close();
await b.close();
writeFileSync(`${OUT}/B-16-compare.json`, JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));

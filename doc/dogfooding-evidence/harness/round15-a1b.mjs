// 15 巡目 A-1b: 未認証で「実在する詳細 URL」を開き、閲覧コード認証のあとに
// 元のシートへ戻るかを実際に通す（コードから推測せず実測する）。
import { chromium } from '<REPO>/node_modules/.pnpm/playwright@1.62.0/node_modules/playwright/index.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';

const BASE = 'http://127.0.0.1:3210';
const OUT = '<REPO>/test-results/dogfooding/round15';
const SHEET = '18a79e66-75e2-47e8-922e-d61342bb5233';
mkdirSync(OUT, { recursive: true });

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
// cookie を一切持たない新しいコンテキスト
const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
const p = await ctx.newPage();

const r = {};
const target = `/view/db/${SHEET}`;
await p.goto(`${BASE}${target}`, { waitUntil: 'networkidle' });
await p.waitForTimeout(1200);
r.afterDirectOpen = new URL(p.url()).pathname + new URL(p.url()).search;
r.redirectedToViewerAuth = new URL(p.url()).pathname === '/viewer-auth';
r.nextParam = new URL(p.url()).searchParams.get('next');
await p.screenshot({ path: `${OUT}/A-1b-gate.png` });

// 閲覧コードで認証してどこへ着地するか
await p.locator('input').first().fill(process.env.VIEWER_CODE);
await p.getByRole('button', { name: '認証' }).click();
await p.waitForTimeout(3000);
r.afterAuth = new URL(p.url()).pathname + new URL(p.url()).search;
r.backToRequestedSheet = new URL(p.url()).pathname === target;
r.bodyHead = (await p.evaluate(() => document.body.innerText)).replace(/\n+/g, ' / ').slice(0, 140);
await p.screenshot({ path: `${OUT}/A-1b-after-auth.png` });

// 対照: next を明示すれば戻るか（viewer-auth 側のパーサは next を読む実装がある）
const ctx2 = await b.newContext({ viewport: { width: 1280, height: 900 } });
const q = await ctx2.newPage();
await q.goto(`${BASE}/viewer-auth?next=${encodeURIComponent(target)}`, { waitUntil: 'networkidle' });
await q.locator('input').first().fill(process.env.VIEWER_CODE);
await q.getByRole('button', { name: '認証' }).click();
await q.waitForTimeout(3000);
r.withExplicitNext = new URL(q.url()).pathname + new URL(q.url()).search;
r.explicitNextWorks = new URL(q.url()).pathname === target;
await q.screenshot({ path: `${OUT}/A-1b-explicit-next.png` });

await ctx.close();
await ctx2.close();
await b.close();
writeFileSync(`${OUT}/A-1b.json`, JSON.stringify(r, null, 2));
console.log(JSON.stringify(r, null, 2));

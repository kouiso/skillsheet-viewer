// B-15a 追試: GitHub env 未設定のとき /view/[path] が返す HTTP ステータスを測る。
// 4 巡目までは画面の文言しか見ておらず「500 にはならない」と書いていた。
// 比較のため同条件で /compare も測る。
import { chromium } from '<REPO>/node_modules/.pnpm/playwright@1.62.0/node_modules/playwright/index.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';

const BASE = 'http://127.0.0.1:3210';
const OUT = '<REPO>/test-results/dogfooding/round5';
const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: EXE });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });

// 閲覧コード認証
const a = await ctx.newPage();
await a.goto(`${BASE}/viewer-auth`, { waitUntil: 'networkidle' });
await a.locator('input').first().fill(process.env.VIEWER_CODE);
await a.getByRole('button', { name: '認証' }).click();
await a.waitForLoadState('networkidle');
await a.close();

const out = {};
for (const [name, url] of [
  ['view-path', `${BASE}/view/skillsheet.md`],
  ['compare', `${BASE}/compare?a=skillsheet.md&b=skillsheet.md`],
]) {
  const p = await ctx.newPage();
  const errors = [];
  p.on('console', (m) => m.type() === 'error' && errors.push(m.text().slice(0, 200)));
  const resp = await p.goto(url, { waitUntil: 'networkidle' }).catch(() => null);
  await p.waitForTimeout(800);
  out[name] = {
    status: resp?.status() ?? null,
    finalUrl: p.url(),
    consoleErrors: errors,
    text: (await p.evaluate(() => document.body.innerText)).slice(0, 400),
  };
  await p.screenshot({ path: `${OUT}/B-15a-${name}-noenv.png` });
  await p.close();
}

// サーバー側の生レスポンスも見る（ブラウザを介さない値）
const raw = await fetch(`${BASE}/view/skillsheet.md`, { redirect: 'manual' }).catch((e) => ({
  status: `fetch failed: ${e.message}`,
}));
out.rawFetchStatus = raw.status;

await ctx.close();
await browser.close();
writeFileSync(`${OUT}/B-15a-noenv.json`, JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));

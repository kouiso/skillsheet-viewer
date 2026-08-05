// 19 巡目 B-2 追試。仕様書 B-2 は「閲覧者コンテキストで (a) /view へ戻る導線 (b) 編集導線の有無」を
// 見ることを求めているのに、結果表は会社名欠落と 320px 横スクロールしか記録しておらず、
// 証跡（round12）もトップバーのテキストしか測っていなかった（Codex 指摘）。
// この 2 つを直しても U-3 / U-4 の退行は検出できないままなので、ここで実測する。
//
// 閲覧コードだけの独立コンテキストで測る。編集者セッションを持ったままだと
// 「閲覧者にも編集導線が出ている」かどうかを判定できない。
import { chromium } from '<REPO>/node_modules/.pnpm/playwright@1.62.0/node_modules/playwright/index.mjs';
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';

{
  const envPath = '<REPO>/apps/web/.env.local';
  if (existsSync(envPath))
    for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const i = t.indexOf('=');
      if (i === -1) continue;
      const k = t.slice(0, i).trim();
      if (process.env[k] === undefined) process.env[k] = t.slice(i + 1).trim();
    }
}

const BASE = 'http://127.0.0.1:3210';
const SHEET = '18a79e66-75e2-47e8-922e-d61342bb5233';
const OUT = '<REPO>/test-results/dogfooding/round19';
mkdirSync(OUT, { recursive: true });

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
// 閲覧コードのみ。編集者セッションは持たせない。
const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
const auth = await ctx.newPage();
await auth.goto(`${BASE}/viewer-auth`, { waitUntil: 'networkidle' });
await auth.locator('input').first().fill(process.env.VIEWER_CODE);
await auth.getByRole('button', { name: '認証' }).click();
await auth.waitForLoadState('networkidle');
await auth.close();

const p = await ctx.newPage();
await p.goto(`${BASE}/view/db/${SHEET}`, { waitUntil: 'networkidle' });
await p.waitForTimeout(2500);

const r = { sheetUrl: p.url() };

// トップバー内のリンクを全部列挙する（href と可視文字列）。
const topbar = p.locator('header').first();
r.topbarText = (await topbar.innerText()).replace(/\n+/g, ' / ');
r.topbarLinks = await topbar.locator('a').evaluateAll((els) =>
  els.map((e) => ({
    href: e.getAttribute('href'),
    text: (e.textContent ?? '').trim().slice(0, 40),
    ariaLabel: e.getAttribute('aria-label'),
    title: e.getAttribute('title'),
  })),
);

// (a) 一覧 /view へ戻る導線があるか
r.returnToListLinks = r.topbarLinks.filter((l) => l.href === '/view' || l.href === '/view/');
r.hasReturnToList = r.returnToListLinks.length > 0;
// ページ全体で見ても存在しないことを確認（トップバー以外に置かれている可能性を潰す）
r.anyViewLinkOnPage = await p.locator('a[href="/view"], a[href="/view/"]').count();

// (b) 閲覧者に編集導線が見えているか
r.builderLinks = r.topbarLinks.filter((l) => (l.href ?? '').startsWith('/builder'));
r.hasBuilderAffordance = r.builderLinks.length > 0;
r.builderLinkVisible = r.hasBuilderAffordance
  ? await p.locator('a[href^="/builder"]').first().isVisible()
  : false;

// 押したらどうなるか（閲覧コードしか持っていないので編集者ゲートに弾かれるはず）
if (r.builderLinkVisible) {
  await p.locator('a[href^="/builder"]').first().click();
  await p.waitForLoadState('networkidle').catch(() => {});
  await p.waitForTimeout(2000);
  r.afterClickingBuilderUrl = p.url();
  r.afterClickingBuilderIsLogin = /\/login/.test(p.url());
}

await p.screenshot({ path: `${OUT}/B-2-viewer-topbar.png` });
await ctx.close();
await b.close();

writeFileSync(`${OUT}/B-2-viewer-topbar.json`, JSON.stringify(r, null, 2));
console.log(JSON.stringify(r, null, 2));

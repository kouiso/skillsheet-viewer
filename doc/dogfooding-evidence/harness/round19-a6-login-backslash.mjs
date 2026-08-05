// 19 巡目 A-6a 再測定。10 巡目のハーネスは `reachedExternal` を
// `reqs.some(u => u.includes('evil.example.com'))` で判定していたため、
// **クエリ文字列にホスト名が入っているだけの自ローカルへのリクエスト**
// （`/login?next=%2F%2Fevil.example.com`）を外部到達と誤検知していた（Codex 指摘）。
// その結果 `//evil.example.com` が「安全に /builder に留まる」のに証跡だけ true になり、
// 結果表と食い違っていた。
//
// 直し方: URL 文字列の部分一致ではなく **リクエスト URL のホスト**で判定し、
// 自ローカル（127.0.0.1:3210）へのリクエストは外部到達に数えない。
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
const LOCAL_HOST = '127.0.0.1';
const EVIL_HOST = 'evil.example.com';
const OUT = '<REPO>/test-results/dogfooding/round19';
mkdirSync(OUT, { recursive: true });

const hostOf = (u) => {
  try {
    return new URL(u).hostname;
  } catch {
    return null;
  }
};

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const out = {};
for (const [label, payload] of [
  ['double-slash', '//evil.example.com'],
  ['backslash', '/\\/evil.example.com'],
  ['absolute-https', 'https://evil.example.com'],
]) {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
  const p = await ctx.newPage();
  const reqs = [];
  p.on('request', (r) => {
    if (r.isNavigationRequest()) reqs.push(r.url());
  });
  await ctx.route('**://evil.example.com/**', (r) => r.abort());
  await p.goto(`${BASE}/login?next=${encodeURIComponent(payload)}`, { waitUntil: 'networkidle' });
  await p.locator('input[type=email]').fill(process.env.E2E_EMAIL);
  await p.locator('input[type=password]').fill(process.env.E2E_PASSWORD);
  await p.getByRole('button', { name: /ログイン/ }).click();
  await p.waitForTimeout(4000);

  const hosts = reqs.map((u) => ({ url: u, host: hostOf(u) }));
  // 自ローカルへのリクエストは、クエリにホスト名が入っていても外部到達ではない。
  const externalHits = hosts.filter((h) => h.host === EVIL_HOST);
  const localHits = hosts.filter((h) => h.host === LOCAL_HOST);
  out[label] = {
    payload,
    finalUrl: p.url(),
    finalHost: hostOf(p.url()),
    navigationRequests: hosts,
    localNavigationCount: localHits.length,
    externalNavigationCount: externalHits.length,
    reachedExternal: externalHits.length > 0,
    // 旧ハーネスの判定を並べて、どこで誤検知していたかを残す
    legacyReachedExternal_substringMatch: reqs.some((u) => u.includes(EVIL_HOST)),
  };
  await ctx.close();
}
await b.close();
writeFileSync(`${OUT}/A-6-login-backslash.json`, JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));

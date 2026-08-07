// `/\/evil.example.com` が本当に外部へ出ようとしているのかを、実際のリクエスト先で確認する。
import { chromium } from '<REPO>/node_modules/.pnpm/playwright@1.62.0/node_modules/playwright/index.mjs';
import { writeFileSync } from 'node:fs';
const BASE='http://127.0.0.1:3210', OUT='<REPO>/test-results/dogfooding/round10';
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const ctx=await b.newContext({viewport:{width:1280,height:800}});
const p=await ctx.newPage();
const navs=[], reqs=[];
p.on('framenavigated', f=>{ if(f===p.mainFrame()) navs.push(f.url()); });
p.on('request', r=>{ if(r.isNavigationRequest()) reqs.push(r.url()); });
// 外部へ出ようとしたら握りつぶして記録（実際に外へは飛ばさない）
await ctx.route('**://evil.example.com/**', route => route.abort());

await p.goto(`${BASE}/viewer-auth?next=${encodeURIComponent('/\\/evil.example.com')}`,{waitUntil:'networkidle'});
await p.locator('input').first().fill(process.env.VIEWER_CODE);
await p.getByRole('button',{name:'認証'}).click();
await p.waitForTimeout(3000);
const out={
  finalUrl: p.url(),
  navigations: navs,
  navigationRequests: reqs,
  reachedExternal: [...navs,...reqs].some(u=>u.includes('evil.example.com')),
};
writeFileSync(`${OUT}/A-6-backslash.json`, JSON.stringify(out,null,2));
console.log(JSON.stringify(out,null,2));
await ctx.close(); await b.close();

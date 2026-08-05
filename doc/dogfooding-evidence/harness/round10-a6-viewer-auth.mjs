// A-6 追試: /viewer-auth の ?next= オープンリダイレクト。
// /login とは別のパーサ（viewer-auth/page.tsx の router.push(dest)）なので個別に測る。
import { chromium } from '<REPO>/node_modules/.pnpm/playwright@1.62.0/node_modules/playwright/index.mjs';
import { writeFileSync } from 'node:fs';
const BASE='http://127.0.0.1:3210', OUT='<REPO>/test-results/dogfooding/round10';
const payloads=[
  ['//evil.example.com', false],
  ['https://evil.example.com', false],
  ['/\\/evil.example.com', false],
  ['http://127.0.0.1:3210/view', false],
  ['/view/db', true],
];
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const out=[];
for (const [next, shouldFollow] of payloads){
  const ctx=await b.newContext({viewport:{width:1280,height:800}});
  const p=await ctx.newPage();
  await p.goto(`${BASE}/viewer-auth?next=${encodeURIComponent(next)}`,{waitUntil:'networkidle'});
  await p.locator('input').first().fill(process.env.VIEWER_CODE);
  await p.getByRole('button',{name:'認証'}).click();
  await p.waitForTimeout(2500);
  const finalUrl=p.url();
  const host=new URL(finalUrl).host;
  out.push({ next, shouldFollow, finalUrl, stayedOnHost: host==='127.0.0.1:3210',
             landedOnView: new URL(finalUrl).pathname==='/view',
             landedOnRequested: new URL(finalUrl).pathname===next });
  await ctx.close();
}
await b.close();
writeFileSync(`${OUT}/A-6-viewer-auth.json`, JSON.stringify(out,null,2));
console.log(JSON.stringify(out,null,2));

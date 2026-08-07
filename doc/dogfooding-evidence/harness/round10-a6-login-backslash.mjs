import { chromium } from '<REPO>/node_modules/.pnpm/playwright@1.62.0/node_modules/playwright/index.mjs';
import { writeFileSync } from 'node:fs';
const BASE='http://127.0.0.1:3210', OUT='<REPO>/test-results/dogfooding/round10';
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const out={};
for (const [label,payload] of [['double-slash','//evil.example.com'],['backslash','/\\/evil.example.com']]){
  const ctx=await b.newContext({viewport:{width:1280,height:800}});
  const p=await ctx.newPage();
  const reqs=[];
  p.on('request', r=>{ if(r.isNavigationRequest()) reqs.push(r.url()); });
  await ctx.route('**://evil.example.com/**', r=>r.abort());
  await p.goto(`${BASE}/login?next=${encodeURIComponent(payload)}`,{waitUntil:'networkidle'});
  await p.locator('input[type=email]').fill(process.env.E2E_EMAIL);
  await p.locator('input[type=password]').fill(process.env.E2E_PASSWORD);
  await p.getByRole('button',{name:/ログイン/}).click();
  await p.waitForTimeout(4000);
  out[label]={ payload, finalUrl:p.url(), navigationRequests:reqs,
               reachedExternal: reqs.some(u=>u.includes('evil.example.com')) };
  await ctx.close();
}
await b.close();
writeFileSync(`${OUT}/A-6-login-backslash.json`, JSON.stringify(out,null,2));
console.log(JSON.stringify(out,null,2));

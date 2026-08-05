import { chromium } from '<REPO>/node_modules/.pnpm/playwright@1.62.0/node_modules/playwright/index.mjs';
import { writeFileSync } from 'node:fs';
const BASE='http://127.0.0.1:3210';
const OUT='<REPO>/test-results/dogfooding/round8';
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const ctx=await b.newContext({viewport:{width:1400,height:950}});
const a=await ctx.newPage();
await a.goto(`${BASE}/viewer-auth`,{waitUntil:'networkidle'});
await a.locator('input').first().fill(process.env.VIEWER_CODE);
await a.getByRole('button',{name:'認証'}).click();
await a.waitForLoadState('networkidle'); await a.close();
const out={};
for (const [label,id] of [['db-markdown','88883075-035c-4046-9bd4-050e01d26667'],['dashboard','18a79e66-75e2-47e8-922e-d61342bb5233']]){
  const p=await ctx.newPage();
  await p.goto(`${BASE}/view/db/${id}`,{waitUntil:'networkidle'});
  await p.waitForTimeout(3000);
  out[label]={
    headingIds: await p.evaluate(()=>document.querySelectorAll('h1[id],h2[id],h3[id]').length),
    tocButtons: await p.locator('aside button[aria-current], aside ul li button').count(),
    anyUlButtons: await p.locator('ul li button').count(),
    tocTexts: (await p.locator('ul li button').allInnerTexts()).slice(0,8),
  };
  await p.screenshot({path:`${OUT}/B-10-${label}.png`});
  await p.close();
}
await ctx.close(); await b.close();
writeFileSync(`${OUT}/B-10-toc.json`, JSON.stringify(out,null,2));
console.log(JSON.stringify(out,null,2));

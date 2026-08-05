// B-10 追試: アクティブ見出しの追従を「TOC ボタンの index」で測る。
// 検証用シートは過去の巡で見出しテキストが重複しているため、テキストでは判別できない。
// IntersectionObserver は rootMargin '-100px 0px -66% 0px' なので、
// 見出しが上から 100px〜34% の帯に入るようスクロール位置を調整する。
import { chromium } from '<REPO>/node_modules/.pnpm/playwright@1.62.0/node_modules/playwright/index.mjs';
import { writeFileSync } from 'node:fs';
const BASE='http://127.0.0.1:3210', OUT='<REPO>/test-results/dogfooding/round9';
const SHEET='88883075-035c-4046-9bd4-050e01d26667';
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const ctx=await b.newContext({viewport:{width:1400,height:900}});
const a=await ctx.newPage();
await a.goto(`${BASE}/viewer-auth`,{waitUntil:'networkidle'});
await a.locator('input').first().fill(process.env.VIEWER_CODE);
await a.getByRole('button',{name:'認証'}).click();
await a.waitForLoadState('networkidle'); await a.close();

const p=await ctx.newPage();
await p.goto(`${BASE}/view/db/${SHEET}`,{waitUntil:'networkidle'});
await p.waitForTimeout(3000);

const activeIndex = () => p.evaluate(() => {
  const btns=[...document.querySelectorAll('ul li button')];
  return btns.findIndex(b=>b.getAttribute('aria-current')==='true');
});
const ids = await p.evaluate(()=>[...document.querySelectorAll('h1[id],h2[id],h3[id]')].map(h=>h.id));
const out={ tocCount: await p.locator('ul li button').count(), headingIds: ids.length, activeAtTop: await activeIndex(), steps: [] };

for (let i=0;i<ids.length;i++){
  await p.evaluate((id)=>{
    const el=document.getElementById(id);
    if(!el) return;
    const y=el.getBoundingClientRect().top+window.scrollY-150; // 帯の中に入れる
    window.scrollTo({top:y,behavior:'instant'});
  }, ids[i]);
  await p.waitForTimeout(900);
  out.steps.push({ headingIndex:i, activeButtonIndex: await activeIndex() });
}
out.followed = out.steps.filter(s=>s.headingIndex===s.activeButtonIndex).length;
await p.screenshot({path:`${OUT}/B-10-active-tracking.png`});
await ctx.close(); await b.close();
writeFileSync(`${OUT}/B-10-active.json`, JSON.stringify(out,null,2));
console.log(JSON.stringify(out,null,2));

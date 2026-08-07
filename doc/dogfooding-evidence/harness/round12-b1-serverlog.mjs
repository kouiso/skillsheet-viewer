// B-1 追試: /view 一覧の「空」分岐と「エラー」分岐を実際に通す。
// 検索 0 件（filtered.length === 0）とは別の分岐:
//   - initialSheets.length === 0  → 「シートがまだありません（ビルダーで作成してください）」
//   - hasError                    → 「一覧の取得に失敗しました。」
import { chromium } from '<REPO>/node_modules/.pnpm/playwright@1.62.0/node_modules/playwright/index.mjs';
import { writeFileSync } from 'node:fs';
const OUT='<REPO>/test-results/dogfooding/round12';
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const out={};
for (const [label, port] of [['error', 3214]]) {
  const BASE=`http://127.0.0.1:${port}`;
  const ctx=await b.newContext({viewport:{width:1280,height:900}});
  const a=await ctx.newPage();
  await a.goto(`${BASE}/viewer-auth`,{waitUntil:'networkidle'});
  await a.locator('input').first().fill(process.env.VIEWER_CODE);
  await a.getByRole('button',{name:'認証'}).click();
  await a.waitForLoadState('networkidle'); await a.close();
  const p=await ctx.newPage();
  const errs=[]; p.on('console',m=>m.type()==='error'&&errs.push(m.text().slice(0,120)));
  const resp=await p.goto(`${BASE}/view`,{waitUntil:'networkidle'}).catch(()=>null);
  await p.waitForTimeout(1500);
  const text=await p.evaluate(()=>document.body.innerText);
  out[label]={
    status: resp?.status()??null,
    text: text.slice(0,300),
    emptyMsg: text.includes('シートがまだありません'),
    errorMsg: text.includes('一覧の取得に失敗しました'),
    mentionsFix: text.includes('db:migrate'),
    consoleErrors: errs.length,
  };
  await p.screenshot({path:`${OUT}/B-1-${label}.png`});
  await ctx.close();
}
await b.close();
writeFileSync(`${OUT}/B-1-error-serverlog.json`, JSON.stringify(out,null,2));
console.log(JSON.stringify(out,null,2));

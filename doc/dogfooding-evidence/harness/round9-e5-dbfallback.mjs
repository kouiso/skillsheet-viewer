// E-5 / E-4 追試: /view/db の DB 取得失敗フォールバックを実際に通す。
// DATABASE_URL / SKILLSHEET_OWNER_ID を「外す」と layout.tsx の assertServerEnv() が先に
// throw してページに到達しないため、値は present のまま接続先を到達不能にする条件で測る。
import { chromium } from '<REPO>/node_modules/.pnpm/playwright@1.62.0/node_modules/playwright/index.mjs';
import { writeFileSync } from 'node:fs';
const BASE='http://127.0.0.1:3211', OUT='<REPO>/test-results/dogfooding/round9';
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const ctx=await b.newContext({viewport:{width:1280,height:900}});
const a=await ctx.newPage();
await a.goto(`${BASE}/viewer-auth`,{waitUntil:'networkidle'});
await a.locator('input').first().fill(process.env.VIEWER_CODE);
await a.getByRole('button',{name:'認証'}).click();
await a.waitForLoadState('networkidle'); await a.close();

const out={};
const p=await ctx.newPage();
const errs=[]; p.on('console',m=>m.type()==='error'&&errs.push(m.text().slice(0,160)));
const resp=await p.goto(`${BASE}/view/db`,{waitUntil:'networkidle'}).catch(()=>null);
await p.waitForTimeout(1500);
out.status=resp?.status()??null;
out.text=(await p.evaluate(()=>document.body.innerText)).slice(0,400);
out.consoleErrors=errs;
out.hasFallbackHeading=out.text.includes('DB版スキルシートを表示できません');
out.mentionsEnv=out.text.includes('DATABASE_URL')&&out.text.includes('SKILLSHEET_OWNER_ID');
out.mentionsMigrate=out.text.includes('db:migrate');
await p.screenshot({path:`${OUT}/E-5-db-fallback.png`});
await p.close();
await ctx.close(); await b.close();
writeFileSync(`${OUT}/E-5-db-fallback.json`, JSON.stringify(out,null,2));
console.log(JSON.stringify(out,null,2));

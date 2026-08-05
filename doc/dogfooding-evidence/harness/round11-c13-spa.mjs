// C-13 追試: SPA 内遷移（シート切替・閲覧リンク）でも未保存警告が出るか。
// beforeunload はタブを閉じる/リロード時のみで、アプリ内遷移は
// builder-client.tsx の confirmDiscardChanges()（window.confirm）が守っている。
import { chromium } from '<REPO>/node_modules/.pnpm/playwright@1.62.0/node_modules/playwright/index.mjs';
import { writeFileSync } from 'node:fs';
const BASE='http://127.0.0.1:3210', OUT='<REPO>/test-results/dogfooding/round11';
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const ctx=await b.newContext({viewport:{width:1400,height:950}});
const p=await ctx.newPage();
await p.goto(`${BASE}/login`,{waitUntil:'networkidle'});
await p.locator('input[type=email]').fill(process.env.E2E_EMAIL);
await p.locator('input[type=password]').fill(process.env.E2E_PASSWORD);
await p.getByRole('button',{name:/ログイン/}).click();
await p.waitForURL(/builder/,{timeout:30000});
await p.waitForTimeout(2500);

const out={};
await p.locator('button',{hasText:/^Full \d+$/}).first().click();
await p.waitForTimeout(2500);
const startUrl=p.url();
// AUTOSAVE_DEBOUNCE_MS=600 なので、待つと自動保存が走って dirty が消える。
// オフラインにして自動保存を失敗させ、未保存のまま保持する。
await ctx.setOffline(true);
await p.locator('textarea').first().fill(`## round11-未保存-${Date.now()}`);
await p.waitForTimeout(4000);
out.statusBeforeNav = await p.evaluate(()=>{
  const t=document.body.innerText;
  for (const s of ['保存済み（自動）','自動保存に失敗','保存中']) if (t.includes(s)) return s;
  return null;
});
out.startUrl=startUrl;

// 1) シート切替
let dialog=null;
p.once('dialog', async d=>{ dialog={type:d.type(), message:d.message()}; await d.dismiss(); });
await p.locator('ul li button span.truncate', {hasText:'エンジニアスキルシート'}).first().click();
await p.waitForTimeout(2500);
out.sheetSwitch={ dialog, urlAfter:p.url(), stayed: p.url()===startUrl };
await p.screenshot({path:`${OUT}/C-13-sheet-switch.png`});

// 2) 「閲覧へ」リンク
let dialog2=null;
p.once('dialog', async d=>{ dialog2={type:d.type(), message:d.message()}; await d.dismiss(); });
const viewLink=p.getByRole('link',{name:/閲覧へ/}).first();
out.viewLinkFound=await viewLink.count();
if (out.viewLinkFound) { await viewLink.click().catch(()=>{}); await p.waitForTimeout(2500); }
out.viewLink={ dialog:dialog2, urlAfter:p.url(), stayed:p.url()===startUrl };
await p.screenshot({path:`${OUT}/C-13-view-link.png`});

writeFileSync(`${OUT}/C-13-spa.json`, JSON.stringify(out,null,2));
console.log(JSON.stringify(out,null,2));
await ctx.close(); await b.close();

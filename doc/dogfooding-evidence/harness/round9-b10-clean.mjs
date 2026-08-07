// B-10 追試2: 見出しが十分離れた専用シートを作ってアクティブ追従を測る。
// 既存の検証用シートは見出しが密集していて 1:1 の判定ができなかった。
import { chromium } from '<REPO>/node_modules/.pnpm/playwright@1.62.0/node_modules/playwright/index.mjs';
import { writeFileSync } from 'node:fs';
import { neon } from '<REPO>/packages/db/node_modules/@neondatabase/serverless/index.mjs';
import { randomUUID } from 'node:crypto';
const BASE='http://127.0.0.1:3210', OUT='<REPO>/test-results/dogfooding/round9';
const sql=neon(process.env.DATABASE_URL);

const owner=process.env.SKILLSHEET_OWNER_ID;
const sheetId=randomUUID();
const titles=['アルファ章','ブラボー章','チャーリー章','デルタ章','エコー章'];
const filler='本文をここに置いて見出し同士を十分に離す。'.repeat(40);
await sql`insert into skill_sheets (id, owner_id, title, updated_at) values (${sheetId}, ${owner}, ${'round9-TOC検証'}, now())`;
for (let i=0;i<titles.length;i++){
  await sql`insert into blocks (id, sheet_id, type, "order", data)
            values (${randomUUID()}, ${sheetId}, 'markdown', ${i},
                    ${JSON.stringify({markdown:`## ${titles[i]}\n\n${filler}`})}::jsonb)`;
}

const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const ctx=await b.newContext({viewport:{width:1400,height:900}});
const a=await ctx.newPage();
await a.goto(`${BASE}/viewer-auth`,{waitUntil:'networkidle'});
await a.locator('input').first().fill(process.env.VIEWER_CODE);
await a.getByRole('button',{name:'認証'}).click();
await a.waitForLoadState('networkidle'); await a.close();

const p=await ctx.newPage();
await p.goto(`${BASE}/view/db/${sheetId}`,{waitUntil:'networkidle'});
await p.waitForTimeout(3000);
const activeText = () => p.evaluate(()=>document.querySelector('ul li button[aria-current="true"]')?.textContent ?? null);
const out={ sheetId, tocTexts: await p.locator('ul li button').allInnerTexts(), steps: [] };
const ids = await p.evaluate(()=>[...document.querySelectorAll('h2[id]')].map(h=>h.id));
out.headingCount = ids.length;
for (let i=0;i<ids.length;i++){
  await p.evaluate((id)=>{const el=document.getElementById(id);const y=el.getBoundingClientRect().top+window.scrollY-150;window.scrollTo({top:y,behavior:'instant'});}, ids[i]);
  await p.waitForTimeout(900);
  out.steps.push({ expected: titles[i], active: await activeText() });
}
out.matched = out.steps.filter(s=>s.active===s.expected).length;
await p.screenshot({path:`${OUT}/B-10-clean-tracking.png`});
await ctx.close(); await b.close();
// 後片付け
await sql`delete from blocks where sheet_id = ${sheetId}`;
await sql`delete from skill_sheets where id = ${sheetId}`;
out.cleanedUp = true;
writeFileSync(`${OUT}/B-10-clean.json`, JSON.stringify(out,null,2));
console.log(JSON.stringify(out,null,2));

// 検証用シートの取り残しを消す（14 巡目の中断分）。本シートには触らない。
import { neon } from '<REPO>/packages/db/node_modules/@neondatabase/serverless/index.mjs';
const sql = neon(process.env.DATABASE_URL);
const rows = await sql`select id, title from skill_sheets where title like 'round1%'`;
for (const r of rows) {
  await sql`delete from blocks where sheet_id = ${r.id}`;
  await sql`delete from skill_sheets where id = ${r.id}`;
}
const left = await sql`select title from skill_sheets order by updated_at desc`;
console.log(JSON.stringify({ removed: rows.map((r) => r.title), remaining: left.map((r) => r.title) }, null, 2));

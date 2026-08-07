// 前回の中断で残った検証用シートを消す。
import { neon } from '<REPO>/packages/db/node_modules/@neondatabase/serverless/index.mjs';
const sql = neon(process.env.DATABASE_URL);
const rows = await sql`select id, title from skill_sheets where title like 'round13-%'`;
for (const r of rows) {
  await sql`delete from blocks where sheet_id = ${r.id}`;
  await sql`delete from skill_sheets where id = ${r.id}`;
}
console.log(JSON.stringify({ removed: rows.map((r) => r.title) }));

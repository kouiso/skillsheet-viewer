// 本シートの project ブロックの実際の形を見る（検証用シートの投入形を合わせるため）。
import { neon } from '<REPO>/packages/db/node_modules/@neondatabase/serverless/index.mjs';
const sql = neon(process.env.DATABASE_URL);
const rows = await sql`select data from blocks where sheet_id = '18a79e66-75e2-47e8-922e-d61342bb5233' and type = 'project'`;
const d = rows[0].data;
console.log(JSON.stringify({ topKeys: Object.keys(d), company0: d.companies?.[0], item0: d.items?.[0] }, null, 2));

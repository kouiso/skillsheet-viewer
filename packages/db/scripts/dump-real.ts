import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

function loadWebEnvLocal(): void {
  const here = dirname(fileURLToPath(import.meta.url));
  const envPath = resolve(here, '../../../apps/web/.env.local');
  const content = readFileSync(envPath, 'utf-8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}
loadWebEnvLocal();

const { getDb } = await import('../src/client');
const { blocks } = await import('../src/schema');
const { eq, asc } = await import('drizzle-orm');

const db = getDb();
const rows = await db.select().from(blocks).where(eq(blocks.sheetId, '18a79e66-75e2-47e8-922e-d61342bb5233')).orderBy(asc(blocks.order));
console.log('BLOCK_COUNT:', rows.length);
for (const r of rows) console.log('---', r.order, r.type, '---');
writeFileSync('/tmp/real_blocks.json', JSON.stringify(rows, null, 2));
console.log('written /tmp/real_blocks.json');

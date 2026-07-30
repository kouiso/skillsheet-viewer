/**
 * Console方向のダッシュボードUI（プロフィール/統計/スキルマトリクス/工程の俯瞰/案件詳細/タイムライン）
 * を実データで見た目確認するための検証用シートを1件 INSERT するスクリプト。
 *
 * 実行: pnpm --filter @skillsheet/db exec tsx packages/db/scripts/seed-console-demo.ts
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createConsoleDemoSheet } from '../src/console-demo';

// apps/web/.env.local から DATABASE_URL / SKILLSHEET_OWNER_ID を読み込む
// （packages/db には .env が無く、この2値は Web 側の .env.local にのみ存在するため）。
function loadWebEnvLocal(): void {
  const here = dirname(fileURLToPath(import.meta.url));
  const envPath = resolve(here, '../../../apps/web/.env.local');
  if (!existsSync(envPath)) {
    throw new Error(`apps/web/.env.local が見つかりません: ${envPath}`);
  }
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

async function main() {
  const sheetId = await createConsoleDemoSheet();
  console.log('created sheetId:', sheetId);
  console.log(`URL: /view/db/${sheetId}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

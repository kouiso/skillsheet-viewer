/**
 * kouiso/skill-sheet の skillsheet.md を Markdown ブロックとして DB にインポートする。
 *
 * 実行:
 *   GITHUB_TOKEN=... pnpm exec tsx scripts/import-skill-sheet.ts
 *
 * 既存の `エンジニアスキルシート` タイトルがあれば削除して新規作成する。
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { isBlockInputEmpty, splitMarkdownIntoBlocks } from '../src/db/blocks';
import {
  createSheet,
  deleteSheet,
  fetchMarkdownFromGitHub,
  getGitHubSeedConfig,
  listSheets,
} from '../src/db/skillsheet';

function loadWebEnvLocal(): void {
  const here = dirname(fileURLToPath(import.meta.url));
  const envPath = resolve(here, '../.env.local');
  if (!existsSync(envPath)) throw new Error(`.env.local が見つかりません: ${envPath}`);
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

const SHEET_TITLE = 'エンジニアスキルシート';

async function main() {
  const config = getGitHubSeedConfig();
  if (!config) {
    throw new Error('GITHUB_TOKEN / GITHUB_OWNER / GITHUB_REPO が未設定です');
  }

  console.log(`Fetching ${config.owner}/${config.repo}/skillsheet.md ...`);
  const markdown = await fetchMarkdownFromGitHub({ ...config, filePath: 'skillsheet.md' });
  // 分割で生じる空白のみのセグメントは分割ノイズなので除く（createSheet はもう
  // 空ブロックを落とさないため、ここで意図的にフィルタする必要がある。issue #128）。
  const segments = splitMarkdownIntoBlocks(markdown).filter((data) => !isBlockInputEmpty({ type: 'markdown', data }));
  console.log(`Split into ${segments.length} markdown blocks`);

  const blockInputs = segments.map((data) => ({ type: 'markdown' as const, data }));

  // 既存の同タイトルシートを削除して重複を防ぐ
  const existing = (await listSheets()).find((s) => s.title === SHEET_TITLE);
  if (existing) {
    console.log(`Deleting existing sheet ${existing.id}`);
    await deleteSheet(existing.id);
  }

  const sheetId = await createSheet(SHEET_TITLE, blockInputs);
  console.log(`Created sheet: ${sheetId}`);
  console.log(`View URL: /view/db/${sheetId}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

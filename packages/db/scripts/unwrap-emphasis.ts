/**
 * 実シートの project 本文から対になった **強調** を外す。
 * 生成ラベル（**業務内容** 等）はコード側で出すので、保存フィールドだけ対象。
 *
 *   ドライラン: pnpm --filter @skillsheet/db exec tsx scripts/unwrap-emphasis.ts
 *   書き込み:   pnpm --filter @skillsheet/db exec tsx scripts/unwrap-emphasis.ts --write
 */
import { mkdirSync, writeFileSync } from 'node:fs';

import { isProjectBlockData, type ProjectItem } from '../src/blocks';
import { unwrapEmphasis } from '../src/text';
import { loadScriptEnv } from './env';

const SHEET_ID = '18a79e66-75e2-47e8-922e-d61342bb5233';
const FIELDS = ['summary', 'duties', 'acquired', 'comment'] as const;

loadScriptEnv();

function unwrapItem(item: ProjectItem): { item: ProjectItem; hits: string[] } {
  const hits: string[] = [];
  const next = { ...item };
  for (const field of FIELDS) {
    const raw = next[field];
    if (typeof raw !== 'string' || raw.length === 0) continue;
    const cleaned = unwrapEmphasis(raw);
    if (cleaned !== raw) {
      hits.push(field);
      next[field] = cleaned;
    }
  }
  return { item: next, hits };
}

async function main(): Promise<void> {
  const write = process.argv.includes('--write');
  const { getSkillSheetById, saveSkillSheetBlocks } = await import('../src/skillsheet');

  const sheet = await getSkillSheetById(SHEET_ID);
  const backupDir = '/tmp/skillsheet-unwrap';
  mkdirSync(backupDir, { recursive: true });
  const backupPath = `${backupDir}/${SHEET_ID}.json`;
  writeFileSync(backupPath, JSON.stringify(sheet.blocks, null, 2));
  console.log('BACKUP', backupPath);

  let changedItems = 0;
  const nextBlocks = sheet.blocks.map((block) => {
    if (block.type !== 'project' || !isProjectBlockData(block.data)) return { type: block.type, data: block.data };
    const items = block.data.items.map((item) => {
      const { item: next, hits } = unwrapItem(item);
      if (hits.length > 0) {
        changedItems += 1;
        console.log('UNWRAP', item.title, hits.join(','));
      }
      return next;
    });
    return { type: block.type as const, data: { ...block.data, items } };
  });

  console.log('CHANGED_ITEMS', changedItems);
  if (!write) {
    console.log('DRY RUN — DB へは書き込んでいません（--write で実行すると保存します）');
    return;
  }
  await saveSkillSheetBlocks(sheet.title, nextBlocks, SHEET_ID);
  console.log('SAVED', SHEET_ID);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

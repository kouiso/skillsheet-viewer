/**
 * 指定シートの推しを React / TypeScript / Nest.js / Next.js の4件へそろえる。
 *
 * 既存の一括更新スクリプトと同じく、既定は dry-run。--apply を付けるまで DB は変更しない。
 * `--sheet-id` または SKILLSHEET_OWNER_ID で必ず対象を絞る。
 */
import { inArray } from 'drizzle-orm';

import { isSkillsBlockData } from '../src/db/blocks';
import { getDb } from '../src/db/client';
import { blocks } from '../src/db/schema';
import {
  loadWebEnvLocal,
  type BlockUpdate,
  resolveTargetSheetIds,
  writeBlockUpdates,
} from './block-write';

const FEATURED_SKILLS = new Map([
  ['言語\u0000TypeScript/JavaScript', true],
  ['フロントエンド\u0000React', true],
  ['フロントエンド\u0000Next.js', true],
  ['バックエンド\u0000Nest.js', true],
]);

function targetKey(category: string, name: string): string {
  return `${category}\u0000${name}`;
}

async function main(): Promise<void> {
  loadWebEnvLocal();
  const apply = process.argv.includes('--apply');
  const db = getDb();
  const sheetIds = await resolveTargetSheetIds(db, process.argv.slice(2));
  const rows = await db.select().from(blocks).where(inArray(blocks.sheetId, sheetIds));
  const found = new Set<string>();
  const updates: BlockUpdate[] = [];

  for (const row of rows) {
    const previous = row.data;
    if (row.type !== 'skills' || !isSkillsBlockData(previous)) continue;
    const data = {
      ...previous,
      skills: previous.skills.map((skill) => {
        const key = targetKey(previous.category, skill.name);
        if (FEATURED_SKILLS.has(key)) {
          found.add(key);
          return { ...skill, featured: true };
        }
        // 「推し」は true のときだけ保持する。false を残すと全行が不要な差分になる。
        const { featured: _featured, ...unfeatured } = skill;
        return unfeatured;
      }),
    };
    updates.push({ id: row.id, sheetId: row.sheetId, data, previous });
  }

  const missing = [...FEATURED_SKILLS.keys()].filter((key) => !found.has(key));
  if (missing.length > 0) {
    throw new Error(`対象スキルが見つかりません: ${missing.map((key) => key.replace('\u0000', ' / ')).join(', ')}`);
  }
  if (found.size !== FEATURED_SKILLS.size) throw new Error('推しの対象数が4件と一致しません');

  const changed = updates.filter((update) => JSON.stringify(update.data) !== JSON.stringify(update.previous));
  console.log(`対象シート: ${sheetIds.length} 件 / 推し: ${found.size} 件 / 変更ブロック: ${changed.length} 件`);
  for (const update of changed) console.log(`  block ${update.id}: featured を更新`);
  if (!apply) {
    console.log('→ 確認のみ（反映するには --apply を付ける）。');
    return;
  }

  const result = await writeBlockUpdates(db, updates);
  console.log(`→ DB へ反映しました（ブロック ${result.written} 件を更新 / ${result.skipped} 件は変更なし）。`);
}

void main();

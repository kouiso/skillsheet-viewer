/**
 * 指定シートの推しを React / TypeScript / Nest.js / Next.js の4件へそろえる。
 *
 * 既定は dry-run。--apply を付けるまで DB は変更しない。
 * `--sheet-id <uuid>` と SKILLSHEET_OWNER_ID・明示DATABASE_URLで対象を絞り、
 * document-service の read/replace（owner照合+版CAS）だけを使う。
 */

import { isSkillsBlockData } from '../src/db/block';
import { createDb } from '../src/db/client';
import { createDocumentService, DocumentError } from '../src/db/document-service';

// NUL区切りはカテゴリ名・スキル名中の空白との衝突を避けるため（継承した形式）。
const FEATURED_SKILLS = new Map([
  ['言語\u0000TypeScript/JavaScript', true],
  ['フロントエンド\u0000React', true],
  ['フロントエンド\u0000Next.js', true],
  ['バックエンド\u0000Nest.js', true],
]);

function targetKey(category: string, name: string): string {
  return `${category}\u0000${name}`;
}

function argValue(args: string[], key: string): string | undefined {
  const index = args.indexOf(key);
  const value = args[index + 1];
  return index >= 0 && value && !value.startsWith('--') ? value : undefined;
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const sheetId = argValue(process.argv.slice(2), '--sheet-id');
  if (!sheetId || !uuid.test(sheetId)) {
    throw new Error('対象シートを --sheet-id <uuid> で1件だけ明示してください。');
  }
  const owner = process.env.SKILLSHEET_OWNER_ID;
  if (!owner) throw new Error('SKILLSHEET_OWNER_ID が必要です');
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL_REQUIRED');

  const db = createDb(process.env.DATABASE_URL);
  const service = createDocumentService(db, owner);
  const result = await service.read(sheetId);
  if (result.status !== 'OK') throw new DocumentError(result.status);
  const snapshot = result.snapshot;
  const found = new Set<string>();
  let matched = 0;
  let changed = false;

  const blocks = snapshot.blocks.map((block) => {
    if (block.type !== 'skills' || !isSkillsBlockData(block.data)) return block;
    const previous = block.data;
    const data = {
      ...previous,
      skills: previous.skills.map((skill) => {
        const key = targetKey(previous.category, skill.name);
        if (FEATURED_SKILLS.has(key)) {
          found.add(key);
          matched += 1;
          if (!skill.featured) changed = true;
          return { ...skill, featured: true };
        }
        // 「推し」は true のときだけ保持する。false を残すと全行が不要な差分になる。
        const { featured: _featured, ...unfeatured } = skill;
        if (skill.featured) changed = true;
        return unfeatured;
      }),
    };
    return { ...block, data };
  });

  const missing = [...FEATURED_SKILLS.keys()].filter((key) => !found.has(key));
  if (missing.length > 0) {
    throw new Error(`対象スキルが見つかりません: ${missing.map((key) => key.replace('\u0000', ' / ')).join(', ')}`);
  }
  if (matched !== FEATURED_SKILLS.size) {
    throw new Error(`推しの対象数が4件と一致しません（現在: ${matched} 件）。対象スキルの重複を解消してください。`);
  }

  console.log(`対象シート: ${snapshot.sheetId} / 推し: ${matched} 件 / 変更: ${changed ? 'あり' : 'なし'}`);
  if (!apply) {
    console.log('→ 確認のみ（反映するには --apply を付ける）。');
    await db.$client.end();
    return;
  }
  if (!changed) {
    console.log('→ 変更がないため書き込みません。');
    await db.$client.end();
    return;
  }

  const after = await service.replace(snapshot.sheetId, snapshot.revision, snapshot.title, blocks);
  console.log(`→ DB へ反映しました（revision ${snapshot.revision} → ${after.revision}）。`);
  await db.$client.end();
}

void main();

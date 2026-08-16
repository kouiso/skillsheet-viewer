/**
 * 案件本文（`item.comment` / `item.duties` / `item.acquired`）と会社概要（`company.note`）を
 * 外部の JSON ファイルから流し込むスクリプト。
 *
 * 本文そのものをこのリポジトリへ置かないのが狙い。skillsheet-viewer は public なので、
 * 職務経歴の文章を同梱すると閲覧コードによる保護を素通りしてしまう。文章の正本は
 * private 側（skill-sheet リポジトリの skillsheet.md）に置き、このスクリプトは
 * 手元で書き出した JSON を読んで DB へ反映するだけにする。
 *
 * JSON の形（キーは案件タイトル / 会社名。書き換えたい項目だけ書けばよい）:
 *   {
 *     "projects": { "<案件タイトル>": { "comment": "...", "duties": "...", "acquired": "..." } },
 *     "companies": { "<会社名>": { "note": "..." } }
 *   }
 *
 * 冪等。既に同じ文字列が入っている項目は更新対象に数えない。
 *
 * 実行:
 *   確認のみ: pnpm --filter @skillsheet/db exec tsx scripts/apply-project-narrative.ts <path.json>
 *   反映:     pnpm --filter @skillsheet/db exec tsx scripts/apply-project-narrative.ts <path.json> --apply
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { eq } from 'drizzle-orm';

import { isProjectBlockData } from '../src/blocks';
import { getDb } from '../src/client';
import { blocks } from '../src/schema';

type ProjectPatch = { comment?: string; duties?: string; acquired?: string };
type CompanyPatch = { note?: string };
interface NarrativeFile {
  projects?: Record<string, ProjectPatch>;
  companies?: Record<string, CompanyPatch>;
}

const PROJECT_FIELDS = ['comment', 'duties', 'acquired'] as const;

function loadWebEnvLocal(): void {
  const here = dirname(fileURLToPath(import.meta.url));
  const envPath = resolve(here, '../../../apps/web/.env.local');
  if (!existsSync(envPath)) {
    throw new Error(`apps/web/.env.local が見つかりません: ${envPath}`);
  }
  for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
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

function readNarrative(path: string): NarrativeFile {
  if (!existsSync(path)) {
    throw new Error(`本文 JSON が見つかりません: ${path}`);
  }
  const parsed: unknown = JSON.parse(readFileSync(path, 'utf-8'));
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('本文 JSON はオブジェクトである必要があります');
  }
  return parsed as NarrativeFile;
}

loadWebEnvLocal();

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const jsonPath = args.find((a) => !a.startsWith('--'));
  if (!jsonPath) {
    throw new Error('本文 JSON のパスを引数で渡してください');
  }

  const narrative = readNarrative(resolve(jsonPath));
  const db = getDb();
  const rows = await db.select().from(blocks).where(eq(blocks.type, 'project'));

  let changed = 0;
  const unmatchedProjects = new Set(Object.keys(narrative.projects ?? {}));
  const unmatchedCompanies = new Set(Object.keys(narrative.companies ?? {}));

  for (const row of rows) {
    if (!isProjectBlockData(row.data)) continue;
    const data = row.data;

    const companies = data.companies.map((company) => {
      const patch = narrative.companies?.[company.name.trim()];
      if (!patch) return company;
      unmatchedCompanies.delete(company.name.trim());
      if (patch.note === undefined || patch.note === company.note) return company;
      changed += 1;
      console.log(`  会社概要 ${company.name}: ${company.note?.length ?? 0} 字 → ${patch.note.length} 字`);
      return { ...company, note: patch.note };
    });

    const items = data.items.map((item) => {
      const patch = narrative.projects?.[item.title.trim()];
      if (!patch) return item;
      unmatchedProjects.delete(item.title.trim());
      const next = { ...item };
      for (const field of PROJECT_FIELDS) {
        const value = patch[field];
        if (value === undefined || value === item[field]) continue;
        changed += 1;
        console.log(`  ${item.title} の ${field}: ${item[field]?.length ?? 0} 字 → ${value.length} 字`);
        next[field] = value;
      }
      return next;
    });

    if (apply) {
      await db
        .update(blocks)
        .set({ data: { ...data, companies, items } })
        .where(eq(blocks.id, row.id));
    }
  }

  for (const title of unmatchedProjects) console.warn(`  JSON の案件がシートに見つかりません: ${title}`);
  for (const name of unmatchedCompanies) console.warn(`  JSON の会社がシートに見つかりません: ${name}`);

  console.log('');
  console.log(`更新対象: ${changed} 項目`);
  console.log(apply ? '→ DB へ反映しました。' : '→ 確認のみ（反映するには --apply を付ける）。');
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

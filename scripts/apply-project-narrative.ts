/**
 * 案件の本文・担当領域（`item.comment` / `duties` / `acquired` / `scope`）と
 * 会社の概要・区分（`company.note` / `kind`）を、外部の JSON ファイルから流し込むスクリプト。
 *
 * 値そのものをこのリポジトリへ置かないのが狙い。skillsheet-viewer は public なので、
 * 職務経歴の文章はもちろん、実在の顧客名・サービス名を含む案件タイトルを同梱すると
 * 閲覧コードによる保護を素通りしてしまう。正本は private 側（skill-sheet リポジトリの
 * skillsheet.md）に置き、このスクリプトは手元で書き出した JSON を読んで DB へ反映するだけにする。
 *
 * `backfill-project-data.ts` は会社名の括弧書きから機械的に決まる kind と技術分類だけを
 * 扱う。そこで拾えない値（案件ごとの scope、括弧書きの無い会社の kind）はこちらで渡す。
 *
 * JSON の形（キーは案件タイトル / 会社名。書き換えたい項目だけ書けばよい）:
 *   {
 *     "projects": { "<案件タイトル>": { "comment": "...", "duties": "...", "acquired": "...", "scope": "..." } },
 *     "companies": { "<会社名>": { "note": "...", "kind": "..." } }
 *   }
 *
 * 冪等。既に同じ文字列が入っている項目は更新対象に数えず、中身が変わらなかった
 * ブロックは UPDATE 自体を出さない（`block-write.ts` 参照）。
 *
 * 対象シートは `--sheet-id` か `SKILLSHEET_OWNER_ID` で必ず絞る。案件タイトル・会社名の
 * 文字列一致だけで書き換え先を決める経路なので、絞らないと同じ DB の検証用デモシートや
 * 別オーナーのシートまで巻き込む。
 *
 * 実行:
 *   確認のみ: pnpm exec tsx scripts/apply-project-narrative.ts <path.json>
 *   反映:     pnpm exec tsx scripts/apply-project-narrative.ts <path.json> --apply
 *   シート指定: 上記に `--sheet-id <uuid>` を足す（省略時は SKILLSHEET_OWNER_ID の全シート）
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { isProjectBlockData } from '../src/db/blocks';
import { getDb } from '../src/db/client';
import { blocks } from '../src/db/schema';
import {
  type BlockUpdate,
  loadWebEnvLocal,
  projectBlocksOfSheets,
  resolveTargetSheetIds,
  writeBlockUpdates,
} from './block-write';

type ProjectPatch = { comment?: string; duties?: string; acquired?: string; scope?: string };
type CompanyPatch = { note?: string; kind?: string };
interface NarrativeFile {
  projects?: Record<string, ProjectPatch>;
  companies?: Record<string, CompanyPatch>;
}

const PROJECT_FIELDS = ['comment', 'duties', 'acquired', 'scope'] as const;
const COMPANY_FIELDS = ['note', 'kind'] as const;

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

async function main(): Promise<void> {
  loadWebEnvLocal();
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  // `--sheet-id <id>` の値を JSON パスと誤認しないよう、拡張子で見分ける。
  const jsonPath = args.find((a) => !a.startsWith('--') && a.endsWith('.json'));
  if (!jsonPath) {
    throw new Error('本文 JSON のパスを引数で渡してください');
  }

  const narrative = readNarrative(resolve(jsonPath));
  const db = getDb();
  const sheetIds = await resolveTargetSheetIds(db, args);
  console.log(`対象シート: ${sheetIds.length} 件`);
  const rows = await db.select().from(blocks).where(projectBlocksOfSheets(sheetIds));

  let changed = 0;
  const updates: BlockUpdate[] = [];
  const unmatchedProjects = new Set(Object.keys(narrative.projects ?? {}));
  const unmatchedCompanies = new Set(Object.keys(narrative.companies ?? {}));

  for (const row of rows) {
    if (!isProjectBlockData(row.data)) continue;
    const data = row.data;

    const companies = data.companies.map((company) => {
      const patch = narrative.companies?.[company.name.trim()];
      if (!patch) return company;
      unmatchedCompanies.delete(company.name.trim());
      const next = { ...company };
      for (const field of COMPANY_FIELDS) {
        const value = patch[field];
        if (value === undefined || value === company[field]) continue;
        changed += 1;
        console.log(`  ${company.name} の ${field}: ${company[field]?.length ?? 0} 字 → ${value.length} 字`);
        next[field] = value;
      }
      return next;
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

    updates.push({ id: row.id, sheetId: row.sheetId, data: { ...data, companies, items }, previous: data });
  }

  for (const title of unmatchedProjects) console.warn(`  JSON の案件がシートに見つかりません: ${title}`);
  for (const name of unmatchedCompanies) console.warn(`  JSON の会社がシートに見つかりません: ${name}`);

  console.log('');
  console.log(`更新対象: ${changed} 項目`);

  if (!apply) {
    console.log('→ 確認のみ（反映するには --apply を付ける）。');
    return;
  }
  const result = await writeBlockUpdates(db, updates);
  console.log(
    `→ DB へ反映しました（ブロック ${result.written} 件を更新 / ${result.skipped} 件は変更なしのため据え置き、シート ${result.sheets} 件の updated_at を更新）。`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

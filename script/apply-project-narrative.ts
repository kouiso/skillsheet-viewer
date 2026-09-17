/**
 * 案件の本文・担当領域・役割（`item.comment` / `duties` / `acquired` / `scope` / `role`）と
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
 * 冪等。既に同じ文字列が入っている項目は更新対象に数えず、提案にも含めない。
 *
 * 対象シートは `--sheet-id` で必ず指定する。案件タイトル・会社名の文字列一致は
 * 候補を探すためにだけ使い、書き換え先の同一性は解決した UUID + field + before/after
 * hash に束縛する（`narrative-proposal.ts`）。同名タイトルが複数あると推測で選ばず失敗する。
 *
 * 直接のDB書き込みはしない。出力は未承認の提案で、反映には
 * `run-narrative-update.ts` の approve → apply を本人承認記録つきで通す。
 *
 * 実行:
 *   提案作成: pnpm exec tsx script/apply-project-narrative.ts <path.json> --sheet-id <uuid> --journal <dir>
 *   確認のみ: 同コマンドから --journal を外す（提案は保存せず差分だけ表示）
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { isProjectBlockData } from '../src/db/block';
import { createDb } from '../src/db/client';
import { createDocumentService } from '../src/db/document-service';
import { proposeNarrativeUpdate } from './narrative-proposal';
import { persistPrivateRepairRecord } from './repair-proposal-file';

type ProjectPatch = {
  comment?: string;
  duties?: string;
  acquired?: string;
  scope?: string;
  role?: string;
  summary?: string;
};
type CompanyPatch = { note?: string; kind?: string };
export interface NarrativeFile {
  projects?: Record<string, ProjectPatch>;
  companies?: Record<string, CompanyPatch>;
}

const PROJECT_FIELDS = ['comment', 'duties', 'acquired', 'scope', 'role', 'summary'] as const;
const COMPANY_FIELDS = ['note', 'kind'] as const;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * パッチ 1 件を検証する。値は「書かない」か「文字列」だけを許す。
 *
 * 以前はトップレベルがオブジェクトかだけ見て `NarrativeFile` へキャストしていた。
 * `null` や数値が混じると、更新ループの `value.length` で落ちるか、型に合わない値を
 * そのまま DB へ書く（`ProjectItem.role` は文字列必須で、読み戻し側の型ガードが弾く）。
 * 本番のデータを書き換える経路なので、DB へ触る前にここで止める。
 */
function assertPatch(where: string, patch: unknown, fields: readonly string[]): void {
  if (typeof patch !== 'object' || patch === null || Array.isArray(patch)) {
    throw new Error(`${where}: パッチはオブジェクトである必要があります`);
  }
  for (const [key, value] of Object.entries(patch)) {
    if (!fields.includes(key)) {
      throw new Error(`${where}: 知らない項目 ${key}（使えるのは ${fields.join(' / ')}）`);
    }
    if (typeof value !== 'string') {
      throw new Error(
        `${where}: ${key} は文字列である必要があります（実際は ${value === null ? 'null' : typeof value}）`,
      );
    }
  }
}

function assertPatchMap(where: string, value: unknown, fields: readonly string[]): void {
  if (value === undefined) return;
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${where} はオブジェクトである必要があります`);
  }
  for (const [name, patch] of Object.entries(value)) {
    assertPatch(`${where}.${name}`, patch, fields);
  }
}

export function readNarrative(path: string): NarrativeFile {
  if (!existsSync(path)) {
    throw new Error(`本文 JSON が見つかりません: ${path}`);
  }
  const parsed: unknown = JSON.parse(readFileSync(path, 'utf-8'));
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('本文 JSON はオブジェクトである必要があります');
  }
  const file = parsed as Record<string, unknown>;
  assertPatchMap('projects', file.projects, PROJECT_FIELDS);
  assertPatchMap('companies', file.companies, COMPANY_FIELDS);
  return parsed as NarrativeFile;
}

function argValue(args: string[], key: string): string | undefined {
  const index = args.indexOf(key);
  const value = args[index + 1];
  return index >= 0 && value && !value.startsWith('--') ? value : undefined;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  // `--sheet-id <id>` の値を JSON パスと誤認しないよう、拡張子で見分ける。
  const jsonPath = args.find((a) => !a.startsWith('--') && a.endsWith('.json'));
  if (!jsonPath) {
    throw new Error('本文 JSON のパスを引数で渡してください');
  }
  const sheetId = argValue(args, '--sheet-id');
  if (!sheetId || !uuid.test(sheetId)) {
    throw new Error('対象シートを --sheet-id <uuid> で明示してください（owner内全シートへの一括経路は廃止）');
  }
  const journalDir = argValue(args, '--journal');
  const owner = process.env.SKILLSHEET_OWNER_ID;
  if (!owner) throw new Error('SKILLSHEET_OWNER_ID が必要です');
  // 期間修復と同じく、接続先は明示DATABASE_URLのみ。暗黙の.env読込で共有DBへ繋がない。
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL_REQUIRED');

  const narrative = readNarrative(resolve(jsonPath));
  const db = createDb(process.env.DATABASE_URL);
  const service = createDocumentService(db, owner);
  const result = await service.read(sheetId);
  await db.$client.end();
  if (result.status !== 'OK') throw new Error('対象シートを読めません');
  const proposal = proposeNarrativeUpdate(owner, result.snapshot, narrative);

  const nameOf = new Map<string, string>();
  for (const block of result.snapshot.blocks) {
    if (!isProjectBlockData(block.data)) continue;
    for (const company of block.data.companies) nameOf.set(company.id, company.name);
    for (const item of block.data.items) nameOf.set(item.id, item.title);
  }
  for (const change of proposal.changes) {
    console.log(`  ${nameOf.get(change.targetId) ?? change.targetId} の ${change.field} を更新`);
  }
  for (const title of proposal.unmatched.projects) console.warn(`  JSON の案件がシートに見つかりません: ${title}`);
  for (const name of proposal.unmatched.companies) console.warn(`  JSON の会社がシートに見つかりません: ${name}`);
  if (proposal.remainingIssues.length > 0) {
    console.warn(`  提案後の文書に検査違反が ${proposal.remainingIssues.length} 件残ります`);
  }

  console.log('');
  console.log(`更新対象: ${proposal.changes.length} 項目`);
  console.log(`beforeHash: ${proposal.beforeHash}`);
  console.log(`afterHash:  ${proposal.afterHash}`);

  if (!journalDir) {
    console.log('→ 確認のみ（提案を保存するには --journal <非公開dir> を付ける）。');
    return;
  }
  persistPrivateRepairRecord(resolve(journalDir, 'proposal.json'), proposal);
  console.log(`→ 未承認の提案を保存しました: ${journalDir}/proposal.json`);
  console.log('  反映には run-narrative-update.ts の approve → apply を通してください。');
}

// テストからこのファイルを import しても main() が走らないようにする
// （import しただけで「パスを渡してください」で落ち、exitCode まで汚す）。
const invokedDirectly = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}

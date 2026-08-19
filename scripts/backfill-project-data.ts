/**
 * project ブロックのデータ品質を直すスクリプト（#240 / #241）。2つのことをやる。
 *
 * 1. 空欄の `company.kind`（会社区分）を、会社名の括弧書きと note の書き出しから埋める
 * 2. 実態と合っていない技術スタックの分類を付け替える
 *
 * #240 / #241 は上位2件だけを挙げているが、実際には案件32件の scope と会社19件の kind が
 * 全件空で、閲覧画面の担当領域タグと PDF の「会社区分」行がどこにも出ていなかった。
 *
 * `item.scope`（担当領域）はここでは扱わない。案件タイトルごとの対応表が必要になるが、
 * skillsheet-viewer は public なので、実在の顧客名・サービス名を含む案件タイトルを
 * リポジトリへ置けない（閲覧コードによる保護を素通りしてしまう）。scope と、
 * この会社名ヒューリスティックで拾えない kind は `apply-project-narrative.ts` に
 * 外部 JSON で渡す。
 *
 * 冪等。既に値が入っている項目は上書きしない（人が後から直した値を潰さないため）。
 * 中身が変わらなかったブロックは UPDATE 自体を出さない（`block-write.ts` 参照）。
 *
 * 対象シートは `--sheet-id` か `SKILLSHEET_OWNER_ID` で必ず絞る（`block-write.ts` 参照）。
 *
 * 実行:
 *   確認のみ: pnpm exec tsx scripts/backfill-project-data.ts
 *   反映:     pnpm exec tsx scripts/backfill-project-data.ts --apply
 *   シート指定: 上記に `--sheet-id <uuid>` を足す（省略時は SKILLSHEET_OWNER_ID の全シート）
 */
import { isProjectBlockData, type ProjectTech } from '../src/db/blocks';
import { getDb } from '../src/db/client';
import { blocks } from '../src/db/schema';
import {
  type BlockUpdate,
  loadWebEnvLocal,
  projectBlocksOfSheets,
  resolveTargetSheetIds,
  writeBlockUpdates,
} from './block-write';

// 技術スタックの分類が実態と合っていないもの（#240 / #241）。
// 課金 SDK・決済サービス・分析タグはフレームワークでもコラボレーションツールでもないので、
// 読み手が「何を使えるのか」を誤解しないよう tools へ寄せる。
// キーは技術名の前方一致で見る（`RevenueCat (SDK)` のような表記ゆれを拾うため）。
type TechBucket = keyof ProjectTech;

const TECH_BUCKET_OVERRIDE: { prefix: string; bucket: TechBucket }[] = [
  { prefix: 'RevenueCat', bucket: 'tools' },
  { prefix: 'UnivaPay', bucket: 'tools' },
  { prefix: 'DOMPurify', bucket: 'tools' },
  { prefix: 'Microsoft Clarity', bucket: 'tools' },
  { prefix: 'GTM', bucket: 'tools' },
  { prefix: 'Google Tag Manager', bucket: 'tools' },
];

const TECH_BUCKETS: TechBucket[] = ['lang', 'fw', 'db', 'infra', 'tools', 'collab'];

function targetBucket(tech: string): TechBucket | null {
  const normalized = tech.trim();
  return TECH_BUCKET_OVERRIDE.find((rule) => normalized.startsWith(rule.prefix))?.bucket ?? null;
}

// 分類の付け替え。同じ技術が移動先に既にあれば重複させず落とす。
// 元配列に同じ技術が2回入っている場合、1回目の filter で両方消えるため、
// 2周目に入らないよう「まだ from に居るか」を見てから動かす（移動件数の二重計上防止）。
function recategoriseTech(tech: ProjectTech, onMove: (name: string, from: TechBucket, to: TechBucket) => void) {
  const next: ProjectTech = { ...tech };
  for (const bucket of TECH_BUCKETS) {
    next[bucket] = [...(tech[bucket] ?? [])];
  }
  for (const from of TECH_BUCKETS) {
    for (const name of [...next[from]]) {
      const to = targetBucket(name);
      if (!to || to === from) continue;
      if (!next[from].includes(name)) continue;
      next[from] = next[from].filter((t) => t !== name);
      if (!next[to].includes(name)) next[to].push(name);
      onMove(name, from, to);
    }
  }
  return next;
}

// 会社名の末尾の括弧書きから区分を取り出す。「A 社（大手 SI ベンダー）」→「大手 SI ベンダー」。
// 括弧を含まない中身だけを見る。`.+` にすると「株式会社A（旧B社）（SIer）」から
// 「旧B社）（SIer」を拾ってしまい、しかも kind 入りの行は次回スキップされるので
// 誤った値が永久に残る。
function kindFromCompanyName(name: string): string | null {
  const matched = name.match(/（([^（）]+)）\s*$/);
  return matched ? matched[1].trim() : null;
}

// note の書き出しが「業務委託にて」なら業務委託。会社名に括弧書きが無い会社がこれに当たる。
function kindFromNote(note: string): string | null {
  return note.trimStart().startsWith('業務委託') ? '業務委託' : null;
}

function resolveKind(name: string, note: string): string | null {
  return kindFromCompanyName(name) ?? kindFromNote(note);
}

async function main(): Promise<void> {
  loadWebEnvLocal();
  const apply = process.argv.includes('--apply');
  const db = getDb();
  const sheetIds = await resolveTargetSheetIds(db, process.argv.slice(2));
  console.log(`対象シート: ${sheetIds.length} 件`);
  const rows = await db.select().from(blocks).where(projectBlocksOfSheets(sheetIds));

  let companiesFilled = 0;
  let companiesSkipped = 0;
  let techMoved = 0;
  const updates: BlockUpdate[] = [];

  for (const row of rows) {
    if (!isProjectBlockData(row.data)) {
      console.warn(`skip: project ブロックとして解釈できない data (block ${row.id})`);
      continue;
    }
    const data = row.data;

    const companies = data.companies.map((company) => {
      if (company.kind?.trim()) {
        companiesSkipped += 1;
        return company;
      }
      const kind = resolveKind(company.name, company.note ?? '');
      if (!kind) {
        console.warn(`  会社区分を決められませんでした: ${company.name}`);
        return company;
      }
      companiesFilled += 1;
      console.log(`  会社区分 ${company.name} → ${kind}`);
      return { ...company, kind };
    });

    const items = data.items.map((item) => {
      const tech = recategoriseTech(item.tech, (name, from, to) => {
        techMoved += 1;
        console.log(`  技術分類 ${item.title}: ${name} を ${from} → ${to}`);
      });
      return { ...item, tech };
    });

    updates.push({ id: row.id, sheetId: row.sheetId, data: { ...data, companies, items }, previous: data });
  }

  console.log('');
  console.log(`会社区分:   ${companiesFilled} 件を補完 / ${companiesSkipped} 件は入力済みのため据え置き`);
  console.log(`技術分類:   ${techMoved} 件を付け替え`);

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

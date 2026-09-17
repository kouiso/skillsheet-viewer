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
 * 中身が変わらないなら replace も出さない。
 *
 * 対象シートは `--sheet-id <uuid>` で必ず1件指定する。接続先は明示DATABASE_URLのみ。
 * document-service の read/replace（owner照合+版CAS）だけを使う。
 *
 * 実行:
 *   確認のみ: pnpm exec tsx script/backfill-project-data.ts --sheet-id <uuid>
 *   反映:     上記に --apply を足す
 */
import { isProjectBlockData, type ProjectTech } from '../src/db/block';
import { createDb } from '../src/db/client';
import { createDocumentService, DocumentError } from '../src/db/document-service';

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
  console.log(`対象シート: ${snapshot.sheetId}`);

  let companiesFilled = 0;
  let companiesSkipped = 0;
  let techMoved = 0;
  let changed = false;

  const blocks = snapshot.blocks.map((block) => {
    if (block.type !== 'project') return block;
    if (!isProjectBlockData(block.data)) {
      console.warn(`skip: project ブロックとして解釈できない data (block ${block.id})`);
      return block;
    }
    const data = block.data;

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
      changed = true;
      console.log(`  会社区分 ${company.name} → ${kind}`);
      return { ...company, kind };
    });

    const items = data.items.map((item) => {
      const tech = recategoriseTech(item.tech, (name, from, to) => {
        techMoved += 1;
        changed = true;
        console.log(`  技術分類 ${item.title}: ${name} を ${from} → ${to}`);
      });
      return { ...item, tech };
    });

    return { ...block, data: { ...data, companies, items } };
  });

  console.log('');
  console.log(`会社区分:   ${companiesFilled} 件を補完 / ${companiesSkipped} 件は入力済みのため据え置き`);
  console.log(`技術分類:   ${techMoved} 件を付け替え`);

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

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

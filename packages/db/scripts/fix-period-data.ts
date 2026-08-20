/**
 * 案件本文の書式そろえが作った期間のズレを直すスクリプト（#245）。
 *
 * kouiso が `kouiso/skill-sheet` の skillsheet.md（正本）と DB のスキルシートを
 * 全項目照合した結果、書式そろえに由来する食い違いのうち直すべきものが2種類あった。
 *
 * 1. Q 社の案件2件・会社の期間が「終了 = 現在」のまま止まっている。
 *    kouiso は 2026 年 7 月末で Q 社を退いている（本人からの確認）ため、終了月を入れる。
 *    入れると `deriveDuration` の計算月数が原文の「9 ヶ月間」「8 ヶ月間」と一致する
 *    （＝この終了月が正しいことの独立した裏取りになっている）。
 * 2. I 社の会社期間だけ `2024.1` というドット表記になっている。他17社は
 *    `YYYY 年 M 月〜YYYY 年 M 月` 形式（原文どおり）。migrate-real-sheet.ts の
 *    normalizePeriod が単月表記にだけ誤って掛かっていたのが原因（別途修正済み・#245）。
 *    このスクリプトは既存 DB に残った結果だけを直す（再発防止は migrate-real-sheet.ts 側）。
 *
 * 対象は会社 id と案件 id で固定する（文字列一致による巻き込み事故を避けるため）。
 * 現在値が期待どおりのときだけ書き換える。既に別の値に直されていたら
 * 上書きせず警告するだけに留める（人が後から直した値を潰さないため）。
 * 期間・会社期間以外のフィールドには一切触らない。
 *
 * 冪等。--apply 無しではドライランのみ（DB へは一切書き込まない）。
 *
 * 実行:
 *   確認のみ: pnpm --filter @skillsheet/db exec tsx scripts/fix-period-data.ts
 *   反映:     pnpm --filter @skillsheet/db exec tsx scripts/fix-period-data.ts --apply
 *   シート指定: 上記に `--sheet-id <uuid>` を足す（省略時は SKILLSHEET_OWNER_ID の全シート）
 */
import { isProjectBlockData } from '../src/blocks';
import { getDb } from '../src/client';
import { blocks } from '../src/schema';
import {
  type BlockUpdate,
  loadWebEnvLocal,
  projectBlocksOfSheets,
  resolveTargetSheetIds,
  writeBlockUpdates,
} from './block-write';

interface CompanyPatch {
  id: string;
  label: string;
  from: string;
  to: string;
}

interface ItemPatch {
  id: string;
  label: string;
  from: string;
  to: string;
}

// 会社期間の修正対象。
// - Q 社（自社サービス事業会社）: 2026 年 7 月末退職を終了月として入れる。
// - I 社: ドット表記 `2024.1` を他17社と同じ `YYYY 年 M 月` 形式へそろえる。
const COMPANY_PATCHES: CompanyPatch[] = [
  {
    id: 'f45d4dc4-98d0-4828-9617-7cb895cd9400',
    label: 'Q 社（自社サービス事業会社）',
    from: '2025 年 11 月〜現在',
    to: '2025 年 11 月〜2026 年 7 月',
  },
  {
    id: 'e50e4c27-4435-4b83-8e2d-c3f792bb8378',
    label: 'I 社',
    from: '2024.1',
    to: '2024 年 1 月',
  },
];

const ITEM_PATCHES: ItemPatch[] = [
  {
    id: '18d8202e-7720-4540-b650-ea60dbccec37',
    label: 'マッチングアプリの開発（Q社）',
    from: '2025.11 — 現在',
    to: '2025.11 — 2026.07',
  },
  {
    id: '685c3295-b3b4-47f1-b3b9-4c053b3dc351',
    label: 'コンテンツメディアの開発（Q社）',
    from: '2025.12 — 現在',
    to: '2025.12 — 2026.07',
  },
];

async function main(): Promise<void> {
  loadWebEnvLocal();
  const apply = process.argv.includes('--apply');
  const db = getDb();
  const sheetIds = await resolveTargetSheetIds(db, process.argv.slice(2));
  console.log(`対象シート: ${sheetIds.length} 件`);
  const rows = await db.select().from(blocks).where(projectBlocksOfSheets(sheetIds));

  const remainingCompanyIds = new Set(COMPANY_PATCHES.map((p) => p.id));
  const remainingItemIds = new Set(ITEM_PATCHES.map((p) => p.id));
  let companiesPatched = 0;
  let itemsPatched = 0;
  const updates: BlockUpdate[] = [];

  for (const row of rows) {
    if (!isProjectBlockData(row.data)) {
      console.warn(`skip: project ブロックとして解釈できない data (block ${row.id})`);
      continue;
    }
    const data = row.data;

    const companies = data.companies.map((company) => {
      const patch = COMPANY_PATCHES.find((p) => p.id === company.id);
      if (!patch) return company;
      remainingCompanyIds.delete(patch.id);
      if (company.period === patch.to) {
        console.log(`  会社期間 ${patch.label}: すでに "${patch.to}" のため何もしません`);
        return company;
      }
      if (company.period !== patch.from) {
        console.warn(
          `  会社 ${patch.label} は現在値が想定と異なるため据え置き（期待 "${patch.from}" / 実際 "${company.period}"）`,
        );
        return company;
      }
      companiesPatched += 1;
      console.log(`  会社期間 ${patch.label}: "${patch.from}" → "${patch.to}"`);
      return { ...company, period: patch.to };
    });

    const items = data.items.map((item) => {
      const patch = ITEM_PATCHES.find((p) => p.id === item.id);
      if (!patch) return item;
      remainingItemIds.delete(patch.id);
      if (item.period === patch.to) {
        console.log(`  案件期間 ${patch.label}: すでに "${patch.to}" のため何もしません`);
        return item;
      }
      if (item.period !== patch.from) {
        console.warn(
          `  案件 ${patch.label} は現在値が想定と異なるため据え置き（期待 "${patch.from}" / 実際 "${item.period}"）`,
        );
        return item;
      }
      itemsPatched += 1;
      console.log(`  案件期間 ${patch.label}: "${patch.from}" → "${patch.to}"`);
      return { ...item, period: patch.to };
    });

    updates.push({ id: row.id, sheetId: row.sheetId, data: { ...data, companies, items }, previous: data });
  }

  for (const id of remainingCompanyIds) console.warn(`  会社 id ${id} が対象シート内に見つかりませんでした`);
  for (const id of remainingItemIds) console.warn(`  案件 id ${id} が対象シート内に見つかりませんでした`);

  console.log('');
  console.log(`会社期間: ${companiesPatched} / ${COMPANY_PATCHES.length} 件を書き換え予定`);
  console.log(`案件期間: ${itemsPatched} / ${ITEM_PATCHES.length} 件を書き換え予定`);

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

/**
 * 要約版 Excel（build-xlsx-digest.ts）の検査。xlsx の中身は ExcelJS で読み戻して確かめる。
 * 全文版（build-xlsx.ts）のテンプレートは使わず 4 列だけを組むので、
 * ここで見るのは並び・通し番号・会社見出し行・印刷設定だけ。
 */
import { readFileSync, writeFileSync } from 'node:fs';
import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import type { Block, CompanyInfo, ProjectItem } from '@/db/block';
import { filterVisibleProjectData } from '@/db/block';

import { buildSkillSheetXlsxDigest } from './build-xlsx-digest';
import { digestTitle } from './edition';

// PDF 側（digest-document.node.test.tsx）と同じ実データ駆動の検証。
// REAL_BLOCKS_JSON 未設定時はスキップされる。
const REAL_BLOCKS_JSON = process.env.REAL_BLOCKS_JSON;
const OUT_XLSX = process.env.XLSX_DIGEST_OUT;

const emptyTech = () => ({ lang: [], fw: [], db: [], infra: [], tools: [], collab: [] });

function project(overrides: Partial<ProjectItem> & { companyId: string; title: string }): ProjectItem {
  return {
    id: `p-${overrides.title}`,
    scope: '',
    period: '2024.01 — 2024.12',
    role: '',
    team: '3名',
    tech: emptyTech(),
    process: [],
    duties: '',
    acquired: '',
    comment: '',
    ...overrides,
  };
}

function sheetBlocks(companies: CompanyInfo[], items: ProjectItem[]): Block[] {
  return [
    {
      id: 'b-profile',
      order: 0,
      type: 'profile',
      data: { name: 'テスト 太郎', title: 'エンジニア', pr: '', strengths: [], meta: {} },
    },
    { id: 'b-project', order: 1, type: 'project', data: { companies, items } },
  ];
}

async function load(buf: Buffer): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  // exceljs の型定義が参照する Buffer と @types/node の Buffer で
  // ArrayBuffer の型引数が食い違うので、ここだけ引数側の型へ合わせる。
  await wb.xlsx.load(buf as unknown as Parameters<typeof wb.xlsx.load>[0]);
  return wb;
}

const TITLE = 'テストシート';

describe('buildSkillSheetXlsxDigest', () => {
  const companies: CompanyInfo[] = [
    { id: 'c1', name: '甲社', kind: '受託', period: '2020.01 — 2025.12', note: '' },
    { id: 'c2', name: '乙社', kind: '', period: '2018.01 — 2019.12', note: '' },
  ];
  const items: ProjectItem[] = [
    project({ companyId: 'c1', title: '案件A', period: '2024.01 — 2024.12' }),
    project({ companyId: 'c1', title: '案件B', period: '2023.01 — 2023.12' }),
    project({ companyId: 'c2', title: '案件C', period: '2018.01 — 2018.12' }),
  ];

  it('タイトル・列見出し・会社見出し・通し番号が仕様どおりに並ぶ', async () => {
    const buf = await buildSkillSheetXlsxDigest(sheetBlocks(companies, items), TITLE);
    const wb = await load(buf);
    const ws = wb.worksheets[0];

    expect(ws.getCell('A1').value).toBe(digestTitle(TITLE));
    expect(ws.getCell('A2').value).toBe('テスト 太郎　エンジニア');
    expect([1, 2, 3, 4].map((c) => ws.getCell(3, c).value)).toEqual(['No', '期間', '案件', 'チーム']);

    // 4 行目: 1 社目の見出し（A:D 結合・「社名　業種　期間　2 案件」）。
    // 期間はビューモデル側で YYYY.MM〜YYYY.MM に正規化済み。
    expect(ws.getCell('A4').value).toBe('甲社　受託　2020.01〜2025.12　2 案件');
    // 5〜6 行目: 甲社の案件 2 件（通し番号 1, 2）。
    expect(ws.getCell('A5').value).toBe(1);
    expect(ws.getCell('C5').value).toBe('案件A');
    expect(ws.getCell('A6').value).toBe(2);
    // 7 行目: 2 社目の見出し。
    expect(ws.getCell('A7').value).toBe('乙社　2018.01〜2019.12　1 案件');
    // 8 行目: 通し番号は会社をまたいで連番（3）。
    expect(ws.getCell('A8').value).toBe(3);
    expect(ws.getCell('C8').value).toBe('案件C');
  });

  it('非表示の会社と案件は出ず、見出しの案件数は表示分だけ', async () => {
    const withHidden: CompanyInfo[] = [
      ...companies,
      { id: 'c3', name: '隠し会社', kind: '', period: '', note: '', hidden: true },
    ];
    const withHiddenItems: ProjectItem[] = [
      ...items,
      project({ companyId: 'c1', title: '隠し案件', hidden: true }),
      project({ companyId: 'c3', title: '隠し会社の案件' }),
    ];
    const buf = await buildSkillSheetXlsxDigest(sheetBlocks(withHidden, withHiddenItems), TITLE);
    const wb = await load(buf);
    const ws = wb.worksheets[0];

    // 甲社は表示 2 件だけ数える（隠し案件は含めない）。
    expect(ws.getCell('A4').value).toBe('甲社　受託　2020.01〜2025.12　2 案件');
    const all = ws.getSheetValues().flat().filter(Boolean).join('|');
    expect(all).not.toContain('隠し会社');
    expect(all).not.toContain('隠し案件');
    // 行数: 3（ヘッダ）+ 2（見出し）+ 3（表示案件）。
    expect(ws.rowCount).toBe(8);
  });

  it('社名に業種が含まれるとき、見出しで業種が重複しない', async () => {
    const dup: CompanyInfo[] = [{ id: 'c9', name: '受託', kind: '受託', period: '2020.01 — 2021.12', note: '' }];
    const dupItems: ProjectItem[] = [project({ companyId: 'c9', title: '案件D' })];
    const buf = await buildSkillSheetXlsxDigest(sheetBlocks(dup, dupItems), TITLE);
    const wb = await load(buf);
    const ws = wb.worksheets[0];
    expect(ws.getCell('A4').value).toBe('受託　2020.01〜2021.12　1 案件');
  });

  it('シート名・印刷設定が仕様どおり', async () => {
    const buf = await buildSkillSheetXlsxDigest(sheetBlocks(companies, items), TITLE);
    const wb = await load(buf);
    const ws = wb.worksheets[0];
    expect(ws.name).toMatch(/^digest-\d{4}-\d{2}$/);
    expect(ws.pageSetup.orientation).toBe('portrait');
    expect(ws.pageSetup.fitToWidth).toBe(1);
    expect(ws.pageSetup.fitToHeight).toBe(0);
    expect(ws.pageSetup.printTitlesRow).toBe('3:3');
  });

  it('案件ブロックがなくても throw せず、見出し行だけになる', async () => {
    const blocks: Block[] = [
      {
        id: 'b-profile',
        order: 0,
        type: 'profile',
        data: { name: 'テスト 太郎', title: 'エンジニア', pr: '', strengths: [], meta: {} },
      },
    ];
    const buf = await buildSkillSheetXlsxDigest(blocks, TITLE);
    const wb = await load(buf);
    const ws = wb.worksheets[0];
    expect(ws.getCell('A1').value).toBe(digestTitle(TITLE));
    expect(ws.rowCount).toBe(3);
    expect(ws.getCell('A3').value).toBe('No');
  });

  it.skipIf(!REAL_BLOCKS_JSON)('実データで見出しと行が全件並ぶ', async () => {
    const blocks = JSON.parse(readFileSync(REAL_BLOCKS_JSON as string, 'utf-8')) as Block[];
    const title = 'エンジニアスキルシート';
    const buf = await buildSkillSheetXlsxDigest(blocks, title);
    if (OUT_XLSX) writeFileSync(OUT_XLSX, buf);

    const wb = await load(buf);
    const ws = wb.worksheets[0];
    console.log(`[xlsx-digest:real] bytes=${buf.length} rows=${ws.rowCount} sheet=${ws.name}`);

    // 期待件数は本番データ側の増減に追従させるため、出力側と同じ
    // filterVisibleProjectData を block 単位で適用して入力から導出する
    // （固定値にすると経歴の追加で定期チェックが誤報する）。
    const visibleParts = blocks
      .filter((b): b is Extract<Block, { type: 'project' }> => b.type === 'project')
      .map((b) => filterVisibleProjectData(b.data));
    const visibleItems = visibleParts.flatMap((d) => d.items);
    const expectedProjects = visibleItems.length;
    const expectedHeadings = new Set(visibleItems.map((i) => i.companyId)).size;

    // 全文版と同じ並びのはず: 見出し行 + 案件行 + タイトル/氏名/列見出し 3 行。
    const headings: string[] = [];
    let projectRows = 0;
    ws.eachRow((row, n) => {
      if (n <= 3) return;
      if (typeof row.getCell(1).value === 'number') projectRows++;
      else headings.push(String(row.getCell(1).value ?? ''));
    });
    console.log(`[xlsx-digest:real] headings=${headings.length} projects=${projectRows}`);
    expect(projectRows).toBe(expectedProjects);
    expect(headings.length).toBe(expectedHeadings);
    // 通し番号が 1..N で連番であること。
    const numbers = Array.from({ length: projectRows }, (_, i) => i + 1);
    const seen: number[] = [];
    ws.eachRow((row, n) => {
      if (n <= 3) return;
      const v = row.getCell(1).value;
      if (typeof v === 'number') seen.push(v);
    });
    expect(seen).toEqual(numbers);
  });
});

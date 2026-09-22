/**
 * 要約版（digest）Excel の生成。全文版（build-xlsx.ts）の 76 列テンプレートは使わず、
 * ブックを空から組む — 全文版は 1 案件 3 行のレイアウトで 2〜4 ページに収まらないため。
 *
 * 表示モデルは PDF と同じ `buildPrintViewModel` を使う。PDF と Excel の
 * 内容・並び・通し番号が同一になる。会社見出し行・案件行とも省略記号（… / 他 N 件）を
 * 付けず、見える行をそのまま出す（値が長ければ wrapText で折り返す）。
 */
import 'server-only';

import ExcelJS from 'exceljs';
// print-view-model.ts は @/db/* と ./print-token しか import していないので
// サーバー側から読める。将来ここへ @react-pdf/* が入るとこのファイルごと壊れるため、
// ビューモデル側へ @react-pdf の import を足さないこと（digest-document.node.test.tsx も同じ前提）。
import { buildPrintViewModel } from '@/component/pdf/print-view-model';
import type { Block } from '@/db/block';

import { digestTitle } from './edition';

// ExcelJS の Borders は diagonal を必須キーに持つので Partial で宣言する
// （cell.border 自体は Partial<Borders> を受ける）。
const THIN_BORDER: Partial<ExcelJS.Borders> = {
  top: { style: 'thin' },
  left: { style: 'thin' },
  bottom: { style: 'thin' },
  right: { style: 'thin' },
};

const HEADING_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FF99CCFF' },
};

export async function buildSkillSheetXlsxDigest(blocks: Block[], title: string): Promise<Buffer> {
  const vm = buildPrintViewModel(digestTitle(title), blocks);

  const wb = new ExcelJS.Workbook();
  const now = new Date();
  const ws = wb.addWorksheet(`digest-${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);

  ws.getColumn(1).width = 5; // A: No
  ws.getColumn(2).width = 20; // B: 期間
  ws.getColumn(3).width = 70; // C: 案件
  ws.getColumn(4).width = 8; // D: チーム

  // 1 行目: タイトル（A:D 結合・太字 14pt）
  ws.mergeCells('A1:D1');
  const titleCell = ws.getCell('A1');
  titleCell.value = digestTitle(title);
  titleCell.font = { bold: true, size: 14 };

  // 2 行目: 氏名と肩書。プロフィールブロックが無ければ空のまま。
  ws.getCell('A2').value = [vm.summary.name, vm.summary.title].filter(Boolean).join('　');

  // 3 行目: 列見出し（繰り返し印刷する行）。
  const headerRow = ws.getRow(3);
  headerRow.values = ['No', '期間', '案件', 'チーム'];
  headerRow.eachCell((cell) => {
    cell.font = { bold: true };
    cell.fill = HEADING_FILL;
    cell.border = THIN_BORDER;
  });

  // 4 行目以降: 会社見出し行（A:D 結合）→ 案件行、の繰り返し。
  let rowIndex = 4;
  for (const company of vm.companies) {
    const headingRow = ws.getRow(rowIndex);
    ws.mergeCells(rowIndex, 1, rowIndex, 4);
    const headingCell = headingRow.getCell(1);
    headingCell.value = [company.name, company.kind, company.periodText, `${company.projectCount} 案件`]
      .filter(Boolean)
      .join('　');
    headingCell.font = { bold: true };
    headingCell.fill = HEADING_FILL;
    for (let col = 1; col <= 4; col++) headingRow.getCell(col).border = THIN_BORDER;
    rowIndex++;

    for (const project of company.projects) {
      const row = ws.getRow(rowIndex);
      row.values = [project.index, project.periodText, project.title, project.team];
      row.getCell(3).alignment = { wrapText: true };
      for (let col = 1; col <= 4; col++) row.getCell(col).border = THIN_BORDER;
      rowIndex++;
    }
  }

  ws.pageSetup = {
    paperSize: 9, // A4
    orientation: 'portrait',
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    printTitlesRow: '3:3',
  };
  ws.pageSetup.printArea = `A1:D${rowIndex - 1}`;

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

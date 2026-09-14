// xlsx の「フォーマット崩れ」を実データで見張る定期検査用テスト。
// CI（pnpm test）では合成フィクスチャで自己診断し、
// xlsx-format-check.yml（毎朝 JST 06:00）が REAL_BLOCKS_JSON に実データを渡す。
// テンプレ原本との書式差分はコード変更・DB 本文変化のどちらでも崩れうるため、
// 生成物の全ブロックをドナー行（原本）と全セル突き合わせる。
import { existsSync, readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';

import { type Block, filterVisibleProjectData, type ProjectItem } from '@/db/block';

import { buildSkillSheetXlsx } from './build-xlsx';
import { XLSX_TEMPLATE_B64 } from './xlsx-template';

const COLS = 76; // A..BX
const FIRST_ROW = 10;
const BLOCK_ROWS = 3;
const BLOCK_MERGES_PER_PROJECT = 21; // build-xlsx.ts の BLOCK_MERGES と同じ個数（固定14 + 工程7）

const REAL_BLOCKS_JSON = process.env.REAL_BLOCKS_JSON;

if (!REAL_BLOCKS_JSON) {
  console.warn(
    '[xlsx-format-check.node.test.tsx] REAL_BLOCKS_JSON 未設定 — 合成フィクスチャで自己診断する。' +
      '実データでの検査は xlsx-format-check.yml が dump-block.ts の出力を渡して行う。',
  );
}

const tech = (over: Partial<ProjectItem['tech']> = {}): ProjectItem['tech'] => ({
  lang: [],
  fw: [],
  db: [],
  infra: [],
  tools: [],
  collab: [],
  ...over,
});

const item = (over: Partial<ProjectItem>): ProjectItem => ({
  id: 'i',
  companyId: 'c1',
  title: '案件',
  scope: '',
  period: '2024.1 — 2024.12',
  role: 'エンジニア',
  team: '5 名',
  tech: tech(),
  process: [],
  duties: '',
  acquired: '',
  comment: '',
  ...over,
});

/** REAL_BLOCKS_JSON 未設定でも書式検査が常時動くよう、複数ブロックの最小構成を用意する。 */
function syntheticBlocks(): Block[] {
  const items = [
    item({ id: 'i1', title: '最新案件', period: '2026.8 — 現在', duties: 'あ'.repeat(300) }),
    item({ id: 'i2', title: '中間案件', period: '2025.4 — 2026.3' }),
    item({ id: 'i3', title: '初期案件', period: '2020.1 — 2024.12' }),
  ];
  return [
    {
      id: 'b-project',
      type: 'project',
      order: 1,
      data: {
        companies: [{ id: 'c1', name: 'C社', kind: '', period: '', note: '' }],
        items,
      },
    },
  ];
}

function loadBlocks(): Block[] {
  if (REAL_BLOCKS_JSON && existsSync(REAL_BLOCKS_JSON)) {
    return JSON.parse(readFileSync(REAL_BLOCKS_JSON, 'utf-8')) as Block[];
  }
  return syntheticBlocks();
}

function visibleItemCount(blocks: Block[]): number {
  const project = blocks.find((b): b is Extract<Block, { type: 'project' }> => b.type === 'project');
  // hidden の案件・hidden な会社配下の案件を除く本番と同じフィルタで数える
  return project ? filterVisibleProjectData(project.data).items.length : 0;
}

const toArrayBuffer = (u8: Uint8Array): ArrayBuffer =>
  u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength) as ArrayBuffer;

const reload = async (buf: Uint8Array) => {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(toArrayBuffer(buf));
  return wb;
};

// 生成物は writeBuffer → load の往復を経ている。ドナー側（テンプレ）も同じ往復を
// 通してから比較しないと、スタイル表現のシリアライズ差が全セル誤検出になる。
async function loadTemplateSheet(): Promise<ExcelJS.Worksheet> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(toArrayBuffer(inflateSync(Buffer.from(XLSX_TEMPLATE_B64, 'base64'))));
  return (await reload(new Uint8Array((await wb.xlsx.writeBuffer()) as ArrayBuffer))).worksheets[0];
}

// exceljs は省略値を {} で持つことがあるため、undefined キーを削ってから比較する
const styleOf = (cell: ExcelJS.Cell): string => JSON.stringify(cell.style, (_k, v) => (v === undefined ? null : v));

// "J11:AP12" 形式の結合範囲を行・列の数値へ分解する
const parseMerge = (m: string): { top: number; left: number; bottom: number; right: number } => {
  const parts = [...m.matchAll(/([A-Z]+)(\d+)/g)].map((p) => ({ col: p[1], row: Number(p[2]) }));
  const colNo = (s: string) => s.split('').reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
  return { top: parts[0].row, left: colNo(parts[0].col), bottom: parts[1].row, right: colNo(parts[1].col) };
};

describe('xlsx フォーマット検査（テンプレ原本との全セル書式一致）', () => {
  it('全ブロックがドナー書式と一致する（例外は最終行下端の表外枠のみ）', async () => {
    const blocks = loadBlocks();
    const tpl = await loadTemplateSheet();
    const ws = (await reload(await buildSkillSheetXlsx(blocks))).worksheets[0];

    const count = visibleItemCount(blocks);
    expect(count).toBeGreaterThan(0);

    const diffs: string[] = [];
    const lastBlockTop = FIRST_ROW + (count - 1) * BLOCK_ROWS;
    for (let idx = 0; idx < count; idx++) {
      const base = FIRST_ROW + idx * BLOCK_ROWS;
      const donorBase = idx === 0 ? 10 : 13; // テンプレのドナー行（先頭 / 定常）
      for (let o = 0; o < BLOCK_ROWS; o++) {
        for (let c = 1; c <= COLS; c++) {
          const got = styleOf(ws.getCell(base + o, c));
          const want = styleOf(tpl.getCell(donorBase + o, c));
          if (got === want) continue;
          // 意図した唯一の逸脱: 表の最終行下端を中線（黒）で閉じる。A 列(No)は対象外。
          const isTableEndBottom =
            base === lastBlockTop &&
            o === BLOCK_ROWS - 1 &&
            c !== 1 &&
            ws.getCell(base + o, c).border?.bottom?.style === 'medium';
          if (!isTableEndBottom) diffs.push(`r${base + o}c${c}`);
        }
      }
      // ブロック先頭2行の行高もドナーと一致（3行目の業務内容行は内容量で可変なので対象外）
      for (const o of [0, 1]) {
        const gotH = ws.getRow(base + o).height ?? 19.5;
        const wantH = tpl.getRow(donorBase + o).height ?? 19.5;
        if (gotH !== wantH) diffs.push(`row-height r${base + o}`);
      }
    }
    expect(diffs).toEqual([]);
  });

  it('各ブロックが 22 個の結合を持ち、No. が 1 から連番で、Invalid Date を含まない', async () => {
    const blocks = loadBlocks();
    const ws = (await reload(await buildSkillSheetXlsx(blocks))).worksheets[0];
    const count = visibleItemCount(blocks);

    const merges = ws.model.merges.map(parseMerge);
    for (let idx = 0; idx < count; idx++) {
      const base = FIRST_ROW + idx * BLOCK_ROWS;
      const inBlock = merges.filter((m) => m.top >= base && m.top <= base + BLOCK_ROWS - 1);
      expect(inBlock.length).toBe(BLOCK_MERGES_PER_PROJECT);
      expect(ws.getCell(base, 1).value).toBe(idx + 1);
    }

    // Invalid Date がセルに混入しない（期間パース失敗・終了月なしの回帰）
    for (let r = FIRST_ROW; r < FIRST_ROW + count * BLOCK_ROWS; r++) {
      for (let c = 1; c <= COLS; c++) {
        const v = ws.getCell(r, c).value;
        if (typeof v === 'string') expect(v).not.toContain('Invalid Date');
        if (v instanceof Date) expect(Number.isNaN(v.getTime())).toBe(false);
      }
    }
  });

  it('印刷範囲が実ブロック数に一致し、列ヘッダ（8-9 行目）が全ページで繰り返される', async () => {
    const blocks = loadBlocks();
    const ws = (await reload(await buildSkillSheetXlsx(blocks))).worksheets[0];
    const count = visibleItemCount(blocks);

    expect(ws.pageSetup.printArea).toBe(`A1:BX${FIRST_ROW - 1 + count * BLOCK_ROWS}`);
    expect(ws.pageSetup.printTitlesRow).toBe('8:9');
  });
});

// スキルシートの DB ブロック → 応募用 Excel（xlsx）生成。
// 手作業で作った取り急ぎ版の生成コード（スプシ template への追記スクリプト）を
// アプリ内で完結する形へ移植したもの。テンプレは xlsx-template.ts に埋め込み、
// ここでは「1案件=3行」のブロックを開始月の新しい順に書き並べる。
import 'server-only';

import { inflateSync } from 'node:zlib';

import ExcelJS from 'exceljs';

import { type Block, filterVisibleProjectData, type ProfileBlockData, type ProjectItem } from '@/db/block';
import { resolveDuration } from '@/db/duration';
import { normalizeProcess, parsePeriodToRange, sortByStartDesc } from '@/db/process';
import { sanitizeHtml } from '@/db/sanitize-html';

import { XLSX_TEMPLATE_B64 } from './xlsx-template';

// --- 列・行の座標（定数表。レイアウト変更時はここだけを直す） --------------------
const COL = {
  NO: 1, // A: No（ブロック3行を縦結合）
  PERIOD_START: 2, // B:D（行0-1結合）開始月
  PERIOD_SEP: 5, // E:F「-」
  PERIOD_END: 7, // G:I 終了月 or 「現在」
  DURATION: 2, // B:I の行2 = (Xヶ月間) 数式
  TITLE: 10, // J:AP 行0 = タイトル
  DESC: 10, // J:AP 行1-2 = 業務内容（≪担当業務≫≪習得スキル≫≪コメント≫）
  ROLE_SCALE: 43, // AQ:AS 行1-2 = 役割/規模
  LANG: 46, // AT:AV 使用言語
  DB: 49, // AW:BB DB
  INFRA: 55, // BC:BF サーバ環境
  FW_TOOLS: 59, // BG:BK FW・MW ツール等
  COLLAB: 64, // BL:BQ 外部サービス
  PROCESS_FIRST: 70, // BR〜BX: 担当工程（7列、行0-2を縦結合）
} as const;
const COLS = 76; // A..BX
const FIRST_ROW = 10; // 案件ブロックの開始行（1-9 はプロフィール＋ヘッダ）
const BLOCK_ROWS = 3; // 1 案件 = 3 行
const PROCESS_COLS = 7; // BR..BX

// [rowOff, col, rowOff2, col2]（ブロック先頭行からの相対位置）。テンプレの結合と一致させる。
const BLOCK_MERGES: [number, number, number, number][] = [
  [0, COL.NO, 2, COL.NO],
  [0, COL.PERIOD_START, 1, 4],
  [0, COL.PERIOD_SEP, 1, 6],
  [0, COL.PERIOD_END, 1, 9],
  [2, COL.PERIOD_START, 2, 9],
  [0, COL.TITLE, 0, 42],
  [1, COL.DESC, 2, 42],
  [0, COL.ROLE_SCALE, 0, 45],
  [1, COL.ROLE_SCALE, 2, 45],
  [0, COL.LANG, 2, 48],
  [0, COL.DB, 2, 54],
  [0, COL.INFRA, 2, 58],
  [0, COL.FW_TOOLS, 2, 63],
  [0, COL.COLLAB, 2, 69],
  ...[...Array(PROCESS_COLS).keys()].map((i): [number, number, number, number] => {
    const c = COL.PROCESS_FIRST + i;
    return [0, c, 2, c];
  }),
];

// プロフィール欄のセル → ブロックデータの対応表
const PROFILE_CELLS: [string, (p: ProfileBlockData) => string | undefined][] = [
  ['D1', (p) => p.name],
  ['D2', (p) => p.meta.age],
  ['D3', (p) => p.meta.qualifications],
  ['D4', (p) => p.meta.work],
  ['D5', (p) => p.meta.specialties],
  ['D6', (p) => p.meta.expertise],
  ['D7', (p) => p.pr],
  ['AU1', (p) => p.company],
  ['AU2', (p) => p.meta.gender],
  ['AU3', (p) => p.meta.education],
  ['AU4', (p) => p.meta.station],
];

// 業務内容セルの見た目行数 → 行高の換算。結合幅 J:AP は 33 列 × 4.43（半角単位）
// で全角換算 130〜140 文字/行（実DB 33件を Google スプシ経由で PDF 化した実測より。
// 95 だと行数を多めに数えて行高が文章量の倍近く出てしまう）。
// 1 行あたりの高さは取り急ぎ版の既存ブロック群の中央値実測（≈15.4）。
const CHARS_PER_LINE = 135;
const HEIGHT_PER_LINE = 15.4;
const DESC_MIN_HEIGHT = 120;

const clone = <T>(o: T): T => JSON.parse(JSON.stringify(o ?? {}));

// エディタの markdown 書き方をスプシの文面へ寄せる（'- '→'・'、'**'除去、'#'除去）。
// viewer/PDF と同じく生HTMLタグは落とす（xlsx 側だけエスケープ無しで残ると、
// セルに `<details>` 等の生マークアップが残って画面と食い違う）。
const mdToSheet = (s: string | undefined): string =>
  sanitizeHtml(s ?? '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/^- /gm, '・')
    .replace(/^#+\s*/gm, '')
    .trim();

// ビューアは summary 未入力時に duties へフォールバックして表示する
// （project-card.tsx `item.summary?.trim() || item.duties`）。xlsx も同じ優先順位で
// 要約を出し、duties も別節として残す（消すとバックアップとしての情報量が落ちる）。
const composeDesc = (i: ProjectItem): string => {
  const sections: string[] = [];
  const summary = i.summary?.trim();
  if (summary) sections.push(`≪要約≫\n${mdToSheet(summary)}`);
  sections.push(`≪担当業務≫\n${mdToSheet(i.duties)}`);
  sections.push(`≪習得スキル≫\n${mdToSheet(i.acquired)}`);
  sections.push(`≪コメント≫\n${mdToSheet(i.comment)}`);
  return sections.join('\n\n');
};

// '13 名' → '13人'。数字を拾えないときは '-'（取り急ぎ版と同じ挙動）。
// role/team も自由入力なので viewer と同じく生タグは落とす（#343）。
const roleCell = (i: ProjectItem): string =>
  `役割\n${sanitizeHtml(i.role)}\n\n\n全体\n${(sanitizeHtml(i.team).match(/\d+/) || ['-'])[0]}人`;

const lineCount = (s: string): number =>
  s.split('\n').reduce((n, l) => n + Math.max(1, Math.ceil([...l].length / CHARS_PER_LINE)), 0);

const joinOrDash = (list: string[]): string => list.map(sanitizeHtml).join('\n') || '-';

interface BlockStyle {
  heights: number[];
  styles: Partial<ExcelJS.Style>[][];
}

// 書式ドナーは2本ある。テンプレ行10-12 = ヘッダ直下の先頭ブロック専用
// （上辺が表の外枠＝double 線などを含む）、行13-15 = 2個目以降の定常ブロック用。
// 先頭ブロックの書式を全ブロックへ複写すると、ブロック間に本来ない上辺線や
// 内側罫線の色違い（黒 hair が残る）が出るので分ける。
const DONOR_FIRST = FIRST_ROW; // 10
const DONOR_STEADY = FIRST_ROW + BLOCK_ROWS; // 13

function captureBlockStyle(ws: ExcelJS.Worksheet, baseRow: number): BlockStyle {
  const heights = [0, 1, 2].map((o) => ws.getRow(baseRow + o).height ?? 19.5);
  const styles = [0, 1, 2].map((o) =>
    Array.from({ length: COLS }, (_, c) => clone(ws.getCell(baseRow + o, c + 1).style)),
  );
  return { heights, styles };
}

// 表の最終行下端だけはドナー（区切り線 = 細線・濃緑）と違い、外枠として中線（黒）を
// 引く。A 列だけは旧スプシの実測どおり細線のまま残す。
const BORDER_TABLE_END: ExcelJS.Border = { style: 'medium', color: { argb: 'FF000000' } };

function writeBlock(
  ws: ExcelJS.Worksheet,
  r: number,
  style: BlockStyle,
  no: number,
  vals: unknown[],
  pos: { first: boolean; last: boolean },
): void {
  style.styles.forEach((row, o) => {
    row.forEach((st, c) => {
      ws.getCell(r + o, c + 1).style = clone(st);
    });
  });
  style.heights.forEach((h, o) => {
    ws.getRow(r + o).height = h;
  });
  // 罫線の修正は mergeCells より前に行う。結合後は被結合セルの style が
  // 左上セルへ委譲されるため、個別の辺に罫線を残せなくなる。
  // ドナーの書式は一切補正しない（原本厳守）。例外は表の最終行下端のみ —
  // 原本の表外枠と同じく中線（黒）で閉じる。
  if (pos.last) {
    const lastRow = r + BLOCK_ROWS - 1;
    for (let c = 1; c <= COLS; c++) {
      if (c === COL.NO) continue;
      const cell = ws.getCell(lastRow, c);
      cell.border = { ...cell.border, bottom: BORDER_TABLE_END };
    }
  }
  // mergeCells ではなく mergeCellsWithoutStyle を使う。前者は被結合セルの style を
  // 左上セルのもので上書きしてしまい、セルごとの罫線（ブロック間の区切り線など）が消える。
  BLOCK_MERGES.forEach(([ro, c, ro2, c2]) => {
    ws.mergeCellsWithoutStyle(r + ro, c, r + ro2, c2);
  });
  // 値は各結合の左上セルにだけ入れる（BLOCK_MERGES の先頭 [ro, c] がアンカー）
  BLOCK_MERGES.forEach(([ro, c], i) => {
    if (vals[i] !== undefined) ws.getCell(r + ro, c).value = vals[i] as ExcelJS.CellValue;
  });
  ws.getCell(r, COL.NO).value = no;
}

/** 期間文字列から開始セル・終了セル・月数の3点を作る。解釈不能なら素の文字列に倒す。 */
function periodCells(
  item: ProjectItem,
  referenceMonth: number | undefined,
): { start: unknown; end: unknown; duration: unknown } {
  // 月数は Excel 数式ではなく viewer/PDF と同じ resolveDuration のラベルを静的に書く。
  // DATEDIF(...,TODAY()) は開くたび値が変わり、逆転期間で #NUM! を出し、
  // 本人入力の item.duration も無視していた（#343）。
  const duration = resolveDuration(item.period, item.duration, referenceMonth).label;
  const range = parsePeriodToRange(item.period);
  if (!range) {
    return { start: item.period || null, end: null, duration: duration || null };
  }
  const [sy, sm] = range.start.split('-').map(Number);
  const start = new Date(Date.UTC(sy, sm - 1, 1));
  if (range.ongoing) {
    return { start, end: '現在', duration };
  }
  // 終了月なし（'2024.1' 等）は end が '' で返る。そのまま年月へ分解すると
  // Invalid Date をセルへ書き込むので、終了セルは空にする。
  if (!range.end) {
    return { start, end: null, duration };
  }
  const [ey, em] = range.end.split('-').map(Number);
  const end = new Date(Date.UTC(ey, em, 0)); // 末日（月末）に揃える
  return { start, end, duration };
}

function itemValues(item: ProjectItem, referenceMonth: number | undefined): unknown[] {
  const { start, end, duration } = periodCells(item, referenceMonth);
  const { done, other } = normalizeProcess(item.process);
  const vals = new Array(BLOCK_MERGES.length).fill(null);
  vals[1] = start;
  vals[2] = '-';
  vals[3] = end;
  vals[4] = duration;
  vals[5] = sanitizeHtml(item.title);
  // 7工程の表外ラベル（other）は ● 列に置き場がないので業務内容の末尾へ添える。
  // 入れないと自由入力の工程名が xlsx から消える（#343）。
  const desc = composeDesc(item);
  vals[6] = other.length > 0 ? `${desc}\n\n≪担当工程（その他）≫\n${other.map(mdToSheet).join('\n')}` : desc;
  vals[7] = null; // 役割/規模ブロックの1行目は空欄（テンプレ踏襲）
  vals[8] = roleCell(item);
  vals[9] = joinOrDash(item.tech.lang);
  vals[10] = joinOrDash(item.tech.db);
  vals[11] = joinOrDash(item.tech.infra);
  vals[12] = joinOrDash([...item.tech.fw, ...item.tech.tools]);
  vals[13] = joinOrDash(item.tech.collab);
  done.forEach((d, i) => {
    vals[14 + i] = d ? '●' : null;
  });
  return vals;
}

// 結合一覧は ws.model.merges（公開 API、Range 文字列の配列）から取る。
function mergeKeys(ws: ExcelJS.Worksheet): string[] {
  return ws.model.merges;
}

// exceljs の xlsx.load は自前の Buffer 型（= ArrayBuffer 派生）を要求するので、
// Node Buffer のビューを新規 ArrayBuffer へ切り出して渡す。
const toArrayBuffer = (u8: Uint8Array): ArrayBuffer =>
  u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength) as ArrayBuffer;

/**
 * スキルシートのブロック列から応募用 xlsx を生成する。
 * 非表示（hidden）の会社・案件はビューア/PDF と同じく出力しない。
 * referenceMonth は継続中案件の月数を viewer/PDF と同じ基準月で確定させるためのもの
 * （省略時は「未確定」— resolveDuration と同じ扱い）。
 */
export async function buildSkillSheetXlsx(blocks: Block[], referenceMonth?: number): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(toArrayBuffer(inflateSync(Buffer.from(XLSX_TEMPLATE_B64, 'base64'))));
  const ws = wb.worksheets[0];
  const styleFirst = captureBlockStyle(ws, DONOR_FIRST);
  const styleSteady = captureBlockStyle(ws, DONOR_STEADY);

  // テンプレのブロック結合（行10以降のドナー2本分）を一度外し、全ブロックを同じ手順で書き直す
  for (const key of mergeKeys(ws)) {
    const top = Number(key.match(/\d+/)?.[0] ?? 0);
    if (top >= FIRST_ROW) ws.unMergeCells(key);
  }

  // project ブロックは複数置ける（会社・時期で分割する運用）。find だと2枚目以降が
  // xlsx から消えるので全ブロックの案件を連結する（#343）。
  const items = sortByStartDesc(
    blocks
      .filter((b): b is Extract<Block, { type: 'project' }> => b.type === 'project')
      .flatMap((b) => filterVisibleProjectData(b.data).items),
    (i) => i.period,
  );

  items.forEach((it, idx) => {
    const r = FIRST_ROW + idx * BLOCK_ROWS;
    const style = idx === 0 ? styleFirst : styleSteady;
    const desc = composeDesc(it);
    const heights = [...style.heights];
    heights[2] = Math.max(DESC_MIN_HEIGHT, Math.ceil(lineCount(desc) * HEIGHT_PER_LINE));
    writeBlock(ws, r, { ...style, heights }, idx + 1, itemValues(it, referenceMonth), {
      first: idx === 0,
      last: idx === items.length - 1,
    });
  });

  const profile = blocks.find((b): b is Extract<Block, { type: 'profile' }> => b.type === 'profile');
  if (profile) {
    for (const [addr, get] of PROFILE_CELLS) {
      const v = get(profile.data);
      if (v) ws.getCell(addr).value = v;
    }
  }

  // 元スプシの Print_Area（A1:BX<最終行>）に倣う。テンプレ側の definedName は
  // 行を切り詰めた時点で範囲がずれるので、実際のブロック数で引き直す。
  // あわせて 8-9 行目（案件表の列ヘッダ）を全ページで繰り返す — 6 ページに
  // なるため、2 ページ目以降で列の意味を追えない問題への対応。
  ws.pageSetup.printArea = `A1:BX${FIRST_ROW - 1 + items.length * BLOCK_ROWS}`;
  ws.pageSetup.printTitlesRow = '8:9';

  const now = new Date();
  ws.name = `latest-${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  return Buffer.from((await wb.xlsx.writeBuffer()) as ArrayBuffer);
}

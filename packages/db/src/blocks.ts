/**
 * スキルシートの「ブロック」データモデル。
 *
 * DB（Neon）を正本とし、スキルシートを順序付きブロック配列として表現する。
 * 汎用 `markdown` ブロックに加え、Excel 風に編集できる `table` ブロックを持つ
 * 判別ユニオン（type と data が一致）。table は保存・描画時に GFM markdown 表へ
 * 変換するため、web(react-markdown+remark-gfm) も PDF(mdast→@react-pdf) も
 * 既存の描画パイプラインをそのまま再利用できる（描画コードの新規追加ゼロ）。
 */

export type BlockType = 'markdown' | 'table' | 'skills' | 'experience';

export interface MarkdownBlockData {
  markdown: string;
}

/** 表セルの水平揃え（GFM の `:---` / `:---:` / `---:` に対応）。 */
export type TableAlign = 'left' | 'center' | 'right';

export interface TableColumn {
  label: string;
  align: TableAlign;
}

/** 表ブロックの構造化データ。ヘッダは columns[].label、本文は rows（ヘッダ行は含まない）。 */
export interface TableBlockData {
  columns: TableColumn[];
  /** 本文行のみ。各行は columns と同じ長さに正規化される。 */
  rows: string[][];
}

/** スキル一覧の 1 エントリ（名称・経験年数・習熟度）。 */
export interface SkillEntry {
  name: string;
  years: number;
  level: string;
}

/** スキル一覧ブロックの構造化データ。カテゴリ名＋スキルの配列。 */
export interface SkillsBlockData {
  category: string;
  skills: SkillEntry[];
}

/** 職務経歴ブロックの構造化データ。 */
export interface ExperienceBlockData {
  company: string;
  /** 期間（開始）例: "2020-01" */
  startDate: string;
  /** 期間（終了）。空文字 = 現在 */
  endDate: string;
  role: string;
  description: string;
}

interface MarkdownBlock {
  id: string;
  type: 'markdown';
  order: number;
  data: MarkdownBlockData;
}

interface TableBlock {
  id: string;
  type: 'table';
  order: number;
  data: TableBlockData;
}

interface SkillsBlock {
  id: string;
  type: 'skills';
  order: number;
  data: SkillsBlockData;
}

interface ExperienceBlock {
  id: string;
  type: 'experience';
  order: number;
  data: ExperienceBlockData;
}

/**
 * スキルシートを構成する 1 ブロック。type と data を一致させた判別ユニオン。
 * id は DB の行 ID、order は 0 始まりの表示順。
 */
export type Block = MarkdownBlock | TableBlock | SkillsBlock | ExperienceBlock;

/**
 * 保存時にクライアント/サーバ間で受け渡すブロック入力（id/order を持たない）。
 * order は配列インデックスで決まるため不要。
 */
export type BlockInput =
  | { type: 'markdown'; data: MarkdownBlockData }
  | { type: 'table'; data: TableBlockData }
  | { type: 'skills'; data: SkillsBlockData }
  | { type: 'experience'; data: ExperienceBlockData };

// --- バリデータ（zod を入れず DB パッケージの依存を増やさない軽量判定） -----

const TABLE_ALIGNS: readonly TableAlign[] = ['left', 'center', 'right'];

function isTableAlign(value: unknown): value is TableAlign {
  return typeof value === 'string' && (TABLE_ALIGNS as readonly string[]).includes(value);
}

export function isMarkdownBlockData(data: unknown): data is MarkdownBlockData {
  return typeof data === 'object' && data !== null && typeof (data as MarkdownBlockData).markdown === 'string';
}

export function isTableBlockData(data: unknown): data is TableBlockData {
  if (typeof data !== 'object' || data === null) return false;
  const { columns, rows } = data as { columns?: unknown; rows?: unknown };
  if (!Array.isArray(columns) || columns.length === 0) return false;
  const columnsOk = columns.every(
    (c) =>
      typeof c === 'object' &&
      c !== null &&
      typeof (c as TableColumn).label === 'string' &&
      isTableAlign((c as TableColumn).align),
  );
  if (!columnsOk) return false;
  if (!Array.isArray(rows)) return false;
  return rows.every((row) => Array.isArray(row) && row.every((cell) => typeof cell === 'string'));
}

export function isSkillsBlockData(data: unknown): data is SkillsBlockData {
  if (typeof data !== 'object' || data === null) return false;
  const { category, skills } = data as { category?: unknown; skills?: unknown };
  if (typeof category !== 'string') return false;
  if (!Array.isArray(skills)) return false;
  return skills.every(
    (s) =>
      typeof s === 'object' &&
      s !== null &&
      typeof (s as SkillEntry).name === 'string' &&
      typeof (s as SkillEntry).years === 'number' &&
      typeof (s as SkillEntry).level === 'string',
  );
}

export function isExperienceBlockData(data: unknown): data is ExperienceBlockData {
  if (typeof data !== 'object' || data === null) return false;
  const d = data as Record<string, unknown>;
  return (
    typeof d.company === 'string' &&
    typeof d.startDate === 'string' &&
    typeof d.endDate === 'string' &&
    typeof d.role === 'string' &&
    typeof d.description === 'string'
  );
}

/** untyped な入力（クライアント由来）が正当な BlockInput かを判定する。 */
export function isBlockInput(value: unknown): value is BlockInput {
  if (typeof value !== 'object' || value === null) return false;
  const { type, data } = value as { type?: unknown; data?: unknown };
  if (type === 'markdown') return isMarkdownBlockData(data);
  if (type === 'table') return isTableBlockData(data);
  if (type === 'skills') return isSkillsBlockData(data);
  if (type === 'experience') return isExperienceBlockData(data);
  return false;
}

/**
 * 表の各行を列数ちょうどに正規化する（足りない分は空セル、余りは切り捨て）。
 * 壊れた DB JSON や ragged な行で描画/エディタが破綻しないようにする。
 */
export function normalizeTableBlockData(data: TableBlockData): TableBlockData {
  const colCount = data.columns.length;
  return {
    columns: data.columns,
    rows: data.rows.map((row) => Array.from({ length: colCount }, (_, i) => row[i] ?? '')),
  };
}

/**
 * 「空ブロック」判定（保存時の drop と、全消し保存ガードで共有する単一の真実）。
 * markdown: trim して空 / table: 列ゼロ、または（全列 label 空 かつ 全セル空）。
 * skills: カテゴリ空 かつ スキル 0 件。experience: 会社名・職種・業務内容が全て空。
 */
export function isBlockInputEmpty(block: BlockInput): boolean {
  if (block.type === 'markdown') return block.data.markdown.trim().length === 0;
  if (block.type === 'skills') {
    return block.data.category.trim().length === 0 && block.data.skills.length === 0;
  }
  if (block.type === 'experience') {
    const { company, role, description } = block.data;
    return company.trim().length === 0 && role.trim().length === 0 && description.trim().length === 0;
  }
  const { columns, rows } = block.data;
  if (columns.length === 0) return true;
  const allLabelsEmpty = columns.every((c) => c.label.trim() === '');
  const allCellsEmpty = rows.every((row) => row.every((cell) => cell.trim() === ''));
  return allLabelsEmpty && allCellsEmpty;
}

// --- markdown 変換 ---------------------------------------------------------

const ALIGN_MARKER: Record<TableAlign, string> = {
  left: ':---',
  center: ':---:',
  right: '---:',
};

/**
 * セルを GFM 表で安全な単一行へ整える。
 * - セル内改行は半角スペースへ（複数行貼り付けで表が崩れるのを防止）
 * - `|` はエスケープ
 * - 空セルは半角スペース 1 つ（空文字だと GFM の表がずれる）
 */
function escapeCell(value: string): string {
  const single = value.replace(/\r?\n/g, ' ').replace(/\|/g, '\\|');
  return single.length > 0 ? single : ' ';
}

/** 表ブロックを GFM markdown 表へ変換する。 */
export function tableBlockToMarkdown(data: TableBlockData): string {
  const { columns, rows } = data;
  const colCount = columns.length;
  const headerLine = `| ${columns.map((c) => escapeCell(c.label)).join(' | ')} |`;
  const alignLine = `| ${columns.map((c) => ALIGN_MARKER[c.align]).join(' | ')} |`;
  const bodyLines = rows.map((row) => {
    // ragged 行を列数ちょうどに正規化してから連結する。
    const cells = Array.from({ length: colCount }, (_, i) => escapeCell(row[i] ?? ''));
    return `| ${cells.join(' | ')} |`;
  });
  return [headerLine, alignLine, ...bodyLines].join('\n');
}

/** スキル一覧ブロックを GFM markdown 表へ変換する。 */
export function skillsBlockToMarkdown(data: SkillsBlockData): string {
  const header = data.category.trim().length > 0 ? `### ${data.category}\n\n` : '';
  if (data.skills.length === 0) return `${header}| スキル | 経験年数 | 習熟度 |\n| :--- | :---: | :--- |`;
  const headerLine = '| スキル | 経験年数 | 習熟度 |';
  const alignLine = '| :--- | :---: | :--- |';
  const bodyLines = data.skills.map(
    (s) => `| ${escapeCell(s.name)} | ${s.years > 0 ? `${s.years}年` : '-'} | ${escapeCell(s.level)} |`,
  );
  return `${header}${[headerLine, alignLine, ...bodyLines].join('\n')}`;
}

/** 職務経歴ブロックを markdown へ変換する。 */
export function experienceBlockToMarkdown(data: ExperienceBlockData): string {
  const { company, startDate, endDate, role, description } = data;
  const period = [startDate, endDate || '現在'].filter(Boolean).join('〜');
  const heading = company.trim().length > 0 ? `### ${company}（${period}）` : `### （${period}）`;
  const lines: string[] = [heading, ''];
  lines.push('| 項目 | 内容 |');
  lines.push('| :--- | :--- |');
  lines.push(`| 期間 | ${period} |`);
  if (role.trim().length > 0) lines.push(`| 職種 | ${escapeCell(role)} |`);
  if (description.trim().length > 0) {
    lines.push('');
    lines.push(description.trim());
  }
  return lines.join('\n');
}

function blockToMarkdown(block: Block): string {
  if (block.type === 'markdown') return block.data.markdown;
  if (block.type === 'table') return tableBlockToMarkdown(block.data);
  if (block.type === 'skills') return skillsBlockToMarkdown(block.data);
  if (block.type === 'experience') return experienceBlockToMarkdown(block.data);
  // 判別ユニオン上は到達不能だが、DB 由来の未知 type を silent に undefined 連結
  // しないよう loud に失敗させる（壊れたデータを見えるエラーにする）。
  throw new Error(`blocksToMarkdown: unknown block type: ${(block as { type: string }).type}`);
}

// 構造境界: レベル2〜4の見出し、または <details> ブロックの開始行。
// ここでドキュメントを分割し、各セクションを 1 ブロックとする。
const BLOCK_BOUNDARY = /^(?:#{2,4}\s|<details[\s>])/;

/**
 * Markdown 文書を構造境界でブロック配列へ分割する（テキストは無損失）。
 * 連結（blocksToMarkdown）すると元の文書と一致する。シードは markdown ブロックのみ生成。
 */
export function splitMarkdownIntoBlocks(markdown: string): MarkdownBlockData[] {
  const lines = markdown.split('\n');
  const segments: string[] = [];
  let current: string[] = [];

  const flush = () => {
    if (current.length > 0) {
      segments.push(current.join('\n'));
      current = [];
    }
  };

  for (const line of lines) {
    if (BLOCK_BOUNDARY.test(line) && current.length > 0) {
      flush();
    }
    current.push(line);
  }
  flush();

  return segments.map((markdown) => ({ markdown }));
}

/** ブロック配列を order 昇順で 1 つの Markdown 文書へ連結する（type 別に変換）。 */
export function blocksToMarkdown(blocks: Block[]): string {
  return [...blocks]
    .sort((a, b) => a.order - b.order)
    .map(blockToMarkdown)
    .join('\n');
}

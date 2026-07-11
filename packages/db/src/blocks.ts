/**
 * スキルシートの「ブロック」データモデル。
 *
 * DB（Neon）を正本とし、スキルシートを順序付きブロック配列として表現する。
 * 汎用 `markdown` ブロックに加え、Excel 風に編集できる `table` ブロックを持つ
 * 判別ユニオン（type と data が一致）。table は保存・描画時に GFM markdown 表へ
 * 変換するため、web(react-markdown+remark-gfm) も PDF(mdast→@react-pdf) も
 * 既存の描画パイプラインをそのまま再利用できる（描画コードの新規追加ゼロ）。
 */

import { formatMonthToken, formatPeriodDisplay } from './process';

export type BlockType = 'markdown' | 'table' | 'skills' | 'experience' | 'profile' | 'stats' | 'project';

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

/** プロフィールブロックのメタ情報。 */
export interface ProfileMeta {
  age?: string;
  work?: string;
  station?: string;
  education?: string;
}

/** プロフィールブロックの構造化データ。 */
export interface ProfileBlockData {
  name: string;
  title: string;
  pr: string;
  strengths: string[];
  meta: ProfileMeta;
}

/** 統計ブロックの 1 アイテム（数値・単位・ラベル）。 */
export interface StatItem {
  value: string;
  unit: string;
  label: string;
}

/** 4 枠統計ブロックの構造化データ。 */
export interface StatsBlockData {
  items: StatItem[];
}

/** 案件ブロックの会社情報。 */
export interface CompanyInfo {
  id: string;
  name: string;
  kind: string;
  period: string;
  note: string;
}

/** 案件ブロックの技術スタック。 */
export interface ProjectTech {
  lang: string[];
  fw: string[];
  db: string[];
  infra: string[];
  tools: string[];
  collab: string[];
}

/** 案件ブロックの 1 案件エントリ。 */
export interface ProjectItem {
  id: string;
  companyId: string;
  title: string;
  scope: string;
  period: string;
  role: string;
  team: string;
  tech: ProjectTech;
  process: string[];
  duties: string;
  acquired: string;
  comment: string;
  /** 案件の要約（工程の俯瞰ダッシュボードのカードに表示）。未入力時は duties にフォールバック。 */
  summary?: string;
  /** 表示用の期間の長さ（例: "3ヶ月"）。未入力時は period から deriveDuration で導出。 */
  duration?: string;
}

/** 案件ブロックの構造化データ（会社情報 + 案件一覧）。 */
export interface ProjectBlockData {
  companies: CompanyInfo[];
  items: ProjectItem[];
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

interface ProfileBlock {
  id: string;
  type: 'profile';
  order: number;
  data: ProfileBlockData;
}

interface StatsBlock {
  id: string;
  type: 'stats';
  order: number;
  data: StatsBlockData;
}

interface ProjectBlock {
  id: string;
  type: 'project';
  order: number;
  data: ProjectBlockData;
}

/**
 * スキルシートを構成する 1 ブロック。type と data を一致させた判別ユニオン。
 * id は DB の行 ID、order は 0 始まりの表示順。
 */
export type Block =
  | MarkdownBlock
  | TableBlock
  | SkillsBlock
  | ExperienceBlock
  | ProfileBlock
  | StatsBlock
  | ProjectBlock;

/**
 * 保存時にクライアント/サーバ間で受け渡すブロック入力（id/order を持たない）。
 * order は配列インデックスで決まるため不要。
 */
export type BlockInput =
  | { type: 'markdown'; data: MarkdownBlockData }
  | { type: 'table'; data: TableBlockData }
  | { type: 'skills'; data: SkillsBlockData }
  | { type: 'experience'; data: ExperienceBlockData }
  | { type: 'profile'; data: ProfileBlockData }
  | { type: 'stats'; data: StatsBlockData }
  | { type: 'project'; data: ProjectBlockData };

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

export function isProfileBlockData(data: unknown): data is ProfileBlockData {
  if (typeof data !== 'object' || data === null) return false;
  const d = data as Record<string, unknown>;
  if (typeof d.name !== 'string') return false;
  if (typeof d.title !== 'string') return false;
  if (typeof d.pr !== 'string') return false;
  if (!Array.isArray(d.strengths) || !d.strengths.every((s) => typeof s === 'string')) return false;
  if (typeof d.meta !== 'object' || d.meta === null) return false;
  return true;
}

export function isStatsBlockData(data: unknown): data is StatsBlockData {
  if (typeof data !== 'object' || data === null) return false;
  const { items } = data as { items?: unknown };
  if (!Array.isArray(items)) return false;
  return items.every(
    (item) =>
      typeof item === 'object' &&
      item !== null &&
      typeof (item as StatItem).value === 'string' &&
      typeof (item as StatItem).unit === 'string' &&
      typeof (item as StatItem).label === 'string',
  );
}

function isProjectTech(t: unknown): t is ProjectTech {
  if (typeof t !== 'object' || t === null) return false;
  const tech = t as Record<string, unknown>;
  const keys: (keyof ProjectTech)[] = ['lang', 'fw', 'db', 'infra', 'tools', 'collab'];
  return keys.every((k) => Array.isArray(tech[k]) && (tech[k] as unknown[]).every((v) => typeof v === 'string'));
}

export function isProjectBlockData(data: unknown): data is ProjectBlockData {
  if (typeof data !== 'object' || data === null) return false;
  const d = data as Record<string, unknown>;
  if (!Array.isArray(d.companies)) return false;
  if (!Array.isArray(d.items)) return false;
  const companiesOk = d.companies.every(
    (c) =>
      typeof c === 'object' &&
      c !== null &&
      typeof (c as CompanyInfo).id === 'string' &&
      typeof (c as CompanyInfo).name === 'string',
  );
  if (!companiesOk) return false;
  return d.items.every(
    (item) =>
      typeof item === 'object' &&
      item !== null &&
      typeof (item as ProjectItem).id === 'string' &&
      typeof (item as ProjectItem).companyId === 'string' &&
      isProjectTech((item as ProjectItem).tech) &&
      Array.isArray((item as ProjectItem).process),
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
  if (type === 'profile') return isProfileBlockData(data);
  if (type === 'stats') return isStatsBlockData(data);
  if (type === 'project') return isProjectBlockData(data);
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
  if (block.type === 'profile') {
    return block.data.name.trim().length === 0 && block.data.title.trim().length === 0;
  }
  if (block.type === 'stats') return block.data.items.length === 0;
  if (block.type === 'project') {
    return block.data.companies.length === 0 && block.data.items.length === 0;
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
  const period = [formatMonthToken(startDate), formatMonthToken(endDate) || '現在'].filter(Boolean).join('〜');
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

/** プロフィールブロックを markdown へ変換する。 */
export function profileBlockToMarkdown(data: ProfileBlockData): string {
  const lines: string[] = [];
  if (data.name.trim()) lines.push(`# ${data.name}`);
  if (data.title.trim()) lines.push(`\n**${data.title}**`);
  if (data.pr.trim()) lines.push(`\n${data.pr}`);
  if (data.strengths.length > 0) {
    lines.push('\n**強み**');
    for (const s of data.strengths) lines.push(`- ${s}`);
  }
  const meta = data.meta;
  const metaItems: string[] = [];
  if (meta.age) metaItems.push(`| 年齢 | ${escapeCell(meta.age)} |`);
  if (meta.work) metaItems.push(`| 勤務形態 | ${escapeCell(meta.work)} |`);
  if (meta.station) metaItems.push(`| 最寄り駅 | ${escapeCell(meta.station)} |`);
  if (meta.education) metaItems.push(`| 学歴 | ${escapeCell(meta.education)} |`);
  if (metaItems.length > 0) {
    lines.push('\n| 項目 | 内容 |');
    lines.push('| :--- | :--- |');
    lines.push(...metaItems);
  }
  return lines.join('\n');
}

/** 統計ブロックを markdown へ変換する。 */
export function statsBlockToMarkdown(data: StatsBlockData): string {
  if (data.items.length === 0) return '';
  const headerLine = `| ${data.items.map((i) => escapeCell(i.label)).join(' | ')} |`;
  const alignLine = `| ${data.items.map(() => ':---:').join(' | ')} |`;
  const valueLine = `| ${data.items.map((i) => escapeCell(`${i.value}${i.unit}`)).join(' | ')} |`;
  return [headerLine, alignLine, valueLine].join('\n');
}

/** 案件ブロックを markdown へ変換する。 */
export function projectBlockToMarkdown(data: ProjectBlockData): string {
  const companyMap = new Map(data.companies.map((c) => [c.id, c]));
  const lines: string[] = [];
  for (const item of data.items) {
    const company = companyMap.get(item.companyId);
    const companyName = company?.name ?? '(不明な会社)';
    lines.push(`### ${companyName} — ${item.title}`);
    lines.push('');
    lines.push('| 項目 | 内容 |');
    lines.push('| :--- | :--- |');
    if (item.period) lines.push(`| 期間 | ${escapeCell(formatPeriodDisplay(item.period))} |`);
    if (item.role) lines.push(`| 役割 | ${escapeCell(item.role)} |`);
    if (item.scope) lines.push(`| 規模・スコープ | ${escapeCell(item.scope)} |`);
    if (item.team) lines.push(`| チーム | ${escapeCell(item.team)} |`);
    const tech = item.tech;
    const techParts: string[] = [...tech.lang, ...tech.fw, ...tech.db, ...tech.infra, ...tech.tools, ...tech.collab];
    if (techParts.length > 0) lines.push(`| 技術スタック | ${escapeCell(techParts.join(', '))} |`);
    if (item.process.length > 0) lines.push(`| 担当工程 | ${escapeCell(item.process.join(', '))} |`);
    if (item.duties.trim()) {
      lines.push('');
      lines.push('**業務内容**');
      lines.push('');
      lines.push(item.duties.trim());
    }
    if (item.acquired.trim()) {
      lines.push('');
      lines.push('**習得スキル・実績**');
      lines.push('');
      lines.push(item.acquired.trim());
    }
    lines.push('');
  }
  return lines.join('\n');
}

function blockToMarkdown(block: Block): string {
  if (block.type === 'markdown') return block.data.markdown;
  if (block.type === 'table') return tableBlockToMarkdown(block.data);
  if (block.type === 'skills') return skillsBlockToMarkdown(block.data);
  if (block.type === 'experience') return experienceBlockToMarkdown(block.data);
  if (block.type === 'profile') return profileBlockToMarkdown(block.data);
  if (block.type === 'stats') return statsBlockToMarkdown(block.data);
  if (block.type === 'project') return projectBlockToMarkdown(block.data);
  // 型システム上は到達不能。DB 由来の未知 type は "" を返して他ブロックを壊さない。
  return '';
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

/**
 * `|` で始まる行が GFM テーブルの区切り行（例 `| --- | :---: |`）かを判定する。
 */
function isTableDelimiterRow(line: string): boolean {
  const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  const cells = trimmed.split('|');
  return cells.length > 0 && cells.every((cell) => /^:?-+:?$/.test(cell.trim()));
}

/**
 * 与えられた markdown が GFM テーブルで始まるかを判定する（先頭「非空行」が `|` 始まり、
 * かつヘッダ行の直後の行がテーブル区切り行であることまで確認する）。
 * lazy continuation でテーブルが直前段落へ飲み込まれるのは、後続ブロックの先頭が
 * テーブル行のときだけなので、この 1 点で連結セパレータを切り替える。
 * `|` 始まりだけを見ると、区切り行を伴わない通常の markdown（先頭が `|` の地の文や
 * コードサンプル等）まで誤って GFM テーブル扱いしてしまうため、区切り行の有無まで見る。
 * GFM 仕様上、区切り行はヘッダ行の直後でなければならず、間に空行を挟むと表として
 * 成立しない（Markdown レンダラもテーブルとして解釈しない）ため、空行はスキップしない。
 */
function startsWithTableRow(markdown: string): boolean {
  const lines = markdown.split('\n');
  let firstContentIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim().length === 0) continue;
    firstContentIndex = i;
    break;
  }
  if (firstContentIndex === -1 || !/^\s*\|/.test(lines[firstContentIndex])) return false;

  const nextLine = lines[firstContentIndex + 1];
  return nextLine !== undefined && isTableDelimiterRow(nextLine);
}

/**
 * 2 ブロックを連結する際のセパレータ（`\n` か `\n\n`）を決める単一の真実。
 * サーバ（blocksToMarkdown）とクライアント（builder の assembleMarkdown）の両方が
 * この関数を経由することで、連結規則が 2 箇所に手コピー重複してドリフトするのを防ぐ。
 *
 * - markdown 型ブロック同士は原則 `\n`（splitMarkdownIntoBlocks とのラウンドトリップ
 *   無損失を維持。split が生成するブロックの先頭は必ず見出し/<details> なので `\n` になる）。
 * - ただし後続 markdown の先頭非空行が GFM テーブル行で始まる場合のみ `\n\n`。単一改行だと
 *   テーブルが直前段落へ lazy continuation として飲み込まれ、区切り行(:---:)が生テキストで
 *   表示される不具合があった（本番 PDF 出力・/view/db で実機確認）。
 * - それ以外（table/skills/experience/profile/stats/project 等、テーブルを内部生成しうる
 *   構造化ブロック）が隣接する場合は常に `\n\n`。
 */
export function blockJoinSeparator(prevType: BlockType, curType: BlockType, curMarkdown: string): '\n' | '\n\n' {
  if (prevType !== 'markdown' || curType !== 'markdown') return '\n\n';
  return startsWithTableRow(curMarkdown) ? '\n\n' : '\n';
}

/**
 * ブロック配列を order 昇順で 1 つの Markdown 文書へ連結する（type 別に変換）。
 * 連結規則は blockJoinSeparator に一元化している（クライアントの assembleMarkdown と共有）。
 */
export function blocksToMarkdown(blocks: Block[]): string {
  const sorted = [...blocks].sort((a, b) => a.order - b.order);
  let result = '';
  for (let i = 0; i < sorted.length; i++) {
    const markdown = blockToMarkdown(sorted[i]);
    if (i === 0) {
      result = markdown;
      continue;
    }
    result += blockJoinSeparator(sorted[i - 1].type, sorted[i].type, markdown) + markdown;
  }
  return result;
}

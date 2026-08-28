/**
 * スキルシートの「ブロック」データモデル。
 *
 * DB（Neon）を正本とし、スキルシートを順序付きブロック配列として表現する。
 * 汎用 `markdown` ブロックに加え、Excel 風に編集できる `table` ブロックを持つ
 * 判別ユニオン（type と data が一致）。table は保存・描画時に GFM markdown 表へ
 * 変換するため、web(react-markdown+remark-gfm) も PDF(mdast→@react-pdf) も
 * 既存の描画パイプラインをそのまま再利用できる（描画コードの新規追加ゼロ）。
 */

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

/**
 * プロフィールブロックのメタ情報（年齢・勤務形態などの1行見出し+値の付随情報）。
 *
 * よく使う8項目には既知のキーでラベルを割り当てるが（PROFILE_META_LABELS）、
 * それ以外の任意のラベルも自由に追加できる（Issue #193: 固定4項目のみ編集画面から
 * 入力できず、性別・資格のように既知のキーでも入力欄が無いと編集画面から直せなかった。
 * 固定リストへ1個ずつ足す設計は同じ問題を再生産するため、任意キーを許容する）。
 */
export interface ProfileMeta {
  age?: string;
  gender?: string;
  qualifications?: string;
  education?: string;
  work?: string;
  station?: string;
  specialties?: string;
  expertise?: string;
  /** 上記以外の任意の項目。キーがそのまま表示ラベルになる。 */
  [key: string]: string | undefined;
}

/**
 * ProfileMeta の既知キー → 表示ラベル。既知キー以外は orderedProfileMetaEntries() が
 * キー自体をラベルとして使う。ビューア（profile-intro.tsx）と markdown/PDF 変換
 * （profileBlockToMarkdown）の両方がこの1つの定義を共有する。
 */
export const PROFILE_META_LABELS: Record<string, string> = {
  age: '年齢',
  gender: '性別',
  qualifications: '資格',
  education: '学歴',
  work: '勤務形態',
  station: '最寄り駅',
  specialties: '得意分野',
  expertise: '得意業務',
};

/**
 * 任意項目のキー（ユーザーが自由入力するラベル文字列）から表示ラベルを解決する。
 * `PROFILE_META_LABELS[key]` を直接ブラケットアクセスすると、key が
 * `constructor` / `toString` / `hasOwnProperty` 等の Object.prototype のプロパティ名と
 * 一致した場合、それらの継承メンバ（関数やオブジェクト）を返してしまい、呼び出し先
 * （escapeCell は文字列以外を渡されると例外、React は関数/オブジェクトを子要素に
 * 取れず例外）でクラッシュする（chatgpt-codex-connector レビュー指摘。エディタは
 * ラベルをこれらの予約語として弾いていないため、ユーザー入力だけで再現する）。
 * Object.hasOwn で自プロパティのみを見て、無ければ key 自体をラベルとして使う。
 */
export function resolveProfileMetaLabel(key: string): string {
  return Object.hasOwn(PROFILE_META_LABELS, key) ? PROFILE_META_LABELS[key] : key;
}

/**
 * meta を「既知キー（PROFILE_META_LABELS の宣言順）→ それ以外のキー（オブジェクトの
 * 挿入順）」の順に並べ、値が空の項目を除いて返す。ビューアと markdown/PDF 変換の
 * どちらも同じ並び順になるよう、順序決定をこの1箇所に集約する。
 */
export function orderedProfileMetaEntries(meta: ProfileMeta | undefined): [string, string][] {
  if (!meta) return [];
  const knownKeys = Object.keys(PROFILE_META_LABELS);
  const entries = Object.entries(meta).filter((e): e is [string, string] => !!e[1] && e[1].trim().length > 0);
  const known = knownKeys
    .map((k) => entries.find(([key]) => key === k))
    .filter((e): e is [string, string] => e !== undefined);
  const rest = entries.filter(([key]) => !knownKeys.includes(key));
  return [...known, ...rest];
}

/** プロフィールブロックの構造化データ。 */
export interface ProfileBlockData {
  name: string;
  title: string;
  pr: string;
  strengths: string[];
  meta: ProfileMeta;
  /** 所属会社名（ビューアのトップバー/kicker に表示）。 */
  company?: string;
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
  /** true のとき閲覧側（ビューア/PDF）で配下案件ごと非表示にする。 */
  hidden?: boolean;
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
  /** true のとき閲覧側（ビューア/PDF）で非表示にする。 */
  hidden?: boolean;
  /** 期間の開始（`YYYY-MM`、`<input type="month">` 形式）。エディタUI内でのみ信頼される。 */
  periodStart?: string;
  /** 期間の終了（`YYYY-MM`）。ongoing が true のときは無視される。 */
  periodEnd?: string;
  /** true のとき「継続中」（終了未定）。 */
  ongoing?: boolean;
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
export {
  isBlockInput,
  isExperienceBlockData,
  isMarkdownBlockData,
  isProfileBlockData,
  isProjectBlockData,
  isSkillsBlockData,
  isStatsBlockData,
  isTableBlockData,
} from './guards';

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
 * 「中身が空のブロック」判定。**永続化フィルタではない**（ここ重要）。
 *
 * ブロックの存在と順序はテンプレやユーザーの「追加」操作が作った構造であり、
 * 中身が空かどうかは描画の都合でしかない。両者を混同して保存前に drop すると、
 * テンプレの入力用スカフォールドが消えて見出しだけが残る（issue #128 / PR#60）。
 * `.gemini/styleguide.md` の [K] 過剰フィルタによるデータ脱落 を参照。
 *
 * 用途は 2 つだけ:
 * 1. 描画時のスキップ（blocksToMarkdown / viewer の groupBlocks / builder プレビュー）
 * 2. 「シート全体に中身がない」ガード（自動保存スキップ・手動保存の confirm）
 *
 * markdown: trim して空 / table: 列ゼロ、または（全列 label 空 かつ 全セル空）。
 * skills: カテゴリ空 かつ スキル 0 件。experience: 会社名・職種・業務内容が全て空。
 * 未知 type は空とみなす（DB 由来の壊れた行で描画を落とさないため）。
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
    const { name, title, pr, strengths, meta, company } = block.data;
    const metaEmpty = Object.values(meta ?? {}).every((v) => !v || String(v).trim().length === 0);
    return (
      name.trim().length === 0 &&
      title.trim().length === 0 &&
      pr.trim().length === 0 &&
      strengths.every((s) => s.trim().length === 0) &&
      metaEmpty &&
      (!company || company.trim().length === 0)
    );
  }
  if (block.type === 'stats') return block.data.items.length === 0;
  if (block.type === 'project') {
    return block.data.companies.length === 0 && block.data.items.length === 0;
  }
  if (block.type === 'table') {
    const { columns, rows } = block.data;
    if (columns.length === 0) return true;
    const allLabelsEmpty = columns.every((c) => c.label.trim() === '');
    const allCellsEmpty = rows.every((row) => row.every((cell) => cell.trim() === ''));
    return allLabelsEmpty && allCellsEmpty;
  }
  // ここに到達するのは (a) BlockInput に新しい type を足したのに分岐を書き忘れた場合
  // （このコンパイル時 never 代入が型エラーで検知する）、(b) DB 由来の壊れた/未知の type
  // （実行時は型を素通りするため、この行が実際に走って false スロー無しで空扱いにする）。
  const exhaustiveCheck: never = block;
  void exhaustiveCheck;
  return true;
}

// --- markdown 変換 ---------------------------------------------------------
export {
  experienceBlockToMarkdown,
  filterVisibleProjectData,
  profileBlockToMarkdown,
  projectBlockToMarkdown,
  skillsBlockToMarkdown,
  statsBlockToMarkdown,
  tableBlockToMarkdown,
} from './serialize';

import { blockToMarkdown } from './serialize';

// 構造境界: レベル2〜4の見出し、または <details> ブロックの開始行。
// ここでドキュメントを分割し、各セクションを 1 ブロックとする。
const BLOCK_BOUNDARY = /^(?:#{2,4}\s|<details[\s>])/;

/**
 * Markdown 文書を構造境界でブロック配列へ分割する（テキストは無損失）。
 * シードは markdown ブロックのみ生成。連結（blocksToMarkdown）は中身が空のセグメントを
 * 除いて元の文書とおおむね一致する（空白のみの区間は復元されない）。
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

/** GFM テーブルの区切り行（例 `| --- | :---: |`）としてのセル数。区切り行でなければ 0。 */
function tableDelimiterCellCount(line: string): number {
  const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  const cells = trimmed.split('|');
  if (cells.length === 0 || !cells.every((cell) => /^:?-+:?$/.test(cell.trim()))) return 0;
  return cells.length;
}

/** ヘッダ行のセル数。外側の `|` は省略できる（GFM）。 */
function headerCellCount(line: string): number {
  const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  return trimmed.split('|').length;
}

/**
 * 与えられた markdown が GFM テーブルで始まるかを判定する（先頭「非空行」がヘッダ行で、
 * かつその直後の行がテーブル区切り行であることまで確認する）。
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
  if (firstContentIndex === -1) return false;

  const headerLine = lines[firstContentIndex];
  const nextLine = lines[firstContentIndex + 1];
  if (nextLine === undefined) return false;

  const delimiterCells = tableDelimiterCellCount(nextLine);
  if (delimiterCells === 0) return false;
  // 外側の `|` を省いたヘッダ（`a | b` / `--- | ---`）も GFM のテーブル。
  // ただし `a | b` の次が `---`（1セル）だと Setext 見出しなので、セル数の一致まで見る。
  if (/^\s*\|/.test(headerLine)) return true;
  return headerLine.includes('|') && headerCellCount(headerLine) === delimiterCells;
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
 *
 * 中身が空のブロック（isBlockInputEmpty）は連結前に除く。並べ替え前に filter することで、
 * 直前ブロック判定（blockJoinSeparator / i === 0 の先頭判定）がスキップされた要素を
 * 指さないようにしている（ループ内 continue だとこれが壊れる）。
 */
export function blocksToMarkdown(blocks: Block[]): string {
  const sorted = [...blocks].filter((b) => !isBlockInputEmpty(b)).sort((a, b) => a.order - b.order);
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

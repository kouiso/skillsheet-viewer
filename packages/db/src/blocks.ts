/**
 * スキルシートの「ブロック」データモデル。
 *
 * DB（Neon）を正本とし、スキルシートを順序付きブロック配列として表現する。
 * 汎用 `markdown` ブロックに加え、Excel 風に編集できる `table` ブロックを持つ
 * 判別ユニオン（type と data が一致）。table は保存・描画時に GFM markdown 表へ
 * 変換するため、web(react-markdown+remark-gfm) も PDF(mdast→@react-pdf) も
 * 既存の描画パイプラインをそのまま再利用できる（描画コードの新規追加ゼロ）。
 */

import { flattenTech, formatMonthToken, formatPeriodDisplay, normalizeProcess, PROCESS_LABELS } from './process';
import { sanitizeMarkdown, sanitizeScriptAndStyle } from './sanitize-html';

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
  // 後方互換: company は存在するなら string（欠如は許容）。
  if (d.company !== undefined && typeof d.company !== 'string') return false;
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

// optional フィールドの「存在するなら型が正しい」チェック（欠如は許容 = 後方互換）。
function optionalTypeOk(value: unknown, type: 'string' | 'boolean'): boolean {
  return value === undefined || typeof value === type;
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
      typeof (c as CompanyInfo).name === 'string' &&
      optionalTypeOk((c as CompanyInfo).hidden, 'boolean'),
  );
  if (!companiesOk) return false;
  return d.items.every(
    (item) =>
      typeof item === 'object' &&
      item !== null &&
      typeof (item as ProjectItem).id === 'string' &&
      typeof (item as ProjectItem).companyId === 'string' &&
      isProjectTech((item as ProjectItem).tech) &&
      Array.isArray((item as ProjectItem).process) &&
      optionalTypeOk((item as ProjectItem).hidden, 'boolean') &&
      optionalTypeOk((item as ProjectItem).periodStart, 'string') &&
      optionalTypeOk((item as ProjectItem).periodEnd, 'string') &&
      optionalTypeOk((item as ProjectItem).ongoing, 'boolean'),
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

const ALIGN_MARKER: Record<TableAlign, string> = {
  left: ':---',
  center: ':---:',
  right: '---:',
};

/**
 * セルを GFM 表で安全な単一行へ整える。
 * - セル内改行は半角スペースへ（複数行貼り付けで表が崩れるのを防止）
 * - `|` はエスケープ
 * - `<` `>` は実体参照へ（下記参照）
 * - 空セルは半角スペース 1 つ（空文字だと GFM の表がずれる）
 *
 * `<` `>` を素通しすると、"Reference <URL>" のような自由入力が remark に生 HTML の
 * インラインノードとして解釈される（`<URL>` が HTML タグらしいパターンに一致するため。
 * HTML5 の既知タグかどうかは問われない）。構造化ビューアは値を素のテキストとして
 * 表示するため見た目には影響しないが、PDF 側（skill-sheet-document.tsx の
 * INLINE_LEAF）は html ノードを意図的に描画せず捨てるため、"Reference <URL>" の
 * "<URL>" 部分だけが PDF から消える（chatgpt-codex-connector レビュー指摘）。
 * `&lt;`/`&gt;` は CommonMark の実体参照としてテキストノードへ復元されるため、
 * 生 HTML として再解釈されずに見た目どおりの文字が残る。
 */
function escapeCell(value: string): string {
  const sanitized = sanitizeScriptAndStyle(value);
  const single = sanitized.replace(/\r?\n/g, ' ').replace(/\|/g, '\\|').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return single.length > 0 ? single : ' ';
}

// 行頭のブロック開始トークン（見出し/リスト/引用/コードフェンス/水平線/生HTML）をエスケープし、
// 自由入力の1行が独立した markdown 構造として解釈されるのを防ぐ。ビューア側（project-card.tsx /
// project-preview.tsx）は company.note を素のテキストとして描画しており、生成する markdown でも
// 同じ「構造を持たない文章」として扱う必要がある。
function escapeMarkdownParagraph(value: string): string {
  const sanitized = sanitizeScriptAndStyle(value);
  return (
    sanitized
      .split('\n')
      // 元の文章に既にバックスラッシュが含まれる場合（例:「\<img ...>」という文字列を
      // 意図した入力）、先にこれをエスケープしておかないと、後続のメタ文字エスケープが
      // 追加した `\` と合わせて `\\<` になってしまう。remark は `\\` を「リテラルな
      // バックスラッシュ1文字」の escape として消費するため、その直後の `<img ...>` が
      // エスケープされていない生のHTMLとして解釈されてしまう（レビュー指摘）。
      // 既存のバックスラッシュを先に `\\` へエスケープしておけば、後続のメタ文字
      // エスケープと合わせて remark 上も元の見た目（バックスラッシュ+文字）を維持できる。
      .map((line) => line.replace(/\\/g, '\\\\'))
      // 行頭の空白が4文字以上（タブ混在含む）だと remark がインデントコードブロックとして
      // 解釈してしまう。表示側（project-card.tsx / project-preview.tsx）は素のテキストとして
      // 描画するため構造が食い違う。タブを含む・4文字以上のときだけコードブロック化しない
      // 3文字までに削る（タブ無しの1〜3文字の空白はそのまま維持する）。
      .map((line) =>
        line.replace(/^[ \t]+/, (indent) => (indent.includes('\t') || indent.length >= 4 ? '   ' : indent)),
      )
      // 行中のどこに出現しても remark に解釈されるインライン構文の記号
      // （画像/リンクの `!`・`[`・`]`、強調の `*`・`_`、コードスパンの `` ` ``、
      // 取り消し線/水平線の `~`、生HTMLの `<`）は、行頭以外に出現しても解釈されてしまう
      // （例:「会社概要 ![機密](url)」のように行中に画像記法が来るケース、レビュー指摘）ため、
      // 位置を問わず一括でエスケープする。`*` は行頭のリストマーカーとしても使われるが、
      // この一括エスケープで行頭・行中どちらの意味も無効化される。
      .map((line) => line.replace(/[![\]*_`~<]/g, '\\$&'))
      // 見出し(#)・引用(>)・リスト(+-)・番号付きリスト・Setext見出しの下線(=)は
      // 行頭にのみ構造として解釈されるため、行頭のときだけエスケープする
      // （行中の `#` や `-` は remark 上ただの文字として扱われるため過剰エスケープを避ける）。
      .map((line) => line.replace(/^(\s*)([#>+\-=]|\d+[.)])/, '$1\\$2'))
      .join('\n')
  );
}

// 案件の自由記述に含まれる見出し記法を、見出しでない素の行へ落とす。
//
// ビューア側の InlineMarkdown は h1〜h6 の component override を持たず、Tailwind preflight が
// 見出しの字送り・太さを inherit へ潰すため、`### 小見出し` は地の文と同じ見た目になる。
// 一方 PDF 側は heading ノードに構造的な意味を与えており、`skill-sheet-document.tsx` の
// 案件カード分割は「次の heading までを1つの分割不可単位」として trailing を集める。
// 自由記述に見出しが混ざると、その場でカードが打ち切られてカード自身がページ境界で
// 割れる（#147 / #194 の再発経路）。画面が構造として扱っていないものを PDF だけが
// 構造として扱うのが誤りなので、生成する markdown の側で見出しにしない。
function stripHeadingSyntax(value: string): string {
  const lines = value.split('\n');
  const out: string[] = [];
  for (const line of lines) {
    // ATX 見出し（`## foo`）。マーカーだけ落として本文は残す。
    const atx = line.match(/^(\s{0,3})#{1,6}[ \t]+(.*)$/);
    if (atx) {
      out.push(atx[1] + atx[2]);
      continue;
    }
    // Setext 見出し（直前の段落行を `===` / `---` の下線が見出しへ格上げする）。
    // 前に空行を挟むと下線は段落から切り離され、`---` は水平線・`===` は素の行になる。
    const previous = out.at(-1);
    if (previous !== undefined && previous.trim() !== '' && /^\s{0,3}(=+|-+)\s*$/.test(line)) {
      out.push('');
    }
    out.push(line);
  }
  return out.join('\n');
}

// 案件の自由記述（duties / acquired / comment）向け。ビューア側はこの3つを
// InlineMarkdown（react-markdown + rehype-sanitize）で描画しており、箇条書き・強調が
// そのまま構造として出る。PDF 側だけ escapeMarkdownParagraph をかけていたため、
// 同じ文字列が `\- ` の羅列になって画面と食い違っていた（#242）。
//
// 構造は保ったまま <script>/<style> だけ落とす。この文字列の行き先は PDF だけではない:
//   - PDF: `skill-sheet-document.tsx`。生HTMLは html ノード処理で無害化される
//     （inline は INLINE_LEAF で破棄、block は stripHtml）
//   - プレビュー: builder-client → BroadcastChannel/localStorage → preview-client →
//     `skill-sheet-viewer.tsx` の MarkdownContent。rehype-raw が有効だが
//     rehype-sanitize（MARKDOWN_SANITIZE_SCHEMA）が後段に入る
//   - `blocksToMarkdown` 経由の `sheet.content`、およびバックアップ書き出しの .md
// 生HTMLを無害化しているのは各描画経路のサニタイザであって、この関数ではない。
function asInlineMarkdown(value: string): string {
  return stripHeadingSyntax(sanitizeScriptAndStyle(value));
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
  const category = escapeCell(data.category);
  const header = data.category.trim().length > 0 ? `### ${category}\n\n` : '';
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
  const companyEscaped = escapeCell(company.trim());
  const heading = company.trim().length > 0 ? `### ${companyEscaped}（${period}）` : `### （${period}）`;
  const lines: string[] = [heading, ''];
  lines.push('| 項目 | 内容 |');
  lines.push('| :--- | :--- |');
  lines.push(`| 期間 | ${period} |`);
  if (role.trim().length > 0) lines.push(`| 職種 | ${escapeCell(role.trim())} |`);
  if (description.trim().length > 0) {
    lines.push('');
    lines.push(escapeMarkdownParagraph(description.trim()));
  }
  return lines.join('\n');
}

/** プロフィールブロックを markdown へ変換する。 */
export function profileBlockToMarkdown(data: ProfileBlockData): string {
  const lines: string[] = [];
  if (data.name.trim()) lines.push(`# ${escapeCell(data.name.trim())}`);
  if (data.title.trim()) lines.push(`\n**${escapeCell(data.title.trim())}**`);
  if (data.pr.trim()) lines.push(`\n${escapeMarkdownParagraph(data.pr.trim())}`);
  if (data.strengths.length > 0) {
    lines.push('\n**強み**');
    for (const s of data.strengths) lines.push(`- ${escapeMarkdownParagraph(s.trim())}`);
  }
  const metaItems: string[] = [];
  // 所属会社はビューア（トップバー/kicker）で表示するため、markdown/PDF でも欠落させない（表示パリティ）。
  if (data.company?.trim()) metaItems.push(`| 所属会社 | ${escapeCell(data.company.trim())} |`);
  // 既知8項目に限らず、編集画面で追加した任意の項目も同じ並び順で出す（Issue #193）。
  for (const [key, value] of orderedProfileMetaEntries(data.meta)) {
    metaItems.push(`| ${escapeCell(resolveProfileMetaLabel(key))} | ${escapeCell(value)} |`);
  }
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

/**
 * hidden な会社（配下案件ごと）と案件を除外した表示用データを返す。
 * ビューア（ProjectSection）と PDF（projectBlockToMarkdown）が共有する唯一のフィルタ。
 */
export function filterVisibleProjectData(data: ProjectBlockData): ProjectBlockData {
  // 明示的に hidden な会社の id 集合。会社未登録（不明な会社）の案件は従来通り表示する。
  const hiddenCompanyIds = new Set(data.companies.filter((c) => c.hidden).map((c) => c.id));
  return {
    companies: data.companies.filter((c) => !c.hidden),
    items: data.items.filter((item) => !item.hidden && !hiddenCompanyIds.has(item.companyId)),
  };
}

/**
 * 案件ブロックを markdown へ変換する（既定では hidden な会社・案件をビューアと同様に除外）。
 * `includeHidden: true` は閲覧面ではないバックアップ書き出し用 — hidden も含めた全件を出力する
 * （バックアップが黙って hidden データを欠落させると、そこからの復元でデータが失われるため）。
 */
export function projectBlockToMarkdown(data: ProjectBlockData, opts?: { includeHidden?: boolean }): string {
  const visible = opts?.includeHidden ? data : filterVisibleProjectData(data);
  const companyMap = new Map(visible.companies.map((c) => [c.id, c]));
  const lines: string[] = [];
  for (const item of visible.items) {
    const company = companyMap.get(item.companyId);
    const companyName = company?.name?.trim() ? escapeCell(company.name.trim()) : '(不明な会社)';
    const title = item.title.trim() ? escapeCell(item.title.trim()) : '(タイトル未入力)';
    lines.push(`### ${companyName} — ${title}`);
    lines.push('');
    lines.push('| 項目 | 内容 |');
    lines.push('| :--- | :--- |');
    if (company?.kind) lines.push(`| 会社区分 | ${escapeCell(company.kind)} |`);
    if (item.period) lines.push(`| 期間 | ${escapeCell(formatPeriodDisplay(item.period))} |`);
    if (item.role) lines.push(`| 役割 | ${escapeCell(item.role)} |`);
    if (item.scope) lines.push(`| 規模・スコープ | ${escapeCell(item.scope)} |`);
    if (item.team) lines.push(`| チーム | ${escapeCell(item.team)} |`);
    const techParts = flattenTech(item.tech);
    if (techParts.length > 0) lines.push(`| 技術スタック | ${escapeCell(techParts.join(', '))} |`);
    const processNormalized = normalizeProcess(item.process);
    const processLabels: string[] = PROCESS_LABELS.filter((_, i) => processNormalized.done[i]);
    processLabels.push(...processNormalized.other);
    if (processLabels.length > 0) lines.push(`| 担当工程 | ${escapeCell(processLabels.join(', '))} |`);
    // 会社概要文（CompanyInfo.note）。従来 PDF・バックアップのどちらにも出力先が無く、
    // 案件単体では伝わらない「どういう立ち位置でその会社に入っていたか」が欠落していた（#139）。
    // 見出しと表の間に挟むと、PDF側の「見出し直後が表なら1ブロックとして分割禁止にする」
    // （renderBlocks の heading+table 結合、#147）が効かなくなり、ページ境界で見出しと
    // 表が分断される問題が再発する。表の後ろに置くことで見出し→表の隣接を保つ。
    // ビューア側（project-card.tsx / project-preview.tsx）は note を素のテキストとして
    // 描画するため、ここでも独立した見出し・リスト等として解釈されないようエスケープする。
    if (company?.note?.trim()) {
      lines.push('');
      lines.push(escapeMarkdownParagraph(company.note.trim()));
    }
    if (item.duties.trim()) {
      lines.push('');
      lines.push('**業務内容**');
      lines.push('');
      lines.push(asInlineMarkdown(item.duties.trim()));
    }
    if (item.acquired.trim()) {
      lines.push('');
      lines.push('**習得スキル・実績**');
      lines.push('');
      lines.push(asInlineMarkdown(item.acquired.trim()));
    }
    // 案件コメント（ProjectItem.comment）。案件1件あたり数百文字の本文で、
    // 画面では InlineMarkdown で描画されているのに PDF には出力先が無く、
    // 最も情報量の多い文章が丸ごと欠落していた（#242）。
    if (item.comment?.trim()) {
      lines.push('');
      lines.push(asInlineMarkdown(item.comment.trim()));
    }
    lines.push('');
  }
  return lines.join('\n');
}

function blockToMarkdown(block: Block): string {
  if (block.type === 'markdown') return sanitizeMarkdown(block.data.markdown);
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

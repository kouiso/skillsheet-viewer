/**
 * PDF（印刷）の描画に必要な形へ、DB のブロック配列を畳んだビューモデル。
 *
 * 描画コンポーネントは一切の判断（振り分け・畳み込み・空値の扱い）をせず、ここが出した
 * 値をそのまま置くだけにする。理由は 2 つ:
 *  - 表示の判断をコンポーネントに散らすと、画面と PDF の食い違いが静かに増える
 *  - ここは Node 環境で普通にテストできる（描画してページを数える必要がない）
 *
 * **DB のデータモデルには何も足していない。** 空のフィールドは「その行を出さない」で
 * 表現し、値が入れば自動で出る。PDF のために型を増やすと、汎用のスキルシート管理
 * アプリとして使えなくなる。
 */

import type { Block, CompanyInfo, ProfileBlockData, ProjectItem, ProjectTech, StatsBlockData } from '@/db/blocks';
import { filterVisibleProjectData, orderedProfileMetaEntries, resolveProfileMetaLabel } from '@/db/blocks';
import { companyDisplayName, groupProjectsByCompany } from '@/db/group-by-company';
import {
  deriveCompanyPeriod,
  deriveDuration,
  flattenTech,
  formatMonthToken,
  formatPeriodDisplay,
  normalizeProcess,
  PROCESS_LABELS,
  parsePeriodBounds,
  splitPeriodRange,
  TECH_BUCKET_ORDER,
} from '@/db/process';
import type { DetailLevel } from '@/db/project-detail-level';
import { resolveDetailLevels } from '@/db/project-detail-level';
import { resolveProjectArea } from '@/db/tech-area';

import {
  PRINT_SIZE,
  PRINT_TECH_LABEL,
  PRINT_TOP_SKILL_LIMIT,
  PRINT_TYPE,
  PRINT_YEAR_VISIBLE_CATEGORIES,
} from './print-tokens';

/** 画面側のビュートグルと同じキー。PDF もこの ON/OFF に従う。 */
export type PrintViewKey = 'skills' | 'process' | 'projects' | 'timeline';

/** チップ 1 個。塗り（その分類の主役）と枠線（それ以外）の 2 種だけ。 */
export interface PrintChip {
  label: string;
  emphasis: 'solid' | 'outline';
}

/**
 * 技術スタックの 1 分類（ラベル + チップ）。
 *
 * かつては 1 分類 6 件（`PRINT_CHIP_LIMIT`）を超えた分を「他 N 件」に畳んでいたが、
 * 27 案件中 16 案件・合計 68 個の技術名が紙面のどこにも出なくなっていた
 * （オーナーの標準指示「元データを全件表示したい」に反する、`no-abbreviated-rendering`
 * skill の origin）。**件数の上限は無い。全件を chips に入れる。**
 */
export interface PrintTechGroup {
  label: string;
  chips: PrintChip[];
}

/** ラベル + 値の 1 行。値が空の行はそもそも作らない。 */
export interface PrintMetaRow {
  label: string;
  value: string;
}

export interface PrintProject {
  id: string;
  title: string;
  companyName: string;
  /**
   * 会社名に区分を添えた表示用の 1 行。実データの会社名は「Q 社（自社サービス事業会社）」の
   * ように**区分を名前の中に含んでいる**ため、機械的に足すと同じ語が 2 度出る（実測）。
   * 既に含まれているときは足さない。
   */
  companyLabel: string;
  /** 例: 2025.11〜2026.07 */
  periodText: string;
  /**
   * 簡約版の期間列（幅 88pt）に 1 行で収まる短縮表記。
   * 例: 2019.05–07（同一年）/ 2018.11–19.01（年をまたぐ）。
   * `periodText` をそのまま入れると 11pt で約 94pt になって列から溢れる（実測）。
   */
  compactPeriodText: string;
  /** 例: 9ヶ月。導出できなければ空文字。 */
  durationText: string;
  team: string;
  /** 詳細版カードのメタ表。役割・技術領域・チーム・担当工程のうち、値があるものだけ。 */
  metaRows: PrintMetaRow[];
  techGroups: PrintTechGroup[];
  duties: string;
  acquired: string;
  comment: string;
  /**
   * 簡約版の 1 行に出す一言（duties → comment の順で先頭 1 文）。
   *
   * 技術名は以前ここに先頭 5 個だけカンマ区切りで同居させていたが、6 個目以降が
   * 紙面のどこにも出なくなる省略だった（`no-abbreviated-rendering` skill 違反）。
   * 簡約版カードは `techGroups` を全件そのままチップで出すので、この一言に技術名を
   * 混ぜる必要はない。
   */
  compactNote: string;
  level: DetailLevel;
  /**
   * 詳細版カードが 1 ページに収まると見積れるか。
   *
   * true なら描画側はカード全体を `wrap={false}` にしてよい（1 案件がページを跨いで
   * 途中で切れることを防ぐ）。false（見積り高さが `PRINT_SIZE.cardMaxSinglePageHeight`
   * を超える）のカードは、区切り単位（メタ表・チップ分類・本文ブロック）ごとに
   * 分割できる形のまま描画する — カード全体を `wrap={false}` にすると、1 ページを
   * 超える内容は改ページではなく文字の圧縮・重なりを起こす（実測）。
   * 見積りは `estimateProjectCardHeight` 参照。
   */
  fitsOnePage: boolean;
}

export interface PrintCompany {
  id: string;
  name: string;
  /**
   * 見出しに添える区分。会社名が既に区分を含んでいるときは空文字にする
   * （実データに名前 `受託` / 区分 `受託` の会社があり、そのまま並べると「受託 受託」になる）。
   */
  kind: string;
  /**
   * 見出しに添える区分。会社名が既に区分を含んでいるときは空文字にする
   * （実データに名前 `受託` / 区分 `受託` の会社があり、そのまま並べると「受託 受託」になる）。
   */
  kindLabel: string;
  /** 会社の在籍期間。CompanyInfo.period が空なら配下案件から導出する。 */
  periodText: string;
  note: string;
  projectCount: number;
  /** 配下案件の役割を重複なく並べたもの。全部空なら空文字。 */
  roles: string;
  /** 配下案件のチーム規模の幅（例: 1〜13 名 / 13 名）。導出できなければ空文字。 */
  teamRange: string;
  /** 最新の会社だけ塗りの帯にする（全案件終了済みなので「現在 / 過去」ではなく「直近 / それ以前」）。 */
  isLatest: boolean;
  projects: PrintProject[];
}

export interface PrintSkill {
  name: string;
  /** ソートにだけ使う生の経験年数。表示するかどうかは yearsLabel が既に判定済み。 */
  years: number;
  level: string;
  /**
   * チップに添える経験年数の表示文字列（例: "8 年"）。表示しない場合は空文字。
   * 分類（`PRINT_YEAR_VISIBLE_CATEGORIES`）とスキルビュートグルで既に判定済みの値を
   * 持たせることで、1 ページ目のチップ・スキル一覧ページのチップのどちらも
   * このフィールドをそのまま使うだけでよくする（判定をコンポーネント側で重複させない）。
   */
  yearsLabel: string;
}

export interface PrintSkillGroup {
  category: string;
  skills: PrintSkill[];
}

export interface PrintSummary {
  sheetTitle: string;
  name: string;
  /** 肩書き。DB が空なら空文字（そのときはスロットごと出さない）。 */
  title: string;
  companyName: string;
  stats: { value: string; unit: string; label: string }[];
  /** 主力スタック。経験年数の降順で PRINT_TOP_SKILL_LIMIT 件まで。 */
  topSkills: PrintChip[];
  /** 対応可能工程。全案件の process の和union。 */
  processLabels: string[];
  /** プロフィール帯（所属・年齢・勤務形態 …）。1 行に 3 列で並ぶ短い項目だけ。 */
  profileRows: PrintMetaRow[];
  /**
   * 値が長くて 1/3 幅の帯に収まらない項目（得意分野・得意業務など）。
   * 1 ページ目のプロフィール帯に入れると帯だけで 150pt を食って自己紹介が溢れるため、
   * スキル一覧ページの先頭へ回す。内容もスキルの要約なので、そちらの方が文脈に合う。
   */
  expertiseRows: PrintMetaRow[];
  /** 自己紹介本文。 */
  pr: string;
}

export interface PrintViewModel {
  summary: PrintSummary;
  skillGroups: PrintSkillGroup[];
  companies: PrintCompany[];
  /** 案件セクションを出すか（ビュートグル `projects`）。 */
  showProjects: boolean;
  /** スキル一覧を出すか（ビュートグル `skills`）。 */
  showSkills: boolean;
  /** 工程を出すか（ビュートグル `process`）。 */
  showProcess: boolean;
}

const ALL_VIEWS: PrintViewKey[] = ['skills', 'process', 'projects', 'timeline'];

// --- 小さなヘルパー -------------------------------------------------------

function trimmed(value: string | undefined): string {
  return typeof value === 'string' ? value.trim() : '';
}

/** 習熟度から強調を決める。上級だけ塗り、それ以外は枠線。 */
const SOLID_LEVELS = new Set(['上級', '★★★']);

export function chipEmphasis(level: string): PrintChip['emphasis'] {
  return SOLID_LEVELS.has(trimmed(level)) ? 'solid' : 'outline';
}

/**
 * スキルの経験年数を表示してよいか判定し、表示用文字列を返す（判定はここ 1 箇所だけ）。
 *
 * `showSkills` が OFF のときは分類を問わず出さない（「スキルを消す」がスキル一覧ページだけ
 * 消して 1 ページ目の主力スタックに年数が残る、では OFF の意味が無いため）。
 */
export function skillYearsLabel(category: string, years: number, showSkills: boolean): string {
  if (!showSkills) return '';
  if (!PRINT_YEAR_VISIBLE_CATEGORIES.has(trimmed(category))) return '';
  return years > 0 ? `${years} 年` : '';
}

/**
 * 「N 名」「N 人」から人数を取り出す。範囲表示のためだけに使い、表示自体は原文を保つ。
 * 取れなければ null（原文をそのまま出す判断に落とす）。
 */
function parseTeamSize(team: string): number | null {
  const match = trimmed(team).match(/(\d+)/);
  return match ? Number(match[1]) : null;
}

/**
 * 簡約版の期間列（幅 88pt）に 1 行で収まる短縮表記を作る。デザイン 1d が採っている形。
 * 同一年なら終了側の年を省き、年をまたぐなら終了側の年を下 2 桁にする。
 * `periodText` をそのまま入れると 11pt で約 94pt になり、列から溢れて隣の案件名に重なる（実測）。
 * 解釈できない period は `formatPeriodDisplay` の結果をそのまま返す（データを壊さない）。
 */
export function compactPeriod(period: string): string {
  const [startToken, endToken] = splitPeriodRange(period);
  const start = formatMonthToken(startToken);
  const end = formatMonthToken(endToken);
  const startMatch = start.match(/^(\d{4})\.(\d{2})$/);
  const endMatch = end.match(/^(\d{4})\.(\d{2})$/);
  if (!startMatch) return formatPeriodDisplay(period);
  if (!endMatch) return endToken ? `${start}–${end || '現在'}` : start;
  if (startMatch[1] === endMatch[1]) return `${start}–${endMatch[2]}`;
  return `${start}–${endMatch[1].slice(2)}.${endMatch[2]}`;
}

/**
 * プロフィール帯（1 行 3 列 = 1 セル約 110pt）に収まる値の文字数の上限。
 * 11pt の全角文字は 1 セルに約 10 文字しか入らないので、30 文字を超えると 3 行以上に
 * 折り返して帯の高さが跳ねる（実データの得意分野は 62 文字だった）。
 */
const PROFILE_SHORT_VALUE_CHARS = 30;

/** 簡約版の一言に使える最大文字数。これを超える分は「…」で切る（1 行に収める）。 */
const COMPACT_NOTE_MAX = 60;

/**
 * 先頭 1 文を切り出す。
 *
 * duties / comment はユーザーの自由記述で、実データでは markdown の箇条書き
 * （`- iOS / Android アプリの機能開発（…）。`）になっている。記号をそのまま出すと
 * 簡約版の 1 行に `- ` が残るため、行頭の箇条書き記号・見出し記号・強調記号を落とす。
 */
export function firstSentence(text: string): string {
  const source = trimmed(text)
    .split(/\r?\n/)
    .map((line) =>
      line
        .replace(/^\s*(?:[-*+]|\d+[.)])\s+/, '')
        .replace(/^\s*#+\s*/, '')
        .trim(),
    )
    .find((line) => line.length > 0);
  if (!source) return '';
  const stripped = source.replace(/\*\*/g, '').replace(/\s+/g, ' ');
  const match = stripped.match(/^[^。\n！？]*[。！？]?/);
  const sentence = (match?.[0] ?? stripped).trim();
  return sentence.length > COMPACT_NOTE_MAX ? `${sentence.slice(0, COMPACT_NOTE_MAX)}…` : sentence;
}

/**
 * 担当工程を表示用の文字列にする。
 *
 * 7 段が先頭から末尾まで連続しているときは「要件定義 〜 保守・運用（全工程）」に畳む。
 * 7 項目を全部並べると約 38 文字で、メタ表のセル幅（約 171pt）に対して 2.5 行に
 * 折り返して枠を崩すため、この畳み込みは表示上の必須要件。
 * 飛びがあるときは個別に並べる（実績を丸めない）。
 */
export function formatProcessForPrint(process: string[]): string {
  const { done, other } = normalizeProcess(process);
  const doneLabels = PROCESS_LABELS.filter((_, i) => done[i]);
  const firstIndex = done.indexOf(true);
  const lastIndex = done.lastIndexOf(true);
  const isContiguous = firstIndex !== -1 && done.slice(firstIndex, lastIndex + 1).every(Boolean);
  const isAll = doneLabels.length === PROCESS_LABELS.length;

  let text: string;
  if (isAll) {
    text = `${PROCESS_LABELS[0]} 〜 ${PROCESS_LABELS[PROCESS_LABELS.length - 1]}（全工程）`;
  } else if (isContiguous && doneLabels.length >= 3) {
    text = `${PROCESS_LABELS[firstIndex]} 〜 ${PROCESS_LABELS[lastIndex]}`;
  } else {
    text = doneLabels.join(', ');
  }
  return [text, ...other].filter(Boolean).join(', ');
}

/**
 * 技術スタックを分類ラベル + チップに畳む。
 *
 * 各分類の**配列先頭 1 個を塗りチップ**にする。DB に「主役技術」のフラグは無く、
 * 配列順は本人がエディタで入れた順（＝重要度順）として扱えるため。
 * 件数は畳まない（PrintTechGroup のコメント参照）。チップ行は必要なだけ折り返す。
 */
export function buildTechGroups(tech: ProjectTech | undefined): PrintTechGroup[] {
  if (!tech) return [];
  const groups: PrintTechGroup[] = [];
  for (const key of TECH_BUCKET_ORDER) {
    const all = flattenTech({ ...emptyTech(), [key]: tech[key] ?? [] });
    if (all.length === 0) continue;
    groups.push({
      label: PRINT_TECH_LABEL[key],
      chips: all.map((label, i) => ({ label, emphasis: i === 0 ? 'solid' : 'outline' })),
    });
  }
  return groups;
}

/**
 * 自己紹介本文の先頭にある飾りの見出し行（`♦ 自己紹介` 等）を落とす。
 * markdown 時代の名残で、描画側が「自己紹介」の小見出しを付けるため二重になる。
 */
export function stripDecorativeHeading(pr: string): string {
  const lines = pr.split(/\r?\n/);
  const first = lines[0]?.trim() ?? '';
  if (/^[♦◆■●▪・#*\s]*自己\s*(紹介|PR)\s*$/.test(first)) return lines.slice(1).join('\n').trim();
  return pr;
}

/** 会社名に区分が既に含まれていなければ「名前（区分）」にする。 */
export function companyLabelOf(name: string, kind: string): string {
  if (!name) return kind;
  if (!kind || name.includes(kind)) return name;
  return `${name}（${kind}）`;
}

function emptyTech(): ProjectTech {
  return { lang: [], fw: [], db: [], infra: [], tools: [], collab: [] };
}

// --- 組み立て -------------------------------------------------------------

// --- 案件カードの高さ見積り（1 ページに収まるかの判定用） -----------------------
//
// @react-pdf に実レイアウトさせずに概算するので、荒い近似を使う。文字幅は「全角相当
// （CJK 等）は 1 文字 ≒ フォントサイズと同じ pt 幅、半角（英数記号）は 0.55 倍」で
// 見積る。全部を全角換算で見積ると、技術チップ（ほぼ英数字の技術名）の折り返し行数を
// 実際の 2 倍近く多く見積り、1 ページに収まるはずのカードまで分割方針に倒してしまう
// （実測: 全角換算のみだと実データの詳細版 14 件中 11 件が「分割」判定になった）。
//
// 見積りが外れて「1 ページに収まる」はずが実際は超える方向の誤りは致命的
// （`wrap={false}` は 1 ページを超える中身を改ページせず圧縮して重ねる。実測、
// company-grouping 作業の zz-wrapfalse-overflow-probe）。見積りが逆向きに外れる
// （実際は収まるのに「超える」と判定する）方向の誤りは、分割可能な形のまま描画される
// だけで崩れない。だから半角の 0.55 倍という値自体は狭め（安全側）に取ってある。

/** 半角相当とみなす文字（ASCII 全般・半角カナ）か。それ以外は全角として扱う。 */
function isHalfWidthChar(codePoint: number): boolean {
  return codePoint <= 0xff || (codePoint >= 0xff61 && codePoint <= 0xffdc);
}

/** 文字列の概算幅（pt）。全角 1em・半角 0.55em として積み上げる。 */
function estimateTextWidth(text: string, fontSizePt: number): number {
  let width = 0;
  for (const ch of text) {
    const isHalf = isHalfWidthChar(ch.codePointAt(0) ?? 0);
    width += fontSizePt * (isHalf ? 0.55 : 1);
  }
  return width;
}

function estimateWrappedLines(text: string, columnWidthPt: number, fontSizePt: number): number {
  if (!text) return 0;
  const totalWidth = estimateTextWidth(text, fontSizePt);
  if (totalWidth <= 0) return 0;
  return Math.max(1, Math.ceil(totalWidth / Math.max(1, columnWidthPt)));
}

/** duties / acquired / comment 1 本ぶんの見積り高さ（pt）。行ごとに折り返しを見積る。 */
function estimateMarkdownHeight(text: string, columnWidthPt: number): number {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (lines.length === 0) return 0;
  const bodyLineHeight = PRINT_TYPE.body.fontSize * PRINT_TYPE.body.lineHeight;
  // 箇条書き記号・見出し記号ぶんの実効幅の目減りを安全側に一律 12pt 見る。
  const effectiveWidth = Math.max(40, columnWidthPt - 12);
  let total = 0;
  for (const line of lines) {
    total += estimateWrappedLines(line, effectiveWidth, PRINT_TYPE.body.fontSize) * bodyLineHeight;
  }
  // 段落間の gap（PrintMarkdown の段落間隔。厳密値ではなく行間 1 個分の安全マージン）。
  return total + Math.max(0, lines.length - 1) * 4;
}

/** カード本文の実効幅（カードの左右パディングを引いた分）。 */
const CARD_CONTENT_WIDTH = PRINT_SIZE.contentWidth - PRINT_SIZE.cardPadHorizontal * 2;

/**
 * 詳細版カード 1 枚の見積り高さ（pt）。project-card-detail.tsx の実レイアウト
 * （ヘッダー・メタ表・技術チップ・業務内容/習得スキル/コメント）に対応させる。
 */
export function estimateProjectCardHeight(fields: {
  title: string;
  companyLabel: string;
  metaRows: PrintMetaRow[];
  techGroups: PrintTechGroup[];
  duties: string;
  acquired: string;
  comment: string;
}): number {
  let height = 0;

  // ヘッダー: 上下パディング(10*2) + 見出し列内の gap(3) + タイトル行 + 会社行。
  // タイトルは headerRight（期間バッジ等）と横並びなので、見積りの実効幅は保守的に狭めに取る。
  const titleLineHeight = PRINT_TYPE.projectTitle.fontSize * PRINT_TYPE.projectTitle.lineHeight;
  height +=
    20 +
    3 +
    estimateWrappedLines(fields.title, 320, PRINT_TYPE.projectTitle.fontSize) * titleLineHeight +
    (fields.companyLabel ? PRINT_TYPE.meta.fontSize * PRINT_TYPE.meta.lineHeight : 0);

  // メタ表: 2 列。行数は列あたり ceil(件数/2)。
  if (fields.metaRows.length > 0) {
    const rowsPerColumn = Math.ceil(fields.metaRows.length / 2);
    const metaRowHeight = PRINT_SIZE.metaRowPadVertical * 2 + PRINT_TYPE.meta.fontSize * PRINT_TYPE.meta.lineHeight;
    height += rowsPerColumn * metaRowHeight;
  }

  // 技術チップ: 分類ごとにチップの概算幅を積んで折り返し行数を見積る。
  if (fields.techGroups.length > 0) {
    height += PRINT_SIZE.cardPadVertical * 2;
    const chipsAreaWidth = CARD_CONTENT_WIDTH - PRINT_SIZE.labelColTech - 8;
    const chipLineHeight = PRINT_TYPE.meta.fontSize * PRINT_TYPE.meta.lineHeight + PRINT_SIZE.chipPadVertical * 2;
    for (const group of fields.techGroups) {
      let used = 0;
      let rows = 1;
      for (const chip of group.chips) {
        const chipTextWidth = estimateTextWidth(chip.label, PRINT_TYPE.meta.fontSize);
        const chipWidth = chipTextWidth + PRINT_SIZE.chipPadHorizontal * 2 + PRINT_SIZE.chipGap;
        if (used > 0 && used + chipWidth > chipsAreaWidth) {
          rows += 1;
          used = chipWidth;
        } else {
          used += chipWidth;
        }
      }
      height += rows * chipLineHeight;
    }
  }

  // 業務内容 / 習得スキル・実績 / コメント: それぞれ paddingVertical(9*2) + ラベル 1 行 + 本文。
  const sectionLabelHeight = PRINT_TYPE.sectionLabel.fontSize * PRINT_TYPE.sectionLabel.lineHeight;
  for (const text of [fields.duties, fields.acquired, fields.comment]) {
    if (!text) continue;
    height += PRINT_SIZE.cardPadVertical * 2 + 4 + sectionLabelHeight;
    height += estimateMarkdownHeight(text, CARD_CONTENT_WIDTH);
  }

  // 外枠罫線・ブロック仕切り・丸め誤差ぶんの安全マージン。
  return height + 24;
}

function buildProject(item: ProjectItem, company: CompanyInfo | undefined, level: DetailLevel): PrintProject {
  const area = resolveProjectArea(item.scope, item.tech);
  const processText = formatProcessForPrint(item.process ?? []);
  const metaRows: PrintMetaRow[] = [];
  if (trimmed(item.role)) metaRows.push({ label: '役割', value: trimmed(item.role) });
  // 導出値は「技術領域」、本人の言葉（scope）は「担当領域」。この区別を崩さない。
  if (trimmed(area.text)) metaRows.push({ label: area.derived ? '技術領域' : '担当領域', value: trimmed(area.text) });
  if (trimmed(item.team)) metaRows.push({ label: 'チーム', value: trimmed(item.team) });
  if (processText) metaRows.push({ label: '担当工程', value: processText });

  const title = trimmed(item.title) || '（タイトル未入力）';
  const companyLabel = companyLabelOf(companyDisplayName(company), trimmed(company?.kind));
  const techGroups = buildTechGroups(item.tech);
  const duties = trimmed(item.duties);
  const acquired = trimmed(item.acquired);
  const comment = trimmed(item.comment);
  const fitsOnePage =
    estimateProjectCardHeight({ title, companyLabel, metaRows, techGroups, duties, acquired, comment }) <=
    PRINT_SIZE.cardMaxSinglePageHeight;

  return {
    id: item.id,
    title,
    companyName: companyDisplayName(company),
    companyLabel,
    periodText: formatPeriodDisplay(item.period),
    compactPeriodText: compactPeriod(item.period),
    durationText: trimmed(item.duration) || deriveDuration(item.period),
    team: trimmed(item.team),
    metaRows,
    techGroups,
    duties,
    acquired,
    comment,
    compactNote: firstSentence(item.summary || item.duties || item.comment),
    level,
    fitsOnePage,
  };
}

/** 会社の実効 period 文字列。`buildCompany` の periodText と同じ導出だが、表示整形前の生値。 */
function companyRawPeriod(company: CompanyInfo | undefined, items: ProjectItem[]): string {
  return trimmed(company?.period) || deriveCompanyPeriod(items.map((i) => i.period));
}

/**
 * 「最新の会社」の index を判定する。
 *
 * 以前は配列の先頭（`index === 0`）を最新として扱っていたが、`groupProjectsByCompany` の
 * 順序は「エディタでの会社の並び順」であって期間の新しさではない
 * （group-by-company.ts のコメント: 「companies 順を正とし」）。エディタで会社の並びを
 * 変えると、期間上は最新でない会社に塗り帯が付いたままになる欠陥だった（レビュー指摘）。
 * 期間の終了年月（`parsePeriodBounds` — 「現在」は実行時点扱い）が最大の会社を選ぶ。
 * 同着は開始が遅い方を優先し、それも同着なら先に見つかった方（配列順）を保つ。
 * 期間を解釈できない会社は最新候補にしない。
 */
function resolveLatestIndex(groups: { company: CompanyInfo | undefined; items: ProjectItem[] }[]): number {
  let latest = -1;
  let latestEnd = -Infinity;
  let latestStart = -Infinity;
  groups.forEach((g, index) => {
    const bounds = parsePeriodBounds(companyRawPeriod(g.company, g.items));
    if (!bounds) return;
    if (bounds.end > latestEnd || (bounds.end === latestEnd && bounds.start > latestStart)) {
      latest = index;
      latestEnd = bounds.end;
      latestStart = bounds.start;
    }
  });
  return latest;
}

function buildCompany(
  company: CompanyInfo | undefined,
  fallbackId: string,
  items: ProjectItem[],
  levelById: Map<string, DetailLevel>,
  isLatest: boolean,
): PrintCompany {
  // 役割名自体が `・` を含む（例: バックエンドリード・インフラエンジニア）ため、
  // 区切りは読点にする。中黒で繋ぐと 1 つの役割名に見えて読めない。
  //
  // 案件の `role` は 1 件に複数の役割が入ることがある（例: `フルスタックエンジニア / EM`）。
  // 文字列のまま重複を除くと、`フルスタックエンジニア` と
  // `フルスタックエンジニア / EM` が別物として残り、会社の行に同じ役割が 2 回並ぶ
  // （実測: 2 ページ目「フルスタックエンジニア、フルスタックエンジニア / エンジニアリング
  // マネージャー」）。役割 1 つずつに割ってから重複を除く。
  // 割るのは列挙に使われる区切りだけで、役割名の一部である `・` は割らない。
  const roles = [
    ...new Set(
      items.flatMap((i) =>
        trimmed(i.role)
          .split(/\s*[/,、]\s*/)
          .map(trimmed)
          .filter(Boolean),
      ),
    ),
  ].join('、');
  const sizes = items.map((i) => parseTeamSize(i.team)).filter((n): n is number => n !== null);
  const min = sizes.length > 0 ? Math.min(...sizes) : null;
  const max = sizes.length > 0 ? Math.max(...sizes) : null;
  const teamRange = min === null || max === null ? '' : min === max ? `${min} 名` : `${min}〜${max} 名`;

  return {
    id: company?.id ?? fallbackId,
    name: companyDisplayName(company),
    kind: companyDisplayName(company).includes(trimmed(company?.kind)) ? '' : trimmed(company?.kind),
    kindLabel: companyDisplayName(company).includes(trimmed(company?.kind)) ? '' : trimmed(company?.kind),
    periodText:
      formatPeriodDisplay(trimmed(company?.period)) ||
      formatPeriodDisplay(deriveCompanyPeriod(items.map((i) => i.period))),
    note: trimmed(company?.note),
    projectCount: items.length,
    roles,
    teamRange,
    isLatest,
    projects: items.map((item) => buildProject(item, company, levelById.get(item.id) ?? 'compact')),
  };
}

function buildSummary(
  sheetTitle: string,
  profile: ProfileBlockData | undefined,
  stats: StatsBlockData | undefined,
  skillGroups: PrintSkillGroup[],
  items: ProjectItem[],
): PrintSummary {
  const allProfileRows: PrintMetaRow[] = [];
  if (trimmed(profile?.company)) allProfileRows.push({ label: '所属', value: trimmed(profile?.company) });
  for (const [key, value] of orderedProfileMetaEntries(profile?.meta)) {
    allProfileRows.push({ label: resolveProfileMetaLabel(key), value: trimmed(value) });
  }
  const profileRows = allProfileRows.filter((row) => row.value.length <= PROFILE_SHORT_VALUE_CHARS);
  const expertiseRows = allProfileRows.filter((row) => row.value.length > PROFILE_SHORT_VALUE_CHARS);

  // 主力スタックは経験年数の降順。同年数のときはスキル一覧に並んでいる順を保つ。
  const flatSkills = skillGroups.flatMap((g, gi) => g.skills.map((s, si) => ({ ...s, order: gi * 1000 + si })));
  const topSkills = flatSkills
    .filter((s) => trimmed(s.name))
    .sort((a, b) => b.years - a.years || a.order - b.order)
    .slice(0, PRINT_TOP_SKILL_LIMIT)
    .map((s) => ({
      // 年数を出すかどうかは skillYearsLabel が既に判定済み（分類許可リスト + スキル
      // ビュートグル）。ここでは組み立てるだけで、判定をこの部品側で繰り返さない。
      label: s.yearsLabel ? `${s.name} ${s.yearsLabel}` : s.name,
      emphasis: chipEmphasis(s.level),
    }));

  // 対応可能工程は全案件の和union。1 件でも担当していれば「対応できる」と読む。
  const done = new Array(PROCESS_LABELS.length).fill(false) as boolean[];
  for (const item of items) {
    const normalized = normalizeProcess(item.process ?? []);
    normalized.done.forEach((v, i) => {
      if (v) done[i] = true;
    });
  }

  return {
    sheetTitle,
    name: trimmed(profile?.name),
    title: trimmed(profile?.title),
    companyName: trimmed(profile?.company),
    // 3 つとも空の枠は出さない。エディタは空の統計項目を許すので、そのまま描くと
    // 1 ページ目に中身の無いセルが 1 つ増え、残りのセルが痩せる（レビュー指摘）。
    stats: (stats?.items ?? [])
      .map((i) => ({ value: trimmed(i.value), unit: trimmed(i.unit), label: trimmed(i.label) }))
      .filter((i) => i.value !== '' || i.unit !== '' || i.label !== ''),
    topSkills,
    processLabels: PROCESS_LABELS.filter((_, i) => done[i]),
    profileRows,
    expertiseRows,
    pr: stripDecorativeHeading(trimmed(profile?.pr)),
  };
}

/**
 * ブロック配列から印刷用ビューモデルを組み立てる。
 *
 * `views` は画面のビュートグルの状態。未指定は全 ON（画面側 `isViewOn` と同じ既定）。
 */
export function buildPrintViewModel(
  sheetTitle: string,
  blocks: Block[],
  views: PrintViewKey[] = ALL_VIEWS,
): PrintViewModel {
  const on = (key: PrintViewKey) => views.includes(key);

  const profile = blocks.find((b): b is Extract<Block, { type: 'profile' }> => b.type === 'profile')?.data;
  const stats = blocks.find((b): b is Extract<Block, { type: 'stats' }> => b.type === 'stats')?.data;
  const skillGroups: PrintSkillGroup[] = blocks
    .filter((b): b is Extract<Block, { type: 'skills' }> => b.type === 'skills')
    .map((b) => {
      const category = trimmed(b.data.category);
      return {
        category,
        skills: (b.data.skills ?? [])
          .filter((s) => trimmed(s.name))
          .map((s) => ({
            name: trimmed(s.name),
            years: s.years,
            level: trimmed(s.level),
            yearsLabel: skillYearsLabel(category, s.years, on('skills')),
          })),
      };
    })
    .filter((g) => g.skills.length > 0);

  const projectBlock = blocks.find((b): b is Extract<Block, { type: 'project' }> => b.type === 'project')?.data;
  const visible = projectBlock ? filterVisibleProjectData(projectBlock) : { companies: [], items: [] };
  const { levelById } = resolveDetailLevels(visible.items);
  const groups = groupProjectsByCompany(visible.companies, visible.items).filter((g) => g.items.length > 0);
  const latestIndex = resolveLatestIndex(groups);
  const companies = groups.map((g, index) =>
    buildCompany(g.company, g.companyId, g.items, levelById, index === latestIndex),
  );

  return {
    summary: buildSummary(sheetTitle, profile, stats, skillGroups, visible.items),
    skillGroups,
    companies,
    showProjects: on('projects'),
    showSkills: on('skills'),
    showProcess: on('process'),
  };
}

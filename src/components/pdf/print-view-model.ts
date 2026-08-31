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
import { resolveCompanyPeriod, resolveDisplayedSkillExperience, resolveDisplayedStats } from '@/db/derived-display';
import { companyDisplayName, groupProjectsByCompany } from '@/db/group-by-company';
import {
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
import { sanitizeHtml, sanitizeMarkdown } from '@/db/sanitize-html';
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
  /**
   * 書類全体での案件の通し番号（1 始まり、会社セクションの並び順のまま上から連番）。
   *
   * DB には番号のフィールドが無い（PDF のために型を足さない方針）。並び順そのものが
   * 番号なので、ビューモデルを組み立てるこの 1 箇所で採番して描画側へ渡す。
   * 描画側で数え直すと、会社をまたいだ通し番号が会社ごとの 1 始まりに戻る。
   */
  index: number;
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
  /** 詳細版カードの「業務内容」ブロックの本文。未入力なら要約（`ProjectItem.summary`）で補う。 */
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
  /**
   * 詳細版カード 1 枚の見積り高さ（pt）。会社見出しが「最初のカードごと」次ページへ
   * 送られるべきかの判定に使う（print-document.tsx の CompanySection）。
   */
  estimatedHeight: number;
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
  /**
   * 得意分野（`profile.strengths`）。画面の ProfileIntro は出しているのに、以前はここで
   * 読んでおらず PDF からだけ丸ごと消えていた。
   */
  strengths: string[];
  /** 自己紹介本文。 */
  pr: string;
}

export interface PrintViewModel {
  summary: PrintSummary;
  skillGroups: PrintSkillGroup[];
  companies: PrintCompany[];
  /**
   * 案件セクションを出すか。
   *
   * `timeline` も同じ扱いにする。PDF に時系列の専用セクションは無く、案件が年月の降順で
   * 並ぶこと自体が画面の Timeline に当たる。ここで `timeline` を無視すると、画面では
   * 時系列が出ている状態で PDF だけがサマリ 1 枚になり、トグルが黙って捨てられる。
   */
  showProjects: boolean;
  /** スキル一覧を出すか（ビュートグル `skills`）。 */
  showSkills: boolean;
  /** 工程を出すか（ビュートグル `process`）。 */
  showProcess: boolean;
}

const ALL_VIEWS: PrintViewKey[] = ['skills', 'process', 'projects', 'timeline'];

// --- 小さなヘルパー -------------------------------------------------------

/**
 * PDF に載せるプレーンテキストの唯一の入口。
 *
 * 画面は sanitizeHtml、レガシー PDF は escapeCell で生タグを落としている。この経路だけが
 * 素通しだと、`<script>社外秘</script>API` のように「どの表示経路でも隠れている中身」が
 * ダウンロードした PDF にだけ literal で出る。ここでタグごと落とす。
 */
function trimmed(value: string | undefined): string {
  return typeof value === 'string' ? sanitizeHtml(value).trim() : '';
}

/**
 * markdown として描くフィールド（業務内容 / 習得スキル・実績 / コメント / 自己紹介）用。
 * `<details>` のような画面で許容済みのタグは残し、script/style だけ中身ごと落とす。
 */
function markdownText(value: string | undefined): string {
  return typeof value === 'string' ? sanitizeMarkdown(value).trim() : '';
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

/** 画面用の年月ラベルを、PDF内で使っている空白入りの表記へ揃える。 */
function printExperienceLabel(label: string): string {
  const match = label.match(/^(\d+)年(?:(\d+)ヶ月)?$/);
  if (!match) return label;
  return match[2] === undefined ? `${match[1]} 年` : `${match[1]} 年 ${match[2]} ヶ月`;
}

/**
 * 「N 名」「N 人」「3〜8 名」から人数を取り出す。範囲表示のためだけに使い、表示自体は原文を保つ。
 *
 * 先頭の 1 つだけを読むと、`3〜8名` を持つ案件が会社の集計で `3 名` に潰れ、上限が実際より
 * 小さく出る。数字を全部拾って両端を返す。取れなければ空配列（原文をそのまま出す判断に落とす）。
 */
function parseTeamSizes(team: string): number[] {
  return (trimmed(team).match(/\d+/g) ?? []).map(Number);
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
 * ページ跨ぎの継続見出し（「A 社（つづき）　案件名（続き）」）を **1 行に収める**。
 *
 * この見出しは Page 直下の絶対配置（`position:absolute`, top 16pt）で描いており、
 * 本文の流れに高さとして寄与しない。本文が始まるのはページ余白 `padTop` = 42pt からで、
 * 見出しに使えるのは実質 26pt（11pt × 行間 1.55 ≒ 17pt の 1 行ぶん）しかない。
 * 会社名と案件名が両方長いと見出しが 2 行に折り返し、2 行目が本文 1 行目の上に
 * そのまま重なる（実測: p4「Q 社（…）（つづき）　動画配信サービスの…（Web）（続き）」の
 * 2 行目が習得スキルの箇条書きに罫線ごと重なっていた）。
 *
 * 落とす順番は「読み手にとっての必要度が低い方から」。会社名は直前のページで必ず見えて
 * いるが、案件名は跨いだ先で初めて必要になるので、**会社名を先に捨てて案件名を残す**。
 * それでも収まらないときだけ案件名を末尾から詰める。
 */
export function fitContinuationHeading(companyLabel: string | undefined, projectLabel: string | undefined): string {
  const company = (companyLabel ?? '').trim();
  const project = (projectLabel ?? '').trim();
  if (!company && !project) return '';
  // 見積り幅は概算（全角 1em / 半角 0.55em）で、実フォントの太字はこれよりやや広い。
  // 折り返しは即座に本文への重なりになるので、9 割で切って安全側に倒す。
  const budget = PRINT_SIZE.contentWidth * 0.9;
  const fontSize = PRINT_TYPE.meta.fontSize;
  const fits = (text: string) => estimateTextWidth(text, fontSize) <= budget;

  const projectPart = project ? `${project}（続き）` : '';
  const companyPart = company ? `${company}（つづき）` : '';
  const both = projectPart && companyPart ? `${companyPart}　${projectPart}` : projectPart || companyPart;
  if (fits(both)) return both;
  // 会社名を落として案件名だけにする。
  if (projectPart && fits(projectPart)) return projectPart;
  return truncateToWidth(projectPart || companyPart, budget, fontSize);
}

/** 末尾を `…` に置き換えて見積り幅へ収める。1 文字も入らない場合でも空文字は返さない。 */
function truncateToWidth(text: string, budgetPt: number, fontSizePt: number): string {
  const chars = [...text];
  const ellipsisWidth = estimateTextWidth('…', fontSizePt);
  let width = 0;
  const kept: string[] = [];
  for (const ch of chars) {
    const next = width + estimateTextWidth(ch, fontSizePt);
    if (next + ellipsisWidth > budgetPt) break;
    kept.push(ch);
    width = next;
  }
  return kept.length === 0 ? '…' : `${kept.join('')}…`;
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
 * **すべて枠線チップにする。塗り（強調）は使わない。**
 * かつては各分類の配列先頭 1 個を「主役技術」とみなして塗っていたが、DB に主役の
 * フラグは無く、配列順が重要度順である保証もない。結果として本人にも説明できない
 * 強調が紙面に出ていた（オーナー指摘: 「製作者の私が意味が分かってなくて青色に
 * なっていたら答えられない」）。読み手に問われて答えられない強調は情報ではなく飾りなので、
 * 根拠のある強調（1 ページ目の主力スタックは習熟度が上級のものを塗る）だけを残す。
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
      chips: all.map((label) => ({ label, emphasis: 'outline' as const })),
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

  // メタ表: 2 列。各行の値は半ページ幅の列で折り返すので、行ごとに折り返し行数を数える。
  // 1 行固定で数えると、担当工程や役割が長い案件で見積りが実際より低く出て fitsOnePage が
  // 誤って true になり、1 ページを超えるカードごと wrap={false} になる（圧縮・重なりの原因）。
  if (fields.metaRows.length > 0) {
    const metaLineHeight = PRINT_TYPE.meta.fontSize * PRINT_TYPE.meta.lineHeight;
    const metaValueWidth = CARD_CONTENT_WIDTH / 2 - PRINT_SIZE.labelColMeta - PRINT_SIZE.metaRowPadHorizontal * 2;
    const rowHeights = fields.metaRows.map(
      (row) =>
        PRINT_SIZE.metaRowPadVertical * 2 +
        estimateWrappedLines(row.value, metaValueWidth, PRINT_TYPE.meta.fontSize) * metaLineHeight,
    );
    // 2 列に上から詰めるので、列ごとの合計の大きい方がメタ表の高さになる。
    const half = Math.ceil(rowHeights.length / 2);
    const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
    height += Math.max(sum(rowHeights.slice(0, half)), sum(rowHeights.slice(half)));
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

/**
 * 役割名を 1 つずつに割って重複を除き、読点で繋ぎ直す。
 *
 * 1 つの `role` に複数の役割が入ることがあり（例: `PL, PL` や
 * `フルスタックエンジニア / エンジニアリングマネージャー`）、文字列のまま扱うと
 * 同じ役割が 2 回並ぶ（実測: 案件カードの「役割：PL, PL」、会社行の
 * 「フルスタックエンジニア、フルスタックエンジニア / エンジニアリングマネージャー」）。
 *
 * 繋ぎ直しに読点を使うのは、役割名自体が `・` を含むため
 * （例: バックエンドリード・インフラエンジニア）。中黒で繋ぐと 1 つの役割名に見えて読めない。
 * 割るのは列挙に使われる区切りだけで、役割名の一部である `・` は割らない。
 */
export function dedupeRoles(...roles: (string | undefined)[]): string {
  return [
    ...new Set(
      roles.flatMap((role) =>
        trimmed(role)
          .split(/\s*[/,、]\s*/)
          .map((part) => trimmed(part))
          .filter(Boolean),
      ),
    ),
  ].join('、');
}

function buildProject(
  item: ProjectItem,
  company: CompanyInfo | undefined,
  level: DetailLevel,
  index: number,
): PrintProject {
  const area = resolveProjectArea(item.scope, item.tech);
  const processText = formatProcessForPrint(item.process ?? []);
  const metaRows: PrintMetaRow[] = [];
  const roleText = dedupeRoles(item.role);
  if (roleText) metaRows.push({ label: '役割', value: roleText });
  // 導出値は「技術領域」、本人の言葉（scope）は「担当領域」。この区別を崩さない。
  if (trimmed(area.text)) metaRows.push({ label: area.derived ? '技術領域' : '担当領域', value: trimmed(area.text) });
  if (trimmed(item.team)) metaRows.push({ label: 'チーム', value: trimmed(item.team) });
  if (processText) metaRows.push({ label: '担当工程', value: processText });

  const title = trimmed(item.title) || '（タイトル未入力）';
  const companyLabel = companyLabelOf(companyDisplayName(company), trimmed(company?.kind));
  const techGroups = buildTechGroups(item.tech);
  // ビューア（project-card.tsx:55 `item.summary?.trim() || item.duties`）と同じ優先順位。
  // PrintProject には duties 専用フィールドしか無く、要約だけ入力して担当業務を空にした
  // 案件（詳細版カード）は 業務内容 ブロックが 1 つも出ない静かなデータ欠落だった
  // （no-abbreviated-rendering skill 違反）。表示名は duties のままにし、ここで解決済みの
  // 値を詰める — 呼び出し側（ProjectCardDetail 等）に判断を分散させない。
  const duties = markdownText(item.summary) || markdownText(item.duties);
  const acquired = markdownText(item.acquired);
  const comment = markdownText(item.comment);
  const estimatedHeight = estimateProjectCardHeight({
    title,
    companyLabel,
    metaRows,
    techGroups,
    duties,
    acquired,
    comment,
  });
  const fitsOnePage = estimatedHeight <= PRINT_SIZE.cardMaxSinglePageHeight;

  return {
    id: item.id,
    index,
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
    compactNote: firstSentence(duties || comment),
    level,
    fitsOnePage,
    estimatedHeight,
  };
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
    const bounds = parsePeriodBounds(resolveCompanyPeriod(g.company, g.items));
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
  /** この会社の先頭案件に振る通し番号。会社をまたいで連番になるよう呼び出し側が積み上げる。 */
  startIndex: number,
): PrintCompany {
  const roles = dedupeRoles(...items.map((i) => i.role));
  const sizes = items.flatMap((i) => parseTeamSizes(i.team));
  const min = sizes.length > 0 ? Math.min(...sizes) : null;
  const max = sizes.length > 0 ? Math.max(...sizes) : null;
  const teamRange = min === null || max === null ? '' : min === max ? `${min} 名` : `${min}〜${max} 名`;

  return {
    id: company?.id ?? fallbackId,
    name: companyDisplayName(company),
    kind: companyDisplayName(company).includes(trimmed(company?.kind)) ? '' : trimmed(company?.kind),
    kindLabel: companyDisplayName(company).includes(trimmed(company?.kind)) ? '' : trimmed(company?.kind),
    periodText: formatPeriodDisplay(resolveCompanyPeriod(company, items)),
    note: markdownText(company?.note),
    projectCount: items.length,
    roles,
    teamRange,
    isLatest,
    projects: items.map((item, i) => buildProject(item, company, levelById.get(item.id) ?? 'compact', startIndex + i)),
  };
}

function buildSummary(
  sheetTitle: string,
  profile: ProfileBlockData | undefined,
  stats: StatsBlockData | undefined,
  skillGroups: PrintSkillGroup[],
  items: ProjectItem[],
  showSkills: boolean,
  referenceMonth?: number,
  hasProjectSource = true,
): PrintSummary {
  const allProfileRows: PrintMetaRow[] = [];
  if (trimmed(profile?.company)) allProfileRows.push({ label: '所属', value: trimmed(profile?.company) });
  for (const [key, value] of orderedProfileMetaEntries(profile?.meta)) {
    allProfileRows.push({ label: resolveProfileMetaLabel(key), value: trimmed(value) });
  }
  const profileRows = allProfileRows.filter((row) => row.value.length <= PROFILE_SHORT_VALUE_CHARS);
  const expertiseRows = allProfileRows.filter((row) => row.value.length > PROFILE_SHORT_VALUE_CHARS);

  // 主力スタックは経験年数の降順。同年数のときはスキル一覧に並んでいる順を保つ。
  //
  // スキルのビュートグルが OFF のときはここも空にする。以前は showSkills を一切見ずに
  // 組み立てており、スキル一覧「ページ」は消えても 1 ページ目の主力スタック見出し＋
  // チップだけが残っていた（スキル情報を隠したのに 1 ページ目には出る、という
  // トグルの約束破り）。
  const flatSkills = showSkills
    ? skillGroups.flatMap((g, gi) => g.skills.map((s, si) => ({ ...s, order: gi * 1000 + si })))
    : [];
  const topSkills = flatSkills
    .filter((s) => trimmed(s.name))
    .sort((a, b) => b.years - a.years || a.order - b.order)
    .slice(0, PRINT_TOP_SKILL_LIMIT)
    .map((s) => ({
      // 年数を出すかどうかはビューモデル組み立て時に判定済み（分類許可リスト + スキル
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
    stats: resolveDisplayedStats(stats?.items ?? [], hasProjectSource ? items : undefined, referenceMonth)
      .map((i) => ({ value: trimmed(i.value), unit: trimmed(i.unit), label: trimmed(i.label) }))
      .filter((i) => i.value !== '' || i.unit !== '' || i.label !== ''),
    topSkills,
    processLabels: PROCESS_LABELS.filter((_, i) => done[i]),
    profileRows,
    expertiseRows,
    strengths: (profile?.strengths ?? []).map(trimmed).filter(Boolean),
    pr: stripDecorativeHeading(markdownText(profile?.pr)),
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
  referenceMonth?: number,
): PrintViewModel {
  const on = (key: PrintViewKey) => views.includes(key);

  const profile = blocks.find((b): b is Extract<Block, { type: 'profile' }> => b.type === 'profile')?.data;
  const stats = blocks.find((b): b is Extract<Block, { type: 'stats' }> => b.type === 'stats')?.data;
  const projectBlock = blocks.find((b): b is Extract<Block, { type: 'project' }> => b.type === 'project')?.data;
  const visible = projectBlock ? filterVisibleProjectData(projectBlock) : { companies: [], items: [] };
  const skillGroups: PrintSkillGroup[] = blocks
    .filter((b): b is Extract<Block, { type: 'skills' }> => b.type === 'skills')
    .map((b) => {
      const category = trimmed(b.data.category);
      return {
        category,
        skills: (b.data.skills ?? [])
          .filter((s) => trimmed(s.name))
          .map((s) => {
            const experience = resolveDisplayedSkillExperience(s, visible.items, referenceMonth);
            return {
              name: trimmed(s.name),
              years: experience.months / 12,
              level: trimmed(s.level),
              yearsLabel:
                on('skills') && PRINT_YEAR_VISIBLE_CATEGORIES.has(category)
                  ? printExperienceLabel(experience.label)
                  : '',
            };
          }),
      };
    })
    .filter((g) => g.skills.length > 0);

  const { levelById } = resolveDetailLevels(visible.items);
  const groups = groupProjectsByCompany(visible.companies, visible.items).filter((g) => g.items.length > 0);
  const latestIndex = resolveLatestIndex(groups);
  // 案件の通し番号は会社をまたいで連番にする（会社ごとに 1 に戻さない）。
  let nextProjectIndex = 1;
  const companies = groups.map((g, index) => {
    const company = buildCompany(g.company, g.companyId, g.items, levelById, index === latestIndex, nextProjectIndex);
    nextProjectIndex += company.projects.length;
    return company;
  });

  return {
    summary: buildSummary(
      sheetTitle,
      profile,
      stats,
      skillGroups,
      visible.items,
      on('skills'),
      referenceMonth,
      projectBlock !== undefined,
    ),
    skillGroups,
    companies,
    showProjects: on('projects') || on('timeline'),
    showSkills: on('skills'),
    showProcess: on('process'),
  };
}

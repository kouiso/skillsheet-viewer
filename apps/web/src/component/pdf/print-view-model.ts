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

import type {
  Block,
  CompanyInfo,
  ProfileBlockData,
  ProjectItem,
  ProjectTech,
  StatsBlockData,
} from '@skillsheet/db/blocks';
import { filterVisibleProjectData, orderedProfileMetaEntries, resolveProfileMetaLabel } from '@skillsheet/db/blocks';
import { companyDisplayName, groupProjectsByCompany } from '@skillsheet/db/group-by-company';
import {
  deriveCompanyPeriod,
  deriveDuration,
  flattenTech,
  formatMonthToken,
  formatPeriodDisplay,
  normalizeProcess,
  PROCESS_LABELS,
  splitPeriodRange,
  TECH_BUCKET_ORDER,
} from '@skillsheet/db/process';
import type { DetailLevel } from '@skillsheet/db/project-detail-level';
import { resolveDetailLevels } from '@skillsheet/db/project-detail-level';
import { resolveProjectArea } from '@skillsheet/db/tech-area';

import { PRINT_CHIP_LIMIT, PRINT_TECH_LABEL, PRINT_TOP_SKILL_LIMIT } from './print-tokens';

/** 画面側のビュートグルと同じキー。PDF もこの ON/OFF に従う。 */
export type PrintViewKey = 'skills' | 'process' | 'projects' | 'timeline';

/** チップ 1 個。塗り（その分類の主役）と枠線（それ以外）の 2 種だけ。 */
export interface PrintChip {
  label: string;
  emphasis: 'solid' | 'outline';
}

/** 技術スタックの 1 分類（ラベル + チップ + 畳んだ件数）。 */
export interface PrintTechGroup {
  label: string;
  chips: PrintChip[];
  /** PRINT_CHIP_LIMIT を超えて「他 N 件」に畳んだ数。0 なら表示しない。 */
  overflowCount: number;
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
  /** 簡約版の 1 行に出す代表技術（先頭 5 個をカンマ区切り）。 */
  compactTech: string;
  /** 簡約版の 1 行に出す一言（duties → comment の順で先頭 1 文）。 */
  compactNote: string;
  level: DetailLevel;
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
  years: number;
  level: string;
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
 * PRINT_CHIP_LIMIT を超えた分は「他 N 件」に畳む（30 個並べるとスキャンできない）。
 */
export function buildTechGroups(tech: ProjectTech | undefined): PrintTechGroup[] {
  if (!tech) return [];
  const groups: PrintTechGroup[] = [];
  for (const key of TECH_BUCKET_ORDER) {
    const all = flattenTech({ ...emptyTech(), [key]: tech[key] ?? [] });
    if (all.length === 0) continue;
    const shown = all.slice(0, PRINT_CHIP_LIMIT);
    groups.push({
      label: PRINT_TECH_LABEL[key],
      chips: shown.map((label, i) => ({ label, emphasis: i === 0 ? 'solid' : 'outline' })),
      overflowCount: all.length - shown.length,
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

function buildProject(item: ProjectItem, company: CompanyInfo | undefined, level: DetailLevel): PrintProject {
  const area = resolveProjectArea(item.scope, item.tech);
  const processText = formatProcessForPrint(item.process ?? []);
  const metaRows: PrintMetaRow[] = [];
  if (trimmed(item.role)) metaRows.push({ label: '役割', value: trimmed(item.role) });
  // 導出値は「技術領域」、本人の言葉（scope）は「担当領域」。この区別を崩さない。
  if (trimmed(area.text)) metaRows.push({ label: area.derived ? '技術領域' : '担当領域', value: trimmed(area.text) });
  if (trimmed(item.team)) metaRows.push({ label: 'チーム', value: trimmed(item.team) });
  if (processText) metaRows.push({ label: '担当工程', value: processText });

  const allTech = flattenTech(item.tech);
  return {
    id: item.id,
    title: trimmed(item.title) || '（タイトル未入力）',
    companyName: companyDisplayName(company),
    companyLabel: companyLabelOf(companyDisplayName(company), trimmed(company?.kind)),
    periodText: formatPeriodDisplay(item.period),
    compactPeriodText: compactPeriod(item.period),
    durationText: trimmed(item.duration) || deriveDuration(item.period),
    team: trimmed(item.team),
    metaRows,
    techGroups: buildTechGroups(item.tech),
    duties: trimmed(item.duties),
    acquired: trimmed(item.acquired),
    comment: trimmed(item.comment),
    compactTech: allTech.slice(0, 5).join(', '),
    compactNote: firstSentence(item.summary || item.duties || item.comment),
    level,
  };
}

function buildCompany(
  company: CompanyInfo | undefined,
  fallbackId: string,
  items: ProjectItem[],
  levelById: Map<string, DetailLevel>,
  isLatest: boolean,
): PrintCompany {
  // 役割名自体が `・` や ` / ` を含む（例: バックエンドリード・インフラエンジニア）ため、
  // 区切りは読点にする。中黒で繋ぐと 1 つの役割名に見えて読めない。
  const roles = [...new Set(items.map((i) => trimmed(i.role)).filter(Boolean))].join('、');
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
      label: s.years > 0 ? `${s.name} ${s.years} 年` : s.name,
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
    .map((b) => ({
      category: trimmed(b.data.category),
      skills: (b.data.skills ?? [])
        .filter((s) => trimmed(s.name))
        .map((s) => ({ name: trimmed(s.name), years: s.years, level: trimmed(s.level) })),
    }))
    .filter((g) => g.skills.length > 0);

  const projectBlock = blocks.find((b): b is Extract<Block, { type: 'project' }> => b.type === 'project')?.data;
  const visible = projectBlock ? filterVisibleProjectData(projectBlock) : { companies: [], items: [] };
  const { levelById } = resolveDetailLevels(visible.items);
  const groups = groupProjectsByCompany(visible.companies, visible.items);
  const companies = groups
    .filter((g) => g.items.length > 0)
    .map((g, index) => buildCompany(g.company, g.companyId, g.items, levelById, index === 0));

  return {
    summary: buildSummary(sheetTitle, profile, stats, skillGroups, visible.items),
    skillGroups,
    companies,
    showProjects: on('projects'),
    showSkills: on('skills'),
    showProcess: on('process'),
  };
}

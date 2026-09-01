/**
 * ブロック種別ごとの markdown 変換（`*ToMarkdown`）。
 * table は保存・描画時に GFM markdown 表へ変換するため、web(react-markdown+remark-gfm) も
 * PDF(mdast→@react-pdf) も既存の描画パイプラインをそのまま再利用できる。
 */

import { flattenTech, formatMonthToken, formatPeriodDisplay, normalizeProcess, PROCESS_LABELS } from '../process';
import { sanitizeMarkdown } from '../sanitize-html';
// tech-area.ts はこのファイルから型のみを取り込むため、実行時の循環は発生しない。
import { resolveProjectArea } from '../tech-area';
import { collapseSoftBreaks } from '../text';
import type {
  Block,
  ExperienceBlockData,
  ProfileBlockData,
  ProjectBlockData,
  SkillsBlockData,
  StatsBlockData,
  TableBlockData,
} from './index';
import { orderedProfileMetaEntries, resolveProfileMetaLabel } from './index';
import { ALIGN_MARKER, asInlineMarkdown, escapeCell, escapeMarkdownParagraph } from './markdown-escape';

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
  const hasFeatured = data.skills.some((skill) => skill.featured === true);
  const headerLine = hasFeatured ? '| スキル | 経験年数 | 習熟度 | 推し |' : '| スキル | 経験年数 | 習熟度 |';
  const alignLine = hasFeatured ? '| :--- | :---: | :--- | :---: |' : '| :--- | :---: | :--- |';
  const bodyLines = data.skills.map((s) => {
    const values = [escapeCell(s.name), s.years > 0 ? `${s.years}年` : '-', escapeCell(s.level)];
    if (hasFeatured) values.push(s.featured ? '✓' : '');
    return `| ${values.join(' | ')} |`;
  });
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
    // 導出値は行名を「技術領域」にする。「この技術を使った」までしか根拠が無いため。
    // 取り込んだ scope は本人の言葉なので「担当領域」で出す（tech-area.ts 参照）。
    const area = resolveProjectArea(item.scope, item.tech);
    if (area.text) lines.push(`| ${area.derived ? '技術領域' : '担当領域'} | ${escapeCell(area.text)} |`);
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
      lines.push(asInlineMarkdown(collapseSoftBreaks(item.duties.trim())));
    }
    if (item.acquired.trim()) {
      lines.push('');
      lines.push('**習得スキル・実績**');
      lines.push('');
      lines.push(asInlineMarkdown(collapseSoftBreaks(item.acquired.trim())));
    }
    // 案件コメント（ProjectItem.comment）。案件1件あたり数百文字の本文で、
    // 画面では InlineMarkdown で描画されているのに PDF には出力先が無く、
    // 最も情報量の多い文章が丸ごと欠落していた（#242）。
    if (item.comment?.trim()) {
      lines.push('');
      lines.push(asInlineMarkdown(collapseSoftBreaks(item.comment.trim())));
    }
    lines.push('');
  }
  return lines.join('\n');
}

export function blockToMarkdown(block: Block): string {
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

import { PRINT_SIZE, PRINT_TYPE } from './print-token';

/** 半角相当とみなす文字（ASCII 全般・半角カナ）か。それ以外は全角として扱う。 */
function isHalfWidthChar(codePoint: number): boolean {
  return codePoint <= 0xff || (codePoint >= 0xff61 && codePoint <= 0xffdc);
}

/** 文字列の概算幅（pt）。全角 1em・半角 0.55em として積み上げる（継続見出しを 1 行に収める判定用）。 */
function estimateTextWidth(text: string, fontSizePt: number): number {
  let width = 0;
  for (const ch of text) {
    const isHalf = isHalfWidthChar(ch.codePointAt(0) ?? 0);
    width += fontSizePt * (isHalf ? 0.55 : 1);
  }
  return width;
}

/**
 * 継続見出しの 1 片。tone が色と太さを決める（デザイン 1e の 3 トーン）。
 * - `company`: 会社名（accent / 700）
 * - `separator` / `mark`: 「／」と「（続き）」（label 色 / 400）
 * - `project`: 案件名（text 色 / 400）
 */
export interface ContinuationHeadingPart {
  text: string;
  tone: 'company' | 'separator' | 'project' | 'mark';
}

/** 案件が続くときの印。会社だけが続くときの印（`COMPANY_CONTINUATION_MARK`）と字を分け、案件カードの続きかを機械が見分けられるようにする。 */
export const PROJECT_CONTINUATION_MARK = '（続き）';
export const COMPANY_CONTINUATION_MARK = '（つづき）';

/**
 * ページ跨ぎの継続見出し（デザイン 1e の「Q 社 ／ 案件名 （続き）」）を **1 行に収める**。
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
 *
 * 会社だけが続くとき（案件カードの途中ではない）は「Q 社 （つづき）」。案件が続くときの
 * 「（続き）」とは字を分ける（print-quality.ts の `continuesPreviousCard` が案件側の字だけを探す）。
 */
export function fitContinuationHeadingParts(
  companyLabel: string | undefined,
  projectLabel: string | undefined,
): ContinuationHeadingPart[] {
  const company = (companyLabel ?? '').trim();
  const project = (projectLabel ?? '').trim();
  if (!company && !project) return [];
  // 見積り幅は概算（全角 1em / 半角 0.55em）で、実フォントの太字はこれよりやや広い。
  // 折り返しは即座に本文への重なりになるので、9 割で切って安全側に倒す。
  const budget = PRINT_SIZE.contentWidth * 0.9;
  const fontSize = PRINT_TYPE.meta.fontSize;
  const widthOf = (parts: ContinuationHeadingPart[]) =>
    estimateTextWidth(parts.map((part) => part.text).join(''), fontSize);
  const fits = (parts: ContinuationHeadingPart[]) => widthOf(parts) <= budget;

  const projectParts: ContinuationHeadingPart[] = project
    ? [
        { text: project, tone: 'project' },
        { text: ` ${PROJECT_CONTINUATION_MARK}`, tone: 'mark' },
      ]
    : [];
  const companyParts: ContinuationHeadingPart[] = company ? [{ text: company, tone: 'company' }] : [];
  if (!project) {
    const companyOnly: ContinuationHeadingPart[] = [
      ...companyParts,
      { text: ` ${COMPANY_CONTINUATION_MARK}`, tone: 'mark' },
    ];
    if (fits(companyOnly)) return companyOnly;
    return [
      { text: truncateToWidth(companyOnly.map((part) => part.text).join(''), budget, fontSize), tone: 'company' },
    ];
  }
  const both: ContinuationHeadingPart[] = company
    ? [...companyParts, { text: ' ／ ', tone: 'separator' }, ...projectParts]
    : projectParts;
  if (fits(both)) return both;
  // 会社名を落として案件名だけにする。
  if (fits(projectParts)) return projectParts;
  return [{ text: truncateToWidth(projectParts.map((part) => part.text).join(''), budget, fontSize), tone: 'project' }];
}

/** 継続見出しの文字列（片をつなげたもの）。 */
export function fitContinuationHeading(companyLabel: string | undefined, projectLabel: string | undefined): string {
  return fitContinuationHeadingParts(companyLabel, projectLabel)
    .map((part) => part.text)
    .join('');
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

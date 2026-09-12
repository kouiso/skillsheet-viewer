import { PRINT_SIZE, PRINT_TYPE } from './print-tokens';

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

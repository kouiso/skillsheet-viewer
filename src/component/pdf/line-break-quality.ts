/**
 * 描いた PDF の改行の崩れを、行と座標だけから規則ごとに数える検査。
 *
 * #388（改行の詰め直し）で直したはずの壊れ方——右端が空いたままの途中改行、
 * 英数字の途中での分割、最終行に数文字だけ残る吊り下がり、行頭・行末の禁則違反、
 * 改行を含まない長すぎる段落、版面からのはみ出し——が、見た目でしか確認できず
 * 毎朝の検査を素通りしていた。ここでは `extractQualityPages`（pdfjs の
 * textContent）が返す行アイテムの座標だけを頼りに、規則ごとの件数と場所
 * （頁・行番号）を返す。本文の文字列は結果に含めない（公開ログに出せるように）。
 *
 * 抽出テキストには段落境界も罫線も残らないので、段落は「同じ横幅に揃った行が
 * 行送りのギャップで連なる」ものとして推定する。表のように同じ高さに複数の段
 * が並ぶ行は、アイテム間の横の空きでセグメントに割ってから列ごとに連結する。
 *
 * pdfjs は行末の空白を捨てるので、英数字で切れた境界が「空白での折り返し」か
 * 「語の途中の分割」かは座標からは区別できない。`splitLongRun` の意図的な分割
 * 点は除外し、さらに `sourceTexts`（描画元の文字列）が渡されたときは結合した
 * 連なりがそのまま元の文中にあるものだけを崩れと数える。
 *
 * 純関数だけを置く。PDF の描画も DB へのアクセスもしない。
 */
import { BREAK_AFTER, isCjk, isNoLineStart, NO_LINE_END, splitLongRun } from './font';
import { FONT_SIZE, LINE_HEIGHT, PAGE } from './layout-metric';
import type { QualityItem, QualityPage } from './print-quality';
import { DEFAULT_QUALITY_OPTIONS } from './print-quality';

export const LINE_BREAK_RULES = [
  'early-break',
  'mid-alnum-break',
  'runt-line',
  'kinsoku',
  'long-paragraph',
  'overflow',
] as const;

export type LineBreakRule = (typeof LINE_BREAK_RULES)[number];

/**
 * 「こぼれ」: 段落の最終行だけが単独で次の頁に送られる現象。
 * 中身の量でも起きるので件数を出すだけで fail 対象にしない。
 */
export type LineBreakMetric = LineBreakRule | 'page-spill';

export interface LineBreakHit {
  /** 1 始まりの頁番号。 */
  page: number;
  /** その頁の先頭から数えた 1 始まりの行番号。 */
  line: number;
}

export interface LineBreakReport {
  counts: Record<LineBreakMetric, number>;
  hits: Record<LineBreakMetric, LineBreakHit[]>;
}

export interface LineBreakCheckOptions {
  /**
   * 描画元の文字列（ブロックの本文など）。英数字で切れた境界について、
   * 「結合した連なりがそのまま元の文中にある」ものだけを語の途中の分割と数え、
   * 空白での折り返し（`tail head` の形でしか出ないもの）を除外する。
   */
  sourceTexts?: string[];
}

interface WorkLine {
  /** 1 始まりの頁番号。 */
  page: number;
  /** その頁の先頭から数えた 1 始まりの行番号。 */
  index: number;
  items: QualityItem[];
  y: number;
}

/** 行を列ごとの区切り（大きな横の空き）で割った単位。段落連結はセグメント単位で行う。 */
interface WorkSeg {
  /** 属する行。報告はこの行番号で返す。 */
  page: number;
  lineIndex: number;
  items: QualityItem[];
  text: string;
  left: number;
  right: number;
  y: number;
  /** セグメント内アイテムの最大フォントサイズ。 */
  size: number;
}

// 既存の幾何検査と同じ版面の定数を使う。
const CONTENT_LEFT = PAGE.PADDING_HORIZONTAL;
const CONTENT_RIGHT = PAGE.WIDTH - PAGE.PADDING_HORIZONTAL;
/** ページの左余白。見出し・footer・箇条書きの記号は本文枠（44）より手前の 40 から始まる。 */
const PAGE_LEFT = 40;
const OVERFLOW_RIGHT = DEFAULT_QUALITY_OPTIONS.contentRight;
const CONTENT_BOTTOM = DEFAULT_QUALITY_OPTIONS.contentBottom;
const FOOTER_RESERVE = DEFAULT_QUALITY_OPTIONS.footerReserve;
const BODY_TOP = DEFAULT_QUALITY_OPTIONS.contentTop;

/**
 * 段落としてつなぐ最小フォントサイズ。CODE（9.5pt）の行はソース行がそのまま
 * 改行されるため「段落の改行規則」の対象外。FOOTER（9pt）も同様。
 */
const PARA_MIN_SIZE = FONT_SIZE.CODE + 0.25;
const SIZE_MATCH = 0.5;
/**
 * 行送りは `size * LINE_HEIGHT`。段落間はそこに
 * `SPACING.PARAGRAPH_MARGIN_BOTTOM`（5pt）が足される。その中間に切れ目を置く。
 */
const PARAGRAPH_GAP_SLACK = 3.5;
/** 行の中でこの幅以上の横の空きがあったら、そこでセグメントを切る（≈1字分）。 */
const SEGMENT_GAP_EM = 1.0;
/** 段落の先頭行から見て、継続行の左端がこの幅まで右にずれても同じ段落とみなす
 * （箇条書きの字下げ分）。表の隣の列を拾わないための上限。 */
const CONTINUATION_INDENT = 24;
/** 「右端の余白が2字以上」: 字 = その行のフォントサイズの em。 */
const EARLY_BREAK_MIN_SLACK_CHARS = 2;
/** 改行を含まない段落の長さの上限（字）。 */
const LONG_PARAGRAPH_MAX_CHARS = 30;
/** 長すぎる段落の対象サイズの上限。見出しサイズ（H4 以上）の行は対象外。 */
const LONG_PARAGRAPH_MAX_SIZE = FONT_SIZE.H4 - 0.25;

/**
 * 行頭に来たら新しい項目（＝新しい段落）とみなす記号。箇条書きの「—」「・」や
 * 番号付きの「12.」。和文の本文がこれらの字から始まることはほぼ無い。
 */
const LIST_MARKER = /^(?:[—–‐-•·・●○◦▪◆◇※＊]|\d{1,3}[.)])/;
const ASCII_ALNUM = /^[0-9A-Za-z]$/;

function isAlnum(ch: string | undefined): boolean {
  return ch !== undefined && ASCII_ALNUM.test(ch);
}

/** 空白を除いた文字数。 */
function visibleLength(text: string): number {
  let n = 0;
  for (const ch of text) {
    if (ch !== ' ') n += 1;
  }
  return n;
}

/**
 * pdfjs の行アイテムを行単位にまとめる。ベースラインの y は 0.5pt 単位で丸め、
 * 同じ行のアイテムは x 昇順に連結する。
 */
function toWorkLines(page: QualityPage, pageNumber: number): WorkLine[] {
  const rows = new Map<number, QualityItem[]>();
  for (const item of page) {
    const key = Math.round(item.y * 2);
    const row = rows.get(key);
    if (row === undefined) {
      rows.set(key, [item]);
    } else {
      row.push(item);
    }
  }
  return [...rows.values()]
    .sort((a, b) => b[0].y - a[0].y)
    .map((items, index) => {
      const sorted = [...items].sort((a, b) => a.x - b.x);
      return { page: pageNumber, index: index + 1, items: sorted, y: sorted[0].y };
    });
}

/** 1 つの行を、セル境界のような大きな横の空きでセグメントに割る。 */
function toSegments(line: WorkLine): WorkSeg[] {
  const segs: WorkSeg[] = [];
  let items: QualityItem[] = [];
  let right = Number.NEGATIVE_INFINITY;
  const flush = () => {
    if (items.length === 0) return;
    segs.push({
      page: line.page,
      lineIndex: line.index,
      items,
      text: items.map((item) => item.text).join(''),
      left: items[0].x,
      right,
      y: line.y,
      size: Math.max(...items.map((item) => item.size)),
    });
    items = [];
    right = Number.NEGATIVE_INFINITY;
  };
  for (const item of line.items) {
    // 空きが 1 字分を超えたら別の区切り（別の列）とみなす。
    if (items.length > 0 && item.x - right > item.size * SEGMENT_GAP_EM) flush();
    items.push(item);
    right = Math.max(right, item.x + item.width);
  }
  flush();
  return segs;
}

/** 本文領域にあるか。頁をまたぐ継続見出し（BODY_TOP より上）と footer 行は除く。 */
function isBodySeg(seg: WorkSeg): boolean {
  return seg.y <= BODY_TOP && seg.y >= FOOTER_RESERVE;
}

/**
 * 直前のセグメントと同じ段落に属するか。行送りのギャップ・字サイズ・
 * 行頭のリスト記号・列の左端の一致で判定する。
 */
function sameParagraph(para: WorkSeg[], next: WorkSeg): boolean {
  const prev = para.at(-1);
  if (prev === undefined) return false;
  if (prev.size < PARA_MIN_SIZE || next.size < PARA_MIN_SIZE) return false;
  if (Math.abs(prev.size - next.size) >= SIZE_MATCH) return false;
  // 同じ高さ（横に並んだ別の列）や間延びした行は別の段落。
  const gap = prev.y - next.y;
  if (gap <= 0.5 || gap > Math.min(prev.size, next.size) * LINE_HEIGHT + PARAGRAPH_GAP_SLACK) return false;
  // 箇条書きの各行は先頭に「—」「・」「12.」が付く。項目の切れ目は段落の切れ目。
  if (LIST_MARKER.test(next.text)) return false;
  // 列の左端が揃う行だけを連結する。字下げされた箇条書きの継続行までは許す。
  const first = para[0];
  if (next.left < first.left - 1.5 || next.left > first.left + CONTINUATION_INDENT) return false;
  return true;
}

/**
 * 頁またぎの段落継続の推定。前頁の最終行の右端余白が 2 字未満なら
 * 「行を最後まで埋めて頁を送った」とみなし、次頁の先頭行を同じ段落に継ぐ。
 * 段落が 1 行しか無いときは行の右端がそのまま段落の右端になってしまうので、
 * 本文左端から始まる行だけ版面の右端と比べる。
 */
function continuesAcrossPage(para: WorkSeg[], firstOfNext: WorkSeg): boolean {
  const last = para.at(-1);
  if (last === undefined) return false;
  if (last.size < PARA_MIN_SIZE || firstOfNext.size < PARA_MIN_SIZE) return false;
  if (Math.abs(last.size - firstOfNext.size) >= SIZE_MATCH) return false;
  if (LIST_MARKER.test(firstOfNext.text)) return false;
  const first = para[0];
  if (firstOfNext.left < first.left - 1.5 || firstOfNext.left > first.left + CONTINUATION_INDENT) return false;
  if (para.length > 1) {
    return Math.max(...para.map((seg) => seg.right)) - last.right < EARLY_BREAK_MIN_SLACK_CHARS * last.size;
  }
  if (last.left > CONTENT_LEFT + 1) return false;
  return CONTENT_RIGHT - last.right < EARLY_BREAK_MIN_SLACK_CHARS * last.size;
}

/**
 * 行の先頭の「切れ目単位」の文字数。英数字の連なりは次の空白・CJK・
 * BREAK_AFTER の字まで（区切り字はその字まで）。それ以外は 1 字。
 */
function firstBreakUnitLength(text: string): number {
  const chars = [...text];
  const first = chars[0];
  if (first === undefined) return 0;
  if (!isAlnum(first)) return 1;
  let n = 1;
  while (n < chars.length) {
    const ch = chars[n];
    if (BREAK_AFTER.has(ch)) return n + 1;
    if (ch === ' ' || isCjk(ch)) break;
    n += 1;
  }
  return n;
}

/** 行先頭の切れ目単位の幅（pt）。アイテム途中で切れる分は文字数で案分する。 */
function firstBreakUnitWidth(seg: WorkSeg, unitLength: number): number {
  let consumed = 0;
  for (const item of seg.items) {
    const itemChars = [...item.text].length;
    if (itemChars === 0) continue;
    if (consumed + itemChars >= unitLength) {
      return item.x + (item.width * (unitLength - consumed)) / itemChars - seg.left;
    }
    consumed += itemChars;
  }
  return seg.right - seg.left;
}

/**
 * 行末・行頭の空白を除いた文字の切れ端が、元の文のどの位置に連続して出るかを探す。
 * 空白の折り返しや、元の文にあった強制改行（段落の切れ目）では、つないだ切れ端が
 * 元の文にそのまま出ない。描画側が段落の途中で勝手に切った境界だけが元の文に
 * 連続して残る。
 */
function boundarySource(
  a: WorkSeg,
  b: WorkSeg,
  sourceTexts: string[] | undefined,
): { text: string; headIndex: number } | undefined {
  if (sourceTexts === undefined) return undefined;
  const tail = [...a.text]
    .slice(-6)
    .join('')
    .replace(/[\s\u00a0]+$/, '');
  const head = [...b.text]
    .slice(0, 6)
    .join('')
    .replace(/^[\s\u00a0]+/, '');
  if (tail.length === 0 || head.length === 0) return undefined;
  const joined = tail + head;
  for (const text of sourceTexts) {
    const index = text.indexOf(joined);
    if (index >= 0) return { text, headIndex: index + tail.length };
  }
  return undefined;
}

/** 行末・行頭の空白でない文字の連なり（空白・CJK で切った走査）。 */
function trailingRun(text: string): string {
  const chars = [...text];
  let i = chars.length;
  while (i > 0 && chars[i - 1] !== ' ' && !isCjk(chars[i - 1])) i -= 1;
  return chars.slice(i).join('');
}
function leadingRun(text: string): string {
  const chars = [...text];
  let i = 0;
  while (i < chars.length && chars[i] !== ' ' && !isCjk(chars[i])) i += 1;
  return chars.slice(0, i).join('');
}

/**
 * 英数字の連なりの途中での分割が splitLongRun の意図的な分割かを判定する。
 * 連結した連なりに splitLongRun を通し、切れ目の位置が分割点と一致すれば
 * 意図的な分割とみなす。
 */
function isIntendedRunSplit(tail: string, head: string): boolean {
  const boundary = [...tail].length;
  let offset = 0;
  for (const chunk of splitLongRun(tail + head)) {
    offset += [...chunk].length;
    if (offset === boundary) return true;
  }
  return false;
}

/** 同じ段落の連続するセグメントの対（頁またぎの継続を含む）に走らせる規則。 */
function checkSegPairs(
  paragraphs: WorkSeg[][],
  hits: Record<LineBreakMetric, Set<string>>,
  sourceTexts: string[] | undefined,
): void {
  for (const para of paragraphs) {
    const frameRight = Math.max(...para.map((seg) => seg.right));
    for (let i = 0; i + 1 < para.length; i += 1) {
      const a = para[i];
      const b = para[i + 1];
      // 行末の余白: 段落最終行以外で右端に 2 字以上空き、次行先頭の
      // 切れ目単位がその余白に入る。切れ目単位は元の文があればそこで測る
      // （抽出テキストでは U+00A0 が半角空白と区別できず、つながった連なりが
      // 実際の折り返し単位になる）。
      const boundary = boundarySource(a, b, sourceTexts);
      const unitLength =
        boundary === undefined
          ? firstBreakUnitLength(b.text)
          : firstBreakUnitLength(boundary.text.slice(boundary.headIndex));
      const slack = frameRight - a.right;
      const sourceOk = sourceTexts === undefined || boundary !== undefined;
      if (slack >= EARLY_BREAK_MIN_SLACK_CHARS * a.size && firstBreakUnitWidth(b, unitLength) <= slack && sourceOk) {
        hits['early-break'].add(`${a.page}:${a.lineIndex}`);
      }
      // 英数字の途中: 行末・行頭がともに英数字で、splitLongRun の分割点でない。
      // 元の文が渡されているときは、連結した連なりがそのまま出るときだけ数える
      // （空白での折り返しは座標からは区別できないため）。
      const lastChar = [...a.text].at(-1);
      const firstChar = [...b.text][0];
      if (isAlnum(lastChar) && isAlnum(firstChar)) {
        const tail = trailingRun(a.text);
        const head = leadingRun(b.text);
        const joined = tail + head;
        const inSource = sourceTexts === undefined || sourceTexts.some((text) => text.includes(joined));
        if (!isIntendedRunSplit(tail, head) && inSource) {
          hits['mid-alnum-break'].add(`${a.page}:${a.lineIndex}`);
        }
      }
      // 禁則: 行末の開き括弧、行頭の閉じ括弧・句読点。
      if (lastChar !== undefined && NO_LINE_END.has(lastChar)) {
        hits.kinsoku.add(`${a.page}:${a.lineIndex}`);
      }
      if (firstChar !== undefined && isNoLineStart(firstChar, [...b.text][1])) {
        hits.kinsoku.add(`${b.page}:${b.lineIndex}`);
      }
    }
  }
}

function emptyHits(): Record<LineBreakMetric, Set<string>> {
  const hits = {} as Record<LineBreakMetric, Set<string>>;
  for (const metric of [...LINE_BREAK_RULES, 'page-spill'] as LineBreakMetric[]) {
    hits[metric] = new Set();
  }
  return hits;
}

/**
 * 行と座標から規則ごとの件数と場所を返す。本文は返さない。
 */
export function checkLineBreakQuality(pages: QualityPage[], options?: LineBreakCheckOptions): LineBreakReport {
  const hits = emptyHits();
  const linesByPage = pages.map((page, i) => toWorkLines(page, i + 1));
  const segsByPage = linesByPage.map((lines) => lines.flatMap(toSegments));
  const bodyByPage = segsByPage.map((segs) => segs.filter(isBodySeg));

  // セグメントを段落に連結する（頁内 → 頁またぎの順）。
  const paragraphs: WorkSeg[][] = [];
  for (const segs of bodyByPage) {
    let current: WorkSeg[] = [];
    for (const seg of segs) {
      if (current.length === 0 || !sameParagraph(current, seg)) {
        if (current.length > 0) paragraphs.push(current);
        current = [seg];
      } else {
        current.push(seg);
      }
    }
    if (current.length > 0) paragraphs.push(current);
  }
  const merged: WorkSeg[][] = [];
  for (const para of paragraphs) {
    const prev = merged.at(-1);
    const prevLast = prev?.at(-1);
    const first = para[0];
    const lastBodyOfPrevPage = prevLast === undefined ? undefined : bodyByPage[prevLast.page - 1].at(-1);
    if (
      prev !== undefined &&
      prevLast !== undefined &&
      first !== undefined &&
      prevLast === lastBodyOfPrevPage &&
      prevLast.page === first.page - 1 &&
      continuesAcrossPage(prev, first)
    ) {
      prev.push(...para);
    } else {
      merged.push([...para]);
    }
  }

  checkSegPairs(merged, hits, options?.sourceTexts);

  for (const para of merged) {
    const last = para.at(-1);
    if (last === undefined) continue;
    // 短い最後の行: 2 行以上ある段落の最終行が 1〜2 字。
    if (para.length >= 2 && visibleLength(last.text) <= 2) {
      hits['runt-line'].add(`${last.page}:${last.lineIndex}`);
    }
    // 長すぎる段落: 改行を含まない段落の合計が 137 字超。本文左端に揃う
    // 段落だけを対象にし、表の列の連結や見出しサイズの行は対象外。
    const isBodyPara =
      para.every((seg) => seg.size >= PARA_MIN_SIZE && seg.size < LONG_PARAGRAPH_MAX_SIZE) &&
      para[0].left <= CONTENT_LEFT + 1;
    const length = para.reduce((sum, seg, i) => {
      const text = i === 0 ? seg.text.replace(LIST_MARKER, '') : seg.text;
      return sum + visibleLength(text);
    }, 0);
    if (isBodyPara && length > LONG_PARAGRAPH_MAX_CHARS) {
      hits['long-paragraph'].add(`${para[0].page}:${para[0].lineIndex}`);
    }
    // こぼれ: 段落の最終行だけが単独で次の頁に来る。件数だけ数える。
    if (para.length >= 2 && para.filter((seg) => seg.page === last.page).length === 1) {
      hits['page-spill'].add(`${last.page}:${last.lineIndex}`);
    }
  }

  // はみ出し: 文字の bbox が版面の外。右は既存の overflow 検査と同じ閾値。
  // 見出し・footer・箇条書き記号はページ左余白（40）から始まるので左の閾値はそこに置き、
  // footer 帯（FOOTER_RESERVE より下）と本文上端より上（継続見出しの絶対配置）は除く。
  for (const lines of linesByPage) {
    for (const line of lines) {
      for (const item of line.items) {
        if (item.y > BODY_TOP || item.y < FOOTER_RESERVE) continue;
        if (item.x + item.width > OVERFLOW_RIGHT + 0.5 || item.x < PAGE_LEFT - 0.5 || item.y < CONTENT_BOTTOM) {
          hits.overflow.add(`${line.page}:${line.index}`);
        }
      }
    }
  }

  const reportHits = {} as Record<LineBreakMetric, LineBreakHit[]>;
  const counts = {} as Record<LineBreakMetric, number>;
  for (const metric of [...LINE_BREAK_RULES, 'page-spill'] as LineBreakMetric[]) {
    reportHits[metric] = [...hits[metric]]
      .map((key) => {
        const [page, line] = key.split(':');
        return { page: Number(page), line: Number(line) };
      })
      .sort((a, b) => a.page - b.page || a.line - b.line);
    counts[metric] = reportHits[metric].length;
  }
  return { counts, hits: reportHits };
}

/** `early-break=0 mid-alnum-break=3 …` のような要約（件数だけ。本文を含まない）。 */
export function summarizeLineBreaks(report: LineBreakReport): string {
  return Object.entries(report.counts)
    .map(([metric, count]) => `${metric}=${count}`)
    .join(' ');
}

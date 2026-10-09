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
import { isCjk, isNoLineStart, MAX_UNBREAKABLE_RUN, NO_LINE_END, splitLongRun } from './font';
import type { QualityItem, QualityPage } from './print-quality';
import { DEFAULT_QUALITY_OPTIONS, isFooterItem } from './print-quality';
import { PRINT_SIZE, PRINT_TYPE } from './print-token';

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
  /** 実割付で分割表示leafに対応する物理ページ・box（上端基準pt）。保存不要の検査用情報。 */
  displayParagraphRegions?: { page: number; top: number; bottom: number; text: string }[];
  /**
   * 描画元の文字列（ブロックの本文など）。英数字で切れた境界について、
   * 「結合した連なりがそのまま元の文中にある」ものだけを語の途中の分割と数え、
   * 空白での折り返し（`tail head` の形でしか出ないもの）を除外する。
   */
  sourceTexts?: string[];
  /**
   * running footer の文字列（`氏名 ／ シート名`）。渡すと下端帯では footer
   * と本文を文字で区別し、footer の高さまで流れ込んだ本文も「はみ出し」に数える。
   * 省略時は帯全体を footer とみなす従来動作（検出が甘い）。
   */
  footerText?: string;
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
  /** 同じ行で右隣にあるセグメントの左端。右端のセグメントは undefined。 */
  nextLeft?: number;
  /**
   * 同じ左端・同じフォントサイズのセグメントがその頁で届く最大の右端
   * （「列の実測の右端」）。異なる幅のコンテナが同じ左端に混ざる頁では
   * 他コンテナ由来の値になり得るため、段落連結の後に段落自身の行が届く
   * 右端で上書きし直す。
   */
  colRight: number;
  /**
   * このセグメントが属する列が使える右端の推定値。右隣の列があるときは
   * 隣列の左端から列間の内側余白を引いた位置、無いときは列の実測右端
   * （ただし段落の行が明らかに狭い欄に居るときは段落の実測右端）。
   */
  bound: number;
}

// 版面の定数は印刷経路の実デザイン（print-token / print-quality の閾値）に揃える。
// `layout-metric.ts` の FONT_SIZE/LINE_HEIGHT は別系統の値で、本文 11.5pt /
// 行送り 1.75 の実 PDF には合わない（レビュー指摘）。
const PAGE_LEFT = PRINT_SIZE.padHorizontal;
const OVERFLOW_RIGHT = DEFAULT_QUALITY_OPTIONS.contentRight;
const CONTENT_BOTTOM = DEFAULT_QUALITY_OPTIONS.contentBottom;
const FOOTER_RESERVE = DEFAULT_QUALITY_OPTIONS.footerReserve;
const BODY_TOP = DEFAULT_QUALITY_OPTIONS.contentTop;

/**
 * 段落としてつなぐ最小フォントサイズ。印刷経路の最小は PRINT_MIN_FONT_SIZE
 * （11pt）で、それより小さい行はこの検査の対象にならない。
 */
const PARA_MIN_SIZE = 10.75;
const SIZE_MATCH = 0.5;
/**
 * 段落内の行送りは `size * そのサイズの lineHeight`（本文 11.5pt×1.75≈20.1）。
 * 段落の切れ目にはさらにブロック間ギャップ（3〜4pt）が足されるので、
 * その中間に切れ目を置く。
 */
const PARAGRAPH_GAP_SLACK = 2;
/** 行の中でこの幅以上の横の空きがあったら、そこでセグメントを切る（≈1字分）。 */
const SEGMENT_GAP_EM = 1.0;
/** 段落の先頭行から見て、継続行の左端がこの幅まで右にずれても同じ段落とみなす
 * （箇条書きの字下げ分）。表の隣の列を拾わないための上限。 */
const CONTINUATION_INDENT = 24;
/** 「右端の余白が2字以上」: 字 = その行のフォントサイズの em。 */
const EARLY_BREAK_MIN_SLACK_CHARS = 2;
/**
 * 簡約表の列見出し行の空白なし文字列（CompactTableHeader: `期間 | 案件 | チーム`）。
 * 続き頁の先頭に複写される見出しは本文の段落ではないので、段落推定の対象から外す。
 * 見出しの語が変わったら project-card-compact.tsx 側と合わせて直す。
 */
const COMPACT_HEADER_SQUASH = '期間案件チーム';
/** 改行を含まない段落の長さの上限（字）。 */
const LONG_PARAGRAPH_MAX_CHARS = 137;
/**
 * 長すぎる段落の対象サイズの上限。本文（11.5pt）とメタ（11pt）は対象にし、
 * 見出しサイズ（projectTitle 13pt 以上）の行は対象外。
 */
const LONG_PARAGRAPH_MAX_SIZE = PRINT_TYPE.projectTitle.fontSize - 0.5;
/**
 * 長すぎる段落の対象は本文カラムの段落だけ。メタ表の値列（x≈152〜）のような
 * 列レイアウトの連結は対象外にするため、左端の上限を置く。
 */
const LONG_PARAGRAPH_LEFT_MAX = 100;
/**
 * 隣の列の左端から引く、列間の内側余白。メタ表（metaRowPadHorizontal 12pt
 * ずつ両側）がこのデザインで最も広い列間余白なので、その両側分を使う。
 * 実際は「隣列テキストの左端 − セル右パディング」が自セルの本文右端なので、
 * やや保守的（検出漏れ側）に倒れている。
 */
const INTER_COLUMN_GAP = 2 * PRINT_SIZE.metaRowPadHorizontal;
/**
 * 段落自身の非最終行が届く右端と、同じ列の頁内最大右端がこれだけ離れている
 * とき、その段落は別の狭いコンテナに居るとみなす。簡約表の主列
 * （本文右端 − チーム列 44pt ≈ 4 字分の差）のような構造的な差を拾い、
 * 段落の全行が一様に大きく手前で折れる一様な崩れ（差がもっと大きい）は
 * 列右端との差で検出できるようにするための境目。
 */
const CONTAINER_DROP_CHARS = 6;
/**
 * 段落最終行の末尾保護。描画エンジン側（patch/@react-pdf__textkit）の
 * keepLastLineMinimum と同じ値: 段落末尾のこの字数の間にある改行機会は
 * 消されるので、最終行の短い連なりは「余白に入る単位」として評価しない。
 */
const LAST_LINE_MIN_CHARS = 3;
/**
 * 頁またぎ継続の判定で「頁の下端近く」「上端近く」とみなす帯。継続行は本文領域の
 * 最下部・最上部にしか来ない。
 */
const PAGE_BOTTOM_BAND = 2; // 行送りの倍数
const PAGE_TOP_BAND = 60;

/**
 * フォントサイズごとの行送り。印刷経路の PRINT_TYPE の対応表を使う
 * （body 11.5pt→1.75、meta 11pt→1.55 …）。未定義のサイズは 1.6 に倒す。
 */
const LINE_HEIGHT_BY_SIZE = new Map<number, number>();
for (const t of Object.values(PRINT_TYPE)) {
  LINE_HEIGHT_BY_SIZE.set(t.fontSize, Math.max(LINE_HEIGHT_BY_SIZE.get(t.fontSize) ?? 0, t.lineHeight));
}
function pitchOf(size: number): number {
  for (const [s, lh] of LINE_HEIGHT_BY_SIZE) {
    if (Math.abs(s - size) < SIZE_MATCH) return size * lh;
  }
  return size * 1.6;
}

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
      bound: 0,
      colRight: 0,
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
  for (let i = 0; i + 1 < segs.length; i += 1) {
    segs[i].nextLeft = segs[i + 1].left;
  }
  return segs;
}

/**
 * 本文領域にあるか。頁をまたぐ継続見出し（BODY_TOP より上）は除く。下端帯
 * （FOOTER_RESERVE より下）は footer と判定されたセグメントだけ除く——
 * footerText が渡れば本文が footer と同じ高さに流れ込んだ場合も本文扱いに
 * なり、段落連結の対象から落ちない（はみ出し検査でも拾う）。
 */
function isBodySeg(seg: WorkSeg, footerText: string): boolean {
  if (seg.y > BODY_TOP) return false;
  if (seg.y >= FOOTER_RESERVE) return true;
  return !seg.items.every((item) => isFooterItem(item, DEFAULT_QUALITY_OPTIONS, footerText));
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
  if (gap <= 0.5 || gap > Math.min(pitchOf(prev.size), pitchOf(next.size)) + PARAGRAPH_GAP_SLACK) return false;
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
 * 右端の判定は `seg.bound`（列の推定右端）に対して行う。複数列の頁では
 * 各セグメントの列ごとの値になるので、表の列の継続も拾える。
 */
function continuesAcrossPage(para: WorkSeg[], firstOfNext: WorkSeg): boolean {
  const last = para.at(-1);
  if (last === undefined) return false;
  if (last.size < PARA_MIN_SIZE || firstOfNext.size < PARA_MIN_SIZE) return false;
  if (Math.abs(last.size - firstOfNext.size) >= SIZE_MATCH) return false;
  if (LIST_MARKER.test(firstOfNext.text)) return false;
  const first = para[0];
  if (firstOfNext.left < first.left - 1.5 || firstOfNext.left > first.left + CONTINUATION_INDENT) return false;
  return last.bound - last.right < EARLY_BREAK_MIN_SLACK_CHARS * last.size;
}

/**
 * seg の属する表で、seg の列の次にある列の左端。同じ行の隣のセグメント
 * （`seg.nextLeft`）があればそれを基本にするが、ラベル列が空など間のセルに
 * 文字が無い行では隣が遠い列を指すので、同じ列のセグメントが立つ他の行に
 * 現れる列まで見て、seg の列より右で最も近い列の左端を返す。
 */
function nextColumnLeft(seg: WorkSeg, segs: WorkSeg[]): number | undefined {
  const lefts = new Set<number>();
  for (const same of segs) {
    // 同じ列にある他行のセグメントが立つ行ごと、その行にある列をすべて拾う。
    if (Math.abs(same.left - seg.left) > 2) continue;
    for (const rowSeg of segs) {
      if (Math.abs(rowSeg.y - same.y) <= 0.5) lefts.add(rowSeg.left);
    }
  }
  const next = [...lefts].filter((left) => left > seg.left + 2).sort((a, b) => a - b)[0];
  return next ?? seg.nextLeft;
}

/**
 * 各セグメントの `bound`（列の推定右端）を頁内のセグメント分布から決める。
 * 右に別の列が並ぶ行は次の列の左端から列間の内側余白を引いた位置、無い行は
 * 「同じ左端・同じサイズで最も右まで届くセグメント」の右端——列の実測の
 * 右端——を暫定値とする。異なる幅のコンテナが同じ左端に混ざる頁（簡約表の
 * 主列と全幅のメタ行など）では実測右端が他コンテナ由来になるので、段落連結
 * の後で段落自身の行が届く右端に直す（resolveParaBounds）。
 */
function annotateBounds(segs: WorkSeg[]): void {
  for (const seg of segs) {
    let colRight = seg.right;
    for (const other of segs) {
      if (Math.abs(other.left - seg.left) <= 2 && Math.abs(other.size - seg.size) < SIZE_MATCH) {
        colRight = Math.max(colRight, other.right);
      }
    }
    seg.colRight = colRight;
    if (seg.nextLeft === undefined) {
      seg.bound = colRight;
      continue;
    }
    const edge = nextColumnLeft(seg, segs) ?? seg.nextLeft;
    seg.bound = Math.max(seg.right, edge - INTER_COLUMN_GAP);
  }
}

/**
 * 隣列の無いセグメントの `bound` を、段落自身の行が届く右端で上書きする。
 * 段落の最終行は短いのが普通なので証拠から除き、非最終行の最大右端を
 * その段落の実測の右端とする。それが列の最大右端から CONTAINER_DROP_CHARS
 * 字分以上狭いときは、その段落は別の（狭い）コンテナに居るとみなす。
 * 行がまったく同じ短さで終わる一様な崩れ（実測右端と列右端の差が大きい）
 * はここでは覆さず、列右端との差として検出できるままにする。
 */
function resolveParaBounds(paragraphs: WorkSeg[][]): void {
  for (const para of paragraphs) {
    // 1 行の段落は折り返しを持たず、a→b の対も生えない。
    if (para.length < 2) continue;
    const ownEdge = para.slice(0, -1).reduce((m, seg) => Math.max(m, seg.right), 0);
    for (const seg of para) {
      if (seg.nextLeft !== undefined) continue;
      if (ownEdge > 0 && seg.colRight - ownEdge <= CONTAINER_DROP_CHARS * seg.size) {
        seg.bound = Math.max(seg.right, ownEdge);
      }
    }
  }
}

/**
 * 頁内で「このセグメントの列の最上段／最下段」か。x 区間が重なるセグメントを
 * 同じ列とみなし、同じ列で上下にセグメントが無いときだけ真。
 */
function xOverlap(a: WorkSeg, b: WorkSeg): boolean {
  return Math.min(a.right, b.right) - Math.max(a.left, b.left) > 0;
}
function isLaneTop(seg: WorkSeg, segs: WorkSeg[]): boolean {
  return !segs.some((s) => s !== seg && s.y > seg.y + 0.5 && xOverlap(s, seg));
}
function isLaneBottom(seg: WorkSeg, segs: WorkSeg[]): boolean {
  return !segs.some((s) => s !== seg && s.y < seg.y - 0.5 && xOverlap(s, seg));
}

/**
 * 位置 i（chars[i-1] と chars[i] の間）で描画エンジンが実際に切れるか。
 * textkit は各シラブルの間のマーカーでしか折り返さないので、ここでも
 * splitForHyphenation と同じ規則で切れる位置だけを返す:
 * - 半角空白の前後は語の境界として必ず切れる
 * - 行末禁則の字の直後・行頭禁則の字の直前では切れない
 * - 非 CJK の連なりの中では splitLongRun の分割点だけが切れる
 * - 残り（CJK との境目、CJK どうし）は切れる
 */
function canBreakBetween(chars: string[], i: number): boolean {
  const prev = chars[i - 1];
  const cur = chars[i];
  if (prev === ' ' || cur === ' ') return true;
  if (NO_LINE_END.has(prev) || isNoLineStart(cur, chars[i + 1])) return false;
  if (!isCjk(prev) && !isCjk(cur)) {
    // 非 CJK の連なりの内部位置。run 全体に splitLongRun を通して、
    // ここが分割点のときだけ切れる。
    let start = i - 1;
    while (start > 0 && chars[start - 1] !== ' ' && !isCjk(chars[start - 1])) start -= 1;
    let end = i;
    while (end < chars.length && chars[end] !== ' ' && !isCjk(chars[end])) end += 1;
    const run = chars.slice(start, end).join('');
    if (run.length <= MAX_UNBREAKABLE_RUN) return false;
    let cut = start;
    for (const chunk of splitLongRun(run)) {
      cut += [...chunk].length;
      if (cut === i) return true;
    }
    return false;
  }
  return true;
}

/**
 * 行の先頭の「切れ目単位」の文字数。描画エンジンが実際に切れる最初の位置まで
 * の、分割できない先頭の塊を測る。例えば行頭が `（onIdTokenChanged）` のとき
 * 「（」は行末禁則なので 1 字では置けず、単位は閉じ括弧までの全体になる。
 *
 * `isLastLine`（段落の最終行）のときは、パッチ済み textkit の
 * keepLastLineMinimum（段落末尾 LAST_LINE_MIN_CHARS 字の間の切れ目は消える）
 * を再現して、保護された末尾の中の切れ目を数えない。最終行が 3 字以下なら
 * 行全体が 1 つの単位になる。
 */
function firstBreakUnitLength(text: string, isLastLine: boolean): number {
  const chars = [...text];
  // 末尾保護で消える切れ目: 最終行では末尾 LAST_LINE_MIN_CHARS 字の中の
  // 区切りは無いので、切れ候補は length - LAST_LINE_MIN_CHARS まで。
  const limit = isLastLine ? Math.max(0, chars.length - LAST_LINE_MIN_CHARS) : chars.length;
  for (let i = 1; i <= limit && i < chars.length; i += 1) {
    if (canBreakBetween(chars, i)) return i;
  }
  return chars.length;
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
  // 元の文で測った単位がこの行の中身より長い＝行の途中で単位が終わらない
  // 境界（長い英数字の連なりの分割など）。余白には入らないものとして扱う。
  return Number.POSITIVE_INFINITY;
}

/**
 * 切れ目が含まれる「切れ目単位」の先頭（文字数・code point 単位）へ遡る。
 * 境界が連なりの途中（長い英数字の途中や U+00A0 で結合した語の直後）にある
 * とき、折り返し単位はその連なり全体なので、空白・CJK の直前まで戻す。
 */
function unitStart(text: string, headIndex: number): number {
  const chars = [...text];
  let i = headIndex;
  while (i > 0 && chars[i - 1] !== ' ' && !isCjk(chars[i - 1])) i -= 1;
  return i;
}

/**
 * 行末・行頭の空白を除いた文字の切れ端が、元の文のどの位置に連続して出るかを探す。
 * まず `tail+head` の連続一致を試し、見つからなければ空白（半角空白・全角空白・
 * U+00A0・改行）を挟む一致を試す——抽出では折り返し位置の空白が行末から
 * 落ちるため、空白での折り返しはこちらにしか当たらない。段落切れの `\n\n` は
 * 行送りギャップで別の段落になるが、単独の `\n` は Text の中でタイトな改行と
 * して描かれるので、段落推定で連結した行同士の切れ目としてここに現れる。
 * 返す `headIndex` は切れ目単位の先頭（`unitStart` で遡った位置）。
 */
interface BoundarySource {
  text: string;
  headIndex: number;
  /**
   * 切れ目が出典の `\n`（作者が引いた強制改行）の上にあったか。
   * Text 内の `\n` は行送りギャップを伴わないタイトな改行として描かれるので、
   * 幾何で連結した段落の中では「早すぎる折り返し」と区別が付かない——出典で
   * `\n` が挟まっている切れ目は作者の意図した改行であって崩れではない。
   */
  brokeAtNewline: boolean;
}

function boundarySource(a: WorkSeg, b: WorkSeg, sourceTexts: string[] | undefined): BoundarySource | undefined {
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
  // 空白での折り返し用の緩い一致: tail の直後に空白系の字が 1 字以上、
  // その直後に head が続くとき、その head の UTF-16 位置を返す。
  // （リテラルの走査で、動的な RegExp は作らない——Code Scan の対策でもある）
  const looseAt = (text: string): { index: number; newline: boolean } => {
    for (let at = 0; ; at += 1) {
      at = text.indexOf(tail, at);
      if (at < 0) return { index: -1, newline: false };
      let i = at + tail.length;
      let ws = 0;
      let newline = false;
      while (i < text.length && /[\s\u00a0]/.test(text[i])) {
        if (text[i] === '\n' || text[i] === '\r') newline = true;
        i += 1;
        ws += 1;
      }
      if (ws > 0 && text.startsWith(head, i)) return { index: i, newline };
    }
  };
  // 同じ切れ端が複数の出典に当たることがある（例: 値 'A / バックエンド' が
  // 別の値 'A / バックエンド / 管理画面' の部分文字列）。そのとき b が出典の
  // 残り全部に一致するもの——b がその段落の最終行——を優先し、なければ
  // b の内容で始まる残りが短い順に採用する。
  const candidates: BoundarySource[] = [];
  for (const text of sourceTexts) {
    const index = text.indexOf(joined);
    if (index >= 0) {
      // indexOf の結果は UTF-16 の位置なので code point 数に直す。
      candidates.push({
        text,
        headIndex: unitStart(text, [...text.slice(0, index + tail.length)].length),
        brokeAtNewline: false,
      });
      continue;
    }
    const loose = looseAt(text);
    if (loose.index >= 0) {
      candidates.push({
        text,
        headIndex: unitStart(text, [...text.slice(0, loose.index)].length),
        brokeAtNewline: loose.newline,
      });
    }
  }
  if (candidates.length === 0) return undefined;
  const bSquash = squashVisible(b.text);
  const restOf = (c: { text: string; headIndex: number }) => squashVisible([...c.text].slice(c.headIndex).join(''));
  const exact = candidates.find((c) => restOf(c) === bSquash);
  if (exact !== undefined) return exact;
  candidates.sort((x, y) => restOf(x).length - restOf(y).length);
  return candidates.find((c) => restOf(c).startsWith(bSquash)) ?? candidates[0];
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

/** 空白系の字（半角・全角空白・U+00A0・改行）を除いた並び。 */
function squashVisible(t: string): string {
  return [...t].filter((ch) => !/[\s\u00a0]/.test(ch)).join('');
}

/** 空白系の字を除いた並びが同じか。 */
function sameVisible(a: string, b: string): boolean {
  return squashVisible(a) === squashVisible(b);
}

/** 同じ段落の連続するセグメントの対（頁またぎの継続を含む）に走らせる規則。 */
function checkSegPairs(
  paragraphs: WorkSeg[][],
  hits: Record<LineBreakMetric, Set<string>>,
  sourceTexts: string[] | undefined,
  regions: LineBreakCheckOptions['displayParagraphRegions'],
): void {
  // Only actual measured leaf ownership grants a new display-end exemption.
  // Equal text elsewhere, automatic flow and callers without frames retain
  // the original source matching behavior.
  const displayedEnd = (b: WorkSeg, para: WorkSeg[]): boolean =>
    regions?.some(
      (region) =>
        region.page === b.page &&
        sameVisible(region.text, para.map((seg) => seg.text).join('')) &&
        para.every(
          (seg) =>
            seg.page === region.page &&
            PRINT_SIZE.pageHeight - seg.y >= region.top - 0.5 &&
            PRINT_SIZE.pageHeight - seg.y <= region.bottom + 0.5,
        ),
    ) ?? false;
  for (const para of paragraphs) {
    for (let i = 0; i + 1 < para.length; i += 1) {
      const a = para[i];
      const b = para[i + 1];
      // 行末の余白: 段落最終行以外で右端に 2 字以上空き、次行先頭の
      // 切れ目単位がその余白に入る。右端は `a.bound`（列の推定右端）を使う。
      // 切れ目単位は「エンジンが実際に切れる最小の塊」（禁則で伸びる塊や、
      // 最終行の末尾保護を含む）で、元の文があればそこで測る（抽出テキストでは
      // U+00A0 が半角空白と区別できず、つながった連なりが実際の折り返し単位
      // になる）。
      // 「最終行」は抽出で連結した列段落ではなく描画元の段落で判断する:
      // メタ表の値セルのように列方向につながった段落でも、セルごとの段落の
      // 最終行には末尾保護が効くので、出典の残り全部がちょうどその行に載る
      // ときを最終行とみなす。
      const boundary = boundarySource(a, b, sourceTexts);
      const rest = boundary === undefined ? undefined : [...boundary.text].slice(boundary.headIndex).join('');
      const isDisplayedEnd = i + 1 === para.length - 1 && displayedEnd(b, para);
      const bIsLastLine =
        (rest === undefined ? i + 1 === para.length - 1 : sameVisible(rest, b.text)) || isDisplayedEnd;
      const unitLength = firstBreakUnitLength(isDisplayedEnd ? b.text : (rest ?? b.text), bIsLastLine);
      const slack = a.bound - a.right;
      const sourceOk = sourceTexts === undefined || boundary !== undefined;
      // brokeAtNewline: 作者が引いた強制改行（出典の \n）。行が途中で止まるのは
      // エンジンの折り返しではなく意図した改行なので「早すぎる折り返し」ではない。
      if (
        boundary?.brokeAtNewline !== true &&
        slack >= EARLY_BREAK_MIN_SLACK_CHARS * a.size &&
        firstBreakUnitWidth(b, unitLength) <= slack &&
        sourceOk
      ) {
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

/**
 * 段落の長さを「改行を含まない部分」ごとに測り、最長チャンクを返す。
 * 規則の対象は「改行を含まない段落」だが、単独の `\n` で切れた行同士は
 * 行送りギャップが無く、幾何の段落推定では 1 つの段落に連なる。出典が
 * 渡されているときは `brokeAtNewline` の位置で区切って各チャンクを測る。
 * 出典が無いときは従来どおり段落全体の長さ。
 */
function longestChunkLength(para: WorkSeg[], sourceTexts: string[] | undefined): number {
  const segLength = (seg: WorkSeg, index: number) =>
    visibleLength(index === 0 ? seg.text.replace(LIST_MARKER, '') : seg.text);
  if (sourceTexts === undefined || para.length < 2) {
    return para.reduce((sum, seg, index) => sum + segLength(seg, index), 0);
  }
  let longest = 0;
  let current = segLength(para[0], 0);
  for (let i = 0; i + 1 < para.length; i += 1) {
    const boundary = boundarySource(para[i], para[i + 1], sourceTexts);
    if (boundary?.brokeAtNewline) {
      longest = Math.max(longest, current);
      current = 0;
    }
    current += segLength(para[i + 1], i + 1);
  }
  return Math.max(longest, current);
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
  const footerText = options?.footerText ?? '';
  const linesByPage = pages.map((page, i) => toWorkLines(page, i + 1));
  // 簡約表の列見出し（project-card-compact.tsx の CompactTableHeader）は続き頁の
  // 先頭に複写される UI であって本文ではない。段落推定へ混ぜると、直前頁の列の
  // セグメント鎖へ見出しが継ぎ足され、最終行の 2 字（「チーム」）を「短い最後の行」
  // と誤検出する。行全体が見出しの文字だけの行を本文から外す。
  const chromeLineKeys = new Set(
    linesByPage.flatMap((lines) =>
      lines
        .filter((line) => squashVisible(line.items.map((i) => i.text).join('')) === COMPACT_HEADER_SQUASH)
        .map((line) => `${line.page}:${line.index}`),
    ),
  );
  const segsByPage = linesByPage.map((lines) => lines.flatMap(toSegments));
  const bodyByPage = segsByPage.map((segs) =>
    segs.filter((seg) => isBodySeg(seg, footerText) && !chromeLineKeys.has(`${seg.page}:${seg.lineIndex}`)),
  );
  for (const segs of bodyByPage) annotateBounds(segs);

  // セグメントを段落に連結する（頁内 → 頁またぎの順）。
  // 表のように同じ行に複数の列が並ぶと、セグメントは行順に列を往復する。
  // 「直前のセグメント」とだけ比べると同じ列の次の行とは二度と連結されず、
  // 列内の折り返しが一切検査されない（レビュー指摘）。そこで閉じていない段落を
  // すべて保持し、各セグメントは条件を満たす中で最も縦に近い段落へ継ぐ。
  // ギャップは行が下がるほど単調に広がるので、繋げなかった段落へ後から
  // 戻って誤って継ぐことはない。
  const paragraphs: WorkSeg[][] = [];
  for (const segs of bodyByPage) {
    const open: WorkSeg[][] = [];
    for (const seg of segs) {
      let best: WorkSeg[] | undefined;
      for (const cand of open) {
        if (!sameParagraph(cand, seg)) continue;
        if (best === undefined || cand[cand.length - 1].y < best[best.length - 1].y) best = cand;
      }
      if (best !== undefined) {
        best.push(seg);
      } else {
        const para = [seg];
        open.push(para);
        paragraphs.push(para);
      }
    }
  }
  // 頁またぎ: 段落の先頭が「その頁の列の最上段」で頁上端の帯にあるときだけ、
  // 前の頁で「同じ列の最下段かつ頁下端の帯」を最終行に持つ段落に継ぐ。
  // 複数列の頁では列ごとに独立して継ぎ目を判定する（1 列だけが継続する場合もある）。
  const merged: WorkSeg[][] = [];
  for (const para of paragraphs) {
    const first = para[0];
    let target: WorkSeg[] | undefined;
    if (first.page > 1 && first.y >= BODY_TOP - PAGE_TOP_BAND && isLaneTop(first, bodyByPage[first.page - 1])) {
      // 継続表のヘッダ行は各頁の先頭で再掲されるため、複数の列が同じ行に頭を揃える。
      // 本文の続き（1 列だけが頁上端に来る）と区別して、同じ行の列頭が 1 個のときだけ継ぐ。
      // ヘッダ再掲を継ぐと「期間」などの細片が段落の最終行になり、runt-line / page-spill
      // の偽陽性になる（実データで再現）。
      const pageSegs = bodyByPage[first.page - 1];
      const sameLineTopCount = pageSegs.filter((s) => s.lineIndex === first.lineIndex && isLaneTop(s, pageSegs)).length;
      if (sameLineTopCount === 1) {
        for (const cand of merged) {
          const last = cand[cand.length - 1];
          if (last.page !== first.page - 1) continue;
          if (last.y > CONTENT_BOTTOM + PAGE_BOTTOM_BAND * pitchOf(last.size)) continue;
          if (!isLaneBottom(last, bodyByPage[last.page - 1])) continue;
          if (!continuesAcrossPage(cand, first)) continue;
          target = cand;
          break;
        }
      }
    }
    if (target !== undefined) {
      target.push(...para);
    } else {
      merged.push(para);
    }
  }

  resolveParaBounds(merged);
  checkSegPairs(merged, hits, options?.sourceTexts, options?.displayParagraphRegions);

  for (const para of merged) {
    const last = para.at(-1);
    if (last === undefined) continue;
    // 短い最後の行: 2 行以上ある段落の最終行が 1〜2 字。
    if (para.length >= 2 && visibleLength(last.text) <= 2) {
      hits['runt-line'].add(`${last.page}:${last.lineIndex}`);
    }
    // 長すぎる段落: 改行を含まない段落の合計が 137 字超。本文カラム
    // （頁直下・カード内・字下げの箇条書きまで）に揃う段落だけを対象にし、
    // メタ表の値列などの列レイアウトや見出しサイズの行は対象外。
    const isBodyPara =
      para.every((seg) => seg.size >= PARA_MIN_SIZE && seg.size < LONG_PARAGRAPH_MAX_SIZE) &&
      para[0].left <= LONG_PARAGRAPH_LEFT_MAX;
    const length = longestChunkLength(para, options?.sourceTexts);
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
  // 本文上端より上（継続見出しの絶対配置）は除く。下端帯は footer 由来の item だけを
  // 除く——座標で帯ごと除くと、本文が footer の高さまで流れ込んだ崩れを見逃す
  // （レビュー指摘。既存の findBottomOverflows と同じ isFooterItem の判定）。
  for (const lines of linesByPage) {
    for (const line of lines) {
      for (const item of line.items) {
        if (item.y > BODY_TOP) continue;
        if (isFooterItem(item, DEFAULT_QUALITY_OPTIONS, footerText)) continue;
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

/**
 * 描画済み PDF の「改行の規則」検査。行の並びと座標だけを見て、
 * Issue #392 の規則表に対応する違反をルールごとの件数と位置（ページ・行番号）で返す。
 *
 * 行文字列は一切返さない（返すのはルール id・ページ番号・行 index・件数だけ）。
 * 毎朝の実データ検査で公開ログへ出しても個人情報が漏れない形にするための制約。
 *
 * ## なぜ組版エンジンの定数をここにも置くか
 *
 * 禁則表（NO_LINE_START / NO_LINE_END）・区切り字（BREAK_AFTER）・長い連なりの上限
 * （MAX_UNBREAKABLE_RUN）は font.ts と同じ値。組版側の定数を import しないのは、
 * この検査を行版の修正前のリビジョン（a7be1c0 系）にも差し替え無しで載せられる
 * ようにするため —— 規則表は「文書としての正しさ」なので、組版側が直る前の
 * 出力にも同じ表を当てる必要がある。
 */

/** 検査に渡す 1 行ぶんの最小情報。print-quality.ts の QualityItem と構造互換。 */
export interface LineCheckItem {
  /** 抽出テキスト（判定には使わず、文字種判定と字数にだけ使う）。 */
  text: string;
  /** フォントサイズ（transform[0]）。 */
  size: number;
  /** 左端（transform[4]）。 */
  x: number;
  /** ベースライン（transform[5]、ページ下端からの pt）。 */
  y: number;
  /** 描画幅。 */
  width: number;
  /**
   * pdfjs が内部的に割り当てたフォント ID（抽出側が渡せる場合だけ）。
   * 「太字の見出しは除く」の判定に使う。無くても検査は動く（太字除外だけ無効になる）。
   */
  fontName?: string;
}

export type LineCheckPage = LineCheckItem[];

export interface LineCheckOptions {
  /** 本文枠の左端（A4 縦・左右余白 40pt）。 */
  contentLeft: number;
  /** 本文枠の右端。 */
  contentRight: number;
  /** 本文枠の上端（ページ下端からの pt）。これより上は絶対配置の継続見出し帯。 */
  contentTop: number;
  /** 本文枠の下端（ページ下端からの pt）。 */
  contentBottom: number;
  /** running footer の帯（ページ下端からの pt）。これより下の item はフッターとして無視。 */
  footerReserve: number;
  /** 改行なし段落を「長すぎる」とみなす字数（規則表の 137 字）。 */
  maxParagraphChars: number;
  /**
   * 英数字の連なりの途中改行を「splitLongRun の意図した切れ目」とみなす連なり長。
   * font.ts の MAX_UNBREAKABLE_RUN と同じ値。
   */
  maxForcedRunChars: number;
}

export const DEFAULT_LINE_CHECK_OPTIONS: LineCheckOptions = {
  contentLeft: 40,
  contentRight: 555,
  contentTop: 800,
  contentBottom: 46,
  footerReserve: 30,
  maxParagraphChars: 137,
  maxForcedRunChars: 16,
};

/** 規則表のルール名。`page-spill` は件数だけ数えて失敗にはしない。 */
export type LineBreakRule =
  | 'trailing-gap'
  | 'mid-alnum-run'
  | 'runt-last-line'
  | 'kinsoku'
  | 'long-paragraph'
  | 'frame-overflow'
  | 'page-spill';

export const LINE_BREAK_RULES: readonly LineBreakRule[] = [
  'trailing-gap',
  'mid-alnum-run',
  'runt-last-line',
  'kinsoku',
  'long-paragraph',
  'frame-overflow',
  'page-spill',
];

export interface LineBreakViolation {
  rule: LineBreakRule;
  /** 1 始まりのページ番号。 */
  page: number;
  /** そのページの本文行（上から順・段間は飛ばした連番）の index。0 始まり。 */
  lineIndex: number;
}

export interface LineBreakCheckResult {
  counts: Record<LineBreakRule, number>;
  /** 位置の一覧（テキストを含まない）。`page-spill` 分も含む。 */
  violations: LineBreakViolation[];
  /** 失敗判定に数える違反数。`page-spill` は除く。 */
  failingCount: number;
}

// ---- font.ts と同じ値の規則表（ファイル冒頭のコメント参照） ----

const NO_LINE_START = new Set(
  [
    '、。，．・：；？！',
    'ヽヾゝゞ々ー',
    '）〕］｝〉》」』】〙〗〟’”｠»',
    'ぁぃぅぇぉっゃゅょゎゕゖ',
    'ァィゥェォッャュョヮヵヶ',
    ')]},.:;?!',
    ' ',
  ].join(''),
);
const NO_LINE_END = new Set(['（〔［｛〈《「『【〘〖〝‘“｟«', '([{', ' '].join(''));
const BREAK_AFTER = new Set(['/', '-', '_', '.', '?', '&', '=', ':', ',', ';', '+', '~', '@', '#', '%', '|', '\\']);

const ASCII_ALNUM = /^[0-9A-Za-z]$/;

/** 箇条書きの行頭記号だけで構成される行（print-primitive.tsx の BulletRow が出す印と同じ集合）。 */
const MARKER_LINE = /^(?:[-‐‑‒–—―・•‣◦]|\d{1,3}[.)])+$/;
/** 行頭が箇条書きの開始を示す記号のとき、その行は新しい段落の先頭とみなす。 */
const PARAGRAPH_HEAD = /^(?:[-‐‑‒–—―・•‣◦]|\d{1,3}[.)])/;

// ---- 内部構造 ----

/** x 方向の空白がこれ以上（pt）なら別の段・別の欄とみなす。 */
const COLUMN_GAP_PT = 4;
/** item 同士の x の隙間がこれより大きいと、連結時に半角空白を 1 字挟む。 */
const SPACE_GAP_PT = 1.5;
/** 行番号まとめ用の y 丸め幅（pt）。print-quality.ts と同じ 0.5pt。 */
const LINE_Y_ROUND = 0.5;
/** 同じ段とみなす左端・フォントサイズの許容誤差（pt）。 */
const TRACK_LEFT_PT = 1.5;
const TRACK_SIZE_PT = 0.5;
/** 「段落の区切り」とみなす行間の、段内標準行間からの超過分（pt）。ブロック間 gap=4pt を拾う。 */
const PARA_PITCH_OVER_PT = 3;
/** ページ下端の枠に接しているとみなす範囲（ページ跨ぎ判定用）。 */
const PAGE_EDGE_SLACK_LINES = 1.6;

interface ExtractLine {
  /** 1 始まりのページ番号。 */
  page: number;
  /** ページ内の本文行番号（0 始まり・全段通し）。 */
  lineIndex: number;
  /** ベースライン（ページ下端からの pt）。 */
  y: number;
  left: number;
  right: number;
  size: number;
  /**
   * 行テキスト。item 境界の大きい隙間には半角空白を 1 字挟んでいる。
   * 規則判定には文字種・禁則表だけを見て、外へは一切出さない。
   */
  text: string;
  /** 行を構成する item（単位幅の計測用）。 */
  items: LineCheckItem[];
  /** この行を構成する文字が全部、本文の主フォントではない（＝太字行）。 */
  allBold: boolean;
  /** 箇条書きの記号だけの行。本文の段落には組み込まず、段落頭の検出にだけ使う。 */
  isMarker: boolean;
}

interface Track {
  left: number;
  size: number;
  /** 同じ欄の本文行（y 降順）。 */
  lines: ExtractLine[];
  /** 欄の右端＝この欄の行の最大到達点（そのページ内）。 */
  columnRight: number;
}

interface ParagraphBlock {
  lines: ExtractLine[];
  /** ページを跨いで同じ段落が続くとき、後続ページ側の行数。 */
  spillLines: number;
}

function visibleChars(text: string): number {
  return Array.from(text.replace(/\s+/g, '')).length;
}

/** 行の実際の並びから「次の 1 切れ目単位」を切り出す（規則表：和文は 1 字、英数字は次の空白・区切り字まで）。 */
function firstBreakUnit(text: string): string {
  const chars = Array.from(text.trimStart());
  if (chars.length === 0) return '';
  const [first, ...rest] = chars;
  if (!ASCII_ALNUM.test(first)) return first;
  const unit = [first];
  for (const ch of rest) {
    if (ASCII_ALNUM.test(ch)) {
      unit.push(ch);
      continue;
    }
    // 区切り字はその字までを 1 単位に含める（「foo-」で終われる単位）。空白・その他は区切り。
    if (BREAK_AFTER.has(ch)) unit.push(ch);
    break;
  }
  return unit.join('');
}

/** 単位の描画幅を、その行を構成する item の実測幅から按分で求める。 */
function measureUnitWidth(line: ExtractLine, unit: string): number {
  let need = Array.from(unit).length;
  if (need === 0) return 0;
  let width = 0;
  for (const item of line.items) {
    const itemChars = Array.from(item.text).length;
    if (itemChars === 0) continue;
    const take = Math.min(need, itemChars);
    width += (item.width * take) / itemChars;
    need -= take;
    if (need <= 0) break;
  }
  // item が尽きた残りは推定（和文 1 字 = size、英字は概ね 0.55 size）。
  if (need > 0) width += need * line.size;
  return width;
}

function tailAlnumRun(text: string): number {
  const chars = Array.from(text);
  let n = 0;
  for (let i = chars.length - 1; i >= 0 && ASCII_ALNUM.test(chars[i]); i--) n++;
  return n;
}

function headAlnumRun(text: string): number {
  let n = 0;
  for (const ch of Array.from(text)) {
    if (!ASCII_ALNUM.test(ch)) break;
    n++;
  }
  return n;
}

/** ページ内の item を、本文の行（段分割済み）に畳み込む。 */
function toLines(
  page: LineCheckPage,
  pageNumber: number,
  dominantFont: string | undefined,
  options: LineCheckOptions,
): ExtractLine[] {
  const rows = new Map<number, LineCheckItem[]>();
  for (const item of page) {
    if (item.y < options.contentBottom || item.y > options.contentTop) continue;
    const key = Math.round(item.y / LINE_Y_ROUND) * LINE_Y_ROUND;
    const row = rows.get(key) ?? [];
    row.push(item);
    rows.set(key, row);
  }
  const lines: ExtractLine[] = [];
  const sortedRows = [...rows.entries()].sort((a, b) => b[0] - a[0]);
  for (const [y, row] of sortedRows) {
    const sorted = [...row].sort((a, b) => a.x - b.x);
    // 1 行の中の段分割: item 間に欄間ほどの隙間がある所で切る。
    let segment: LineCheckItem[] = [];
    let prevRight = 0;
    const flush = (): void => {
      if (segment.length === 0) return;
      let text = '';
      let cursor = segment[0].x;
      for (const item of segment) {
        if (item.x - cursor > SPACE_GAP_PT && text !== '') text += ' ';
        text += item.text;
        cursor = Math.max(cursor, item.x + item.width);
      }
      const allBold =
        dominantFont !== undefined &&
        segment.every((item) => item.fontName !== undefined && item.fontName !== dominantFont);
      lines.push({
        page: pageNumber,
        lineIndex: -1,
        y,
        left: segment[0].x,
        right: Math.max(...segment.map((item) => item.x + item.width)),
        size: Math.max(...segment.map((item) => item.size)),
        text,
        items: segment,
        allBold,
        isMarker: MARKER_LINE.test(text.trim()) && visibleChars(text) <= 4,
      });
      segment = [];
    };
    for (const item of sorted) {
      if (segment.length > 0 && item.x - prevRight > COLUMN_GAP_PT) flush();
      segment.push(item);
      prevRight = item.x + item.width;
    }
    flush();
  }
  // lineIndex はページ内の本文行の通し番号（上から順・全段通し）。位置の提示用。
  lines
    .sort((a, b) => b.y - a.y || a.left - b.left)
    .forEach((line, index) => {
      line.lineIndex = index;
    });
  return lines;
}

/** 本文の主フォント（= 正書き）を、文字数の最大の fontName で決める。 */
function dominantFontName(pages: LineCheckPage[]): string | undefined {
  const byFont = new Map<string, number>();
  for (const page of pages) {
    for (const item of page) {
      if (item.fontName === undefined) continue;
      byFont.set(item.fontName, (byFont.get(item.fontName) ?? 0) + Array.from(item.text).length);
    }
  }
  let best: string | undefined;
  let bestChars = 0;
  for (const [name, chars] of byFont) {
    if (chars > bestChars) {
      best = name;
      bestChars = chars;
    }
  }
  return best;
}

/**
 * 行を「段」（同じ左端・サイズの欄の連なり）に分け、欄の右端を求める。
 * 段の右端は、その段に属する全行の最大到達点（ページごと）。
 */
function toTracks(pageLines: ExtractLine[][]): Track[][] {
  return pageLines.map((lines) => {
    const tracks: Track[] = [];
    for (const line of lines) {
      const track = tracks.find(
        (t) => Math.abs(t.left - line.left) <= TRACK_LEFT_PT && Math.abs(t.size - line.size) <= TRACK_SIZE_PT,
      );
      if (track) {
        track.lines.push(line);
      } else {
        tracks.push({ left: line.left, size: line.size, lines: [line], columnRight: line.right });
      }
    }
    for (const track of tracks) {
      track.lines.sort((a, b) => b.y - a.y);
      track.columnRight = Math.max(...track.lines.map((line) => line.right));
    }
    return tracks;
  });
}

/** 行の直前の行と同じ段落に属するか（箇条書き記号・段内標準行間の超過で切り分ける）。 */
function isSameParagraph(
  prev: ExtractLine,
  next: ExtractLine,
  medianPitch: number,
  markerLines: ExtractLine[],
): boolean {
  // 段内の普通の行間より明確に開いている → 段落（またはブロック）の区切り。
  if (prev.y - next.y > medianPitch + PARA_PITCH_OVER_PT) return false;
  // 行頭が箇条書き記号 → 新しい項目の始まり。
  if (PARAGRAPH_HEAD.test(next.text.trimStart())) return false;
  // 同じ高さに箇条書き記号の行があれば、その本文行は項目の先頭。
  for (const marker of markerLines) {
    if (Math.abs(marker.y - next.y) <= 1.5 && marker.right <= next.left + 1) return false;
  }
  return true;
}

/** 段内の行を段落（ParagraphBlock）に切る。ページを跨ぐ段落はあとで linkSpilledBlocks がつなぐ。 */
function toBlocks(pageTracks: Track[][], markerLines: ExtractLine[][]): ParagraphBlock[] {
  const blocks: ParagraphBlock[] = [];
  pageTracks.forEach((tracks, pageIndex) => {
    for (const track of tracks) {
      const lines = track.lines.filter((line) => !line.isMarker);
      if (lines.length === 0) continue;
      // 段内の標準行間（連続する行の y 間隔の中央値）を測り、段落区切りの判定に使う。
      const pitches: number[] = [];
      for (let i = 0; i + 1 < lines.length; i++) pitches.push(lines[i].y - lines[i + 1].y);
      pitches.sort((a, b) => a - b);
      const medianPitch = pitches.length > 0 ? pitches[Math.floor(pitches.length / 2)] : lines[0].size * 1.75;

      let current: ParagraphBlock = { lines: [lines[0]], spillLines: 0 };
      for (let i = 1; i < lines.length; i++) {
        const prev = lines[i - 1];
        const next = lines[i];
        if (isSameParagraph(prev, next, medianPitch, markerLines[pageIndex])) {
          current.lines.push(next);
        } else {
          blocks.push(current);
          current = { lines: [next], spillLines: 0 };
        }
      }
      blocks.push(current);
    }
  });
  return blocks;
}

/**
 * ページを跨ぐ段落をつなぐ。前ページの最終ブロックがページ下端まで達していて、
 * 次ページの最上段ブロックが同じ段（左端・サイズ一致）なら同じ段落とみなす。
 */
function linkSpilledBlocks(blocks: ParagraphBlock[], options: LineCheckOptions): ParagraphBlock[] {
  const byPage = new Map<number, ParagraphBlock[]>();
  for (const block of blocks) {
    const page = block.lines[0].page;
    const list = byPage.get(page) ?? [];
    list.push(block);
    byPage.set(page, list);
  }
  const swallowed = new Set<ParagraphBlock>();
  const merged: ParagraphBlock[] = [];
  for (const block of blocks) {
    if (swallowed.has(block)) continue;
    const last = block.lines[block.lines.length - 1];
    const nextPage = last.page + 1;
    // 次ページの最上段の本文行のベースライン（y は下端からの pt なので最大値が最上段）。
    const nextPageFirstY = Math.max(...(byPage.get(nextPage) ?? []).map((b) => b.lines[0].y), -1);
    const candidates = (byPage.get(nextPage) ?? []).filter((b) => {
      const first = b.lines[0];
      return (
        b !== block &&
        Math.abs(first.left - last.left) <= TRACK_LEFT_PT &&
        Math.abs(first.size - last.size) <= TRACK_SIZE_PT &&
        first.y === nextPageFirstY
      );
    });
    const nearBottom = last.y <= options.contentBottom + last.size * PAGE_EDGE_SLACK_LINES;
    if (nearBottom && candidates.length === 1) {
      const [next] = candidates;
      block.lines.push(...next.lines);
      block.spillLines = next.lines.length;
      swallowed.add(next);
    }
    merged.push(block);
  }
  return merged;
}

/** 行頭禁則（次の行の先頭字）。'.'は直後が英数字なら語の途中として許容する（font.ts の isNoLineStart と同じ）。 */
function isForbiddenLineStart(first: string, second: string | undefined): boolean {
  if (first === '.' && second !== undefined && ASCII_ALNUM.test(second)) return false;
  return NO_LINE_START.has(first);
}

/**
 * 描画済みページ群に改行の規則検査を適用する。
 *
 * 返り値は件数と位置（ページ・行番号）だけ。行テキストは一切含まない。
 */
export function checkLineBreakRules(
  pages: LineCheckPage[],
  options: LineCheckOptions = DEFAULT_LINE_CHECK_OPTIONS,
): LineBreakCheckResult {
  const violations: LineBreakViolation[] = [];
  const counts = Object.fromEntries(LINE_BREAK_RULES.map((rule) => [rule, 0])) as Record<LineBreakRule, number>;
  const add = (rule: LineBreakRule, line: ExtractLine): void => {
    counts[rule] += 1;
    violations.push({ rule, page: line.page, lineIndex: line.lineIndex });
  };

  const dominant = dominantFontName(pages);
  const pageLines = pages.map((page, i) => toLines(page, i + 1, dominant, options));
  const markerLines = pageLines.map((lines) => lines.filter((line) => line.isMarker));
  const pageTracks = toTracks(pageLines);
  const blocks = linkSpilledBlocks(toBlocks(pageTracks, markerLines), options);

  // 規則 6「はみ出し」: 文字の外枠が本文枠の外に出る。footer 帯は本文ではないので除く。
  pages.forEach((page, pageIndex) => {
    const lines = pageLines[pageIndex];
    const lineOf = (item: LineCheckItem): ExtractLine | undefined =>
      lines.find((line) => Math.abs(line.y - item.y) <= LINE_Y_ROUND);
    for (const item of page) {
      if (item.y < options.footerReserve) continue; // footer
      if (item.y > options.contentTop) continue; // 本文枠より上の絶対配置帯（継続見出し）
      const outX = item.x < options.contentLeft - 0.5 || item.x + item.width > options.contentRight + 0.5;
      const outY = item.y < options.contentBottom;
      if (!outX && !outY) continue;
      const line = lineOf(item);
      counts['frame-overflow'] += 1;
      violations.push({ rule: 'frame-overflow', page: pageIndex + 1, lineIndex: line?.lineIndex ?? -1 });
    }
  });

  for (const block of blocks) {
    const { lines } = block;

    // 規則 5「長すぎる段落」: 段落の最終行を除く字数が 137 字を超える（太字の見出しは除く）。
    const charsBeforeLast = lines.slice(0, -1).reduce((sum, line) => sum + visibleChars(line.text), 0);
    if (charsBeforeLast > options.maxParagraphChars && !lines.every((line) => line.allBold)) {
      counts['long-paragraph'] += 1;
      violations.push({ rule: 'long-paragraph', page: lines[0].page, lineIndex: lines[0].lineIndex });
    }

    // 規則 3「短い最後の行」: 2 行以上の段落で最後の行が 1〜2 字。
    const lastChars = visibleChars(lines[lines.length - 1].text);
    if (lines.length >= 2 && lastChars >= 1 && lastChars <= 2) {
      add('runt-last-line', lines[lines.length - 1]);
    }

    // 規則 7「1 行だけ次のページへ」: 件数だけ。失敗にはしない。
    if (block.spillLines === 1) {
      counts['page-spill'] += 1;
      violations.push({
        rule: 'page-spill',
        page: lines[lines.length - 1].page,
        lineIndex: lines[lines.length - 1].lineIndex,
      });
    }

    // 段落内の行境界（規則 1・2・4）を順に見る。
    for (let i = 0; i + 1 < lines.length; i++) {
      const cur = lines[i];
      const next = lines[i + 1];
      const lastChar = Array.from(cur.text.trimEnd()).at(-1) ?? '';
      const nextChars = Array.from(next.text.trimStart());
      const nextFirst = nextChars[0] ?? '';
      const nextSecond = nextChars[1];

      // 規則 1「行末の余白」: 段落の最後以外の行で右端までの余白が 2 字以上あり、
      // 次の行の最初の切れ目単位がその余白に入る。余白はその段落自身が届いている
      // 右端（段落内の行の最大到達点）に対して測る。同じ欄に違う幅の段落が並ぶと
      // 段全体の最大ではなくなるので、段落ごとの右端を使う。
      // 最後の行への折り返し（境界が段落の最後の行を作るもの）は数えない。組版側が
      // 「最後の行を最小字数にする」ために末尾の改行位置を意図的に消すことがあり、
      // そのとき前の行の末には切れ目の分だけ意図的な余白ができる。最後の行の短さは
      // 規則 3「短い最後の行」が見るので、ここでは段落の途中の早すぎる折り返しだけを数える。
      if (i + 1 < lines.length - 1) {
        const columnRight = Math.max(...lines.map((line) => line.right));
        const gap = columnRight - cur.right;
        if (gap >= cur.size * 2) {
          const unit = firstBreakUnit(next.text);
          const unitWidth = measureUnitWidth(next, unit);
          if (unitWidth <= gap - 0.5) add('trailing-gap', cur);
        }
      }

      // 規則 4「禁則」: 行末が開き括弧、または行頭が閉じ括弧・句読点など。
      if (
        (lastChar !== '' && NO_LINE_END.has(lastChar)) ||
        (nextFirst !== '' && isForbiddenLineStart(nextFirst, nextSecond))
      ) {
        add('kinsoku', cur);
      }

      // 規則 2「英数字の途中」: 英数字で終わる行の次の行が英数字で始まる。
      // splitLongRun が切る所（境界をまたぐ連なりの合計が 16 字以上）は除く。
      if (ASCII_ALNUM.test(lastChar) && ASCII_ALNUM.test(nextFirst)) {
        const runAcross = tailAlnumRun(cur.text) + headAlnumRun(next.text);
        if (runAcross < options.maxForcedRunChars) add('mid-alnum-run', cur);
      }
    }
  }

  const failingCount = violations.filter((v) => v.rule !== 'page-spill').length;
  return { counts, violations, failingCount };
}

import type { Leaf, MeasuredLeaf, MeasuredLine } from './print-leaf';

/**
 * 測った葉をページに割り付ける純粋な関数。
 *
 * @react-pdf の自動改ページを使わず、ここで決めた `PrintPage[]` を明示的な `<Page>` に
 * 並べて描く。制約はこれまで `wrap` / `minPresenceAhead` / 高さ 0 の先行兄弟 で
 * 表現しようとして崩れていたものの言い換え:
 *
 * - `keepWithNext` の葉（見出し類）は次の葉と同居できなければ連鎖ごと次ページへ送る
 * - 連鎖の合計が 1 ページを超えるときだけ連鎖を尻から切る（同居不可の逃げ道）
 * - `splittable: 'lines'` の葉は 4 行以上のときだけ、頭 ≥ 2 行・尻 ≥ 2 行で割る。
 *   割った頭・尻は `measure` で測り直す（Knuth-Plass が段落全体で最適化するため、
 *   切った後の改行位置は変わり得る。実測では行数は 36/36 で不変だったが保証ではない）。
 *   測り直した頭が入らなければ 1 行減らして試し、頭・尻が本文と対応付けられない葉は割らない
 *
 * `measure` と `split` は引数で受ける。単体テストでは高さを返すだけのモックにできる。
 */

export interface PlacedLeaf {
  leaf: MeasuredLeaf;
  /** ページ本文上端からの pt。 */
  top: number;
  /** ページ先頭に静的に置いた継続用の葉（簡約表の列ヘッダー等）。本文の葉ではない。 */
  leadIn?: boolean;
}

export interface PrintPage {
  leaves: PlacedLeaf[];
  /** 最後の葉の marginBottom まで含めた使用高さ。版面利用率の検査に使う。 */
  usedHeight: number;
}

export interface SplitResult {
  head: Leaf;
  tail: Leaf;
}

export interface PaginateOptions {
  contentHeight: number;
  /** 段落を行境界で 2 つに分けた葉を作る。頭は記号付き、尻は記号なし、などは呼び出し側が決める。 */
  split: (leaf: MeasuredLeaf, headLines: MeasuredLine[], tailLines: MeasuredLine[]) => SplitResult | undefined;
  measure: (leaf: Leaf) => Promise<MeasuredLeaf>;
  /** 割るときに頭・尻へ最低限残す行数。既定 2（widow / orphan を出さない）。 */
  minLinesHead?: number;
  minLinesTail?: number;
  /**
   * 2 ページ目以降の先頭に静的に置く葉（前ページから続く簡約表の列ヘッダー等）。
   * `first` はそのページの本文の先頭に来る葉、`previous` は前ページの最後の葉。
   * 継続見出しのように高さを持たない絶対配置のものはここでは扱わず、描画側で付ける。
   */
  continuation?: (first: MeasuredLeaf, previous: MeasuredLeaf) => MeasuredLeaf | undefined;
}

/** 浮動小数の足し合わせで 754.0000001 になったものを「収まらない」と扱わないための遊び。 */
const EPSILON = 0.01;

function outerHeight(leaf: MeasuredLeaf): number {
  return leaf.marginTop + leaf.height + leaf.marginBottom;
}

function canSplit(
  leaf: MeasuredLeaf,
  minHead: number,
  minTail: number,
): leaf is MeasuredLeaf & { lines: MeasuredLine[] } {
  return leaf.splittable === 'lines' && leaf.lines !== undefined && leaf.lines.length >= minHead + minTail;
}

/** 先頭 k 行だけ残したときの高さの見積り。行以外の高さ（padding 等）は丸ごと頭に残るとみなす。 */
function headHeightEstimate(leaf: MeasuredLeaf & { lines: MeasuredLine[] }, k: number): number {
  const linesTotal = leaf.lines.reduce((sum, line) => sum + line.height, 0);
  const overhead = Math.max(0, leaf.height - linesTotal);
  return overhead + leaf.lines.slice(0, k).reduce((sum, line) => sum + line.height, 0);
}

/**
 * `keepWithNext` の連鎖（index から始まり、keepWithNext=false の葉で終わる）が
 * 同居するのに必要な高さ。最後の葉が割れる段落なら、最初の minHead 行だけ見えればよい。
 */
function chainRequirement(
  leaves: MeasuredLeaf[],
  index: number,
  contentHeight: number,
  minHead: number,
  minTail: number,
): number {
  let end = index;
  while (end < leaves.length - 1 && leaves[end].keepWithNext) end++;

  const requirementOf = (last: number): number => {
    let total = 0;
    for (let i = index; i < last; i++) total += outerHeight(leaves[i]);
    const tail = leaves[last];
    const body = canSplit(tail, minHead, minTail) ? headHeightEstimate(tail, minHead) : tail.height;
    return total + tail.marginTop + body;
  };

  // 連鎖の合計が 1 ページを超えるなら、どこかで切るしかない。尻から削って収まる長さにする。
  let last = end;
  while (last > index && requirementOf(last) > contentHeight + EPSILON) last--;
  return requirementOf(last);
}

async function trySplit(
  leaf: MeasuredLeaf & { lines: MeasuredLine[] },
  remaining: number,
  options: Required<Pick<PaginateOptions, 'split' | 'measure' | 'minLinesHead' | 'minLinesTail'>>,
): Promise<{ head: MeasuredLeaf; tail: MeasuredLeaf } | null> {
  const { split, measure, minLinesHead, minLinesTail } = options;
  let k = leaf.lines.length - minLinesTail;
  while (k >= minLinesHead && leaf.marginTop + headHeightEstimate(leaf, k) > remaining + EPSILON) k--;

  // 見積りで入る k から始め、測り直して入らなければ 1 行ずつ減らす。
  for (; k >= minLinesHead; k--) {
    const parts = split(leaf, leaf.lines.slice(0, k), leaf.lines.slice(k));
    // 本文と行が対応付けられない葉は割らない（呼び出し側の判断。葉ごと次ページへ送る）。
    if (!parts) return null;
    const head = await measure({ ...parts.head, keepWithNext: false });
    if (head.marginTop + head.height <= remaining + EPSILON) {
      const tail = await measure({ ...parts.tail, keepWithNext: leaf.keepWithNext });
      return { head, tail };
    }
  }
  return null;
}

export async function paginate(leaves: MeasuredLeaf[], options: PaginateOptions): Promise<PrintPage[]> {
  const { contentHeight } = options;
  const minLinesHead = options.minLinesHead ?? 2;
  const minLinesTail = options.minLinesTail ?? 2;
  const splitOptions = { split: options.split, measure: options.measure, minLinesHead, minLinesTail };

  const pages: PrintPage[] = [];
  let page: PrintPage = { leaves: [], usedHeight: 0 };
  let y = 0;
  const queue = [...leaves];

  const place = (leaf: MeasuredLeaf, leadIn = false): void => {
    page.leaves.push(leadIn ? { leaf, top: y + leaf.marginTop, leadIn } : { leaf, top: y + leaf.marginTop });
    y += outerHeight(leaf);
    page.usedHeight = y;
  };
  const breakPage = (): void => {
    pages.push(page);
    page = { leaves: [], usedHeight: 0 };
    y = 0;
  };

  let index = 0;
  while (index < queue.length) {
    const leaf = queue[index];
    // 継続用の葉しか無いページは、本文の葉にとってはまだ空。ここを「空でない」と扱うと、
    // 継続用の葉を置いた直後に入らない葉が来たとき改ページを繰り返して止まらなくなる。
    const pageEmpty = page.leaves.every((placed) => placed.leadIn);
    if (pageEmpty && pages.length > 0 && page.leaves.length === 0 && options.continuation) {
      const previousPage = pages[pages.length - 1];
      const previous = previousPage.leaves[previousPage.leaves.length - 1]?.leaf;
      const lead = previous ? options.continuation(leaf, previous) : undefined;
      if (lead) place(lead, true);
    }
    const remaining = contentHeight - y;

    if (leaf.marginTop + leaf.height <= remaining + EPSILON) {
      const requirement = chainRequirement(queue, index, contentHeight, minLinesHead, minLinesTail);
      if (requirement <= remaining + EPSILON || pageEmpty) {
        place(leaf);
        index++;
        continue;
      }
      breakPage();
      continue;
    }

    // 葉そのものが残りに入らない。割れるなら頭だけ置き、尻を次ページの先頭に回す。
    if (canSplit(leaf, minLinesHead, minLinesTail)) {
      const parts = await trySplit(leaf, remaining, splitOptions);
      if (parts) {
        place(parts.head);
        queue[index] = parts.tail;
        breakPage();
        continue;
      }
    }

    if (pageEmpty) {
      // 空ページにも入らない割れない葉。葉は 1 ページ以下に保つ設計なので本来ここへは来ない。
      // 来た場合は圧縮も消失もさせず、そのまま置いて溢れさせる（検査で捕まる）。
      place(leaf);
      index++;
      continue;
    }
    breakPage();
  }

  if (page.leaves.length > 0 || pages.length === 0) pages.push(page);
  return pages;
}

import layoutDocument from '@react-pdf/layout';
import { Document, Font, Page, pdf } from '@react-pdf/renderer';

import PDF_FONT_FAMILY from './constants';
import type { Leaf, MeasuredLeaf, MeasuredLine } from './print-leaf';
import { frameLeaf } from './print-leaf-frame';
import { printStyles } from './print-primitives';
import { PRINT_SIZE } from './print-tokens';

/**
 * 葉を描く前に高さと行を測る。
 *
 * 手段は `@react-pdf/layout` の `layout()` を「背の高い 1 ページ・`wrap={false}`」に対して
 * 呼ぶこと。分割が起きないので全葉が 1 ページに縦に並び、yoga の `box` と textkit の
 * `lines[]` がそのまま取れる。同じ textkit・同じハイフネーション callback が走るため、
 * 明示ページに置き直したときの行数・高さと一致する（実測: 492 葉で top の差 4e-5pt、
 * 行数不一致 0、`print-measure-place.node.test.tsx` が固定している）。
 *
 * `renderToBuffer` の `onRender` からも同じ layout は取れるが、pdfkit が 60000pt の
 * ページを実際に描くため 10 倍遅い（12 s vs 1.1 s）。
 */

/** 測定用ページの高さ。A4 本文の 80 ページ分あれば十分で、超える場合は葉を分けて測る。 */
export const MEASURE_PAGE_HEIGHT = 60000;
/** 1 回の layout() に載せる葉の上限。葉は互いに独立（縦積み・全幅）なので分けても結果は変わらない。 */
const MEASURE_BATCH_SIZE = 200;

interface LayoutBox {
  top: number;
  height: number;
  width: number;
  marginTop?: number;
  marginBottom?: number;
}

interface LayoutLine {
  string?: string;
  box: { height: number };
}

interface LayoutNode {
  type: string;
  box?: LayoutBox;
  lines?: LayoutLine[];
  children?: LayoutNode[];
}

type LayoutFn = (document: unknown, fontStore: unknown) => Promise<LayoutNode>;

function collectTexts(node: LayoutNode, out: LayoutNode[]): void {
  if (node.type === 'TEXT') {
    out.push(node);
    return;
  }
  for (const child of node.children ?? []) collectTexts(child, out);
}

function linesOf(node: LayoutNode): MeasuredLine[] | undefined {
  const texts: LayoutNode[] = [];
  collectTexts(node, texts);
  // 2 つ以上の Text（装飾付き段落や記号 + 本文の行）は文字列を繋ぎ直しても元の見た目に
  // 戻せないので、行を返さず「割れない葉」として扱わせる。
  if (texts.length !== 1 || !texts[0].lines) return undefined;
  return texts[0].lines.map((line) => ({ height: line.box.height, string: line.string ?? '' }));
}

/** 葉を枠ごと 1 枚の View にする。描画側も同じ関数を通す（print-leaf-frame.tsx）。 */
export function wrapLeaf(leaf: Leaf) {
  return frameLeaf(leaf);
}

function assertFontsReady(fontStore: typeof Font): void {
  // callback 未登録のまま測ると和文の改行位置が変わり、描画時と行数が食い違う。
  // 静かにズレるより先に落とす。
  const store = fontStore as unknown as {
    getRegisteredFontFamilies?: () => string[];
    getHyphenationCallback?: () => unknown;
  };
  const families = store.getRegisteredFontFamilies?.() ?? [];
  if (!families.includes(PDF_FONT_FAMILY)) {
    throw new Error(`measureLeaves: フォント ${PDF_FONT_FAMILY} が未登録。先に registerPdfFonts() を呼ぶ`);
  }
  if (typeof store.getHyphenationCallback === 'function' && !store.getHyphenationCallback()) {
    throw new Error('measureLeaves: ハイフネーション callback が未登録。先に registerPdfFonts() を呼ぶ');
  }
}

async function measureBatch(leaves: Leaf[], fontStore: typeof Font): Promise<MeasuredLeaf[]> {
  const instance = pdf(
    <Document>
      <Page size={[PRINT_SIZE.pageWidth, MEASURE_PAGE_HEIGHT]} wrap={false} style={printStyles.page}>
        {leaves.map(wrapLeaf)}
      </Page>
    </Document>,
  );
  const root = await (layoutDocument as unknown as LayoutFn)(instance.container.document, fontStore);
  const page = root.children?.[0];
  const nodes = page?.children ?? [];
  if (!page || nodes.length !== leaves.length) {
    throw new Error(`measureLeaves: 葉 ${leaves.length} 個に対して layout の子が ${nodes.length} 個`);
  }
  const last = nodes[nodes.length - 1];
  const pageBox = page.box;
  if (last.box && pageBox && last.box.top + last.box.height > pageBox.height) {
    // 測定ページから溢れると textkit が末尾の行を切り落とし、高さが小さく出る。
    throw new Error(`measureLeaves: 葉 ${leaves.length} 個が測定ページ ${MEASURE_PAGE_HEIGHT}pt に収まらない`);
  }
  return leaves.map((leaf, index) => {
    const node = nodes[index];
    const box = node.box;
    if (!box) throw new Error(`measureLeaves: 葉 ${leaf.id} の box が無い`);
    const lines = leaf.splittable === 'lines' ? linesOf(node) : undefined;
    return {
      ...leaf,
      height: box.height,
      marginTop: box.marginTop ?? 0,
      marginBottom: box.marginBottom ?? 0,
      ...(lines ? { lines } : {}),
    };
  });
}

export async function measureLeaves(leaves: Leaf[], fontStore: typeof Font = Font): Promise<MeasuredLeaf[]> {
  assertFontsReady(fontStore);
  const measured: MeasuredLeaf[] = [];
  for (let start = 0; start < leaves.length; start += MEASURE_BATCH_SIZE) {
    measured.push(...(await measureBatch(leaves.slice(start, start + MEASURE_BATCH_SIZE), fontStore)));
  }
  return measured;
}

/** 葉を 1 つだけ測る。段落を割った後の頭・尻の再測定（paginate の oracle）に使う。 */
export async function measureLeaf(leaf: Leaf, fontStore: typeof Font = Font): Promise<MeasuredLeaf> {
  const [measured] = await measureLeaves([leaf], fontStore);
  return measured;
}

// PDF 描画が読む範囲に絞った mdast ノードの構造型。remark の型をそのまま持ち込むと
// 描画側・高さ見積り側の双方が unist の総和型に引きずられるため、必要な属性だけを持つ
// 独立した型として定義し、両者から共有する。
export interface MdNode {
  type: string;
  value?: string;
  depth?: number;
  ordered?: boolean;
  children?: MdNode[];
  align?: (string | null)[];
  url?: string;
}

/** ノード配下のテキストを連結する（描画・高さ見積りの双方が使う）。 */
export function nodeText(node: MdNode): string {
  if (typeof node.value === 'string') return node.value;
  if (node.children) return node.children.map(nodeText).join('');
  return '';
}

/** ノード配下の強制改行（`break`）の数。段落の行数見積りで 1 行ずつ加算する。 */
export function hardBreakCount(node: MdNode): number {
  if (node.type === 'break') return 1;
  if (!node.children) return 0;
  return node.children.reduce((sum, child) => sum + hardBreakCount(child), 0);
}

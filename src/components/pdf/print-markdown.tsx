/**
 * 案件の自由記述（業務内容 / 習得スキル・実績 / コメント）を印刷デザインで描画する。
 *
 * 対象は `duties` / `acquired` / `comment` の 3 つだけで、実データはこの範囲に収まる:
 * 段落・箇条書き（ネストあり）・太字・斜体・インラインコード・リンク。
 * 表や見出しは入らない（`blocks.ts` の `asInlineMarkdown` が見出し記法を落としている）。
 *
 * 既存の `skill-sheet-document.tsx` の mdast レンダラは**流用しない**。あちらは画面テーマの
 * 色・サイズで組まれた markdown 全文レンダラで、レガシー閲覧経路のために凍結している。
 * こちらは印刷トークンで組む別系統として独立させ、片方の変更が他方を壊さないようにする。
 */

import { StyleSheet, View } from '@react-pdf/renderer';
import type { ReactElement, ReactNode } from 'react';
import remarkParse from 'remark-parse';
import { unified } from 'unified';

import { isSafeLinkHref, PDF_REMARK_PLUGINS } from '@/lib/markdown-config';
import { BulletLine, BulletRow, Link, Paragraph, PrintText, printStyles } from './print-primitives';
import { PRINT_COLOR, PRINT_TYPE, PRINT_WEIGHT } from './print-tokens';

export interface MdNode {
  type: string;
  value?: string;
  ordered?: boolean;
  start?: number;
  children?: MdNode[];
  url?: string;
}

const styles = StyleSheet.create({
  blocks: { flexDirection: 'column', gap: 4 },
  nested: { flexDirection: 'column', gap: 3, paddingLeft: 10 },
  emphasis: { fontStyle: 'italic' },
  code: { ...PRINT_TYPE.meta, color: PRINT_COLOR.heading, backgroundColor: PRINT_COLOR.surface },
  strong: { fontWeight: PRINT_WEIGHT.bold, color: PRINT_COLOR.heading },
  table: { flexDirection: 'column', borderTop: `0.75pt solid ${PRINT_COLOR.ruleFaint}` },
  tableRow: { flexDirection: 'row', borderBottom: `0.75pt solid ${PRINT_COLOR.ruleFaint}` },
  tableHeadRow: { flexDirection: 'row', borderBottom: `0.75pt solid ${PRINT_COLOR.rule}` },
  tableCell: { ...PRINT_TYPE.meta, color: PRINT_COLOR.text, flex: 1, paddingVertical: 3, paddingHorizontal: 5 },
  tableHeadCell: {
    ...PRINT_TYPE.meta,
    fontWeight: PRINT_WEIGHT.bold,
    color: PRINT_COLOR.heading,
    flex: 1,
    paddingVertical: 3,
    paddingHorizontal: 5,
  },
});

/** 生 HTML から タグだけ落として本文を残す。画面側は rehype-sanitize が担保している。 */
function stripHtmlTags(value: string | undefined): string {
  if (!value) return '';
  return value
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * 段落が「太字だけ」でできているか。`**開発基盤・チーム**` のように、本文の中で
 * 小見出しとして使われている段落を見分けるために使う。
 */
export function isHeadingLikeParagraph(node: MdNode): boolean {
  const meaningful = (node.children ?? []).filter((child) => !(child.type === 'text' && !(child.value ?? '').trim()));
  return meaningful.length === 1 && meaningful[0].type === 'strong';
}

/**
 * `allowBold` は「太字を太字として描いてよいか」。
 *
 * 既定は false ＝ 文の途中の `**…**` はウェイトを上げずに地の文として描く。
 * 提出用 PDF では、本人が後から読み返しても理由を説明できない強調が紙面に残ると
 * 「なぜここだけ太いのか」に答えられない（オーナー指摘）。一方で段落まるごとが
 * 太字のものは本文の小見出しとして機能しており、これを地の文に落とすと
 * コメント全体が切れ目の無い塊になって読めなくなる。だから
 * 「段落まるごと太字＝小見出しだけ残し、文中の強調は消す」で分ける。
 */
function renderInline(nodes: MdNode[] | undefined, allowBold = false): ReactNode {
  if (!nodes) return null;
  return nodes.map((node, index) => {
    const key = `${node.type}-${index}`;
    if (node.type === 'text') return node.value ?? null;
    if (node.type === 'break') return '\n';
    // 生 HTML はタグだけ落として中の文字は残す。捨てると <details><summary>概要</summary>
    // 本文</details> のように画面には出ている記述が PDF から丸ごと消える。
    if (node.type === 'html') return stripHtmlTags(node.value) || null;
    if (node.type === 'inlineCode') {
      return (
        <PrintText key={key} style={styles.code}>
          {node.value}
        </PrintText>
      );
    }
    if (node.type === 'strong') {
      if (!allowBold) return renderInline(node.children);
      return (
        <PrintText key={key} style={styles.strong}>
          {renderInline(node.children, true)}
        </PrintText>
      );
    }
    if (node.type === 'emphasis') {
      return (
        <PrintText key={key} style={styles.emphasis}>
          {renderInline(node.children, allowBold)}
        </PrintText>
      );
    }
    if (node.type === 'delete') {
      return (
        <PrintText key={key} style={{ textDecoration: 'line-through' }}>
          {renderInline(node.children, allowBold)}
        </PrintText>
      );
    }
    if (node.type === 'link') {
      const href = node.url ?? '';
      // 安全なスキーム以外は注釈を出さない（<Link src> はそのまま PDF の URI アクションになる）。
      if (!isSafeLinkHref(href)) {
        return (
          <PrintText key={key} style={printStyles.link}>
            {renderInline(node.children, allowBold)}
          </PrintText>
        );
      }
      return (
        <Link key={key} src={href} style={printStyles.link}>
          {renderInline(node.children, allowBold)}
        </Link>
      );
    }
    return node.children ? renderInline(node.children, allowBold) : (node.value ?? null);
  });
}

function renderListItem(item: MdNode, key: string, marker: string): ReactNode {
  const children = item.children ?? [];
  const nestedLists = children.filter((child) => child.type === 'list');
  const ownBlocks = children.filter((child) => child.type !== 'list');
  return (
    <View key={key}>
      <BulletRow marker={marker}>{ownBlocks.flatMap((block) => renderInline(block.children))}</BulletRow>
      {nestedLists.length > 0 && (
        <View style={styles.nested}>
          {nestedLists.flatMap((list, li) =>
            (list.children ?? []).map((child, ci) =>
              renderListItem(child, `${key}-n${li}-${ci}`, listMarker(list, ci)),
            ),
          )}
        </View>
      )}
    </View>
  );
}

/**
 * 箇条書きの行頭記号。順序付きリスト（`1.` `2.`）は番号を保つ — 手順や順位を書いた本文が
 * 並びだけの箇条書きに落ちると、順番という情報そのものが消える。
 */
function listMarker(list: MdNode, index: number): string {
  if (!list.ordered) return '—';
  const start = typeof list.start === 'number' ? list.start : 1;
  return `${start + index}.`;
}

function renderBlock(node: MdNode, key: string): ReactNode {
  if (node.type === 'paragraph') {
    return <Paragraph key={key}>{renderInline(node.children, isHeadingLikeParagraph(node))}</Paragraph>;
  }
  if (node.type === 'list') {
    return (
      <View key={key} style={styles.blocks}>
        {(node.children ?? []).map((item, index) => renderListItem(item, `${key}-${index}`, listMarker(node, index)))}
      </View>
    );
  }
  if (node.type === 'blockquote') {
    return (
      <View key={key} style={styles.nested}>
        {(node.children ?? []).map((child, index) => renderBlock(child, `${key}-${index}`))}
      </View>
    );
  }
  if (node.type === 'code') return <Paragraph key={key}>{node.value}</Paragraph>;
  // GFM の表。1 段落に潰すと値が列から切り離されて読めなくなるので、行と列のまま描く。
  if (node.type === 'table') {
    const rows = node.children ?? [];
    return (
      <View key={key} style={styles.table}>
        {rows.map((row, ri) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: 表の行と列は位置そのものが識別子で、内容は重複しうる。
          <View key={`${key}-r${ri}`} style={ri === 0 ? styles.tableHeadRow : styles.tableRow}>
            {(row.children ?? []).map((cell, ci) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: 同上。列の位置が識別子。
              <PrintText key={`${key}-r${ri}-c${ci}`} style={ri === 0 ? styles.tableHeadCell : styles.tableCell}>
                {renderInline(cell.children)}
              </PrintText>
            ))}
          </View>
        ))}
      </View>
    );
  }
  // 見出し・表・区切り線は 3 つのフィールドには現れない。来た場合も本文として出して落とさない。
  if (node.children) return <Paragraph key={key}>{renderInline(node.children)}</Paragraph>;
  return node.value ? <Paragraph key={key}>{node.value}</Paragraph> : null;
}

// PDF 専用のプラグイン集合を使う。画面用の MARKDOWN_REMARK_PLUGINS は remark-breaks を
// 含んでおり、単独改行が break ノードになる。react-pdf の Text 内に \n を入れると隣接行が
// 重なるため、PDF 側は remark-breaks を外した集合（markdown-config.ts の定義）を使う。
const processor = unified().use(remarkParse).use(PDF_REMARK_PLUGINS);

/**
 * 自由記述 1 フィールドを描画する。空文字なら null（呼び出し側でブロックごと出さない）。
 */
export function PrintMarkdown({ text }: { text: string }) {
  if (!text.trim()) return null;
  const tree = processor.runSync(processor.parse(text)) as unknown as MdNode;
  return (
    <View style={styles.blocks}>
      {/* 高さ 0 の先行兄弟。@react-pdf は「親の最初の子は既にページ先頭にいる」と見なして
          改ページの判断を省き、ページが埋まっていても先頭の段落をそのまま現在ページへ
          置いて下端からはみ出させる（layout の shouldBreak / splitNodes。詳しくは
          project-card-compact.tsx のコメント）。何も描かない View を 1 つ先に置くだけで
          その判定が外れ、収まらない分が正しく次ページへ送られる。 */}
      <View />
      {(tree.children ?? []).map((node, index) => renderBlock(node, `b${index}`))}
    </View>
  );
}

/**
 * 自由記述を measure-then-place の葉の材料に分解したもの（案件セクション用）。
 *
 * `PrintMarkdown` は 1 枚の View に段落と箇条書きを積むが、それではフィールド全体が
 * 1 つの葉になり、長い本文でページに置けなくなる。段落・箇条書き 1 項目・表 をそれぞれ
 * 独立した要素にして返し、呼び出し側（print-leaves.tsx）が葉に仕立てる。
 * 装飾の無い段落だけ `text` と `remake` を持ち、行境界で割れる。
 */
export interface MarkdownPiece {
  el: ReactElement;
  kind: 'paragraph' | 'bullet' | 'block';
  /** 装飾の無い段落の本文。割った頭・尻を `remake` に渡して作り直す。 */
  text?: string;
  remake?: (text: string) => ReactElement;
  /** 入れ子の深さぶんの字下げ（pt）。 */
  indent: number;
  /** 直前の要素との間隔（pt）。PrintMarkdown の gap と同じ値。 */
  gap: number;
}

const BLOCK_GAP = 4;
const NESTED_GAP = 3;
const NESTED_INDENT = 10;

/** 太字・リンク等の入れ子 Text を持たず、文字列を繋ぎ直しても見た目が変わらない段落か。 */
function isPlainParagraph(node: MdNode): boolean {
  return (node.children ?? []).every((child) => child.type === 'text' || child.type === 'html');
}

function plainText(node: MdNode): string {
  return (node.children ?? [])
    .map((child) => (child.type === 'html' ? stripHtmlTags(child.value) : (child.value ?? '')))
    .join('');
}

function listItemPieces(item: MdNode, key: string, marker: string, depth: number, out: MarkdownPiece[]): void {
  const children = item.children ?? [];
  const nestedLists = children.filter((child) => child.type === 'list');
  const ownBlocks = children.filter((child) => child.type !== 'list');
  out.push({
    kind: 'bullet',
    el: (
      <BulletLine key={key} marker={marker}>
        {ownBlocks.flatMap((block) => renderInline(block.children))}
      </BulletLine>
    ),
    indent: depth * NESTED_INDENT,
    gap: depth === 0 ? BLOCK_GAP : NESTED_GAP,
  });
  nestedLists.forEach((list, li) => {
    (list.children ?? []).forEach((child, ci) => {
      listItemPieces(child, `${key}-n${li}-${ci}`, listMarker(list, ci), depth + 1, out);
    });
  });
}

function blockPieces(node: MdNode, key: string, depth: number, out: MarkdownPiece[]): void {
  if (node.type === 'paragraph') {
    if (isPlainParagraph(node) && !isHeadingLikeParagraph(node)) {
      const text = plainText(node);
      const remake = (value: string) => <Paragraph key={key}>{value}</Paragraph>;
      out.push({ kind: 'paragraph', el: remake(text), text, remake, indent: depth * NESTED_INDENT, gap: BLOCK_GAP });
      return;
    }
    out.push({
      kind: 'paragraph',
      el: renderBlock(node, key) as ReactElement,
      indent: depth * NESTED_INDENT,
      gap: BLOCK_GAP,
    });
    return;
  }
  if (node.type === 'list') {
    (node.children ?? []).forEach((item, index) => {
      listItemPieces(item, `${key}-${index}`, listMarker(node, index), depth, out);
    });
    return;
  }
  if (node.type === 'blockquote') {
    (node.children ?? []).forEach((child, index) => {
      blockPieces(child, `${key}-${index}`, depth + 1, out);
    });
    return;
  }
  if (node.type === 'code') {
    const text = node.value ?? '';
    const remake = (value: string) => <Paragraph key={key}>{value}</Paragraph>;
    out.push({ kind: 'paragraph', el: remake(text), text, remake, indent: depth * NESTED_INDENT, gap: BLOCK_GAP });
    return;
  }
  const el = renderBlock(node, key);
  if (el) out.push({ kind: 'block', el: el as ReactElement, indent: depth * NESTED_INDENT, gap: BLOCK_GAP });
}

export function markdownPieces(text: string): MarkdownPiece[] {
  if (!text.trim()) return [];
  const tree = processor.runSync(processor.parse(text)) as unknown as MdNode;
  const out: MarkdownPiece[] = [];
  (tree.children ?? []).forEach((node, index) => {
    blockPieces(node, `b${index}`, 0, out);
  });
  return out;
}

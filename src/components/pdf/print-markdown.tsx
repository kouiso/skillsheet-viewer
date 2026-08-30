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
import type { ReactNode } from 'react';
import remarkParse from 'remark-parse';
import { unified } from 'unified';

import { isSafeLinkHref, PDF_REMARK_PLUGINS } from '@/lib/markdown-config';
import { BulletRow, Link, Paragraph, PrintText, printStyles } from './print-primitives';
import { PRINT_COLOR, PRINT_TYPE, PRINT_WEIGHT } from './print-tokens';

interface MdNode {
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

function renderInline(nodes: MdNode[] | undefined): ReactNode {
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
      return (
        <PrintText key={key} style={styles.strong}>
          {renderInline(node.children)}
        </PrintText>
      );
    }
    if (node.type === 'emphasis') {
      return (
        <PrintText key={key} style={styles.emphasis}>
          {renderInline(node.children)}
        </PrintText>
      );
    }
    if (node.type === 'delete') {
      return (
        <PrintText key={key} style={{ textDecoration: 'line-through' }}>
          {renderInline(node.children)}
        </PrintText>
      );
    }
    if (node.type === 'link') {
      const href = node.url ?? '';
      // 安全なスキーム以外は注釈を出さない（<Link src> はそのまま PDF の URI アクションになる）。
      if (!isSafeLinkHref(href)) {
        return (
          <PrintText key={key} style={printStyles.link}>
            {renderInline(node.children)}
          </PrintText>
        );
      }
      return (
        <Link key={key} src={href} style={printStyles.link}>
          {renderInline(node.children)}
        </Link>
      );
    }
    return node.children ? renderInline(node.children) : (node.value ?? null);
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
  if (node.type === 'paragraph') return <Paragraph key={key}>{renderInline(node.children)}</Paragraph>;
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
    <View style={styles.blocks}>{(tree.children ?? []).map((node, index) => renderBlock(node, `b${index}`))}</View>
  );
}

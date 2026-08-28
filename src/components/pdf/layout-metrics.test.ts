import { describe, expect, it } from 'vitest';

import { estimateTableRowHeight } from './layout-metrics';
import type { MdNode } from './mdast';

/** `| a | b |` 相当の table ノードを作る。 */
function table(rows: string[][]): MdNode {
  return {
    type: 'table',
    children: rows.map((cells) => ({
      type: 'tableRow',
      children: cells.map((value) => ({ type: 'tableCell', children: [{ type: 'text', value }] })),
    })),
  } as MdNode;
}

describe('estimateTableRowHeight', () => {
  it('通常の表は行の高さを返す', () => {
    const node = table([
      ['見出しA', '見出しB'],
      ['値1', '値2'],
    ]);
    const row = node.children?.[1] as MdNode;
    expect(estimateTableRowHeight(node, row, 515)).toBeGreaterThan(0);
  });

  // 先頭行の children が空だと columnCount が 0 になり、`??` では拾えない。
  // flexTotal が 0 → share が Infinity → 高さが常に1行分になり、過小見積りで
  // wrap={false} を許してしまう（Issue #262 の再発方向）。
  it('先頭行のセルが空でも、長文セルの高さを1行分に潰さない', () => {
    const node: MdNode = {
      type: 'table',
      children: [
        { type: 'tableRow', children: [] },
        {
          type: 'tableRow',
          children: [{ type: 'tableCell', children: [{ type: 'text', value: 'あ'.repeat(400) }] }],
        },
      ],
    } as MdNode;
    const row = node.children?.[1] as MdNode;
    const singleLine = estimateTableRowHeight(
      table([['x'], ['x']]),
      table([['x'], ['x']]).children?.[1] as MdNode,
      515,
    );

    expect(estimateTableRowHeight(node, row, 515)).toBeGreaterThan(singleLine * 3);
  });
});

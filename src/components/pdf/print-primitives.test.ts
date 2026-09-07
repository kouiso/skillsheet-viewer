/**
 * ページ割りに効く「高さ 0 の先行兄弟 + wrap={false}」の組を固定する。
 *
 * @react-pdf は「親の最初の子は既にページ先頭にいる」と見なして改ページの判断を省く。
 * そのため `wrap={false}` の要素が親の最初の子になると、ページが埋まっていてもその場に
 * 描かれて版面の下端を突き抜ける（実測: 箇条書きと技術チップの両方で発生）。
 * 兄弟だけ、あるいは wrap 指定だけを消しても型は通り、壊れるのは実データの特定ページ
 * だけなので、ここで組として固定する。
 *
 * この組が要るのは自動改ページに任せている 1 ページ目（自己紹介の PrintMarkdown）だけ。
 * 案件セクションは measure-then-place（print-leaves.tsx）で葉ごとに置くので `BulletLine` を使う。
 *
 * 描画（renderToBuffer）はしない — jsdom 側では @react-pdf の実描画を禁じているため
 * （CLAUDE.md）。見たいのは要素ツリーの形だけで、それは戻り値を歩けば確認できる。
 */
import { Children, Fragment, isValidElement, type ReactNode } from 'react';
import { describe, expect, it } from 'vitest';

import { BulletRow } from './print-primitives';

interface ElementLike {
  props: Record<string, unknown> & { children?: ReactNode };
}

/** React の要素のうち、props を読める形のものか。 */
function isElementLike(node: unknown): node is ElementLike {
  return isValidElement(node) && typeof node.props === 'object' && node.props !== null;
}

/** fragment を展開して、直下の子要素だけを順番に返す。 */
function childrenOf(node: ReactNode): ElementLike[] {
  return Children.toArray(node).flatMap((child) => {
    if (!isElementLike(child)) return [];
    // fragment は自身ではなく中身が並ぶ。
    if (isValidElement(child) && child.type === Fragment) return childrenOf(child.props.children);
    return [child];
  });
}

describe('BulletRow', () => {
  it('行の前に高さ 0 の兄弟を置き、行自体は分割禁止にする', () => {
    const children = childrenOf(BulletRow({ children: '本文' }));
    expect(children).toHaveLength(2);
    // 1 つ目は中身も style も持たない View（高さ 0 の先行兄弟）。
    expect(children[0].props.children).toBeUndefined();
    expect(children[0].props.style).toBeUndefined();
    expect(children[1].props.wrap).toBe(false);
  });
});

import { Page, StyleSheet, View } from '@react-pdf/renderer';
import type { ReactNode } from 'react';

import { frameLeaf } from './print-leaf-frame';
import { continuationHeadingFor } from './print-leaves';
import type { PrintPage } from './print-paginate';
import { PrintText, printStyles } from './print-primitives';
import { PRINT_COLOR, PRINT_SIZE, PRINT_TYPE } from './print-tokens';

/**
 * 割り付け済みの `PrintPage[]` を明示的な `<Page>` に並べる。
 *
 * ここには `wrap` / `break` / `minPresenceAhead` / `render` prop が 1 つも無い。どの葉が
 * どのページに乗るかは `paginate` が決め終わっていて、@react-pdf は各ページを 1 回
 * レイアウトして描くだけ（分割の再レイアウトが無いぶん、自動改ページより速い）。
 * 継続見出しも `PrintPage` から静的に決まる。
 */

export const continuationStyles = StyleSheet.create({
  // ページ跨ぎの継続ヘッダー。**height を与えないこと**（与えると描画が消える）。
  // 外枠は位置だけを持つ。罫線を外枠に付けると、継続ヘッダーを出さないページにも線だけが描かれる。
  header: {
    position: 'absolute',
    top: PRINT_SIZE.headerTop,
    left: PRINT_SIZE.padHorizontal,
    right: PRINT_SIZE.padHorizontal,
  },
  inner: {
    borderBottomWidth: PRINT_SIZE.ruleThin,
    borderBottomColor: PRINT_COLOR.rule,
    paddingBottom: 4,
  },
  // maxLines / textOverflow は @react-pdf では props ではなく **style** で渡す
  // （@react-pdf/layout の getMaxLines は node.style を見る）。
  // 2 行目は本文の 1 行目に重なるので、文字列側（fitContinuationHeading）で 1 行に
  // 収めたうえで、ここでも折り返しを禁じて二重に塞ぐ。
  text: {
    ...PRINT_TYPE.meta,
    fontWeight: 700,
    color: PRINT_COLOR.accent,
    maxLines: 1,
    textOverflow: 'ellipsis',
  },
});

export function ContinuationHeading({ text }: { text: string }) {
  if (!text) return null;
  return (
    <View style={continuationStyles.header}>
      <View style={continuationStyles.inner}>
        <PrintText style={continuationStyles.text}>{text}</PrintText>
      </View>
    </View>
  );
}

export function ProjectPages({ pages, footer }: { pages: PrintPage[]; footer: ReactNode }) {
  return (
    <>
      {pages.map((page, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: ページは順序そのものが identity
        <Page key={index} size="A4" style={printStyles.page}>
          <ContinuationHeading text={continuationHeadingFor(page, index)} />
          {page.leaves.map((placed) => frameLeaf(placed.leaf))}
          {footer}
        </Page>
      ))}
    </>
  );
}

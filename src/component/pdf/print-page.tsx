import { Page, StyleSheet, View } from '@react-pdf/renderer';
import type { ReactNode } from 'react';
import type { ContinuationHeadingPart } from './print-continuation-heading';
import { frameLeaf } from './print-leaf-frame';
import { continuationHeadingPartsFor } from './print-leaf-list';
import type { PrintPage } from './print-paginate';
import { PrintText, printStyles } from './print-primitive';
import { PRINT_COLOR, PRINT_SIZE, PRINT_TYPE, PRINT_WEIGHT } from './print-token';

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
    fontWeight: PRINT_WEIGHT.bold,
    color: PRINT_COLOR.accent,
    maxLines: 1,
    textOverflow: 'ellipsis',
  },
  // 上の text は digest-document の「シート名（続き）」も使う。継続見出しは片ごとに下の 3 トーンで上書きする。
  // デザイン 1e の 3 トーン。会社名だけ accent / 700、「／」と「（続き）」は label 色、案件名は text 色。
  company: { fontWeight: PRINT_WEIGHT.bold, color: PRINT_COLOR.accent },
  separator: { fontWeight: PRINT_WEIGHT.normal, color: PRINT_COLOR.label },
  mark: { fontWeight: PRINT_WEIGHT.normal, color: PRINT_COLOR.label },
  project: { fontWeight: PRINT_WEIGHT.normal, color: PRINT_COLOR.text },
});

export function ContinuationHeading({ parts }: { parts: ContinuationHeadingPart[] }) {
  if (parts.length === 0) return null;
  return (
    <View style={continuationStyles.header}>
      <View style={continuationStyles.inner}>
        <PrintText style={continuationStyles.text}>
          {parts.map((part, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: 片は順序そのものが identity
            <PrintText key={index} style={continuationStyles[part.tone]}>
              {part.text}
            </PrintText>
          ))}
        </PrintText>
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
          <ContinuationHeading parts={continuationHeadingPartsFor(page, index)} />
          {page.leaves.map((placed) => frameLeaf(placed.leaf))}
          {footer}
        </Page>
      ))}
    </>
  );
}

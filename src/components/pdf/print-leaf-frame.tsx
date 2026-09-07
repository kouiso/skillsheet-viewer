import { StyleSheet, View } from '@react-pdf/renderer';
import type { ReactElement } from 'react';

import type { CardFrame, FrameSpec, Leaf } from './print-leaf';
import { PRINT_COLOR, PRINT_SIZE } from './print-tokens';

/**
 * 葉を枠（レール → カード枠 → 字下げ）で包む。
 *
 * **測定（`measureLeaves`）と描画（`ProjectPages`）は必ずこの 1 関数を通す。** 行数は
 * 幅だけで決まるので、枠の padding が片方だけ違えば測った高さと置いた高さがズレる。
 * それが measure-then-place の唯一の現実的な壊れ方で、`print-measure-place.node.test.tsx`
 * が予測 = 実測で見張っている。
 */

const styles = StyleSheet.create({
  rail: {
    borderLeftWidth: PRINT_SIZE.companyRailWidth,
    borderLeftColor: PRINT_COLOR.rule,
    paddingLeft: PRINT_SIZE.companyRailIndent,
  },
  cardBase: { borderColor: PRINT_COLOR.rule, flexDirection: 'column' },
  surface: { backgroundColor: PRINT_COLOR.surface },
  divider: { borderBottomWidth: PRINT_SIZE.ruleThin, borderBottomColor: PRINT_COLOR.rule },
  // 会社の終わり。帯にすると重いので、短い罫線 1 本だけでセクションが閉じたことを示す。
  endMarker: {
    marginTop: 8,
    width: PRINT_SIZE.companyEndMarkerWidth,
    borderBottomWidth: PRINT_SIZE.ruleStrong,
    borderBottomColor: PRINT_COLOR.rule,
  },
});

function cardStyle(card: CardFrame) {
  const rule = PRINT_SIZE.ruleThin;
  return [
    styles.cardBase,
    {
      borderTopWidth: card.top ? rule : 0,
      borderBottomWidth: card.bottom ? rule : 0,
      borderLeftWidth: card.sides ? rule : 0,
      borderRightWidth: card.sides ? rule : 0,
      // 角丸は辺が揃う角だけ。片方の辺しか無い角に付けると線が途中で丸まる。
      borderTopLeftRadius: card.top && card.sides ? PRINT_SIZE.cardRadius : 0,
      borderTopRightRadius: card.top && card.sides ? PRINT_SIZE.cardRadius : 0,
      borderBottomLeftRadius: card.bottom && card.sides ? PRINT_SIZE.cardRadius : 0,
      borderBottomRightRadius: card.bottom && card.sides ? PRINT_SIZE.cardRadius : 0,
      paddingTop: card.padTop,
      paddingBottom: card.padBottom,
      paddingHorizontal: card.padHorizontal,
    },
    card.surface ? styles.surface : {},
    card.divider ? styles.divider : {},
  ];
}

export const NO_FRAME: FrameSpec = {
  rail: false,
  gapAbove: 0,
  marginBottom: 0,
  card: null,
  indent: 0,
  endMarker: false,
};

/** 葉 1 つを枠で包んだ要素。Page 直下の子が必ず 1 つになるので、測定と描画で index がズレない。 */
export function frameLeaf(leaf: Leaf): ReactElement {
  const frame = leaf.frame ?? NO_FRAME;
  const inner = frame.indent > 0 ? <View style={{ paddingLeft: frame.indent }}>{leaf.el}</View> : leaf.el;
  const carded = frame.card ? <View style={cardStyle(frame.card)}>{inner}</View> : inner;
  return (
    <View
      key={leaf.id}
      style={[frame.rail ? styles.rail : {}, { paddingTop: frame.gapAbove, marginBottom: frame.marginBottom }]}
    >
      {carded}
      {frame.endMarker && <View style={styles.endMarker} />}
    </View>
  );
}

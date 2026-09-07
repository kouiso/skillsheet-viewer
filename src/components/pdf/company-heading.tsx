/**
 * 会社セクションの見出し（デザイン 1b「B — 会社セクション見出し」）。
 *
 * 帯は「塗り（直近の会社）」と「淡色（それ以前）」の 2 種だけ。色に載せている意味はこの
 * 1 軸しかないので、モノクロコピーでも情報は落ちない（print-tokens.ts の設計方針）。
 *
 * 会社概要（`note`）は**この見出しの下で 1 回だけ**出す。現行 PDF は同じ文章を配下の
 * 案件カード全てに繰り返しており、案件本文より会社紹介の方が長く見える状態だった。
 *
 * ページ割りはここでは一切扱わない。帯と概要はそれぞれ measure-then-place の葉になり
 * （print-leaves.tsx）、「見出しだけがページ末尾に残らない」は `keepWithNext` で表現する。
 * かつてここにあった `wrap={false}` / `minPresenceAhead` / 概要の文字数上限は、
 * @react-pdf の自動改ページを小突くための回避策で、割り付けを自前にした時点で不要になった。
 */

import { StyleSheet, View } from '@react-pdf/renderer';

import { Paragraph, PrintText } from './print-primitives';
import { PRINT_COLOR, PRINT_SIZE, PRINT_TYPE, PRINT_WEIGHT } from './print-tokens';
import type { PrintCompany } from './print-view-model';

const styles = StyleSheet.create({
  band: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 7,
    paddingHorizontal: 10,
    // 会社名が長いときに在籍期間と文字が触らないための最小間隔。デザインは短い社名なので
    // 隙間が自然に空いており値が書かれていない。左側と同じ 9pt を使う。
    gap: 9,
  },
  bandLatest: { backgroundColor: PRINT_COLOR.accent },
  // それ以前の会社は淡色帯。塗りが弱いぶん、上端の 1.5pt 罫線で会社の切り替わりを作る。
  bandEarlier: {
    backgroundColor: PRINT_COLOR.band,
    borderTopWidth: PRINT_SIZE.ruleStrong,
    borderTopColor: PRINT_COLOR.heading,
  },

  // 会社名 15pt と区分 11pt はベースライン揃え。中央揃えにすると区分だけ浮いて見える。
  // `flex: 1` は必須。@react-pdf（Yoga）の flexShrink 既定は 0 なので、付けないと
  // 「会社名 + 区分」が縮まず、右の在籍期間が本文右端 555pt を越えて余白に食い込む
  // （実測: 社名 22 文字 + 区分 16 文字で右端 566.7pt）。
  bandLeft: { flex: 1, flexDirection: 'row', alignItems: 'baseline', gap: 9 },
  nameLatest: { ...PRINT_TYPE.company, color: PRINT_COLOR.paper },
  nameEarlier: { ...PRINT_TYPE.company, color: PRINT_COLOR.heading },
  kindLatest: { ...PRINT_TYPE.meta, color: PRINT_COLOR.onAccent },
  kindEarlier: { ...PRINT_TYPE.meta, color: PRINT_COLOR.label },
  // 在籍期間は縮めない（「2018.02 〜 2019.07」が途中で折り返すと日付として読めない）。
  periodLatest: {
    ...PRINT_TYPE.meta,
    fontWeight: PRINT_WEIGHT.bold,
    color: PRINT_COLOR.paper,
    flexShrink: 0,
  },
  periodEarlier: {
    ...PRINT_TYPE.meta,
    fontWeight: PRINT_WEIGHT.bold,
    color: PRINT_COLOR.heading,
    flexShrink: 0,
  },

  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  // 塗り帯の下は左右も細罫で囲む。囲まないと帯と 2 行目が別ブロックに見える。
  summaryRowLatest: {
    borderBottomWidth: PRINT_SIZE.ruleStrong,
    borderBottomColor: PRINT_COLOR.heading,
    borderLeftWidth: PRINT_SIZE.ruleThin,
    borderLeftColor: PRINT_COLOR.rule,
    borderRightWidth: PRINT_SIZE.ruleThin,
    borderRightColor: PRINT_COLOR.rule,
  },
  summaryRowEarlier: { borderBottomWidth: PRINT_SIZE.ruleThin, borderBottomColor: PRINT_COLOR.rule },
  summaryText: { ...PRINT_TYPE.meta, color: PRINT_COLOR.text },

  // 会社概要はデザインに寸法が無い。帯の文字（左内側 10pt）に頭を揃え、
  // 2 行目の罫線と文字がくっつかない最小の余白だけを足している。
  note: { paddingTop: 6, paddingHorizontal: 10 },
});

/** 帯 + 案件数の行。会社概要は含まない（別の葉 `CompanyNote`）。 */
export function CompanyHeadingBand({ company }: { company: PrintCompany }) {
  const isLatest = company.isLatest;
  // デザインの右端「詳細版 ×N」は出さない。内部の分類結果で、読む側には意味が無い。
  const summary = [`${company.projectCount} 案件`, company.roles, company.teamRange].filter(Boolean).join(' ／ ');
  return (
    <View>
      <View style={[styles.band, isLatest ? styles.bandLatest : styles.bandEarlier]}>
        <View style={styles.bandLeft}>
          <PrintText style={isLatest ? styles.nameLatest : styles.nameEarlier}>{company.name}</PrintText>
          {company.kind !== '' && (
            <PrintText style={isLatest ? styles.kindLatest : styles.kindEarlier}>{company.kind}</PrintText>
          )}
        </View>
        {company.periodText !== '' && (
          <PrintText style={isLatest ? styles.periodLatest : styles.periodEarlier}>{company.periodText}</PrintText>
        )}
      </View>
      {/* 2 行目は下端の罫線自体が見出しの枠なので、案件数しか残らない場合も行ごと消さない。 */}
      <View style={[styles.summaryRow, isLatest ? styles.summaryRowLatest : styles.summaryRowEarlier]}>
        <PrintText style={styles.summaryText}>{summary}</PrintText>
      </View>
    </View>
  );
}

/** 会社概要 1 段落。本文を差し替えて作り直せるので、行境界で割った頭・尻にも使う。 */
export function CompanyNote({ text }: { text: string }) {
  return (
    <View style={styles.note}>
      <Paragraph>{text}</Paragraph>
    </View>
  );
}

/**
 * 会社セクションの見出し（デザイン 1b「B — 会社セクション見出し」）。
 *
 * 帯は「塗り（直近の会社）」と「淡色（それ以前）」の 2 種だけ。色に載せている意味はこの
 * 1 軸しかないので、モノクロコピーでも情報は落ちない（print-tokens.ts の設計方針）。
 *
 * 会社概要（`note`）は**この見出しの下で 1 回だけ**出す。現行 PDF は同じ文章を配下の
 * 案件カード全てに繰り返しており、案件本文より会社紹介の方が長く見える状態だった。
 */

import { StyleSheet, View } from '@react-pdf/renderer';

import { DynamicView, type PageRenderProps, Paragraph, PrintText } from './print-primitives';
import { PRINT_COLOR, PRINT_SIZE, PRINT_TYPE, PRINT_WEIGHT } from './print-tokens';
import type { PrintCompany } from './print-view-model';

/**
 * 見出しの後ろにこれだけの高さが残っていなければページを送る。
 * 帯 2 行（約 64pt）＋ 続く案件カードのヘッダー 1 個分を見込んだ値で、
 * 「見出しだけがページ末尾に取り残される」形を防ぐ。
 *
 * ただし **`minPresenceAhead` だけでは足りない**。`@react-pdf/layout` の `shouldBreak`
 * （lib/index.js の `shouldSplit && !canWrap` / `!shouldSplit && endOfPresence > height`）は
 * `minPresenceAhead` を「そのノードが残り高さに収まる」場合しか見ない。収まらない場合は
 * 分割可能なノードをその場で割る。実測でも帯 1 行目だけが前ページに残り、案件数の行と
 * 下端の罫線が次ページへ落ちた（残り高さ 54〜4pt のとき）。だから枠は `wrap={false}` にする。
 */
/**
 * 会社見出しの後ろにこれだけの高さが残っていなければ、会社ごと次のページへ送る（pt）。
 *
 * 120 だった頃は、見出しの下に案件カードの頭だけが覗く形でページが終わり、読み手は
 * ページの下端で所属が切り替わったことに気づけなかった（実測: 38 ページ版の p30 で
 * B 社の見出しがページ下端から 134pt = 紙面の下 18% の位置に出ていた）。
 *
 * 240pt は「見出し + 概要 + 最初のカードの頭とメタ表」がまとまって見える高さ。
 * 実データで会社見出しが最も下に来るページでも、下端から 486pt（紙面の上 4 割の中）に
 * 収まる。会社ごとに必ず改ページする案（46 ページ・平均充填率 77%・半分以上白い
 * ページ 7 枚）と比べ、42 ページ・平均 85%・半分以上白いページ 2 枚で済む。
 *
 * **この値が効くには、会社セクションの中で見出しより前に兄弟が 1 つ必要**
 * （print-document.tsx の高さ 0 の View）。@react-pdf は「親の最初の子は既にページ先頭に
 * いる」と見なして minPresenceAhead を無視するため、それが無いと 120 でも 320 でも
 * 出力が 1 ページも変わらない（実測）。
 */
const MIN_PRESENCE_AHEAD = 240;

/**
 * 会社概要を帯と同じ分割単位（`wrap={false}`）に入れてよい上限の文字数。
 *
 * 実測で決めた値。前の会社の本文量を 1 段落刻みで変えて見出しの落ち位置を 15 通り作り、
 * 概要 25 / 125 / 400 / 850 字はすべて崩れなし、2000 字（約 45 行 = 900pt）で全通り崩れた
 * （分割不可ブロックが 1 ページに入らず、帯の余白ごと圧縮されてフッターに重なる）。
 * 崩れが確認できなかった最大値をそのまま上限にする。実データの最長は 123 字。
 *
 * これを超える概要だけ枠の外に出す。外に出すと帯が圧縮される場合があるが、
 * 枠に入れたまま 1 ページを超えると概要が丸ごと落ちる。落とすより崩れる方を採る。
 */
const NOTE_INLINE_MAX_CHARS = 850;

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

export function CompanyHeading({
  company,
  onFirstPage,
}: {
  company: PrintCompany;
  /**
   * この見出しが実際に乗ったページ番号を通知する（会社の「つづき」見出しの判定に使う）。
   * 見出し自体は `wrap={false}` で 1 ページに収まる保証があるので、確定パス
   * （`subPageNumber` を持つ呼び出し）を 1 回拾えば「会社の開始ページ」が確定する。
   */
  onFirstPage?: (pageProps: PageRenderProps) => void;
}) {
  const isLatest = company.isLatest;
  // デザインの右端「詳細版 ×N」は出さない。内部の分類結果で、読む側には意味が無い。
  const summary = [`${company.projectCount} 案件`, company.roles, company.teamRange].filter(Boolean).join(' ／ ');

  // 会社概要は帯と同じ分割単位（枠の中）に入れる。外に出すと、残り高さが 54〜14pt の
  // ときに枠だけが前ページへ残って余白ごと圧縮され、帯 2 行がフッターに重なった（実測）。
  // 概要を枠に含めると同じ落ち位置でも崩れず次ページへ送られる。
  const noteFitsInBlock = company.note.length <= NOTE_INLINE_MAX_CHARS;
  const note = company.note !== '' && (
    <View style={styles.note}>
      <Paragraph>{company.note}</Paragraph>
    </View>
  );

  const block = (
    // `wrap={false}` を付けたこの View は**このコンポーネントの根**でなければならない。
    // 上にもう 1 枚 View を挟むと、残り高さが 54〜14pt のときページ送りではなく圧縮が
    // 走り、帯の余白が潰れて 2 行目がフッター（下から 46pt）に食い込む（実測）。
    <View wrap={false} minPresenceAhead={MIN_PRESENCE_AHEAD}>
      {onFirstPage && (
        <DynamicView
          render={(pageProps) => {
            // 分割中の呼び出しは subPageNumber を持たない。確定パスだけを見る
            // （project-card-detail.tsx の markFirstContent と同じ理由）。
            if (pageProps.subPageNumber !== undefined) onFirstPage(pageProps);
            return null;
          }}
        />
      )}
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
      {noteFitsInBlock && note}
    </View>
  );

  if (noteFitsInBlock) return block;
  return (
    <View>
      {block}
      {note}
    </View>
  );
}

/**
 * PDF（印刷）専用のデザイントークン。
 *
 * 画面（Console テーマ / ティール `#0d9488`）とは**意図的に別系統**にしている。
 * PDF は白背景・モノクロコピー前提の提出書類で、有彩色はネイビー 1 色だけに絞る。
 * モノクロ出力時 `#1F3A5F` は約 25% グレーになり、見出し色 `#14171C` と区別が付く。
 * 色に意味を持たせているのは「直近 / それ以前」の 1 軸だけなので、白黒でも情報は落ちない。
 *
 * `src/lib/design-tokens.ts` は画面の色との一致を `design-tokens.test.ts` で機械検証している。
 * こちらはその検証対象ではない（一致させないことが設計判断）。
 */

/** 色。用途を名前にしていて、同じ値を別用途で使い回さない。 */
export const PRINT_COLOR = {
  /** 見出し・強い罫線（1.5pt）・数値の強調 */
  heading: '#14171C',
  /** 本文 */
  text: '#2E3238',
  /** ラベル・メタ・補助（対白 6.1:1） */
  label: '#5F666E',
  /** 唯一の有彩色。直近の会社の帯、塗りチップ、箇条書きの記号 */
  accent: '#1F3A5F',
  /** 直近の会社の帯（accent 塗り）の上に乗る補助文字 */
  onAccent: '#C9D6E6',
  /** 罫線 0.75pt（対白 3.2:1 = WCAG 1.4.11 を満たす） */
  rule: '#8A9099',
  /** 表の内側の細い区切り */
  ruleFaint: '#C9CED4',
  /** 帯（それ以前の会社の見出し・工程チップ） */
  band: '#E7ECF2',
  /** 面（カード頭・成果ブロック） */
  surface: '#F2F4F6',
  /** 紙 */
  paper: '#FFFFFF',
} as const;

/**
 * 文字サイズと行間。
 *
 * **`lineHeight` は必ず倍率で指定する。pt 値の直接指定は禁止。**
 * 現行 PDF の p13 で文字が行ごと重なって潰れていたのは
 * `lineHeight ÷ fontSize = 0.03` という pt 指定が原因で、倍率で書けば起こり得ない。
 *
 * 最小は 11pt。これ以上小さくしない（提出書類として読める下限）。
 */
export const PRINT_TYPE = {
  name: { fontSize: 24, fontWeight: 700, lineHeight: 1.2 },
  stat: { fontSize: 17, fontWeight: 700, lineHeight: 1.2 },
  company: { fontSize: 15, fontWeight: 700, lineHeight: 1.3 },
  projectTitle: { fontSize: 13, fontWeight: 700, lineHeight: 1.45 },
  sectionLabel: { fontSize: 11, fontWeight: 700, lineHeight: 1.5 },
  body: { fontSize: 11.5, fontWeight: 400, lineHeight: 1.75 },
  meta: { fontSize: 11, fontWeight: 400, lineHeight: 1.55 },
} as const;

/** 使うウェイトは 400 / 500 / 700 の 3 つだけ。 */
export const PRINT_WEIGHT = { normal: 400, medium: 500, bold: 700 } as const;

/** 最小フォントサイズ。検証スクリプトがこの値未満の描画を弾く。 */
export const PRINT_MIN_FONT_SIZE = 11;

/** 寸法。A4 縦 595 × 842pt を前提にした実数。 */
export const PRINT_SIZE = {
  pageWidth: 595,
  pageHeight: 842,
  padTop: 42,
  padBottom: 32,
  padHorizontal: 40,
  /** 本文幅 = 595 - 40 × 2 */
  contentWidth: 515,
  /** ランニングヘッダーの上端・フッターの下端（絶対配置の座標） */
  headerTop: 16,
  footerBottom: 14,
  companySectionGap: 20,
  /**
   * 会社セクション左のレール（縦罫線）の太さ。`borderLeftWidth` を折り返す View に
   * 付けると、@react-pdf はページ跨ぎの断片ごとに再描画する（実測、
   * react-pdf-capability.node.test.tsx の H）。`wrap={false}` は不要。
   */
  companyRailWidth: 2,
  /** レールから見出し帯・案件カードまでの余白。会社セクション全体の paddingLeft に使う。 */
  companyRailIndent: 12,
  /** 会社の終わりを示す短い罫線の幅。帯にはしない（淡いままで十分読み取れる）。 */
  companyEndMarkerWidth: 18,
  cardGap: 16,
  cardPadVertical: 9,
  cardPadHorizontal: 12,
  metaRowPadVertical: 5,
  metaRowPadHorizontal: 12,
  chipPadVertical: 2,
  chipPadHorizontal: 6,
  chipGap: 3,
  chipRadius: 2,
  /** メタ表のラベル列 */
  labelColMeta: 62,
  /**
   * 技術チップの分類ラベル列。デザインは 72pt だが、実データのラベル
   * （`フレームワーク` = 11pt × 7 文字 = 77pt）が 1 行に収まらないため 80pt にしている。
   * デザインの分類名は実装できない（下記 PRINT_TECH_LABEL のコメント参照）。
   */
  labelColTech: 80,
  /** 簡約版カードの期間列 */
  labelColCompact: 88,
  /** 簡約版カードのチーム列 */
  teamColCompact: 44,
  ruleStrong: 1.5,
  ruleThin: 0.75,
  cardRadius: 3,
  /**
   * 案件カード 1 枚が「1 ページに収まり得る」上限高さ。
   * pageHeight(842) − padTop(42) − ページの paddingBottom（`padBottom`32 + フッター余白 14）= 754。
   * カードの見積り高さがこれ以下なら `wrap={false}` でカード全体を分割禁止にできる
   * （@react-pdf は wrap={false} のノードがこの高さを超えると、ページ送りではなく
   * 文字を圧縮して重ねる — 実測、company-grouping 作業の zz-wrapfalse-overflow-probe）。
   * 超えるカードだけ、区切り単位（メタ表・チップ分類・本文ブロック）ごとに分割可能な形へ戻す。
   */
  cardMaxSinglePageHeight: 754,
  /**
   * 簡約表の列ヘッダーの後ろにこれだけの高さが残っていなければページを送る。
   * 列ヘッダー（HEAD_PAD_VERTICAL 5×2 + meta 1 行 ≒ 27pt）+ 先頭案件の 1 行目
   * （ROW_PAD_VERTICAL 7×2 + 本文 2 行分の折り返しを見込んで ≒ 48pt）の合計に
   * 安全マージンを足した値。これが無いと、実行時点で残り高さが少ないページに
   * 列ヘッダーだけが乗り、データ行 0 件のまま改ページして次ページで表が再度
   * 描かれる（実測: p19→p20 / p25→p26 境界、company-heading.tsx の
   * MIN_PRESENCE_AHEAD と同種の不具合）。
   */
  compactHeaderMinPresenceAhead: 90,
} as const;

/**
 * 技術チップの分類ラベル（表示専用の短縮）。
 *
 * デザインは「言語 / フロント / バックエンド / CMS・データ / インフラ / 品質・運用」という
 * 分類を提案しているが、これは DB の `ProjectTech` の 6 キー
 * （`lang` / `fw` / `db` / `infra` / `tools` / `collab`）と 1 対 1 に対応しない。
 * デザイン側に寄せると「この技術はフロントかバックエンドか」を推測する規則を新規に
 * 発明することになり、間違いが静かに混ざる。**分類は DB のキーをそのまま使う。**
 *
 * ラベルだけは `process.ts` の `TECH_BUCKET_LABELS` を 80pt の列に 1 行で収まる長さへ
 * 短縮している（`コラボレーションツール` は 121pt で必ず折り返して不自然な行分割になる）。
 * 意味は変えていない。分類の増減もしていない。
 */
export const PRINT_TECH_LABEL = {
  lang: '言語',
  fw: 'フレームワーク',
  db: 'データベース',
  infra: 'インフラ',
  tools: '開発ツール',
  collab: '連携ツール',
} as const;

/**
 * 1 ページ目の主力スタックに並べるチップの上限。
 *
 * これは「元データの省略」ではなく「1 ページ目の見出しとしての抜粋」。全件は
 * スキル一覧ページ（`skills-page.tsx`）に必ず出る。オーナーの「簡易表記はあかん」
 * （2026-08-29、案件詳細の作り替えレビューで確定）は「同じ内容の 2 変種で片方が
 * 情報を落とす」ことを禁じる指示で、この上限は変種間の食い違いではなく「サマリ
 * ページに全件を並べると 1 ページ目が主力スタックだけで埋まる」ための独立した
 * デザイン上限なので対象外と判断した。据え置く。
 */
export const PRINT_TOP_SKILL_LIMIT = 10;

/**
 * チップに経験年数を添えてよいスキル分類。
 *
 * オーナーの指摘「CI/CD 4年ってなんやねん」の通り、年数は言語・フレームワーク・
 * インフラ基盤には意味があるが、ツール・CMS・テストのような分類には意味がない。
 * 実データのスキル分類は「フレームワーク」を「フロントエンド」「バックエンド」に
 * 分けて登録しているため、同じ概念として両方を許可リストに含める
 * （分類名は `skills` ブロックの自由入力文字列で、DB のキー体系ではない）。
 */
export const PRINT_YEAR_VISIBLE_CATEGORIES = new Set([
  '言語',
  'フレームワーク',
  'フロントエンド',
  'バックエンド',
  'インフラ',
]);

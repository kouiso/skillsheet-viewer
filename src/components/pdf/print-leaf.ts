import type { ReactElement } from 'react';

/**
 * measure-then-place の単位「葉」。
 *
 * 印刷経路はこれまで @react-pdf の自動改ページに任せ、変な結果が出るたびに
 * `wrap` / `minPresenceAhead` / 高さ 0 の先行兄弟 でつついてきた。本文の長さが閾値を
 * またいだ途端に別の場所で崩れるのはその作りが原因なので、描く前に全部の高さを測り、
 * どのページに何を置くかを自分で決める（`print-measure.tsx` → `print-paginate.ts`）。
 * 葉は「これ以上は分割の単位にしない」塊で、必ず 1 ページに収まる大きさに保つ
 * （段落は行で割る）。
 */
export type LeafKind =
  | 'company-heading'
  | 'company-note'
  | 'card-header'
  | 'meta'
  | 'tech-group'
  | 'section-label'
  | 'paragraph'
  | 'bullet'
  | 'block'
  | 'compact-header'
  | 'compact-row'
  | 'compact-body';

/**
 * 案件カードの枠（1 枚のカードを複数の葉に割ったとき、各葉が受け持つ辺と余白）。
 * 上辺・下辺は静的に決める（カードの先頭の葉だけ上辺、末尾の葉だけ下辺）。ページを跨いだ
 * 箇所では @react-pdf が自動分割していた頃と同じく枠が開いたままになる。
 */
export interface CardFrame {
  top: boolean;
  bottom: boolean;
  /** 左右の辺。簡約表は左右の枠を持たない。 */
  sides: boolean;
  padTop: number;
  padBottom: number;
  padHorizontal: number;
  /** 習得スキル・実績ブロックの薄い塗り。 */
  surface: boolean;
  /** ブロックの仕切り（下罫線）。カードの最後のブロックには付けない。 */
  divider: boolean;
}

/**
 * 葉を包む枠の指定。**測定と描画で同じ関数（`frameLeaf`）がこれを同じ幅の枠に変える**。
 * 行数は幅だけで決まるので、ここが唯一「測った高さと置いた高さ」がズレ得る場所になる。
 */
export interface FrameSpec {
  /** 会社セクション左のレール（縦罫線 + 内側の余白）。 */
  rail: boolean;
  /** レールの内側で、この葉の上に取る余白（カード同士の間隔など）。 */
  gapAbove: number;
  /** 葉の下（レールの外側）に取る余白。会社と会社の間隔。 */
  marginBottom: number;
  card: CardFrame | null;
  /** 葉の中身の字下げ（入れ子の箇条書き）。 */
  indent: number;
  /** 会社の終わりを示す短い罫線を、この葉の直後に描く。 */
  endMarker: boolean;
}

export interface Leaf {
  id: string;
  kind: LeafKind;
  companyId: string;
  /** 継続見出し用のラベル（会社名 + 区分）。 */
  companyLabel?: string;
  /** 同じカードの葉は枠（border）を共有する。カードに属さない葉は undefined。 */
  cardId?: string;
  cardLabel?: string;
  cardLevel?: 'detail' | 'compact';
  /** 同じ簡約表に属する葉。表がページを跨いだとき、次ページ先頭に列ヘッダーを置く判定に使う。 */
  groupId?: string;
  /** 中身。測定でも描画でも同じ要素を同じ幅で置くことで、行数のズレを塞ぐ。 */
  el: ReactElement;
  frame?: FrameSpec;
  /** true なら次の葉と同じページに置く。置けなければ連鎖ごと次ページへ送る（見出し類）。 */
  keepWithNext: boolean;
  /** 'lines' は Text を 1 つだけ持つ葉で、行境界で 2 つに割ってよい。 */
  splittable: 'lines' | 'never';
  /** 装飾の無い本文そのもの。`splittable: 'lines'` の葉だけ持ち、行の切れ目で 2 つに分ける元になる。 */
  text?: string;
  /** 割った頭・尻の本文から同じ形の要素を作り直す。`splittable: 'lines'` の葉だけ持つ。 */
  remake?: (text: string) => ReactElement;
}

export interface MeasuredLine {
  height: number;
  /** 改行後の 1 行の文字列。ハイフネーション用の空マーカーは含まない。 */
  string: string;
}

export interface MeasuredLeaf extends Leaf {
  /** 外枠（margin を除く border box）の高さ pt。 */
  height: number;
  marginTop: number;
  marginBottom: number;
  /** `splittable: 'lines'` の葉だけ持つ。Text が 2 つ以上あるときは付けない（割れない）。 */
  lines?: MeasuredLine[];
}

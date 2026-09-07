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
  | 'card-header'
  | 'meta'
  | 'tech-group'
  | 'section-label'
  | 'paragraph'
  | 'bullet'
  | 'compact-header'
  | 'compact-row'
  | 'compact-body'
  | 'company-end';

export interface Leaf {
  id: string;
  kind: LeafKind;
  companyId: string;
  /** 同じカードの葉は枠（border）を共有する。カードに属さない葉は undefined。 */
  cardId?: string;
  /** 中身。測定でも描画でも同じ要素を同じ幅で置くことで、行数のズレを塞ぐ。 */
  el: ReactElement;
  /** true なら次の葉と同じページに置く。置けなければ連鎖ごと次ページへ送る（見出し類）。 */
  keepWithNext: boolean;
  /** 'lines' は Text を 1 つだけ持つ葉で、行境界で 2 つに割ってよい。 */
  splittable: 'lines' | 'never';
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

import { beforeEach, describe, expect, it } from 'vitest';

import type { Leaf, MeasuredLeaf, MeasuredLine } from './print-leaf';
import { type PaginateOptions, paginate } from './print-paginate';

/**
 * `paginate` は高さの数字だけで決まる純粋な関数なので、@react-pdf を一切使わずに
 * 「見出しが最後に残らない」「記号なしの尻が作られる」といった意図を固定できる。
 * 実際の描画との一致は print-measure-place.node.test.tsx が見る。
 */

const CONTENT = 754;
const LINE = 19;

let seq = 0;
function leaf(height: number, extra: Partial<MeasuredLeaf> = {}): MeasuredLeaf {
  seq++;
  return {
    id: `L${seq}`,
    kind: 'paragraph',
    companyId: 'c',
    el: null as unknown as Leaf['el'],
    keepWithNext: false,
    splittable: 'never',
    height,
    marginTop: 0,
    marginBottom: 0,
    ...extra,
  };
}

function paragraph(lines: number, extra: Partial<MeasuredLeaf> = {}): MeasuredLeaf {
  const measured: MeasuredLine[] = Array.from({ length: lines }, (_, i) => ({ height: LINE, string: `行${i + 1}` }));
  return leaf(lines * LINE, { splittable: 'lines', lines: measured, ...extra });
}

function heading(height = 30): MeasuredLeaf {
  return leaf(height, { kind: 'section-label', keepWithNext: true });
}

/** 分割した葉を「行数 × 行高」で測り直すモック。文字列の再改行は起きない前提。 */
const options: PaginateOptions = {
  contentHeight: CONTENT,
  // 分割行を葉に持たせ、measure が「行数 × 行高」で測り直す
  split: (source, head, tail) => ({
    head: { ...source, id: `${source.id}-head`, __lines: head } as Leaf,
    tail: { ...source, id: `${source.id}-tail`, __lines: tail } as Leaf,
  }),
  measure: async (source) => {
    const picked = (source as Leaf & { __lines?: MeasuredLine[] }).__lines ?? [];
    return { ...source, height: picked.length * LINE, marginTop: 0, marginBottom: 0, lines: picked };
  },
};

const ids = (pages: Awaited<ReturnType<typeof paginate>>) => pages.map((p) => p.leaves.map((l) => l.leaf.id));

describe('paginate', () => {
  beforeEach(() => {
    seq = 0;
  });

  it('入る限り同じページに積み、入らなくなったら次ページへ送る', async () => {
    const pages = await paginate([leaf(300), leaf(300), leaf(300)], options);
    expect(ids(pages)).toEqual([['L1', 'L2'], ['L3']]);
    expect(pages[0].leaves[1].top).toBe(300);
    expect(pages[1].leaves[0].top).toBe(0);
  });

  it('marginTop は先頭の葉でも効き、top に足される', async () => {
    const pages = await paginate([leaf(100, { marginTop: 12, marginBottom: 8 }), leaf(100)], options);
    expect(pages[0].leaves[0].top).toBe(12);
    expect(pages[0].leaves[1].top).toBe(120);
    expect(pages[0].usedHeight).toBe(220);
  });

  it('見出し（keepWithNext）は次の葉と同居できなければ連鎖ごと次ページへ', async () => {
    const pages = await paginate([leaf(700), heading(30), leaf(100)], options);
    expect(ids(pages)).toEqual([['L1'], ['L2', 'L3']]);
  });

  it('見出しの次が長い段落なら、最初の 2 行が同居できれば見出しは残る', async () => {
    // 700 + 30 + 2 行(38) = 768 > 754 → 送る。700 + 30 + 2 行が入る 686 なら残る。
    const sent = await paginate([leaf(700), heading(30), paragraph(10)], options);
    expect(ids(sent)[0]).toEqual(['L1']);
    const kept = await paginate([leaf(686), heading(30), paragraph(10)], options);
    expect(ids(kept)[0]).toEqual(['L4', 'L5', 'L6-head']);
    expect(kept[0].leaves[2].leaf.lines).toHaveLength(2);
  });

  it('keepWithNext の連鎖が 1 ページを超えるときだけ連鎖を切る', async () => {
    // 見出し 30 → カードヘッダー 40（keep）→ 分割不可の本文 720。合計 790 > 754。
    // 連鎖を尻から切って「見出し + ヘッダー = 70」で判定するので、残り 100 のページに残る。
    const pages = await paginate([leaf(654), heading(30), leaf(40, { keepWithNext: true }), leaf(720)], options);
    expect(ids(pages)).toEqual([['L1', 'L2', 'L3'], ['L4']]);
  });

  it('4 行以上の段落は頭 ≥ 2 行・尻 ≥ 2 行で割り、尻は次ページ先頭に来る', async () => {
    const pages = await paginate([leaf(700), paragraph(6)], options);
    // 残り 54 → 2 行(38) が入る
    expect(ids(pages)).toEqual([['L1', 'L2-head'], ['L2-tail']]);
    expect(pages[0].leaves[1].leaf.lines).toHaveLength(2);
    expect(pages[1].leaves[0].leaf.lines).toHaveLength(4);
  });

  it('3 行以下の段落は割らず丸ごと送る', async () => {
    const pages = await paginate([leaf(700), paragraph(3)], options);
    expect(ids(pages)).toEqual([['L1'], ['L2']]);
  });

  it('尻に 2 行残せない位置では割らず丸ごと送る', async () => {
    // 残り 54 = 2 行ぶん。4 行の段落を 2/2 には割れるが、5 行を 4/1 には割らない。
    const pages = await paginate([leaf(700), paragraph(4)], options);
    expect(ids(pages)).toEqual([['L1', 'L2-head'], ['L2-tail']]);
    const pages2 = await paginate([leaf(700 - 2 * LINE), paragraph(4)], { ...options });
    // 残り 92 = 4 行ぶん入るので割らない
    expect(ids(pages2)).toEqual([['L3', 'L4']]);
  });

  it('測り直しで頭が入らなければ 1 行減らす', async () => {
    // 頭を「見積りより 1 行高く」返す measure。残り 57 に 3 行(57) は見積り上入るが実測 4 行(76) で溢れる。
    let calls = 0;
    const strict: PaginateOptions = {
      ...options,
      measure: async (source) => {
        calls++;
        const measured = await options.measure(source);
        if (source.id.endsWith('-head')) return { ...measured, height: measured.height + LINE };
        return measured;
      },
    };
    const pages = await paginate([leaf(CONTENT - 3 * LINE), paragraph(8)], strict);
    expect(ids(pages)).toEqual([['L1', 'L2-head'], ['L2-tail']]);
    expect(pages[0].leaves[1].leaf.lines).toHaveLength(2);
    // 3 行で 1 回失敗 → 2 行で成功 → 尻 = 3 回
    expect(calls).toBe(3);
  });

  it('1 ページより高い段落は空ページでも割り、2 回以上に分かれる', async () => {
    const pages = await paginate([paragraph(90)], options);
    // 754 / 19 = 39.6 → 39 行ずつ
    expect(pages.map((p) => p.leaves.map((l) => l.leaf.lines?.length))).toEqual([[39], [39], [12]]);
    for (const p of pages) expect(p.usedHeight).toBeLessThanOrEqual(CONTENT);
  });

  it('割れない葉が 1 ページより高ければ、消さずにそのまま置く', async () => {
    const pages = await paginate([leaf(100), leaf(900), leaf(100)], options);
    expect(ids(pages)).toEqual([['L1'], ['L2'], ['L3']]);
  });

  it('ランダムな高さ 1000 葉で、順序が保たれ、割れない葉だけのページは本文高さを超えない', async () => {
    let state = 12345;
    const rand = () => {
      state = (state * 1103515245 + 12345) % 2147483648;
      return state / 2147483648;
    };
    const input: MeasuredLeaf[] = [];
    for (let i = 0; i < 1000; i++) {
      const r = rand();
      if (r < 0.3) input.push(paragraph(1 + Math.floor(rand() * 30)));
      else if (r < 0.45) input.push(heading(20 + Math.floor(rand() * 40)));
      else input.push(leaf(10 + Math.floor(rand() * 300), { marginTop: rand() < 0.5 ? 0 : 8, marginBottom: 8 }));
    }
    const pages = await paginate(input, options);
    const order = pages.flatMap((p) => p.leaves.map((l) => l.leaf.id.replace(/-(head|tail)$/, '')));
    const expected = input.map((l) => l.id);
    // 分割された葉は同じ id が続くので重複を潰してから比較する
    expect(order.filter((id, i) => order[i - 1] !== id)).toEqual(expected);
    for (const p of pages) {
      const last = p.leaves[p.leaves.length - 1];
      expect(last.top + last.leaf.height).toBeLessThanOrEqual(CONTENT + 0.01);
      // 見出しがページ末尾に残っていない
      expect(last.leaf.keepWithNext && p !== pages[pages.length - 1]).toBe(false);
    }
  });
});

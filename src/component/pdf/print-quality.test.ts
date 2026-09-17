import { describe, expect, it } from 'vitest';
import {
  continuesPreviousCard,
  findBottomOverflows,
  findBoxOverlaps,
  findOrphanListMarker,
  findWrappedHeaderLines,
  measurePageFill,
  DEFAULT_QUALITY_OPTIONS as O,
  type QualityItem,
  type QualityPage,
} from './print-quality';

const item = (text: string, x: number, y: number, width: number, size = 11.5): QualityItem => ({
  text,
  x,
  y,
  width,
  size,
});

describe('findBoxOverlaps（検査 8）', () => {
  it('行間 1.75 で正しく積まれた 2 行は重なりに数えない', () => {
    // 11.5pt × 1.75 = 20.1pt。字面（上 0.88em / 下 0.22em）は届かない。
    expect(findBoxOverlaps([item('一行目', 40, 700, 60), item('二行目', 40, 679.9, 60)])).toHaveLength(0);
  });

  it('数 pt ずれて重なった 2 つの塊を拾う（検査 1 の y 差 1pt 未満では拾えなかった形）', () => {
    // 実測（旧 v4 の p26）: y=44.4 と y=51.6 の 7.2pt ずれで字面が重なっていた。
    const found = findBoxOverlaps([item('計 〜 総合', 100, 44.4, 31), item('HTML', 100, 51.6, 31)]);
    expect(found).toHaveLength(1);
    expect(found[0].ratio).toBeGreaterThan(0.9);
  });

  it('横に並んでいるだけ（同じ行の隣の run）は重なりに数えない', () => {
    expect(findBoxOverlaps([item('前半', 40, 700, 30), item('後半', 70, 700, 30)])).toHaveLength(0);
  });
});

describe('findBottomOverflows（検査 9）', () => {
  it('本文の下端より下に描かれた item を拾う', () => {
    expect(findBottomOverflows([item('溢れた行', 40, 34.5, 40)]).map((i) => i.text)).toEqual(['溢れた行']);
  });

  it('running footer は本文ではないので数えない', () => {
    const footer = 'I・K ／ エンジニアスキルシート';
    expect(findBottomOverflows([item(footer, 40, 16, 120, 11)], O, footer)).toHaveLength(0);
    // ページ番号は pdfjs が `26` / `/` / `46` に割って返すことがある。
    expect(findBottomOverflows([item('26', 500, 16, 12, 11), item('/', 512, 16, 4, 11)], O, footer)).toHaveLength(0);
  });

  it('本文が footer と同じ高さまで流れ込んだら拾う（帯だけで除外しない）', () => {
    // レビュー指摘: 座標だけで下端の帯を除外すると、y=20 まで溢れた本文を見逃す。
    const footer = 'I・K ／ エンジニアスキルシート';
    const found = findBottomOverflows([item('溢れた本文', 100, 20, 60), item(footer, 40, 16, 120, 11)], O, footer);
    expect(found.map((i) => i.text)).toEqual(['溢れた本文']);
  });

  it('本文の範囲内は数えない', () => {
    expect(findBottomOverflows([item('普通の行', 40, O.contentBottom + 1, 40)])).toHaveLength(0);
  });
});

describe('findWrappedHeaderLines（検査 10）', () => {
  it('継続見出しが 1 行なら指摘しない', () => {
    // 実測: 見出し 813.1 / 本文 1 行目 786.6。
    expect(findWrappedHeaderLines([item('会社（つづき）', 40, 813.1, 200, 11), item('本文', 40, 786.6, 40)])).toEqual(
      [],
    );
  });

  it('見出しの 2 行目が本文の帯へ割り込んだら拾う', () => {
    // 実測（旧 v4 の p4）: 813.1 見出し / 796.1 見出し 2 行目 / 786.6 本文。
    const found = findWrappedHeaderLines([
      item('会社（つづき）　案件', 40, 813.1, 400, 11),
      item('（続き）', 40, 796.1, 40, 11),
      item('本文', 40, 786.6, 40),
    ]);
    expect(found).toEqual([796]);
  });
});

describe('measurePageFill（検査 11 の入力）', () => {
  it('版面の下端まで本文があるページは 100% に近い', () => {
    const fill = measurePageFill([item('先頭', 40, 786, 40), item('末尾', 40, 50, 40)]);
    expect(fill.usedRatio).toBeGreaterThan(0.99);
    expect(fill.gap).toBeCloseTo(4, 1);
  });

  it('本文が上の方で終わっていれば、その割合が出る', () => {
    // 800 − 0.5 × 754 = 423。ちょうど半分。
    const fill = measurePageFill([item('先頭', 40, 786, 40), item('途中で終わる', 40, 423, 60)]);
    expect(fill.usedRatio).toBeCloseTo(0.5, 2);
  });

  it('running footer は本文の下端に数えない（数えると全ページが埋まっていることになる）', () => {
    const footer = 'I・K ／ エンジニアスキルシート';
    const fill = measurePageFill([item('本文', 40, 700, 40), item(footer, 40, 16, 120, 11)], O, footer);
    expect(fill.bottom).toBe(700);
  });

  it('本文が 1 行も無いページは利用率 0 になる', () => {
    const footer = 'I・K ／ エンジニアスキルシート';
    expect(measurePageFill([item(footer, 40, 16, 120, 11)], O, footer).usedRatio).toBe(0);
  });
});

describe('continuesPreviousCard（同じカードの続きか）', () => {
  // 継続見出しは絶対配置で本文上端（800pt）より上に出る。y=813 は実測値。
  it('案件名の「（続き）」が上端に乗っていれば、同じカードの続き', () => {
    expect(
      continuesPreviousCard([item('会員基盤リプレイス（続き）', 40, 813.1, 200, 11), item('本文', 40, 700, 40)]),
    ).toBe(true);
  });

  it('会社名の「（つづき）」だけなら、カードは変わっている', () => {
    // 会社は平仮名の「つづき」、案件は漢字の「続き」で表記が分かれている。
    expect(continuesPreviousCard([item('B社（ベンチャー企業）（つづき）', 40, 813.1, 200, 11)])).toBe(false);
  });

  it('本文の中の「（続き）」は継続見出しではない（上端の帯だけを見る）', () => {
    expect(continuesPreviousCard([item('本文に（続き）と書いてあるだけ', 40, 700, 200)])).toBe(false);
  });
});

describe('findOrphanListMarker（検査 12）', () => {
  it('最下段が箇条書きの記号 1 文字だけなら拾う', () => {
    expect(findOrphanListMarker([item('本文の行', 40, 300, 60), item('—', 40, 280, 6)])).toBe('—');
  });

  it('順序付きリストの番号だけでも拾う', () => {
    expect(findOrphanListMarker([item('本文の行', 40, 300, 60), item('12.', 40, 280, 12)])).toBe('12.');
  });

  it('記号のあとに本文が続いていれば正常', () => {
    expect(findOrphanListMarker([item('—', 40, 280, 6), item('本文が同じ行にある', 52, 280, 90)])).toBeUndefined();
  });

  it('running footer を最下段と取り違えない', () => {
    const footer = 'I・K ／ エンジニアスキルシート';
    const page: QualityPage = [item('—', 40, 280, 6), item(footer, 40, 16, 120, 11)];
    expect(findOrphanListMarker(page, O, footer)).toBe('—');
  });
});

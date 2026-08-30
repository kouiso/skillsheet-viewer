import { describe, expect, it } from 'vitest';
import {
  findBottomOverflows,
  findBoxOverlaps,
  findWrappedHeaderLines,
  DEFAULT_QUALITY_OPTIONS as O,
  type QualityItem,
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
    expect(findBottomOverflows([item('I・K ／ エンジニアスキルシート', 40, 16, 120, 11)])).toHaveLength(0);
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

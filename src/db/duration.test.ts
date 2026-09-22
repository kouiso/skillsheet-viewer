import { describe, expect, it } from 'vitest';
import { currentMonthKey } from './derived-display';
import { durationFromRange, parseDurationMonths, resolveDuration } from './duration';

const ref = 2026 * 12 + 8;
describe('durationの完全一致換算', () => {
  it.each([
    ['1年', 12],
    ['2ヶ月', 2],
    ['1年2か月', 14],
    ['半年', 6],
    [' 0か月 ', 0],
  ] as const)('%s', (text, months) => {
    expect(parseDurationMonths(text)).toBe(months);
  });
  it.each(['約1年', '１年', '1.5年', '', '1年くらい'])('未知・近似の%sを推測しない', (text) => {
    expect(parseDurationMonths(text)).toBeNull();
  });
});
describe('durationの原文保持と矛盾', () => {
  it('未来の終了月を経験の経過月へ含めない', () => {
    expect(resolveDuration('2026.08 — 2026.12', undefined, ref)).toMatchObject({ derivedMonths: 2, label: '2ヶ月' });
  });
  it('基準月なしでは現在時刻で算出せず原文を残す', () => {
    expect(resolveDuration('2026.01 — 現在', ' 半年 ')).toEqual({
      manual: ' 半年 ',
      derivedMonths: null,
      label: '半年',
      conflict: false,
    });
  });

  it('同月を1ヶ月とし、本人入力の同義表記を保持する', () => {
    expect(resolveDuration('2020.01 — 2020.01', ' 1ヶ月 ', ref)).toEqual({
      manual: ' 1ヶ月 ',
      derivedMonths: 1,
      label: '1ヶ月',
      conflict: false,
    });
  });
  it('確定期間との換算可能な矛盾だけを止める', () => {
    expect(resolveDuration('2020.01 — 2020.12', '半年', ref)).toMatchObject({ conflict: true, label: '半年' });
    expect(resolveDuration('2020.01 — 2020.12', '約半年', ref)).toMatchObject({ conflict: false, label: '約半年' });
  });
  it('conflict は期間自身の幅と比較し、基準月での clamp（経過月）とは分ける（#354）', () => {
    // 終了が基準月より後の閉じた期間: 本人入力「1年」は期間の幅12ヶ月と一致 → 矛盾ではない。
    // 旧実装は経過月9ヶ月と比較して誤って conflict → PDF 出力を止めていた。
    expect(resolveDuration('2026.01 — 2026.12', '1年', ref)).toMatchObject({ conflict: false, derivedMonths: 9 });
    // 逆に経過月と偶然一致する誤入力は、期間の幅と違うので検出できる
    expect(resolveDuration('2026.01 — 2026.12', '9ヶ月', ref)).toMatchObject({ conflict: true });
  });
  it('継続中は本人入力と基準月の導出を両方残す', () => {
    expect(resolveDuration('2026.01 — 現在', '半年', ref)).toMatchObject({
      conflict: false,
      label: '本人入力 半年／2026-09基準 9ヶ月',
    });
  });
  it('不明期間の本人入力を消さず、未入力は未確定とする', () => {
    expect(resolveDuration('不明', '半年', ref)).toMatchObject({ label: '半年', derivedMonths: null, conflict: false });
    expect(resolveDuration('不明', undefined, ref).label).toBe('未確定');
  });
});

describe('durationFromRange', () => {
  it('開始・終了から両端含む月数を導出する', () => {
    expect(durationFromRange('2020-06', '2021-08', false)).toBe('1年3ヶ月');
    expect(durationFromRange('2025-01', '2025-04', false)).toBe('4ヶ月');
  });

  it('ongoing=true のときは基準月時点の月数を出す（viewer と同じ語彙）', () => {
    const expected = resolveDuration('2024.01 — 現在', undefined, currentMonthKey()).label;
    expect(expected).not.toBe('継続中');
    expect(expected).not.toBe('未確定');
    expect(durationFromRange('2024-01', '', true)).toBe(expected);
  });

  it('start が不正なら空文字', () => {
    expect(durationFromRange('', '2021-08', false)).toBe('');
  });

  it('ongoing=false で終了月が未入力なら空文字（継続中はチェック時のみ）', () => {
    expect(durationFromRange('2020-06', '', false)).toBe('');
  });
});

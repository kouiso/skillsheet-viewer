import { describe, expect, it } from 'vitest';
import { parseDurationMonths, resolveDuration } from './duration';

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
    expect(resolveDuration('2026.08 — 2026.12', undefined, ref)).toMatchObject({ derivedMonths: 2, label: '2か月' });
  });
  it('基準月なしでは現在時刻で算出せず原文を残す', () => {
    expect(resolveDuration('2026.01 — 現在', ' 半年 ')).toEqual({
      manual: ' 半年 ',
      derivedMonths: null,
      label: '半年',
      conflict: false,
    });
  });

  it('同月を1か月とし、本人入力の同義表記を保持する', () => {
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
  it('継続中は本人入力と基準月の導出を両方残す', () => {
    expect(resolveDuration('2026.01 — 現在', '半年', ref)).toMatchObject({
      conflict: false,
      label: '本人入力 半年／2026-09基準 9か月',
    });
  });
  it('不明期間の本人入力を消さず、未入力は未確定とする', () => {
    expect(resolveDuration('不明', '半年', ref)).toMatchObject({ label: '半年', derivedMonths: null, conflict: false });
    expect(resolveDuration('不明', undefined, ref).label).toBe('未確定');
  });
});

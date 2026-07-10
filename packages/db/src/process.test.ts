import { describe, expect, it } from 'vitest';
import {
  deriveDuration,
  flattenTech,
  formatMonthToken,
  formatPeriodDisplay,
  normalizeProcess,
  parseStart,
  parseTokenToDate,
  serializeDateToken,
  sortByStartDesc,
  splitPeriodRange,
} from './process';

describe('normalizeProcess', () => {
  it('未知の語彙は other に落ちる', () => {
    const result = normalizeProcess(['要件定義', 'インフラ構築']);
    expect(result.done[0]).toBe(true);
    expect(result.other).toEqual(['インフラ構築']);
  });

  it('labels 未指定（デフォルト引数）でも例外にならない', () => {
    const result = normalizeProcess(undefined);
    expect(result.done).toEqual(new Array(7).fill(false));
    expect(result.other).toEqual([]);
  });
});

describe('deriveDuration', () => {
  it('開始・終了とも判明していれば月数から算出する', () => {
    expect(deriveDuration('2025.1 — 2025.4')).toBe('4ヶ月');
  });

  it('終端が「現在」なら継続中', () => {
    expect(deriveDuration('2025.11 — 現在')).toBe('継続中');
  });

  it('period が空文字の場合は継続中ではなく空文字を返す（レガシーデータの誤表示防止）', () => {
    expect(deriveDuration('')).toBe('');
  });

  it('period が undefined/非文字列でも例外にならず空文字を返す', () => {
    // @ts-expect-error 型上は string だが、レガシーデータ由来の非文字列混入を想定する。
    expect(deriveDuration(undefined)).toBe('');
  });
});

describe('parseStart', () => {
  it('YYYY.MM 形式を解釈できる', () => {
    expect(parseStart('2025.11 — 現在')).toBeCloseTo(2025 + 10 / 12);
  });
});

describe('flattenTech', () => {
  it('6バケットを初出順・重複なしでフラット化する', () => {
    const tech = { lang: ['TS', 'Go'], fw: ['Next.js', 'TS'], db: [], infra: [], tools: [], collab: [] };
    expect(flattenTech(tech)).toEqual(['TS', 'Go', 'Next.js']);
  });

  it('tech が undefined でも例外にならない', () => {
    // @ts-expect-error レガシーデータ由来の欠損を想定する。
    expect(flattenTech(undefined)).toEqual([]);
  });

  it('特定バケットが欠落していても例外にならない', () => {
    const tech = { lang: ['TS'], fw: ['Next.js'] };
    // @ts-expect-error 一部バケット欠損のレガシーデータを想定する。
    expect(flattenTech(tech)).toEqual(['TS', 'Next.js']);
  });
});

describe('sortByStartDesc', () => {
  it('start 降順（新しい順）に並べ、null は末尾へ安定ソートする', () => {
    const items = [{ p: '2020.1' }, { p: '2025.1' }, { p: '不明' }, { p: '2023.1' }];
    const sorted = sortByStartDesc(items, (i) => i.p);
    expect(sorted.map((i) => i.p)).toEqual(['2025.1', '2023.1', '2020.1', '不明']);
  });
});

describe('splitPeriodRange（export化の確認）', () => {
  it('〜 区切りを分割できる', () => {
    expect(splitPeriodRange('2020.04〜2023.03')).toEqual(['2020.04', '2023.03']);
  });

  it('終了なし（進行中）を正しく分割する', () => {
    expect(splitPeriodRange('2020.04〜')).toEqual(['2020.04', '']);
  });

  it('区切りなし単独トークンは [token, ""] を返す', () => {
    expect(splitPeriodRange('2020')).toEqual(['2020', '']);
  });
});

describe('formatMonthToken', () => {
  it('ISO日付（YYYY-MM-DD）を YYYY.MM 形式に整形する', () => {
    expect(formatMonthToken('2020-04-15')).toBe('2020.04');
  });

  it('前後の空白をトリムして整形する（回帰防止）', () => {
    expect(formatMonthToken('  2020-04-15  ')).toBe('2020.04');
  });

  it('YYYY-MM 形式を YYYY.MM 形式に整形する', () => {
    expect(formatMonthToken('2020-04')).toBe('2020.04');
  });

  it('YYYY.MM 形式はゼロパディングして返す', () => {
    expect(formatMonthToken('2020.4')).toBe('2020.04');
  });

  it('「現在」トークンはそのまま返す', () => {
    expect(formatMonthToken('現在')).toBe('現在');
  });

  it('解釈できない文字列はそのまま返す（データを壊さない）', () => {
    expect(formatMonthToken('2020年4月')).toBe('2020年4月');
  });
});

describe('formatPeriodDisplay', () => {
  it('ISO日付範囲を月精度で表示する', () => {
    expect(formatPeriodDisplay('2020-04-15〜2023-03-20')).toBe('2020.04〜2023.03');
  });

  it('区切りありで終了空 = 進行中（「現在」が付く）', () => {
    expect(formatPeriodDisplay('2020.04〜')).toBe('2020.04〜現在');
  });

  it('区切りなし単独トークンには「〜現在」を付けない（回帰防止）', () => {
    expect(formatPeriodDisplay('2020')).toBe('2020');
  });

  it('既存の「〜現在」表記をそのまま整形する', () => {
    expect(formatPeriodDisplay('2020.04〜現在')).toBe('2020.04〜現在');
  });

  it('空文字はそのまま返す', () => {
    expect(formatPeriodDisplay('')).toBe('');
  });
});

describe('serializeDateToken', () => {
  it('Date を YYYY-MM-DD 文字列にシリアライズする', () => {
    expect(serializeDateToken(new Date(2023, 2, 20))).toBe('2023-03-20');
  });

  it('月・日を2桁ゼロパディングする', () => {
    expect(serializeDateToken(new Date(2020, 3, 5))).toBe('2020-04-05');
  });
});

describe('parseTokenToDate', () => {
  it('ISO日付トークンを正確な Date に変換する', () => {
    const d = parseTokenToDate('2020-04-15');
    expect(d).toBeInstanceOf(Date);
    expect(d?.getFullYear()).toBe(2020);
    expect(d?.getMonth()).toBe(3); // 0-indexed
    expect(d?.getDate()).toBe(15);
  });

  it('月精度トークン（YYYY.MM）は 1 日補完する', () => {
    const d = parseTokenToDate('2020.04');
    expect(d?.getDate()).toBe(1);
  });

  it('「現在」トークンは undefined を返す', () => {
    expect(parseTokenToDate('現在')).toBeUndefined();
  });

  it('空文字は undefined を返す', () => {
    expect(parseTokenToDate('')).toBeUndefined();
  });
});

describe('parseStart/deriveDuration（ISO日付トークン対応の回帰防止）', () => {
  it('ISO日付トークンを含む期間を既存の月精度トークンと同じ精度で解釈する', () => {
    expect(parseStart('2020-04-15 — 2023-03-20')).toBeCloseTo(2020 + 3 / 12);
    expect(deriveDuration('2020-04-15 — 2023-03-20')).toBe('3年');
  });
});

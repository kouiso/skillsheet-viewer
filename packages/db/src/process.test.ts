import { describe, expect, it } from 'vitest';
import {
  deriveCompanyPeriod,
  deriveDuration,
  durationFromRange,
  flattenTech,
  formatMonthToken,
  formatPeriodDisplay,
  formatPeriodRange,
  labelsForProcessIndex,
  normalizeProcess,
  parsePeriodToRange,
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

  it('7段モデルの正準ラベル「実装・単体」「保守・運用」は certain として done になる', () => {
    const result = normalizeProcess(['実装・単体', '保守・運用']);
    expect(result.done[3]).toBe(true);
    expect(result.done[6]).toBe(true);
    expect(result.uncertain.every((u) => u === false)).toBe(true);
    expect(result.other).toEqual([]);
  });

  it('レガシー語彙「実装」「運用・保守」も従来どおり certain として動作する', () => {
    const result = normalizeProcess(['実装', '運用・保守']);
    expect(result.done[3]).toBe(true);
    expect(result.done[6]).toBe(true);
    expect(result.other).toEqual([]);
  });

  it('「テスト」は結合/総合の uncertain のまま（done にしない）', () => {
    const result = normalizeProcess(['テスト']);
    expect(result.done[4]).toBe(false);
    expect(result.done[5]).toBe(false);
    expect(result.uncertain[4]).toBe(true);
    expect(result.uncertain[5]).toBe(true);
  });

  it('「テスト」＋「結合テスト」の共存でも done と uncertain は同じ index で同時に true にならない', () => {
    // レガシー「テスト」を温存したままエディタで「結合テスト」を ON にした状態。
    // done[4] が確定した段は uncertain から外す（同一案件を donut と「確認中」に二重計上しない）。
    const result = normalizeProcess(['テスト', '結合テスト']);
    expect(result.done[4]).toBe(true);
    expect(result.uncertain[4]).toBe(false);
    // 総合テスト側は依然として不確実のまま
    expect(result.done[5]).toBe(false);
    expect(result.uncertain[5]).toBe(true);
  });
});

describe('labelsForProcessIndex', () => {
  it('index=3 には「実装」と「実装・単体」の両方が含まれる', () => {
    const labels = labelsForProcessIndex(3);
    expect(labels).toContain('実装');
    expect(labels).toContain('実装・単体');
  });

  it('index=6 には「運用・保守」と「保守・運用」の両方が含まれる', () => {
    const labels = labelsForProcessIndex(6);
    expect(labels).toContain('運用・保守');
    expect(labels).toContain('保守・運用');
  });

  it('uncertain マッチ（「テスト」）は含まれない', () => {
    expect(labelsForProcessIndex(4)).not.toContain('テスト');
    expect(labelsForProcessIndex(5)).not.toContain('テスト');
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

  it('終了が単に未記載（開始のみ）の period は継続中とみなさず空文字を返す', () => {
    // 継続中チェック OFF のまま終了月未入力の案件（"2020.06"）や単年レガシー（"2020"）を
    // 「継続中」と誤表示しない。「継続中」は "現在" 終端の明示があるときだけ。
    expect(deriveDuration('2020.06')).toBe('');
    expect(deriveDuration('2020')).toBe('');
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

  it('レガシー表記（YYYY年M月）も月精度トークンとして解釈する（parseYearMonthとの解釈ゆれ回帰防止）', () => {
    const d = parseTokenToDate('2020年4月');
    expect(d).toBeInstanceOf(Date);
    expect(d?.getFullYear()).toBe(2020);
    expect(d?.getMonth()).toBe(3); // 0-indexed
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

describe('formatPeriodRange', () => {
  it('開始・終了とも指定されていれば "YYYY.MM — YYYY.MM" を組み立てる', () => {
    expect(formatPeriodRange('2020-06', '2021-08', false)).toBe('2020.06 — 2021.08');
  });

  it('ongoing=true のとき終端は「現在」', () => {
    expect(formatPeriodRange('2024-01', '', true)).toBe('2024.01 — 現在');
  });

  it('start が不正/空なら空文字（レガシー period 温存のフォールバック）', () => {
    expect(formatPeriodRange('', '2021-08', false)).toBe('');
    expect(formatPeriodRange('不明', '2021-08', false)).toBe('');
  });

  it('end が不正/空なら開始のみ表示する', () => {
    expect(formatPeriodRange('2020-06', '', false)).toBe('2020.06');
  });
});

describe('durationFromRange', () => {
  it('開始・終了から両端含む月数を導出する', () => {
    expect(durationFromRange('2020-06', '2021-08', false)).toBe('1年3ヶ月');
    expect(durationFromRange('2025-01', '2025-04', false)).toBe('4ヶ月');
  });

  it('ongoing=true のときは「継続中」', () => {
    expect(durationFromRange('2024-01', '', true)).toBe('継続中');
  });

  it('start が不正なら空文字', () => {
    expect(durationFromRange('', '2021-08', false)).toBe('');
  });

  it('ongoing=false で終了月が未入力なら「継続中」ではなく空文字（継続中はチェック時のみ）', () => {
    expect(durationFromRange('2020-06', '', false)).toBe('');
  });
});

describe('parsePeriodToRange', () => {
  it('"YYYY.MM — YYYY.MM" を月入力初期値へ変換する', () => {
    expect(parsePeriodToRange('2020.06 — 2021.08')).toEqual({ start: '2020-06', end: '2021-08', ongoing: false });
  });

  it('終端「現在」は ongoing=true になる', () => {
    expect(parsePeriodToRange('2024.01 — 現在')).toEqual({ start: '2024-01', end: '', ongoing: true });
  });

  it('"YYYY年M月〜YYYY年M月" 表記も解釈できる', () => {
    expect(parsePeriodToRange('2020年6月〜2021年8月')).toEqual({ start: '2020-06', end: '2021-08', ongoing: false });
  });

  it('パース不能なレガシー文字列は null（呼び出し側は温存表示）', () => {
    expect(parsePeriodToRange('不明')).toBeNull();
    expect(parsePeriodToRange('2020.06 — 終了時期未定')).toBeNull();
  });

  it('単年（"2020"）は月が特定できないため null', () => {
    expect(parsePeriodToRange('2020')).toBeNull();
  });

  it('旧日付ピッカー時代の ISO 日単位（"YYYY-MM-DD〜YYYY-MM-DD"）は日を切り捨てて月精度に変換する', () => {
    expect(parsePeriodToRange('2020-06-15〜2021-08-01')).toEqual({
      start: '2020-06',
      end: '2021-08',
      ongoing: false,
    });
  });
});

describe('deriveCompanyPeriod', () => {
  it('複数案件から最古開始 — 最新終了を導出する', () => {
    expect(deriveCompanyPeriod(['2020.06 — 2021.08', '2019.01 — 2019.12'])).toBe('2019.01 — 2021.08');
  });

  it('継続中の案件が 1 件でもあれば終端は「現在」', () => {
    expect(deriveCompanyPeriod(['2018.04 — 2019.03', '2020.01 — 現在'])).toBe('2018.04 — 現在');
  });

  it('空配列・全件パース不能なら空文字', () => {
    expect(deriveCompanyPeriod([])).toBe('');
    expect(deriveCompanyPeriod(['不明', ''])).toBe('');
  });

  it('終了が単に未記載の period（"2020" / 開始のみ）は継続中とみなさない', () => {
    // 単年レガシー "2020" や終了月未入力の "2020.06" で会社期間を「— 現在」へ倒さない。
    expect(deriveCompanyPeriod(['2020'])).toBe('2020');
    expect(deriveCompanyPeriod(['2020.06'])).toBe('2020.06');
    expect(deriveCompanyPeriod(['2019.01 — 2019.06', '2020'])).toBe('2019.01 — 2019.06');
  });
});

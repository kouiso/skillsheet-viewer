import { describe, expect, it } from 'vitest';
import { deriveDuration, flattenTech, normalizeProcess, parseStart, sortByStartDesc } from './process';

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

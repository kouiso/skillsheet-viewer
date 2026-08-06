import { describe, expect, it } from 'vitest';

import { splitForHyphenation } from './fonts';

// ZERO WIDTH NO-BREAK SPACE（U+FEFF）。@react-pdf/textkit がこれを glue
// （ハイフン無しの改行可能な空白）として扱うことを前提にした実装なので、
// テストでも同じ文字リテラルで期待値を組み立てる。
const ZWNBSP = '﻿';

describe('splitForHyphenation', () => {
  it('CJK 文字だけの語は、各文字の直前に ZWNBSP を挟んで1文字ずつに分割する', () => {
    expect(splitForHyphenation('日本語')).toEqual(['日', ZWNBSP, '本', ZWNBSP, '語']);
  });

  it('ASCII の連なりは分割しない（1要素のまま）', () => {
    expect(splitForHyphenation('TypeScript')).toEqual(['TypeScript']);
  });

  it('ASCII の連なり内の実ハイフンは保持する（分割対象にしない）', () => {
    expect(splitForHyphenation('expo-router')).toEqual(['expo-router']);
  });

  it('ASCII ランと CJK 文字が混在する語は、境界にも ZWNBSP を挟む', () => {
    expect(splitForHyphenation('React連携')).toEqual(['React', ZWNBSP, '連', ZWNBSP, '携']);
  });

  it('CJK → ASCII の境界にも ZWNBSP を挟む（逆方向）', () => {
    expect(splitForHyphenation('連携React')).toEqual(['連', ZWNBSP, '携', ZWNBSP, 'React']);
  });

  it('サロゲートペアが必要な符号点（絵文字等）は CJK 扱いにせず ASCII ランへまとめる', () => {
    // 🎉 (U+1F389) は基本多言語面の外（サロゲートペア必須）。CJK と誤判定すると、
    // 国旗や ZWJ 連結絵文字のように複数符号点からなる文字の符号点間に ZWNBSP を
    // 挟んでしまい、シーケンスが分断される。
    expect(splitForHyphenation('🎉Party')).toEqual(['🎉Party']);
  });

  it('戻り値の配列を結合すると元の語と一致する（ZWNBSP は不可視文字として残る想定）', () => {
    const word = '担当業務';
    const parts = splitForHyphenation(word);
    expect(parts.join('').replaceAll(ZWNBSP, '')).toBe(word);
  });

  it('空文字は [word] のまま返す', () => {
    expect(splitForHyphenation('')).toEqual(['']);
  });
});

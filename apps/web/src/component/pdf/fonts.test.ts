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

  it('NFD 正規化された日本語（結合濁点）は基底文字から分離しない', () => {
    // 'か' (U+304B) + 結合濁点 (U+3099) = NFD の「が」。結合濁点は isCjk の範囲
    // （0x2E80–0xFFFF）に一致してしまうため、対策前は基底文字との間に ZWNBSP が
    // 挟まり PDF 上で濁点だけ分離しうる。
    const nfdGa = 'が';
    expect(splitForHyphenation(nfdGa)).toEqual([nfdGa]);
    expect(splitForHyphenation(`${nfdGa}んばれ`)).toEqual([nfdGa, ZWNBSP, 'ん', ZWNBSP, 'ば', ZWNBSP, 'れ']);
  });

  it('異体字セレクタ付き絵文字（VS16）は基底の符号点から分離しない', () => {
    // ❤️ = U+2764 (HEAVY BLACK HEART) + U+FE0F (VARIATION SELECTOR-16)。
    // VS16 も isCjk の範囲に一致するため、対策前は分離しうる。
    const heartVs16 = '❤️';
    expect(splitForHyphenation(heartVs16)).toEqual([heartVs16]);
  });

  it('漢字の異体字シーケンス（IVS、補助面の異体字セレクタ）は基底文字から分離しない', () => {
    // 葛 (U+845B) + IVS選択子 (U+E0100, 補助特殊用途面)。補助面の符号点はサロゲート
    // ペアになり isCjk の範囲（0x2E80–0xFFFF、BMPのみ）の外なので CJK 扱いにはならないが、
    // 対策前は「非CJK文字」として prevWasCjk（直前がCJK）判定に基づき ZWNBSP が
    // 挿入され、結果として基底の漢字から分離しうる。
    const kanjiWithIvs = '葛\u{E0100}';
    expect(splitForHyphenation(kanjiWithIvs)).toEqual([kanjiWithIvs]);
  });

  it('CJK記号への結合分音記号（U+20D0台）は基底文字から分離しない', () => {
    // 漢 (U+6F22) + COMBINING ENCLOSING CIRCLE (U+20DD)。旧範囲（結合分音記号一般 /
    // かな結合濁点 / 異体字セレクタのみ）には含まれず、対策前は分離しうる。
    const kanjiWithEnclosingCircle = '漢\u{20DD}';
    expect(splitForHyphenation(kanjiWithEnclosingCircle)).toEqual([kanjiWithEnclosingCircle]);
  });
});

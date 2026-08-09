// patches/@react-pdf__textkit@6.3.0.patch で追加した検証用エクスポート。
// getNodes() 内部の hyphenated 判定が、単一 CJK 書記素に対しては常に false になることを
// 直接検証する（Issue #203 / #215）。
import { isSingleCjkSyllable } from '@react-pdf/textkit';
import { describe, expect, it } from 'vitest';

describe('isSingleCjkSyllable', () => {
  it('単一の CJK 文字は true を返す', () => {
    expect(isSingleCjkSyllable('あ')).toBe(true);
    expect(isSingleCjkSyllable('漢')).toBe(true);
    expect(isSingleCjkSyllable('日')).toBe(true);
  });

  it('結合濁点を含む NFD 正規化の「が」は true を返す', () => {
    // 'か'(U+304B) + 結合濁点(U+3099)
    const nfdGa = 'か\u3099';
    expect(Array.from(nfdGa)).toHaveLength(2);
    expect(isSingleCjkSyllable(nfdGa)).toBe(true);
  });

  it('異体字セレクタ付き漢字（IVS）は true を返す', () => {
    // 葛(U+845B) + 補助面異体字セレクタ(U+E0100)
    const kanjiWithIvs = '葛\u{E0100}';
    expect(Array.from(kanjiWithIvs)).toHaveLength(2);
    expect(isSingleCjkSyllable(kanjiWithIvs)).toBe(true);
  });

  it('CJK 統合漢字拡張（補助面）の単一文字は true を返す', () => {
    // 𠀀 (U+20000, 拡張B)
    expect(isSingleCjkSyllable('\u{20000}')).toBe(true);
  });

  it('複数の CJK 文字が含まれる場合は false を返す', () => {
    expect(isSingleCjkSyllable('日本語')).toBe(false);
    expect(isSingleCjkSyllable('ab')).toBe(false);
  });

  it('ASCII 文字や非 CJK 絵文字は false を返す', () => {
    expect(isSingleCjkSyllable('A')).toBe(false);
    expect(isSingleCjkSyllable('TypeScript')).toBe(false);
    expect(isSingleCjkSyllable('🎉')).toBe(false);
  });

  it('空文字列は false を返す', () => {
    expect(isSingleCjkSyllable('')).toBe(false);
  });
});

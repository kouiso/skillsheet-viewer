import { describe, expect, it } from 'vitest';

import { splitForHyphenation } from './fonts';

// splitForHyphenation が CJK 文字境界に挟む改行マーカー。以前は ZWNBSP（U+FEFF、
// 不可視文字）を使っていたが、@react-pdf/textkit がシラブル配列からPDFの実テキストを
// 再構築するため、ZWNBSP自体がPDFのテキストコンテンツに literal に残ってしまい
// コピー・検索時に不可視の区切り文字が混入する問題があった（レビュー指摘）。
// 空文字列は同じ「改行可能な空白＝glue」として扱われつつ、テキスト内容には
// 一切文字を追加しない。
const BREAK_MARKER = '';

describe('splitForHyphenation', () => {
  it('CJK 文字だけの語は、各文字の直前に改行マーカーを挟んで1文字ずつに分割する', () => {
    expect(splitForHyphenation('日本語')).toEqual(['日', BREAK_MARKER, '本', BREAK_MARKER, '語']);
  });

  it('ASCII の連なりは分割しない（1要素のまま）', () => {
    expect(splitForHyphenation('TypeScript')).toEqual(['TypeScript']);
  });

  it('ASCII の連なり内の実ハイフンは保持する（分割対象にしない）', () => {
    expect(splitForHyphenation('expo-router')).toEqual(['expo-router']);
  });

  it('ASCII ランと CJK 文字が混在する語は、境界にも改行マーカーを挟む', () => {
    expect(splitForHyphenation('React連携')).toEqual(['React', BREAK_MARKER, '連', BREAK_MARKER, '携']);
  });

  it('CJK → ASCII の境界にも改行マーカーを挟む（逆方向）', () => {
    expect(splitForHyphenation('連携React')).toEqual(['連', BREAK_MARKER, '携', BREAK_MARKER, 'React']);
  });

  it('サロゲートペアが必要な符号点（絵文字等）は CJK 扱いにせず ASCII ランへまとめる', () => {
    // 🎉 (U+1F389) は基本多言語面の外（サロゲートペア必須）。CJK と誤判定すると、
    // 国旗や ZWJ 連結絵文字のように複数符号点からなる文字の符号点間に改行マーカーを
    // 挟んでしまい、シーケンスが分断される。
    expect(splitForHyphenation('🎉Party')).toEqual(['🎉Party']);
  });

  it('戻り値の配列を結合すると元の語と完全に一致する（改行マーカーは空文字列のためPDFのテキスト内容には残らない）', () => {
    const word = '担当業務';
    const parts = splitForHyphenation(word);
    expect(parts.join('')).toBe(word);
  });

  it('空文字は [word] のまま返す', () => {
    expect(splitForHyphenation('')).toEqual(['']);
  });

  it('NFD 正規化された日本語（結合濁点）は基底文字から分離しない', () => {
    // 'か' (U+304B) + 結合濁点 (U+3099) = NFD の「が」。結合濁点は isCjk の範囲
    // （0x2E80–0xFFFF）に一致してしまうため、対策前は基底文字との間に改行マーカーが
    // 挟まり PDF 上で濁点だけ分離しうる。
    const nfdGa = 'が';
    expect(splitForHyphenation(nfdGa)).toEqual([nfdGa]);
    expect(splitForHyphenation(`${nfdGa}んばれ`)).toEqual([
      nfdGa,
      BREAK_MARKER,
      'ん',
      BREAK_MARKER,
      'ば',
      BREAK_MARKER,
      'れ',
    ]);
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
    // 対策前は「非CJK文字」として prevWasCjk（直前がCJK）判定に基づき改行マーカーが
    // 挿入され、結果として基底の漢字から分離しうる。
    const kanjiWithIvs = '葛\u{E0100}';
    expect(splitForHyphenation(kanjiWithIvs)).toEqual([kanjiWithIvs]);
  });

  it('補助面のCJK統合漢字拡張（U+20000以降）も改行可能な1文字として扱う（レビュー指摘: BMP外を一律除外していたためテーブルセルからはみ出していた）', () => {
    // 𠀀 (U+20000, CJK統合漢字拡張Bの先頭)。対策前は CJK_END_EXCLUSIVE（0x10000）
    // による一律除外で「CJKではない1文字」として ASCII ランへまとめられ、
    // 改行不可能な1シラブルとして扱われていた。
    const supplementaryCjk = '\u{20000}';
    expect(splitForHyphenation(`${supplementaryCjk}本`)).toEqual([supplementaryCjk, BREAK_MARKER, '本']);
  });

  it('CJK記号への結合分音記号（U+20D0台）は基底文字から分離しない', () => {
    // 漢 (U+6F22) + COMBINING ENCLOSING CIRCLE (U+20DD)。旧範囲（結合分音記号一般 /
    // かな結合濁点 / 異体字セレクタのみ）には含まれず、対策前は分離しうる。
    const kanjiWithEnclosingCircle = '漢\u{20DD}';
    expect(splitForHyphenation(kanjiWithEnclosingCircle)).toEqual([kanjiWithEnclosingCircle]);
  });
});

describe('splitForHyphenation の禁則処理', () => {
  /** 改行マーカーの直後に来る文字（= 行頭になりうる文字）を全部集める。 */
  const lineStartCandidates = (word: string): string[] => {
    const parts = splitForHyphenation(word);
    const heads: string[] = [];
    for (let i = 0; i < parts.length - 1; i++) {
      if (parts[i] === BREAK_MARKER && parts[i + 1] !== undefined) heads.push(parts[i + 1][0]);
    }
    return heads;
  };

  it('句読点・中黒・閉じ括弧は行頭候補にならない', () => {
    // 禁則が無いと「クエリ最適化」→改行→「。」のように句点だけが次行の頭に落ちる（実測）。
    for (const word of ['最適化。', '課金・キャンペーン演出 等）。', '実装、設計', '対応（全工程）']) {
      expect(lineStartCandidates(word)).not.toContain('。');
      expect(lineStartCandidates(word)).not.toContain('、');
      expect(lineStartCandidates(word)).not.toContain('・');
      expect(lineStartCandidates(word)).not.toContain('）');
    }
  });

  it('開き括弧の直後は行頭候補にならない（開き括弧が行末に残らない）', () => {
    expect(splitForHyphenation('（例')).toEqual(['（', '例']);
  });

  it('ASCII の閉じ括弧・句読点も行頭候補にしない', () => {
    expect(splitForHyphenation('実装)')).toEqual(['実', BREAK_MARKER, '装', ')']);
  });

  it('禁則に当たらない境界では従来どおり改行を許す', () => {
    expect(splitForHyphenation('最適化')).toEqual(['最', BREAK_MARKER, '適', BREAK_MARKER, '化']);
  });

  it('禁則を入れても結合すると元の語に戻る', () => {
    for (const word of ['最適化。', '課金・演出', '（例）', 'React連携。', '実装)']) {
      expect(splitForHyphenation(word).join('')).toBe(word);
    }
  });
});

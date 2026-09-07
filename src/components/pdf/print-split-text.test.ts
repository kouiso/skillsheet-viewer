import { describe, expect, it } from 'vitest';

import type { MeasuredLine } from './print-leaf';
import { lineBoundaryOffset, splitTextAtLine } from './print-split-text';

const lines = (...strings: string[]): MeasuredLine[] => strings.map((string) => ({ height: 20, string }));

describe('splitTextAtLine', () => {
  it('行の文字列で本文を辿り、切れ目の位置で分ける', () => {
    const text = 'あいうえおかきくけこさしすせそ';
    const result = splitTextAtLine(text, lines('あいうえお', 'かきくけこ', 'さしすせそ'), 2);
    expect(result).toEqual({ head: 'あいうえおかきくけこ', tail: 'さしすせそ' });
  });

  it('段落内の改行は行の文字列に含まれないが、元の本文の位置は正しく進む', () => {
    const text = '・一行目の本文。\n・二行目の本文。\n・三行目の本文。';
    const result = splitTextAtLine(text, lines('・一行目の本文。', '・二行目の本文。', '・三行目の本文。'), 1);
    expect(result).toEqual({ head: '・一行目の本文。', tail: '・二行目の本文。\n・三行目の本文。' });
    // 頭を繋ぎ直しただけでは改行が消えて別の本文になる（この関数が要る理由）
    expect(lineBoundaryOffset(text, lines('・一行目の本文。', '・二行目の本文。'), 1)).toBe(8);
  });

  it('折り返しで足されたハイフンと行末の空白は本文に無いものとして扱う', () => {
    const text = 'an implementation detail';
    const result = splitTextAtLine(text, lines('an implemen-', 'tation detail'), 1);
    expect(result).toEqual({ head: 'an implemen', tail: 'tation detail' });
    expect(splitTextAtLine('foo bar baz', lines('foo bar ', 'baz'), 1)).toEqual({ head: 'foo bar', tail: 'baz' });
  });

  it('本文と行が食い違うときは分けない（葉ごと送る側へ倒す）', () => {
    expect(splitTextAtLine('あいうえお', lines('あいう', 'かき'), 1)).toEqual({ head: 'あいう', tail: 'えお' });
    expect(splitTextAtLine('あいうえお', lines('xyz', 'えお'), 1)).toBeUndefined();
    expect(splitTextAtLine('あいうえお', lines('あいうえお'), 1)).toBeUndefined();
    expect(splitTextAtLine('あいうえお', lines('あい', 'うえお'), 0)).toBeUndefined();
  });
});

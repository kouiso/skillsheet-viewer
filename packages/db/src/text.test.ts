import { describe, expect, it } from 'vitest';

import { collapseSoftBreaks, unwrapEmphasis } from './text';

describe('collapseSoftBreaks', () => {
  it('段落内の単独改行を空白に潰す', () => {
    expect(collapseSoftBreaks('前半\n後半')).toBe('前半 後半');
  });

  it('空行は段落境界として残す', () => {
    expect(collapseSoftBreaks('一段落\n\n二段落')).toBe('一段落\n\n二段落');
  });

  it('番号リストの行はつなげない', () => {
    expect(collapseSoftBreaks('1. 指摘した\n2. ありそうだと感じた')).toBe('1. 指摘した\n2. ありそうだと感じた');
  });

  it('箇条書きの行はつなげない', () => {
    expect(collapseSoftBreaks('- 前\n- 後')).toBe('- 前\n- 後');
    expect(collapseSoftBreaks('• 前\n• 後')).toBe('• 前\n• 後');
  });

  it('リスト項目の折り返し行は項目に接続する', () => {
    expect(collapseSoftBreaks('1. 前半\n後半')).toBe('1. 前半 後半');
  });
});

describe('unwrapEmphasis', () => {
  it('対になった ** だけ外す', () => {
    expect(unwrapEmphasis('出来るできないを**指摘**し')).toBe('出来るできないを指摘し');
  });
});

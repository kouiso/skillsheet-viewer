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

  it('Setext 見出しの下線はつなげない', () => {
    expect(collapseSoftBreaks('Setext 見出し\n===\n本文')).toBe('Setext 見出し\n===\n本文');
  });

  // `+` も Markdown の箇条書き記号（CodeRabbit 指摘 / PR #247）。
  it('`+` の箇条書きを1行に連結しない', () => {
    expect(collapseSoftBreaks('+ 項目1\n+ 項目2\n+ 項目3')).toBe('+ 項目1\n+ 項目2\n+ 項目3');
  });

  it('`+` の箇条書きの直前にある段落は今までどおり潰す', () => {
    expect(collapseSoftBreaks('前段の\n途中改行\n+ 項目1\n+ 項目2')).toBe('前段の 途中改行\n+ 項目1\n+ 項目2');
  });
});

describe('unwrapEmphasis', () => {
  it('対になった ** だけ外す', () => {
    expect(unwrapEmphasis('出来るできないを**指摘**し')).toBe('出来るできないを指摘し');
  });

  // 対にならない ** が残ると画面にも PDF にも記号がそのまま出る（CodeRabbit 指摘 / PR #247）。
  it('閉じ忘れた ** も残さない', () => {
    expect(unwrapEmphasis('未完 **強調')).toBe('未完 強調');
    expect(unwrapEmphasis('**開いたまま **閉じた** 続き')).toBe('開いたまま 閉じた 続き');
  });

  // 案件コメントは「**バックエンド**」のような小見出しを独立した行で置いて話題を分ける。
  // 行全体が強調だけの行は残さないと切れ目が読めなくなる（PBI #292 / SBI #293）。
  it('行全体が太字だけの行は太字のまま残す', () => {
    expect(unwrapEmphasis('**バックエンド**\n\n本文')).toBe('**バックエンド**\n\n本文');
  });

  it('小見出し行のある本文でも、文中の太字は外す', () => {
    expect(unwrapEmphasis('**バックエンド**\n\n途中の**強調**を外す')).toBe('**バックエンド**\n\n途中の強調を外す');
  });

  // 段落の途中の太字行は、描画側で soft break が潰れて段落先頭の文中太字になる。
  // 小見出しとして表示されないので外す。
  it('前後に空行が無く本文に接続する太字行は外す', () => {
    expect(unwrapEmphasis('導入\n**見出し**\n本文')).toBe('導入\n見出し\n本文');
  });

  it('行頭の太字でも後ろに本文が続く行は外す', () => {
    expect(unwrapEmphasis('**見出し** 続きの文')).toBe('見出し 続きの文');
  });
});

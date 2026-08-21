// このファイルは vitest.config.pdf.ts（environment: 'node'）側で走る。
// glyph-coverage.ts に焼き込んだ収録表が、実フォント（public/fonts/*.ttf）の cmap と
// 一致していることを検証する。フォントを差し替えたのに表を更新し忘れると、描けない
// 文字がそのまま PDF に落ちて Issue #263 E が再発するため、機械的に検出する。

import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { coverageRanges, isRenderableCodePoint, MISSING_GLYPH_PLACEHOLDER, toRenderableText } from './glyph-coverage';
import { BOLD_TTF, REGULAR_TTF } from './test-font-paths';
import { readCoveredCodePoints } from './truetype-cmap';

function rangesToString(ranges: readonly (readonly [number, number])[]): string {
  return ranges.map(([start, end]) => `${start.toString(16)}-${end.toString(16)}`).join(',');
}

function setToRanges(codePoints: Set<number>): [number, number][] {
  const sorted = [...codePoints].sort((a, b) => a - b);
  const ranges: [number, number][] = [];
  for (const codePoint of sorted) {
    const last = ranges[ranges.length - 1];
    if (last && codePoint === last[1] + 1) {
      last[1] = codePoint;
      continue;
    }
    ranges.push([codePoint, codePoint]);
  }
  return ranges;
}

describe('glyph-coverage（Noto Sans JP の収録表）', () => {
  it('焼き込んだ収録表が実フォントの cmap（Regular ∩ Bold）と一致する', () => {
    const regular = readCoveredCodePoints(readFileSync(REGULAR_TTF));
    const bold = readCoveredCodePoints(readFileSync(BOLD_TTF));
    const intersection = new Set([...regular].filter((codePoint) => bold.has(codePoint)));
    expect(rangesToString(setToRanges(intersection))).toBe(rangesToString(coverageRanges()));
  });

  it('実フォントに無い文字は描画対象から外れている（表の向きが逆でないことの確認）', () => {
    // 未収録の実例（Issue #263 E で実際に化けた文字）。
    for (const ch of ['🚀', '🎉', '✅', '⚡', '✔', '☑', '≒', 'ℹ', '한', 'ก']) {
      expect(isRenderableCodePoint(ch.codePointAt(0) ?? 0)).toBe(false);
    }
    // 収録済みの実例。ここが false になると本文が 〓 に潰れる。
    for (const ch of ['あ', '漢', 'A', '・', '■', '•', '〓', '→', '★', '±', 'α']) {
      expect(isRenderableCodePoint(ch.codePointAt(0) ?? 0)).toBe(true);
    }
  });

  it('toRenderableText は未収録文字だけを 〓 に置き換え、本文は変えない', () => {
    expect(toRenderableText('日本語とEnglishと記号→★')).toBe('日本語とEnglishと記号→★');
    expect(toRenderableText('絵文字: 🚀🎉✅ です')).toBe(`絵文字: ${MISSING_GLYPH_PLACEHOLDER.repeat(3)} です`);
    // 補助面（サロゲートペア）は cmap に載っていても react-pdf の経路で化けるため一律置換する。
    expect(toRenderableText('𪚲')).toBe(MISSING_GLYPH_PLACEHOLDER);
    // 不可視の書式文字（異体字セレクタ・ZWJ）は 〓 を増やさず落とす。
    expect(toRenderableText('☑️')).toBe(MISSING_GLYPH_PLACEHOLDER);
    expect(toRenderableText('あ‍い')).toBe('あい');
    // 改行・タブは cmap に無いがレイアウトに必要なのでそのまま残す。
    expect(toRenderableText('あ\nい\tう')).toBe('あ\nい\tう');
  });

  it('改行・タブ・CR 以外の C0 制御文字は落とす（紙面に見えないゴミを残さない）', () => {
    // NUL / BEL / ESC などはフォントに字形が無く、cmap 判定にも掛からないまま
    // そのまま PDF に載っていた。ASCII だけの文字列は早期リターンに入るため、
    // 早期リターン側の判定も同時に固定する。
    expect(toRenderableText('a\u0000b')).toBe('ab');
    expect(toRenderableText('\u0007警告\u001b')).toBe('警告');
    expect(toRenderableText('DEL\u007f')).toBe('DEL');
    // レイアウトに必要な3文字は残る（上と同じ経路を通っても消えない）。
    expect(toRenderableText('a\u0000b\nc\td\re')).toBe('ab\nc\td\re');
  });
});

describe('truetype-cmap（壊れたフォントの読み取り）', () => {
  /** cmap の format 4 サブテーブルだけを持つ最小の sfnt を組み立てる。 */
  function buildFontWithFormat4(segCountX2: number, subtableBytes: number): Buffer {
    const cmapAt = 12 + 16;
    const subtableAt = cmapAt + 4 + 8;
    const font = Buffer.alloc(subtableAt + subtableBytes);
    font.writeUInt16BE(1, 4); // numTables
    font.write('cmap', 12, 'latin1');
    font.writeUInt32BE(cmapAt, 12 + 8); // table offset
    font.writeUInt32BE(4 + 8 + subtableBytes, 12 + 12); // table length
    font.writeUInt16BE(1, cmapAt + 2); // numSubtables
    font.writeUInt16BE(3, cmapAt + 4); // platform: Windows
    font.writeUInt16BE(1, cmapAt + 6); // encoding: BMP
    font.writeUInt32BE(subtableAt - cmapAt, cmapAt + 8); // subtable offset（cmap 先頭から）
    font.writeUInt16BE(4, subtableAt); // format
    if (subtableBytes >= 8) font.writeUInt16BE(segCountX2, subtableAt + 6);
    return font;
  }

  it('segCount が実体より大きくても RangeError にならず、読める分で打ち切る', () => {
    // 壊れた（あるいは切り詰められた）フォントは segCountX2 に実体より大きな値を書ける。
    // 境界チェックが無いと readUInt16BE が RangeError を投げ、収録表の検証ごと落ちる。
    const font = buildFontWithFormat4(0x1000, 32);
    expect(() => readCoveredCodePoints(font)).not.toThrow();
    expect(readCoveredCodePoints(font).size).toBe(0);
  });

  it('format 4 のヘッダすら入っていないサブテーブルでも落ちない', () => {
    const font = buildFontWithFormat4(2, 4);
    expect(() => readCoveredCodePoints(font)).not.toThrow();
  });
});

import type { MeasuredLine } from './print-leaf';

/**
 * 測った行の切れ目に対応する、元の本文の文字位置を求める。
 *
 * 行の文字列を繋ぎ直して頭・尻を作ってはいけない。textkit の `lines[].string` は改行
 * （段落内の `\n`）や折り返し位置に入れたハイフンを含まないので、繋ぐと元と違う本文になり、
 * 「12 行ぶん」のつもりで作った頭が 7 行で測れる（実測、合成フィクスチャの「・」付き段落）。
 * 元の本文の上を行の文字列で辿り、切れ目の位置だけを取る。
 *
 * 辿れなかったら undefined を返す（呼び出し側は割らずに葉ごと送る。空きは残るが本文は壊れない）。
 */
export function lineBoundaryOffset(text: string, lines: MeasuredLine[], headLineCount: number): number | undefined {
  if (headLineCount <= 0 || headLineCount >= lines.length) return undefined;
  let cursor = 0;
  for (let i = 0; i < headLineCount; i++) {
    // 前の行末で捨てられた空白・改行を飛ばす
    while (cursor < text.length && /\s/.test(text[cursor])) cursor++;
    const line = lines[i].string;
    const candidates = [line, line.endsWith('-') ? line.slice(0, -1) : undefined, line.trimEnd()].filter(
      (c): c is string => c !== undefined && c.length > 0,
    );
    const matched = candidates.find((c) => text.startsWith(c, cursor));
    if (matched === undefined) return undefined;
    cursor += matched.length;
  }
  return cursor;
}

/** 本文を行の切れ目で 2 つに分ける。頭の末尾・尻の先頭の空白は落とす（余計な空行を作らないため）。 */
export function splitTextAtLine(
  text: string,
  lines: MeasuredLine[],
  headLineCount: number,
): { head: string; tail: string } | undefined {
  const offset = lineBoundaryOffset(text, lines, headLineCount);
  if (offset === undefined) return undefined;
  const head = text.slice(0, offset).trimEnd();
  const tail = text.slice(offset).replace(/^\s+/, '');
  if (!head || !tail) return undefined;
  return { head, tail };
}

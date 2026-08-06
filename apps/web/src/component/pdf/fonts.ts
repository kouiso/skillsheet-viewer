import { Font } from '@react-pdf/renderer';

import PDF_FONT_FAMILY from './constants';

// public/ 配下に配置したフォントを URL 参照する（Vite の `?url` import を Next 用に置換）。
// PDF はクライアントで動的生成するため、ブラウザから取得可能な絶対パスで解決する。
const NotoSansJPRegular = '/fonts/NotoSansJP-Regular.otf';
const NotoSansJPBold = '/fonts/NotoSansJP-Bold.otf';

// CJK/全角文字の開始コードポイント。これ以上は1文字単位で改行を許可する。
const CODEPOINT = { CJK_START: 0x2e80 } as const;

// ZERO WIDTH NO-BREAK SPACE。ECMAScript の String.prototype.trim() が
// 空白として扱う数少ない「表示幅が実質ゼロ」の文字で、@react-pdf/textkit の
// レイアウトエンジンはこれを（ハイフン付き改行点＝penalty ではなく）通常の
// 改行可能な空白＝glue として扱う。CJK 文字の境界に挟むことで、行末に
// ハイフン記号を出さずに任意の文字境界で改行できるようにする。
const ZWNBSP = '﻿';

let registered = false;

/**
 * 日本語は単語区切りが無いため、ASCII の連なりは保ちつつ、
 * 全角・CJK 文字の境界で改行を許可するように語を分割する。
 *
 * 各 CJK 文字の直前に ZWNBSP を挟んで返す。@react-pdf/textkit 側は
 * 「次の要素が空白なら次で改行してよい（ハイフン無し）」と判定するため、
 * 文字そのものを区切り値として返す（旧実装）とハイフン付きの改行点として
 * 扱われてしまう。ZWNBSP を挟むことで改行点は空白側に付き、CJK 文字は
 * 崩れずそのまま出力される。
 */
export function splitForHyphenation(word: string): string[] {
  const parts: string[] = [];
  let buffer = '';
  const flush = (): void => {
    if (buffer) {
      parts.push(buffer);
      buffer = '';
    }
  };
  for (const ch of word) {
    if (ch.charCodeAt(0) < CODEPOINT.CJK_START) {
      buffer += ch;
      continue;
    }
    flush();
    if (parts.length > 0) parts.push(ZWNBSP);
    parts.push(ch);
  }
  flush();
  return parts.length > 0 ? parts : [word];
}

/**
 * PDF 用フォント（リポジトリにバンドルした Noto Sans JP）を一度だけ登録する。
 * CDN 依存を排し、実行時に確実に日本語をレンダリングできるようにする。
 */
export default function registerPdfFonts(): void {
  if (registered) return;

  Font.register({
    family: PDF_FONT_FAMILY,
    fonts: [
      { src: NotoSansJPRegular, fontWeight: 400 },
      { src: NotoSansJPBold, fontWeight: 700 },
      // 日本語フォントに true italic は存在しないため、italic スタイルにも同じ字形を登録する。
      // これにより fontStyle: 'italic' が日本語を含めて確実に解決し、文字化け（tofu）を防ぐ。
      { src: NotoSansJPRegular, fontWeight: 400, fontStyle: 'italic' },
      { src: NotoSansJPBold, fontWeight: 700, fontStyle: 'italic' },
    ],
  });

  // registerHyphenationCallback はテスト時にモックされ未定義のことがあるためガードする。
  if (typeof Font.registerHyphenationCallback === 'function') {
    Font.registerHyphenationCallback(splitForHyphenation);
  }

  registered = true;
}

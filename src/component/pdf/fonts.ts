import { Font } from '@react-pdf/renderer';

import NotoSansJPBold from '@/assets/fonts/NotoSansJP-Bold.otf?url';
import NotoSansJPRegular from '@/assets/fonts/NotoSansJP-Regular.otf?url';

import PDF_FONT_FAMILY from './constants';

// CJK/全角文字の開始コードポイント。これ以上は1文字単位で改行を許可する。
const CODEPOINT = { CJK_START: 0x2e80 } as const;

let registered = false;

/**
 * 日本語は単語区切りが無いため、ASCII の連なりは保ちつつ、
 * 全角・CJK 文字の境界で改行を許可するように語を分割する。
 */
function splitForHyphenation(word: string): string[] {
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
    ],
  });

  // registerHyphenationCallback はテスト時にモックされ未定義のことがあるためガードする。
  if (typeof Font.registerHyphenationCallback === 'function') {
    Font.registerHyphenationCallback(splitForHyphenation);
  }

  registered = true;
}

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

// この値以上の符号点（絵文字・記号ブロック等）は CJK ではないため 1 文字ずつの改行対象に
// しない。for...of はサロゲートペアを 1 符号点として1回のイテレーションで返すが、国旗
// （地域指示記号2つ）や ZWJ 連結絵文字（結合子で繋いだ複数符号点）は符号点ごとに別々の
// イテレーションになる。各符号点を独立に CJK 判定すると、本来ひと繋がりであるべき
// 絵文字シーケンスの符号点間に改行点（ZWNBSP）を挟んでしまう。CJK は全て基本多言語面
// （U+0000–U+FFFF）に収まるため、それより上（サロゲートペアが必要な符号点）は一律で
// 対象外にする。
const CJK_END_EXCLUSIVE = 0x10000;

function isCjk(ch: string): boolean {
  const code = ch.codePointAt(0) ?? 0;
  return code >= CODEPOINT.CJK_START && code < CJK_END_EXCLUSIVE;
}

// 結合文字（結合分音記号・かな結合濁点/半濁点）や異体字セレクタは単独の文字ではなく、
// 直前の基底文字と合わせて1つの書記素（grapheme）を構成する。isCjk の範囲チェック
// （0x2E80–0xFFFF）に一致してしまう（例: U+3099 結合濁点、絵文字の異体字セレクタ
// U+FE0F）ため、CJK境界の判定から明示的に除外し、常に直前の文字と同じグループに
// 留める。NFD 正規化された日本語（「か」+結合濁点）や VS16 付き絵文字がここで
// 分離されると、PDF 上で濁点や異体字セレクタだけが基底文字から離れて改行される。
function isCombiningOrVariationSelector(ch: string): boolean {
  const code = ch.codePointAt(0) ?? 0;
  return (
    (code >= 0x0300 && code <= 0x036f) || // Combining Diacritical Marks
    (code >= 0x3099 && code <= 0x309a) || // かな結合濁点・半濁点
    (code >= 0xfe00 && code <= 0xfe0f) // Variation Selectors
  );
}

/**
 * 日本語は単語区切りが無いため、ASCII の連なりは保ちつつ、
 * 全角・CJK 文字の境界で改行を許可するように語を分割する。
 *
 * 各 CJK 文字の前後に ZWNBSP を挟んで返す。@react-pdf/textkit 側は
 * 「次の要素が空白なら次で改行してよい（ハイフン無し）」と判定するため、
 * 文字そのものを区切り値として返す（旧実装）とハイフン付きの改行点として
 * 扱われてしまう。ZWNBSP を挟むことで改行点は空白側に付き、CJK 文字は
 * 崩れずそのまま出力される。CJK→ASCII の境界（例:「連携React」の携/R間）にも
 * 挟まないと、その境界だけ改行機会が無くなる。
 */
export function splitForHyphenation(word: string): string[] {
  const parts: string[] = [];
  let buffer = '';
  let prevWasCjk = false;
  const flush = (): void => {
    if (buffer) {
      parts.push(buffer);
      buffer = '';
    }
  };
  for (const ch of word) {
    if (isCombiningOrVariationSelector(ch)) {
      // 直前の基底文字がどちらに格納されていても（ASCII連なりの buffer か、
      // CJK単独文字として直接 push された parts か）、そこへ結合するだけで
      // prevWasCjk は変更しない（結合文字自身は境界判定に関与しない）。
      if (buffer) {
        buffer += ch;
      } else if (parts.length > 0) {
        parts[parts.length - 1] += ch;
      } else {
        buffer += ch;
      }
      continue;
    }
    if (!isCjk(ch)) {
      if (prevWasCjk && parts.length > 0) parts.push(ZWNBSP);
      buffer += ch;
      prevWasCjk = false;
      continue;
    }
    flush();
    if (parts.length > 0) parts.push(ZWNBSP);
    parts.push(ch);
    prevWasCjk = true;
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

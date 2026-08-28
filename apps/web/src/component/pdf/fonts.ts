import { Font } from '@react-pdf/renderer';

import PDF_FONT_FAMILY from './constants';

// public/ 配下に配置したフォントを URL 参照する（Vite の `?url` import を Next 用に置換）。
// PDF はクライアントで動的生成するため、ブラウザから取得可能な絶対パスで解決する。
//
// Noto Sans JP の CFF(OTF) 版を使うと @react-pdf/renderer の CFF サブセット化が
// 壊れ、文字が豆腐（tofu）になったり、大量描画時にコンテンツが無音で消失する
// （Issue #172）。TrueType 版を使うことで、埋め込み・抽出・ビューア表示が正常になる。
const NotoSansJPRegular = '/fonts/NotoSansJP-Regular.ttf';
const NotoSansJPBold = '/fonts/NotoSansJP-Bold.ttf';

// CJK/全角文字の開始コードポイント。これ以上は1文字単位で改行を許可する。
const CODEPOINT = { CJK_START: 0x2e80 } as const;

// CJK文字境界に挟む改行マーカー。以前は ZWNBSP（U+FEFF、表示幅ゼロの不可視文字）を
// 使っていたが、@react-pdf/textkit の getNodes()/breakLines() はハイフネーション
// コールバックが返すシラブル配列から実際のPDFテキストレイヤーの文字列を
// 再構築するため、ZWNBSP自体がPDFのテキストコンテンツに literal に残ってしまい、
// テキスト選択・コピーや検索時に不可視の区切り文字が混入する問題があった
// （レビュー指摘）。空文字列は String.prototype.trim() === '' を満たし
// getNodes() 側で同じ「改行可能な空白＝glue」として扱われる一方、シラブルの
// 長さが0のため PDF のテキスト内容には一切文字を追加しない
// （patches/@react-pdf__textkit@6.3.0.patch の hyphenated 判定も
// nextSyllable.trim() === '' で一致するため、空文字列でも従来通りハイフンは
// 付与されない）。
const BREAK_MARKER = '';

let registered = false;

// この値以上の符号点（絵文字・記号ブロック等）は基本多言語面外だが、CJK 統合漢字の
// 拡張領域（人名・地名等の異体字を含む、いわゆる補助多言語面のCJK）もここに含まれる
// ため、一律で除外すると U+20000 以降の拡張漢字が改行不可能な1シラブルとして扱われ、
// 狭いテーブルセルからはみ出す（レビュー指摘）。基本多言語面の上限は区切りとして
// 使わず、CJK 補助面の実際の範囲を isSupplementaryCjkIdeograph で個別に判定する。
const CJK_END_EXCLUSIVE = 0x10000;

// CJK 統合漢字の補助面拡張ブロック（Unicode の Unihan 系ブロック定義に基づく）。
// 絵文字（U+1F300 系等）や国旗の地域指示記号など、CJK ではない他の補助面文字は
// これらの範囲に含まれないため誤って改行可能扱いにはならない。
function isSupplementaryCjkIdeograph(code: number): boolean {
  return (
    (code >= 0x20000 && code <= 0x2a6df) || // CJK統合漢字拡張B
    (code >= 0x2a700 && code <= 0x2b73f) || // 拡張C
    (code >= 0x2b740 && code <= 0x2b81f) || // 拡張D
    (code >= 0x2b820 && code <= 0x2ceaf) || // 拡張E
    (code >= 0x2ceb0 && code <= 0x2ebef) || // 拡張F
    (code >= 0x2f800 && code <= 0x2fa1f) || // CJK互換漢字補助
    (code >= 0x30000 && code <= 0x3134f) || // 拡張G
    (code >= 0x31350 && code <= 0x323af) // 拡張H
  );
}

function isCjk(ch: string): boolean {
  const code = ch.codePointAt(0) ?? 0;
  if (code >= CODEPOINT.CJK_START && code < CJK_END_EXCLUSIVE) return true;
  return isSupplementaryCjkIdeograph(code);
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
    (code >= 0x0300 && code <= 0x036f) || // 結合ダイアクリティカル記号
    (code >= 0x1ab0 && code <= 0x1aff) || // 結合ダイアクリティカル記号拡張
    (code >= 0x1dc0 && code <= 0x1dff) || // 結合ダイアクリティカル記号補助
    (code >= 0x20d0 && code <= 0x20ff) || // 記号用結合ダイアクリティカル記号
    (code >= 0x3099 && code <= 0x309a) || // かな結合濁点・半濁点
    (code >= 0xfe00 && code <= 0xfe0f) || // 異体字セレクタ
    (code >= 0xfe20 && code <= 0xfe2f) || // 結合ハーフマーク
    (code >= 0xe0100 && code <= 0xe01ef) // Variation Selectors Supplement（漢字の異体字シーケンス、IVS）
  );
}

/**
 * 行頭に置いてはいけない文字（行頭禁則）。句読点・閉じ括弧・小書き仮名・繰り返し記号など。
 * ここに載っている文字の直前では改行マーカーを挟まない。
 */
const NO_LINE_START = new Set(
  [
    '、。，．・：；？！',
    'ヽヾゝゞ々ー',
    '）〕］｝〉》」』】〙〗〟’”｠»',
    'ぁぃぅぇぉっゃゅょゎゕゖ',
    'ァィゥェォッャュョヮヵヶ',
    ')]},.:;?!',
  ].join(''),
);

/**
 * 行末に置いてはいけない文字（行末禁則）。開き括弧など。
 * ここに載っている文字の直後では改行マーカーを挟まない。
 */
const NO_LINE_END = new Set(['（〔［｛〈《「『【〘〖〝‘“｟«', '([{'].join(''));

/**
 * 日本語は単語区切りが無いため、ASCII の連なりは保ちつつ、
 * 全角・CJK 文字の境界で改行を許可するように語を分割する。
 *
 * 各 CJK 文字の前後に BREAK_MARKER（空文字列）を挟んで返す。@react-pdf/textkit 側は
 * 「次の要素が空白（trim()===''）なら次で改行してよい（ハイフン無し）」と判定するため、
 * 文字そのものを区切り値として返す（旧実装）とハイフン付きの改行点として
 * 扱われてしまう。BREAK_MARKER を挟むことで改行点はその空要素側に付き、CJK 文字は
 * 崩れずそのまま出力される。CJK→ASCII の境界（例:「連携React」の携/R間）にも
 * 挟まないと、その境界だけ改行機会が無くなる。
 */
export function splitForHyphenation(word: string): string[] {
  const parts: string[] = [];
  let buffer = '';
  let prevWasCjk = false;
  let prevChar = '';
  const flush = (): void => {
    if (buffer) {
      parts.push(buffer);
      buffer = '';
    }
  };
  /**
   * 禁則処理。改行マーカーを挟んでよい境界かを判定する。
   *
   * @react-pdf/textkit は日本語の禁則を知らないので、境界を無条件に挟むと
   * 句点や閉じ括弧だけが次行の頭に落ちる（実測: 「クエリ最適化」→改行→「。」）。
   * 提出書類として明確に体裁の崩れなので、マーカーを挟む側で防ぐ。
   */
  const canBreakBefore = (next: string): boolean => !NO_LINE_START.has(next) && !NO_LINE_END.has(prevChar);
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
      if (prevWasCjk && parts.length > 0 && canBreakBefore(ch)) parts.push(BREAK_MARKER);
      buffer += ch;
      prevWasCjk = false;
      prevChar = ch;
      continue;
    }
    flush();
    if (parts.length > 0 && canBreakBefore(ch)) parts.push(BREAK_MARKER);
    parts.push(ch);
    prevWasCjk = true;
    prevChar = ch;
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

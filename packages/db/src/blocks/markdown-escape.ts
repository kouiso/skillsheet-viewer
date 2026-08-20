/**
 * ブロックを markdown へ変換する際に使う、自由入力文字列のエスケープ系ヘルパ。
 * serialize.ts の各 `*ToMarkdown` からのみ利用される内部ユーティリティ。
 */

import { sanitizeScriptAndStyle } from '../sanitize-html';
import type { TableAlign } from './index';

export const ALIGN_MARKER: Record<TableAlign, string> = {
  left: ':---',
  center: ':---:',
  right: '---:',
};

/**
 * セルを GFM 表で安全な単一行へ整える。
 * - セル内改行は半角スペースへ（複数行貼り付けで表が崩れるのを防止）
 * - `|` はエスケープ
 * - `<` `>` は実体参照へ（下記参照）
 * - 空セルは半角スペース 1 つ（空文字だと GFM の表がずれる）
 *
 * `<` `>` を素通しすると、"Reference <URL>" のような自由入力が remark に生 HTML の
 * インラインノードとして解釈される（`<URL>` が HTML タグらしいパターンに一致するため。
 * HTML5 の既知タグかどうかは問われない）。構造化ビューアは値を素のテキストとして
 * 表示するため見た目には影響しないが、PDF 側（skill-sheet-document.tsx の
 * INLINE_LEAF）は html ノードを意図的に描画せず捨てるため、"Reference <URL>" の
 * "<URL>" 部分だけが PDF から消える（chatgpt-codex-connector レビュー指摘）。
 * `&lt;`/`&gt;` は CommonMark の実体参照としてテキストノードへ復元されるため、
 * 生 HTML として再解釈されずに見た目どおりの文字が残る。
 */
export function escapeCell(value: string): string {
  const sanitized = sanitizeScriptAndStyle(value);
  const single = sanitized
    // 既存のバックスラッシュを先に処理する（後から足すエスケープ用の `\` と混ざらないように）。
    .replace(/\\/g, '\\\\')
    .replace(/\r?\n/g, ' ')
    .replace(/\|/g, '\\|')
    // 構造化ビューアはセルを素のテキストとして出す。markdown/PDF 側だけ `[表示名](URL)` が
    // リンクに、`![...]()` が画像に化けると、同じデータの見え方が経路ごとに食い違う。
    .replace(/[![\]*_`~]/g, '\\$&')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return single.length > 0 ? single : ' ';
}

// 行頭のブロック開始トークン（見出し/リスト/引用/コードフェンス/水平線/生HTML）をエスケープし、
// 自由入力の1行が独立した markdown 構造として解釈されるのを防ぐ。ビューア側（project-card.tsx /
// project-preview.tsx）は company.note を素のテキストとして描画しており、生成する markdown でも
// 同じ「構造を持たない文章」として扱う必要がある。
export function escapeMarkdownParagraph(value: string): string {
  const sanitized = sanitizeScriptAndStyle(value);
  return (
    sanitized
      .split('\n')
      // 元の文章に既にバックスラッシュが含まれる場合（例:「\<img ...>」という文字列を
      // 意図した入力）、先にこれをエスケープしておかないと、後続のメタ文字エスケープが
      // 追加した `\` と合わせて `\\<` になってしまう。remark は `\\` を「リテラルな
      // バックスラッシュ1文字」の escape として消費するため、その直後の `<img ...>` が
      // エスケープされていない生のHTMLとして解釈されてしまう（レビュー指摘）。
      // 既存のバックスラッシュを先に `\\` へエスケープしておけば、後続のメタ文字
      // エスケープと合わせて remark 上も元の見た目（バックスラッシュ+文字）を維持できる。
      .map((line) => line.replace(/\\/g, '\\\\'))
      // 行頭の空白が4文字以上（タブ混在含む）だと remark がインデントコードブロックとして
      // 解釈してしまう。表示側（project-card.tsx / project-preview.tsx）は素のテキストとして
      // 描画するため構造が食い違う。タブを含む・4文字以上のときだけコードブロック化しない
      // 3文字までに削る（タブ無しの1〜3文字の空白はそのまま維持する）。
      .map((line) =>
        line.replace(/^[ \t]+/, (indent) => (indent.includes('\t') || indent.length >= 4 ? '   ' : indent)),
      )
      // 行中のどこに出現しても remark に解釈されるインライン構文の記号
      // （画像/リンクの `!`・`[`・`]`、強調の `*`・`_`、コードスパンの `` ` ``、
      // 取り消し線/水平線の `~`、生HTMLの `<`）は、行頭以外に出現しても解釈されてしまう
      // （例:「会社概要 ![機密](url)」のように行中に画像記法が来るケース、レビュー指摘）ため、
      // 位置を問わず一括でエスケープする。`*` は行頭のリストマーカーとしても使われるが、
      // この一括エスケープで行頭・行中どちらの意味も無効化される。
      .map((line) => line.replace(/[![\]*_`~<]/g, '\\$&'))
      // 見出し(#)・引用(>)・リスト(+-)・番号付きリスト・Setext見出しの下線(=)は
      // 行頭にのみ構造として解釈されるため、行頭のときだけエスケープする
      // （行中の `#` や `-` は remark 上ただの文字として扱われるため過剰エスケープを避ける）。
      .map((line) => line.replace(/^(\s*)([#>+\-=]|\d+[.)])/, '$1\\$2'))
      .join('\n')
  );
}

// 案件の自由記述に含まれる見出し記法を、見出しでない素の行へ落とす。
//
// ビューア側の InlineMarkdown は h1〜h6 の component override を持たず、Tailwind preflight が
// 見出しの字送り・太さを inherit へ潰すため、`### 小見出し` は地の文と同じ見た目になる。
// 一方 PDF 側は heading ノードに構造的な意味を与えており、`skill-sheet-document.tsx` の
// 案件カード分割は「次の heading までを1つの分割不可単位」として trailing を集める。
// 自由記述に見出しが混ざると、その場でカードが打ち切られてカード自身がページ境界で
// 割れる（#147 / #194 の再発経路）。画面が構造として扱っていないものを PDF だけが
// 構造として扱うのが誤りなので、生成する markdown の側で見出しにしない。
function stripHeadingSyntax(value: string): string {
  const lines = value.split('\n');
  const out: string[] = [];
  // ``` / ~~~ の中身はコード本体であって markdown 構造ではないので書き換えない。
  let fence: string | null = null;
  for (const line of lines) {
    const fenceMatch = line.match(/^\s{0,3}(`{3,}|~{3,})/);
    if (fence !== null) {
      out.push(line);
      if (fenceMatch && fenceMatch[1][0] === fence[0] && fenceMatch[1].length >= fence.length) fence = null;
      continue;
    }
    if (fenceMatch) {
      fence = fenceMatch[1];
      out.push(line);
      continue;
    }
    // ATX 見出し（`## foo`）。マーカーだけ落として本文は残す。
    // CommonMark では本文の無い `###` 単独行も見出しなので、同じく落とす（#147 / #194 の再発経路）。
    const atx = line.match(/^(\s{0,3})#{1,6}(?:[ \t]+(.*))?$/);
    if (atx) {
      out.push(atx[1] + (atx[2] ?? ''));
      continue;
    }
    // Setext 見出し（直前の段落行を `===` / `---` の下線が見出しへ格上げする）。
    // 前に空行を挟むと下線は段落から切り離され、`---` は水平線・`===` は素の行になる。
    const previous = out.at(-1);
    if (previous !== undefined && previous.trim() !== '' && /^\s{0,3}(=+|-+)\s*$/.test(line)) {
      out.push('');
    }
    out.push(line);
  }
  return out.join('\n');
}

// 案件の自由記述（duties / acquired / comment）向け。ビューア側はこの3つを
// InlineMarkdown（react-markdown + rehype-sanitize）で描画しており、箇条書き・強調が
// そのまま構造として出る。PDF 側だけ escapeMarkdownParagraph をかけていたため、
// 同じ文字列が `\- ` の羅列になって画面と食い違っていた（#242）。
//
// 構造は保ったまま <script>/<style> だけ落とす。この文字列の行き先は PDF だけではない:
//   - PDF: `skill-sheet-document.tsx`。生HTMLは html ノード処理で無害化される
//     （inline は INLINE_LEAF で破棄、block は stripHtml）
//   - プレビュー: builder-client → BroadcastChannel/localStorage → preview-client →
//     `skill-sheet-viewer.tsx` の MarkdownContent。rehype-raw が有効だが
//     rehype-sanitize（MARKDOWN_SANITIZE_SCHEMA）が後段に入る
//   - `blocksToMarkdown` 経由の `sheet.content`、およびバックアップ書き出しの .md
// 生HTMLを無害化しているのは各描画経路のサニタイザであって、この関数ではない。
export function asInlineMarkdown(value: string): string {
  return stripHeadingSyntax(sanitizeScriptAndStyle(value));
}

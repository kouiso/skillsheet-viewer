/**
 * ユーザー入力を想定した文字列から、生HTMLタグ（特に<script>/<style>）と
 * その内容を取り除き、プレーンテキストとして安全に表示できるようにする。
 * Markdown 経由ではない箇所（名前・タイトル・会社名・スキル名 など）で使う。
 */
export function sanitizeHtml(input: string | null | undefined): string {
  if (!input) return '';
  // <script> / <style> タグとその内容を完全に除去。
  let sanitized = input.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '');
  // 残ったその他のタグも除去（開始・終了・空タグ）。
  sanitized = sanitized.replace(/<\/?[a-zA-Z][^>]*>/g, '');
  return sanitized;
}

/**
 * <script>/<style> タグとその内容だけを取り除く。
 * それ以外の生HTMLタグは保持する。
 */
export function sanitizeScriptAndStyle(input: string | null | undefined): string {
  if (!input) return '';
  return input.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '');
}

/**
 * Markdown ブロックの入力から <script>/<style> タグとその内容だけを取り除く。
 * <details> 等、ビューア/PDF で許容されている生HTMLタグは保持する。
 */
export const sanitizeMarkdown = sanitizeScriptAndStyle;

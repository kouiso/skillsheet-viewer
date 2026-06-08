// 1ブロックに保つ「小さい表」の最大行数。これを超える背の高い表はページ間で折り返す。
export const SMALL_TABLE_MAX_ROWS = 4;

/**
 * 表をページ間で折り返してよいかを返す（必ず boolean）。
 *
 * 小さい表（概要・担当工程など）は分割すると見栄えが悪いので 1 ブロックに保つ（false）。
 * 背の高い表（スキル表等）は折り返しを許可する（true）。
 *
 * 重要: react-pdf の getWrap は `'wrap' in props ? props.wrap : true` のため、
 * `wrap={undefined}` を渡すと「キーは存在するが falsy」と判定され折返し不可になる。
 * ページ高さを超える表が折返し不可だとレイアウト全体が崩れるため、必ず明示的な boolean を渡すこと。
 */
export function shouldTableWrap(rowCount: number): boolean {
  return rowCount > SMALL_TABLE_MAX_ROWS;
}

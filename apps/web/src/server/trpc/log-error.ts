// UNAUTHORIZED/NOT_FOUND/CONFLICT は procedure 側で意図的に投げている想定内の分岐なので
// ログ不要。それ以外（入力検証失敗や想定外の例外）だけ根本原因が追えるよう記録する。
// tRPC の Fetch adapter（/api/trpc）と後方互換 REST アダプタ（/api/auth・/api/logout・
// /api/revalidate）の両方が同じ判定を使うことで、互換アダプタだけ想定外エラーが
// 一切ログされずに握り潰される事態を防ぐ。
const EXPECTED_ERROR_CODES: ReadonlySet<string> = new Set(['UNAUTHORIZED', 'FORBIDDEN', 'NOT_FOUND', 'CONFLICT']);

export function shouldLogTRPCError(code: string): boolean {
  return !EXPECTED_ERROR_CODES.has(code);
}

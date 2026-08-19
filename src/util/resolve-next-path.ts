/**
 * `?next=` パラメータをオープンリダイレクトさせずに解決する。
 *
 * 前方一致（`startsWith('/') && !startsWith('//')`）による判定は、
 * `/\/evil.example.com` のような異表記（バックスラッシュ）をすり抜ける。
 * ブラウザは URL の authority 部で `\` を `/` と同一視するため、
 * `router.push('/\\/evil.example.com')` は `//evil.example.com`
 * （プロトコル相対 URL）として解決され、外部サイトへ遷移してしまう。
 *
 * `URL` で実際に解決してから同一オリジンかどうかを見るほうが、
 * 異表記を個別に潰し続けるより確実。
 */
export function resolveNextPath(next: string | null | undefined, fallback: string, origin: string): string {
  if (!next) return fallback;
  try {
    const url = new URL(next, origin);
    if (url.origin !== origin) return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}

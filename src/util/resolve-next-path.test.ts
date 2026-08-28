import { describe, expect, it } from 'vitest';

import { resolveNextPath } from './resolve-next-path';

const ORIGIN = 'http://localhost:3210';
const FALLBACK = '/view';

describe('resolveNextPath', () => {
  it('内部パスはそのまま許可する', () => {
    expect(resolveNextPath('/view/db/123', FALLBACK, ORIGIN)).toBe('/view/db/123');
  });

  it('クエリ・ハッシュを保ったまま許可する', () => {
    expect(resolveNextPath('/view/db/123?tab=skills#top', FALLBACK, ORIGIN)).toBe('/view/db/123?tab=skills#top');
  });

  it('null / undefined / 空文字は fallback へ落とす', () => {
    expect(resolveNextPath(null, FALLBACK, ORIGIN)).toBe(FALLBACK);
    expect(resolveNextPath(undefined, FALLBACK, ORIGIN)).toBe(FALLBACK);
    expect(resolveNextPath('', FALLBACK, ORIGIN)).toBe(FALLBACK);
  });

  // 前方一致（startsWith('/') && !startsWith('//')）による旧実装は、
  // 以下のいずれも「内部パス」と誤判定してすり抜けさせていた（#159）。
  it.each([
    ['プロトコル相対URL', '//evil.example.com'],
    ['絶対URL', 'https://evil.example.com'],
    ['バックスラッシュ1つ（authority部で / と同一視される）', '/\\/evil.example.com'],
    ['バックスラッシュ2つ', '/\\\\evil.example.com'],
    ['scheme直後のバックスラッシュ', 'https:/\\evil.example.com'],
    ['URLエンコードされたバックスラッシュ', '/%5C/evil.example.com'],
  ])('%s は外部遷移させず fallback へ落とす: %s', (_label, malicious) => {
    const dest = resolveNextPath(malicious, FALLBACK, ORIGIN);
    // fallback を返すか、内部オリジンに解決されるかのどちらかであること
    // （%5C はデコードされずパス文字列として残るため後者になりうる）。
    const resolved = new URL(dest, ORIGIN);
    expect(resolved.origin).toBe(ORIGIN);
  });

  it('不正な URL 文字列は fallback へ落とす', () => {
    expect(resolveNextPath('http://[invalid', FALLBACK, ORIGIN)).toBe(FALLBACK);
  });
});

import { describe, expect, it } from 'vitest';

import { shouldLogTRPCError } from './log-error';

/**
 * この判定は tRPC の Fetch adapter と互換 REST アダプタ 3 本が共有する。
 * 「想定内の分岐」を増やしすぎると、想定外の例外まで無言で消える。
 */
describe('shouldLogTRPCError', () => {
  it.each(['UNAUTHORIZED', 'NOT_FOUND', 'CONFLICT'])('想定内の %s はログしない', (code) => {
    expect(shouldLogTRPCError(code)).toBe(false);
  });

  // FORBIDDEN は cross-origin 拒否＝CSRF 試行の唯一のサーバー側シグナル。
  // 握り潰すと攻撃の痕跡が一切残らないので、必ずログ対象に残す。
  it('FORBIDDEN はログする（CSRF 試行の痕跡を消さない）', () => {
    expect(shouldLogTRPCError('FORBIDDEN')).toBe(true);
  });

  it.each([
    'INTERNAL_SERVER_ERROR',
    'BAD_REQUEST',
    'TOO_MANY_REQUESTS',
    'TIMEOUT',
  ])('想定外の %s はログする', (code) => {
    expect(shouldLogTRPCError(code)).toBe(true);
  });
});

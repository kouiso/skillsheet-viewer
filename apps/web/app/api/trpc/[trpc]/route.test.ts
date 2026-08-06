import { describe, expect, it } from 'vitest';

import { shouldLogTRPCError } from './route';

describe('shouldLogTRPCError', () => {
  it.each([
    'UNAUTHORIZED',
    'NOT_FOUND',
    'CONFLICT',
  ])('%s は procedure 側で意図的に投げる想定内の分岐のためログしない', (code) => {
    expect(shouldLogTRPCError(code)).toBe(false);
  });

  it.each(['BAD_REQUEST', 'INTERNAL_SERVER_ERROR', 'TIMEOUT'])('%s は想定外のエラーのためログする', (code) => {
    expect(shouldLogTRPCError(code)).toBe(true);
  });
});

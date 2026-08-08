import { describe, expect, it } from 'vitest';

import { isUuid } from './is-uuid';

describe('isUuid', () => {
  it('有効なUUIDを認める', () => {
    expect(isUuid('18a79e66-75e2-47e8-922e-d61342bb5233')).toBe(true);
    expect(isUuid('18A79E66-75E2-47E8-922E-D61342BB5233')).toBe(true);
  });

  it('無効な文字列を拒否する', () => {
    expect(isUuid('not-a-uuid')).toBe(false);
    expect(isUuid('')).toBe(false);
    expect(isUuid('18a79e66-75e2-47e8-922e-d61342bb523')).toBe(false);
    expect(isUuid('18a79e66-75e2-47e8-922e-d61342bb5233-extra')).toBe(false);
    expect(isUuid(null)).toBe(false);
    expect(isUuid(undefined)).toBe(false);
  });
});

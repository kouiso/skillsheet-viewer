import { describe, expect, expectTypeOf, it } from 'vitest';

import type { ViewKey } from '@/components/viewer-topbar';

import { toSecondsBucket, type ViewToggleKey } from './event';

describe('ViewToggleKey', () => {
  it('viewer-topbar.tsx の ViewKey と値の集合が一致する（依存方向を守るため複製している）', () => {
    // 型レベルの検査。片方だけに値を足すと tsc（pnpm type-check）がここで落ちる。
    expectTypeOf<ViewKey>().toEqualTypeOf<ViewToggleKey>();
  });
});

describe('toSecondsBucket', () => {
  it.each([
    [0, '0-5'],
    [4_999, '0-5'],
    [5_000, '5-15'],
    [14_999, '5-15'],
    [15_000, '15-30'],
    [29_999, '15-30'],
    [30_000, '30-60'],
    [59_999, '30-60'],
    [60_000, '60+'],
    [3_600_000, '60+'],
  ] as const)('%d ms → %s', (ms, expected) => {
    expect(toSecondsBucket(ms)).toBe(expected);
  });
});

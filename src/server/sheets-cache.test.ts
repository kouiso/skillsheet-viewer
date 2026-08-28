import { describe, expect, it } from 'vitest';

import { isDbContentStale } from './sheets-cache';

// DB_REVALIDATE_SECONDS(60) * 3 = 180秒がしきい値（sheets-cache.ts 参照）。
// 実装の定数を変更した場合はここも合わせて調整すること。
const STALE_THRESHOLD_MS = 180_000;

describe('isDbContentStale', () => {
  it('しきい値より新しい取得時刻は stale と判定しない', () => {
    expect(isDbContentStale(Date.now() - (STALE_THRESHOLD_MS - 1_000))).toBe(false);
  });

  it('しきい値より古い取得時刻は stale と判定する（Issue #204）', () => {
    expect(isDbContentStale(Date.now() - (STALE_THRESHOLD_MS + 1_000))).toBe(true);
  });

  it('取得直後（現在時刻）は stale と判定しない', () => {
    expect(isDbContentStale(Date.now())).toBe(false);
  });
});

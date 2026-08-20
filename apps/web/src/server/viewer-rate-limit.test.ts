import { MAX_FAILURES } from '@skillsheet/db/viewer-rate-limit';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  checkViewerLoginRateLimit,
  clearViewerLoginRateLimit,
  reserveViewerLoginAttemptBoth,
  resetViewerLoginRateLimitMemory,
} from './viewer-rate-limit';

/**
 * DB へ届かない状況（DATABASE_URL 未設定・DB 障害）でも、プロセス内カウンタだけで
 * 総当たりを止められることを確認する。DB 側の集計は packages/db 側の責務。
 *
 * DB に届かないときに素通しにしてしまうと、DB を落とすだけで制限を外せることになる。
 */
describe('閲覧コードの回数制限（DB へ届かない場合のプロセス内カウンタ）', () => {
  beforeEach(() => {
    resetViewerLoginRateLimitMemory();
    // DB 不通時の警告でテスト出力が埋まらないようにする。
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('最初はロックされていない', async () => {
    const state = await checkViewerLoginRateLimit('ip:1.2.3.4');
    expect(state.locked).toBe(false);
    expect(state.remainingAttempts).toBe(MAX_FAILURES);
  });

  it(`${MAX_FAILURES} 回までは照合に進め、それを超えると弾く`, async () => {
    const key = 'ip:1.2.3.4';
    for (let i = 1; i <= MAX_FAILURES; i++) {
      const state = await reserveViewerLoginAttemptBoth(key);
      expect(state.locked, `${i} 回目は照合に進めるべき`).toBe(false);
    }
    const locked = await reserveViewerLoginAttemptBoth(key);
    expect(locked.locked).toBe(true);
    expect(locked.retryAfterSeconds).toBeGreaterThan(0);

    // 以後は照合そのものに進めない。
    await expect(checkViewerLoginRateLimit(key)).resolves.toMatchObject({ locked: true });
  });

  // 「確認 → 照合 → 記録」の3段だと、並列リクエストが全部同じ「未ロック」を読んで
  // 上限を超えた数の照合まで進んでしまう。枠の消費が1回で済んでいることを確かめる。
  it('同時に投げても照合まで進めるのは上限回数まで', async () => {
    const key = 'ip:9.9.9.9';
    const results = await Promise.all(
      Array.from({ length: MAX_FAILURES * 3 }, () => reserveViewerLoginAttemptBoth(key)),
    );
    expect(results.filter((r) => !r.locked)).toHaveLength(MAX_FAILURES);
  });

  it('送り元が違えば互いに巻き込まない', async () => {
    for (let i = 0; i <= MAX_FAILURES; i++) await reserveViewerLoginAttemptBoth('ip:1.1.1.1');

    await expect(checkViewerLoginRateLimit('ip:1.1.1.1')).resolves.toMatchObject({ locked: true });
    await expect(checkViewerLoginRateLimit('ip:2.2.2.2')).resolves.toMatchObject({ locked: false });
  });

  it('認証に成功した相手は記録が消えて元に戻る', async () => {
    const key = 'ip:3.3.3.3';
    await reserveViewerLoginAttemptBoth(key);
    await reserveViewerLoginAttemptBoth(key);
    await clearViewerLoginRateLimit(key);

    await expect(checkViewerLoginRateLimit(key)).resolves.toMatchObject({
      locked: false,
      remainingAttempts: MAX_FAILURES,
    });
  });

  it('ロック時間が過ぎれば再び試せる', async () => {
    const key = 'ip:4.4.4.4';
    const now = 1_000_000;
    for (let i = 0; i <= MAX_FAILURES; i++) await reserveViewerLoginAttemptBoth(key, now);
    await expect(checkViewerLoginRateLimit(key, now)).resolves.toMatchObject({ locked: true });

    // ロック（15分）と集計窓（10分）の両方を越えた時点。
    const later = now + 16 * 60 * 1000;
    await expect(checkViewerLoginRateLimit(key, later)).resolves.toMatchObject({ locked: false });
  });
});

import {
  checkViewerLoginLock,
  clearViewerLoginFailures,
  LOCK_MS,
  MAX_FAILURES,
  type RateLimitState,
  recordViewerLoginFailure,
  WINDOW_MS,
} from '@skillsheet/db/viewer-rate-limit';

/**
 * 閲覧コードの総当たり対策を、プロセス内カウンタと DB カウンタの二段で行う。
 *
 * なぜ二段か:
 * - DB だけにすると、DB 障害時に閲覧コード認証まで巻き込まれて誰も見られなくなる。
 *   `server/trpc/context.ts` が「閲覧 cookie の判定は DB を参照しない」と明記しているのと
 *   同じ理由で、login も DB 障害で全面停止させたくない。
 * - プロセス内だけにすると、Vercel の serverless はインスタンスを使い捨てで水平に増やすため、
 *   並列でいくらでも試行できてしまう。
 *
 * そこで「プロセス内は必ず効く。DB は届く限り効く（届かなければ警告して素通し）」にする。
 * どちらか一方でもロックしていればロック扱い。
 */

interface MemoryEntry {
  failureCount: number;
  windowStartedAt: number;
  lockedUntil: number | null;
}

/** インスタンスが生きている間だけ持つ。使い捨てなので溜まり続けない。 */
const memory = new Map<string, MemoryEntry>();
/** 際限なく増えないよう上限を設ける。超えたら古い順に捨てる。 */
const MEMORY_MAX_KEYS = 10_000;

function memoryCheck(key: string, now: number): RateLimitState {
  const entry = memory.get(key);
  if (!entry) return { locked: false, retryAfterSeconds: 0, remainingAttempts: MAX_FAILURES };
  if (entry.lockedUntil && entry.lockedUntil > now) {
    return { locked: true, retryAfterSeconds: Math.ceil((entry.lockedUntil - now) / 1000), remainingAttempts: 0 };
  }
  if (now - entry.windowStartedAt > WINDOW_MS) {
    memory.delete(key);
    return { locked: false, retryAfterSeconds: 0, remainingAttempts: MAX_FAILURES };
  }
  return {
    locked: false,
    retryAfterSeconds: 0,
    remainingAttempts: Math.max(0, MAX_FAILURES - entry.failureCount),
  };
}

function memoryRecordFailure(key: string, now: number): RateLimitState {
  const existing = memory.get(key);
  const inWindow = existing && now - existing.windowStartedAt <= WINDOW_MS;
  const failureCount = inWindow ? existing.failureCount + 1 : 1;
  const windowStartedAt = inWindow ? existing.windowStartedAt : now;
  const lockedUntil = failureCount >= MAX_FAILURES ? now + LOCK_MS : (existing?.lockedUntil ?? null);

  if (!memory.has(key) && memory.size >= MEMORY_MAX_KEYS) {
    const oldest = memory.keys().next();
    if (!oldest.done) memory.delete(oldest.value);
  }
  memory.set(key, { failureCount, windowStartedAt, lockedUntil });
  return memoryCheck(key, now);
}

/** 二段のうち「よりロックが強い方」を返す。 */
function strictest(a: RateLimitState, b: RateLimitState): RateLimitState {
  if (a.locked && b.locked) return a.retryAfterSeconds >= b.retryAfterSeconds ? a : b;
  if (a.locked) return a;
  if (b.locked) return b;
  return a.remainingAttempts <= b.remainingAttempts ? a : b;
}

export async function checkViewerLoginRateLimit(key: string, now = Date.now()): Promise<RateLimitState> {
  const inMemory = memoryCheck(key, now);
  try {
    return strictest(inMemory, await checkViewerLoginLock(key, new Date(now)));
  } catch (err) {
    // DB に届かないだけで閲覧を止めない。プロセス内の判定は生かす。
    console.warn('viewer rate limit: DB check failed, falling back to in-process counter', err);
    return inMemory;
  }
}

export async function recordViewerLoginFailureBoth(key: string, now = Date.now()): Promise<RateLimitState> {
  const inMemory = memoryRecordFailure(key, now);
  try {
    return strictest(inMemory, await recordViewerLoginFailure(key, new Date(now)));
  } catch (err) {
    console.warn('viewer rate limit: DB record failed, falling back to in-process counter', err);
    return inMemory;
  }
}

export async function clearViewerLoginRateLimit(key: string): Promise<void> {
  memory.delete(key);
  try {
    await clearViewerLoginFailures(key);
  } catch (err) {
    console.warn('viewer rate limit: DB clear failed', err);
  }
}

/** テスト用。プロセス内カウンタを空にする。 */
export function resetViewerLoginRateLimitMemory(): void {
  memory.clear();
}

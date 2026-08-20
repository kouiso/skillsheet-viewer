import { eq, sql } from 'drizzle-orm';

import { type Database, getDb } from './client';
import { viewerLoginAttempt } from './schema';

/**
 * 閲覧コードの総当たり対策。
 *
 * 以前は回数制限もロックも遅延も無く、実測で毎秒 337 回の試行が通った。
 * 共有の閲覧コード 1 本が唯一の防御なので、オンライン総当たりが成立してしまう。
 *
 * 数え方の正本を DB に置いているのは、Vercel の serverless がインスタンスを
 * 使い捨てで水平に増やすため。プロセス内カウンタだと並列でいくらでも回せる。
 */

/** 何回失敗したらロックするか。 */
export const MAX_FAILURES = 8;
/** 失敗回数を数える窓（この時間だけ失敗が経過しなければカウントをリセットする）。 */
export const WINDOW_MS = 10 * 60 * 1000;
/** 上限に達したときのロック時間。 */
export const LOCK_MS = 15 * 60 * 1000;
/** IP が取れない場合に使う共通キー。取れない相手同士でひとまとめに制限する。 */
export const UNKNOWN_KEY = 'unknown';

export interface RateLimitState {
  locked: boolean;
  /** ロック解除までの秒数（locked=false のときは 0）。 */
  retryAfterSeconds: number;
  /** ロックまでに残っている失敗回数。 */
  remainingAttempts: number;
}

/**
 * `x-forwarded-for` の先頭を送り元とみなす。Vercel はこのヘッダを自分で書き換えるため、
 * クライアントからの詐称は届かない。自ホスト運用など前段が信用できない環境では
 * 個別の送り元を識別できないので、その場合も UNKNOWN_KEY にまとめて制限が外れないようにする。
 */
export function clientKeyFromHeaders(headers: Headers | null | undefined): string {
  const forwarded = headers?.get('x-forwarded-for');
  const first = forwarded?.split(',')[0]?.trim();
  const real = first || headers?.get('x-real-ip')?.trim();
  return real ? `ip:${real}` : UNKNOWN_KEY;
}

function lockState(row: { failureCount: number; lockedUntil: Date | null }, now: Date): RateLimitState {
  if (row.lockedUntil && row.lockedUntil.getTime() > now.getTime()) {
    return {
      locked: true,
      retryAfterSeconds: Math.ceil((row.lockedUntil.getTime() - now.getTime()) / 1000),
      remainingAttempts: 0,
    };
  }
  return { locked: false, retryAfterSeconds: 0, remainingAttempts: Math.max(0, MAX_FAILURES - row.failureCount) };
}

/** いまロック中かどうかを見る。コードの照合より前に呼ぶ。 */
export async function checkViewerLoginLock(
  key: string,
  now = new Date(),
  db: Database = getDb(),
): Promise<RateLimitState> {
  const [row] = await db.select().from(viewerLoginAttempt).where(eq(viewerLoginAttempt.key, key)).limit(1);
  if (!row) return { locked: false, retryAfterSeconds: 0, remainingAttempts: MAX_FAILURES };
  // 窓を過ぎていて、かつロック中でもなければ、記録は無いものとして扱う。
  if (
    (!row.lockedUntil || row.lockedUntil.getTime() <= now.getTime()) &&
    now.getTime() - row.windowStartedAt.getTime() > WINDOW_MS
  ) {
    return { locked: false, retryAfterSeconds: 0, remainingAttempts: MAX_FAILURES };
  }
  return lockState(row, now);
}

/**
 * 失敗を1回記録し、記録後の状態を返す。
 *
 * 1 文で upsert しているのは、同じ送り元からの並列リクエストで
 * 「読んでから書く」が競合し、数え落としが起きるのを避けるため。
 */
export async function recordViewerLoginFailure(
  key: string,
  now = new Date(),
  db: Database = getDb(),
): Promise<RateLimitState> {
  const windowStart = new Date(now.getTime() - WINDOW_MS);
  const lockUntil = new Date(now.getTime() + LOCK_MS);

  const [row] = await db
    .insert(viewerLoginAttempt)
    .values({ key, failureCount: 1, windowStartedAt: now, lockedUntil: null })
    .onConflictDoUpdate({
      target: viewerLoginAttempt.key,
      set: {
        // 窓を過ぎていれば数え直し、そうでなければ加算する。
        failureCount: sql`case when ${viewerLoginAttempt.windowStartedAt} < ${windowStart.toISOString()} then 1 else ${viewerLoginAttempt.failureCount} + 1 end`,
        windowStartedAt: sql`case when ${viewerLoginAttempt.windowStartedAt} < ${windowStart.toISOString()} then ${now.toISOString()}::timestamptz else ${viewerLoginAttempt.windowStartedAt} end`,
        lockedUntil: sql`case when (case when ${viewerLoginAttempt.windowStartedAt} < ${windowStart.toISOString()} then 1 else ${viewerLoginAttempt.failureCount} + 1 end) >= ${MAX_FAILURES} then ${lockUntil.toISOString()}::timestamptz else ${viewerLoginAttempt.lockedUntil} end`,
      },
    })
    .returning();

  return lockState(row, now);
}

/** 認証に成功したら記録を消す。正しい利用者を巻き込まないため。 */
export async function clearViewerLoginFailures(key: string, db: Database = getDb()): Promise<void> {
  await db.delete(viewerLoginAttempt).where(eq(viewerLoginAttempt.key, key));
}

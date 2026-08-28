import { createHash } from 'node:crypto';
import { eq, lt, or, sql } from 'drizzle-orm';

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

/** 何回まで照合を許すか。これを超える試行はコードを見ずに弾く。 */
export const MAX_FAILURES = 8;
/** 失敗回数を数える窓（この時間だけ試行が途切れればカウントをリセットする）。 */
export const WINDOW_MS = 10 * 60 * 1000;
/** 上限に達したときのロック時間。 */
export const LOCK_MS = 15 * 60 * 1000;
/** IP が取れない場合に使う共通キー。取れない相手同士でひとまとめに制限する。 */
export const UNKNOWN_KEY = 'unknown';

export interface RateLimitState {
  locked: boolean;
  /** ロック解除までの秒数（locked=false のときは 0）。 */
  retryAfterSeconds: number;
  /** ロックまでに残っている試行回数。 */
  remainingAttempts: number;
}

/**
 * `x-forwarded-for` の先頭を送り元とみなし、**ハッシュして**返す。
 *
 * Vercel はこのヘッダを自分で書き換えるため、クライアントからの詐称は届かない。
 * 前段が信用できない環境では個別の送り元を識別できないので、その場合は UNKNOWN_KEY に
 * まとめて制限が外れないようにする。
 *
 * 生の IP を返さないのは、この値が DB（`viewer_login_attempt.key`）に永続化され、
 * ロック時にはログにも出るため。必要なのは「同じ送り元か」の判定だけで、IP 自体は要らない。
 */
export function clientKeyFromHeaders(headers: Headers | null | undefined): string {
  const forwarded = headers?.get('x-forwarded-for');
  const first = forwarded?.split(',')[0]?.trim();
  const real = first || headers?.get('x-real-ip')?.trim();
  if (!real) return UNKNOWN_KEY;
  return `ip:${createHash('sha256').update(real, 'utf-8').digest('hex').slice(0, 32)}`;
}

function stateFrom(row: { failureCount: number; lockedUntil: Date | null }, now: Date): RateLimitState {
  if (row.lockedUntil && row.lockedUntil.getTime() > now.getTime()) {
    return {
      locked: true,
      retryAfterSeconds: Math.ceil((row.lockedUntil.getTime() - now.getTime()) / 1000),
      remainingAttempts: 0,
    };
  }
  return { locked: false, retryAfterSeconds: 0, remainingAttempts: Math.max(0, MAX_FAILURES - row.failureCount) };
}

/**
 * 試行枠を1つ atomically に消費し、消費後の状態を返す。**コードを照合する前に**呼ぶ。
 *
 * 「確認してから記録する」の2段構えだと、同じ送り元から並列に投げられたリクエストが
 * 全部「まだロックされていない」を読んでしまい、上限を超えた数の照合が走る。
 * 1文の upsert にまとめて、その競合を無くしている。
 *
 * 返り値が locked=true のときは、このリクエストは照合に進んではいけない。
 */
export async function reserveViewerLoginAttempt(
  key: string,
  now = new Date(),
  db: Database = getDb(),
): Promise<RateLimitState> {
  const windowStart = new Date(now.getTime() - WINDOW_MS).toISOString();
  const lockUntil = new Date(now.getTime() + LOCK_MS).toISOString();
  const nowIso = now.toISOString();

  // ロック中かどうか。ロック中は一切書き換えない。
  // 書き換えると、ロック中に来た要求のたびにロック期限が伸び、共有 IP の利用者が
  // 攻撃者の試行に巻き込まれて永久に入れなくなる。
  const isLocked = sql`(${viewerLoginAttempt.lockedUntil} is not null and ${viewerLoginAttempt.lockedUntil} > ${nowIso}::timestamptz)`;
  // 窓を過ぎていれば数え直す（ロックが切れている場合のみ）。
  const windowExpired = sql`(${viewerLoginAttempt.windowStartedAt} < ${windowStart}::timestamptz and (${viewerLoginAttempt.lockedUntil} is null or ${viewerLoginAttempt.lockedUntil} <= ${nowIso}::timestamptz))`;
  const nextCount = sql`case when ${isLocked} then ${viewerLoginAttempt.failureCount} when ${windowExpired} then 1 else ${viewerLoginAttempt.failureCount} + 1 end`;

  const [row] = await db
    .insert(viewerLoginAttempt)
    .values({ key, failureCount: 1, windowStartedAt: now, lockedUntil: null })
    .onConflictDoUpdate({
      target: viewerLoginAttempt.key,
      set: {
        failureCount: nextCount,
        windowStartedAt: sql`case when ${isLocked} then ${viewerLoginAttempt.windowStartedAt} when ${windowExpired} then ${nowIso}::timestamptz else ${viewerLoginAttempt.windowStartedAt} end`,
        lockedUntil: sql`case when ${isLocked} then ${viewerLoginAttempt.lockedUntil} when (${nextCount}) > ${MAX_FAILURES} then ${lockUntil}::timestamptz else ${viewerLoginAttempt.lockedUntil} end`,
      },
    })
    .returning();

  // 消費後の枠が上限を超えていれば、このリクエストは照合に進ませない。
  if (row.failureCount > MAX_FAILURES) {
    return {
      locked: true,
      retryAfterSeconds: row.lockedUntil
        ? Math.max(1, Math.ceil((row.lockedUntil.getTime() - now.getTime()) / 1000))
        : Math.ceil(LOCK_MS / 1000),
      remainingAttempts: 0,
    };
  }
  return stateFrom(row, now);
}

/** いま試行できるかを、枠を消費せずに見る（表示や事前判定用）。 */
export async function checkViewerLoginLock(
  key: string,
  now = new Date(),
  db: Database = getDb(),
): Promise<RateLimitState> {
  const [row] = await db.select().from(viewerLoginAttempt).where(eq(viewerLoginAttempt.key, key)).limit(1);
  if (!row) return { locked: false, retryAfterSeconds: 0, remainingAttempts: MAX_FAILURES };
  if (
    (!row.lockedUntil || row.lockedUntil.getTime() <= now.getTime()) &&
    now.getTime() - row.windowStartedAt.getTime() > WINDOW_MS
  ) {
    return { locked: false, retryAfterSeconds: 0, remainingAttempts: MAX_FAILURES };
  }
  return stateFrom(row, now);
}

/** 認証に成功したら記録を消す。正しい利用者を巻き込まないため。 */
export async function clearViewerLoginFailures(key: string, db: Database = getDb()): Promise<void> {
  await db.delete(viewerLoginAttempt).where(eq(viewerLoginAttempt.key, key));
}

/**
 * 期限切れの記録を消す。
 *
 * 攻撃側は送り元を変えられるので、放っておくと行が増え続ける。
 * cron を増やさずに済むよう、失敗を記録するついでに呼ぶ想定（失敗自体が稀なので負荷にならない）。
 */
export async function purgeExpiredViewerLoginAttempts(now = new Date(), db: Database = getDb()): Promise<void> {
  const nowIso = now.toISOString();
  const windowStart = new Date(now.getTime() - WINDOW_MS).toISOString();
  await db.delete(viewerLoginAttempt).where(
    or(
      // ロックが明けている、かつ集計窓も過ぎている行はもう意味がない。
      sql`${viewerLoginAttempt.lockedUntil} is not null and ${viewerLoginAttempt.lockedUntil} <= ${nowIso}::timestamptz and ${viewerLoginAttempt.windowStartedAt} < ${windowStart}::timestamptz`,
      sql`${viewerLoginAttempt.lockedUntil} is null and ${lt(viewerLoginAttempt.windowStartedAt, new Date(windowStart))}`,
    ),
  );
}

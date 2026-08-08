import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const getSessionMock = vi.fn();

vi.mock('next/headers', () => ({ headers: vi.fn(async () => new Headers()) }));
vi.mock('@/lib/auth', () => ({ getAuth: () => ({ api: { getSession: getSessionMock } }) }));

import { getEditorUserId, isEditor } from './auth-gate';

let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = {
    BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
    DATABASE_URL: process.env.DATABASE_URL,
    SKILLSHEET_OWNER_ID: process.env.SKILLSHEET_OWNER_ID,
  };
  process.env.BETTER_AUTH_SECRET = 'secret';
  process.env.DATABASE_URL = 'postgres://x';
  process.env.SKILLSHEET_OWNER_ID = 'owner-1';
  getSessionMock.mockReset();
});

afterEach(() => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  vi.restoreAllMocks();
});

describe('getEditorUserId / isEditor', () => {
  it('session.user.id が owner と一致すれば id を返し isEditor は true', async () => {
    getSessionMock.mockResolvedValue({ user: { id: 'owner-1' } });
    expect(await getEditorUserId()).toBe('owner-1');
    expect(await isEditor()).toBe(true);
  });

  it('HTTP Request headers が渡された場合は Next.js global より優先する', async () => {
    const requestHeaders = new Headers({ cookie: 'better-auth.session_token=http-token' });
    getSessionMock.mockResolvedValue({ user: { id: 'owner-1' } });

    await expect(getEditorUserId(requestHeaders)).resolves.toBe('owner-1');
    expect(getSessionMock).toHaveBeenCalledWith({ headers: requestHeaders });
  });

  it('owner と一致しない id は null / false', async () => {
    getSessionMock.mockResolvedValue({ user: { id: 'someone-else' } });
    expect(await getEditorUserId()).toBeNull();
    expect(await isEditor()).toBe(false);
  });

  it('セッションが無ければ null / false', async () => {
    getSessionMock.mockResolvedValue(null);
    expect(await getEditorUserId()).toBeNull();
    expect(await isEditor()).toBe(false);
  });

  it('必要な env が欠けていれば getSession を呼ばず null', async () => {
    delete process.env.SKILLSHEET_OWNER_ID;
    expect(await getEditorUserId()).toBeNull();
    expect(getSessionMock).not.toHaveBeenCalled();
  });

  it('getSession が例外を投げたら null（catch）', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    getSessionMock.mockRejectedValue(new Error('boom'));
    expect(await getEditorUserId()).toBeNull();
    expect(await isEditor()).toBe(false);
  });
});

// React cache() は実際のレンダーコンテキスト外（vitest 環境）ではメモ化せず、呼び出すたびに
// 関数を再実行する（caller.test.ts で実測済み）。そのため「1リクエストで getSession が1回」を
// 素の vitest で直接は再現できない。ここでは cache() を「実際に効く」契約どおりに振る舞う
// フェイク実装へ差し替え、その契約が満たされたときに auth-gate.ts の配線が正しく1回に
// 閉じることだけを検証する（実際に cache() が効くこと自体は React 自身の契約）。
describe('getEditorUserId の RSC 経路メモ化配線（cache() が契約どおり動く前提）', () => {
  beforeEach(() => {
    getSessionMock.mockReset();
    process.env.BETTER_AUTH_SECRET = 'secret';
    process.env.DATABASE_URL = 'postgres://x';
    process.env.SKILLSHEET_OWNER_ID = 'owner-1';
  });

  afterEach(() => {
    vi.doUnmock('react');
    vi.resetModules();
  });

  it('引数なし呼び出しを何度重ねても getSession は1回だけ（cache() を経由するのは無引数呼び出しだけ）', async () => {
    vi.doMock('react', async (importOriginal) => {
      const actual = await importOriginal<typeof import('react')>();
      const memoize = <T extends (...args: never[]) => unknown>(fn: T): T => {
        let hasCached = false;
        let cached: ReturnType<T>;
        return ((...args: Parameters<T>) => {
          if (!hasCached) {
            hasCached = true;
            cached = fn(...args) as ReturnType<T>;
          }
          return cached;
        }) as T;
      };
      return { ...actual, cache: memoize };
    });
    vi.resetModules();
    getSessionMock.mockResolvedValue({ user: { id: 'owner-1' } });

    const { getEditorUserId: freshGetEditorUserId } = await import('./auth-gate');
    await Promise.all([freshGetEditorUserId(), freshGetEditorUserId(), freshGetEditorUserId()]);

    expect(getSessionMock).toHaveBeenCalledTimes(1);
  });

  it('requestHeaders を渡す HTTP 経路は cache() を経由しないため、毎回 getSession を呼ぶ', async () => {
    vi.doMock('react', async (importOriginal) => {
      const actual = await importOriginal<typeof import('react')>();
      const memoize = <T extends (...args: never[]) => unknown>(fn: T): T => {
        let hasCached = false;
        let cached: ReturnType<T>;
        return ((...args: Parameters<T>) => {
          if (!hasCached) {
            hasCached = true;
            cached = fn(...args) as ReturnType<T>;
          }
          return cached;
        }) as T;
      };
      return { ...actual, cache: memoize };
    });
    vi.resetModules();
    getSessionMock.mockResolvedValue({ user: { id: 'owner-1' } });

    const { getEditorUserId: freshGetEditorUserId } = await import('./auth-gate');
    const h = new Headers({ cookie: 'better-auth.session_token=http-token' });
    await Promise.all([freshGetEditorUserId(h), freshGetEditorUserId(h)]);

    expect(getSessionMock).toHaveBeenCalledTimes(2);
  });
});

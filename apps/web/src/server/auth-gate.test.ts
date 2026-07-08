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

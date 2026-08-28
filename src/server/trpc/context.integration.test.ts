import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// context.test.ts は @/server/auth-gate と @/server/viewer-gate の両方をモックし、
// createTRPCContext() 自身のメモ化ロジックだけを検証する。だが、それだと
// 「HTTP 経路で渡した requestHeaders が実際に viewer-gate の cookie 読み取りへ届くか」
// という配線そのものは、モックが記録した引数を見ているだけで実物では確認できない。
// ここでは auth-gate/viewer-gate を一切モックせず、Better Auth 呼び出しの最下層
// （@/lib/auth）だけをモックして、実物の cookie パース・HMAC 検証を通す。
const getSessionMock = vi.fn();
vi.mock('@/lib/auth', () => ({ getAuth: () => ({ api: { getSession: getSessionMock } }) }));
vi.mock('next/headers', () => ({
  headers: vi.fn(async () => new Headers()),
  cookies: vi.fn(async () => ({ get: () => undefined })),
}));

let saved: Record<string, string | undefined>;

beforeEach(async () => {
  saved = {
    SESSION_SECRET: process.env.SESSION_SECRET,
    BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
    DATABASE_URL: process.env.DATABASE_URL,
    SKILLSHEET_OWNER_ID: process.env.SKILLSHEET_OWNER_ID,
  };
  process.env.SESSION_SECRET = 'integration-test-session-secret';
  delete process.env.BETTER_AUTH_SECRET;
  delete process.env.DATABASE_URL;
  delete process.env.SKILLSHEET_OWNER_ID;
  getSessionMock.mockReset();
  vi.resetModules();
});

afterEach(() => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

describe('createTRPCContext と実物の auth-gate/viewer-gate の結線（context.test.ts はここをモックする）', () => {
  it('HTTP 経路: request の Cookie ヘッダーに載った有効な閲覧セッションを実際に検証して isViewer=true になる', async () => {
    const { createSessionToken } = await import('@/server/session');
    const token = createSessionToken();
    const req = new Request('https://example.com/api/trpc/auth.status', {
      headers: { cookie: `session=${token}` },
    });

    const { createTRPCContext } = await import('./context');
    const ctx = createTRPCContext({ req });

    await expect(ctx.getIsViewer()).resolves.toBe(true);
    await expect(ctx.getEditorUserId()).resolves.toBeNull();
    // 編集者判定用の Better Auth 環境変数を意図的に外しているので getSession は呼ばれない。
    expect(getSessionMock).not.toHaveBeenCalled();
  });

  it('HTTP auth.status: 閲覧 cookie だけなら canView=true / canEdit=false を返す', async () => {
    const { createSessionToken } = await import('@/server/session');
    const token = createSessionToken();
    const req = new Request('https://example.com/api/trpc/auth.status', {
      headers: { cookie: `session=${token}` },
    });
    const { createTRPCContext } = await import('./context');
    const { createCallerFactory } = await import('./init');
    const { authRouter } = await import('./router/auth');
    const caller = createCallerFactory(authRouter)(createTRPCContext({ req }));

    await expect(caller.status()).resolves.toEqual({ canEdit: false, canView: true });
    expect(getSessionMock).not.toHaveBeenCalled();
  });

  it('HTTP auth.status: 閲覧 cookie と編集者 session の併存時も canEdit=true を維持する', async () => {
    process.env.BETTER_AUTH_SECRET = 'secret';
    process.env.DATABASE_URL = 'postgres://x';
    process.env.SKILLSHEET_OWNER_ID = 'owner-1';
    getSessionMock.mockResolvedValue({ user: { id: 'owner-1' } });
    const { createSessionToken } = await import('@/server/session');
    const token = createSessionToken();
    const req = new Request('https://example.com/api/trpc/auth.status', {
      headers: { cookie: `session=${token}; better-auth.session_token=cached-session` },
    });
    const { createTRPCContext } = await import('./context');
    const { createCallerFactory } = await import('./init');
    const { authRouter } = await import('./router/auth');
    const caller = createCallerFactory(authRouter)(createTRPCContext({ req }));

    await expect(caller.status()).resolves.toEqual({ canEdit: true, canView: true });
    expect(getSessionMock).toHaveBeenCalledOnce();
  });

  it('HTTP 経路: Cookie が無い/不正なら isViewer=false になる（実物の cookie パース経由）', async () => {
    const req = new Request('https://example.com/api/trpc/auth.status', {
      headers: { cookie: 'other=unrelated' },
    });

    const { createTRPCContext } = await import('./context');
    const ctx = createTRPCContext({ req });

    await expect(ctx.getIsViewer()).resolves.toBe(false);
  });

  it('HTTP 経路: 改ざんされた署名は実物の timingSafeEqual 検証で弾かれる', async () => {
    const { createSessionToken } = await import('@/server/session');
    const token = createSessionToken();
    const tamperedToken = `${token.split('.')[0]}.tampered-signature-xxxxxxxxxxxxxxxx`;
    const req = new Request('https://example.com/api/trpc/auth.status', {
      headers: { cookie: `session=${tamperedToken}` },
    });

    const { createTRPCContext } = await import('./context');
    const ctx = createTRPCContext({ req });

    await expect(ctx.getIsViewer()).resolves.toBe(false);
  });

  it('RSC 経路（req 無し）: 実物の isEditor が Better Auth のセッションを解決して editorUserId を返す', async () => {
    process.env.BETTER_AUTH_SECRET = 'secret';
    process.env.DATABASE_URL = 'postgres://x';
    process.env.SKILLSHEET_OWNER_ID = 'owner-1';
    getSessionMock.mockResolvedValue({ user: { id: 'owner-1' } });

    const { createTRPCContext } = await import('./context');
    const ctx = createTRPCContext();

    await expect(ctx.getEditorUserId()).resolves.toBe('owner-1');
    await expect(ctx.getIsViewer()).resolves.toBe(true);
  });
});

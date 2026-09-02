import { TRPCError } from '@trpc/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { reportDegradation, reportTRPCError } from './report-error';

const captureMessageMock = vi.fn();
vi.mock('@sentry/nextjs', () => ({ captureMessage: captureMessageMock, captureException: vi.fn() }));

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

/**
 * `isSentryEnabled()` は NODE_ENV=test で常に false（config.test.ts で確認済み）なので、
 * ここでは「Sentry へ実際に送るかどうか」ではなく「console.error を呼ぶ/呼ばない」だけを見る。
 * Sentry 側の実送信保証は動作確認手順（DevTools 目視・手順4）で行う — 単体テストでは
 * `NEXT_PUBLIC_*` のビルド時インライン化を再現できないため代替できない。
 */
describe('reportTRPCError', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each(['UNAUTHORIZED', 'NOT_FOUND', 'CONFLICT'])('%s は想定内なので console.error を呼ばない', (code) => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    reportTRPCError({
      error: new TRPCError({ code: code as never, message: 'x' }),
      scope: 'test',
      logArgs: ['test: unexpected error:', new Error('x')],
    });
    expect(spy).not.toHaveBeenCalled();
  });

  it('FORBIDDEN は CSRF 試行の唯一のシグナルなので console.error を呼ぶ', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const error = new TRPCError({ code: 'FORBIDDEN', message: 'cross-origin' });
    reportTRPCError({ error, scope: 'test', logArgs: ['test: unexpected error:', error] });
    expect(spy).toHaveBeenCalledWith('test: unexpected error:', error);
  });

  it('logArgs をそのまま console.error に渡す（既存ログ文言を一字一句維持する）', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const error = new Error('boom');
    reportTRPCError({ error, scope: 'test', logArgs: ['POST /api/auth: unexpected error:', error] });
    expect(spy).toHaveBeenCalledWith('POST /api/auth: unexpected error:', error);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('TRPCError でない例外は常にログする', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const error = new Error('unexpected');
    reportTRPCError({ error, scope: 'test', logArgs: ['test: unexpected error:', error] });
    expect(spy).toHaveBeenCalledWith('test: unexpected error:', error);
  });
});

describe('reportDegradation', () => {
  afterEach(() => {
    captureMessageMock.mockClear();
  });

  it('NODE_ENV=test では Sentry 無効なので通信も発生しない', async () => {
    reportDegradation('degraded', { scope: 'test' });
    await tick();
    expect(captureMessageMock).not.toHaveBeenCalled();
  });
});

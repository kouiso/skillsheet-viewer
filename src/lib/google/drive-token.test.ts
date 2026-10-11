import { afterEach, describe, expect, it, vi } from 'vitest';

import { createDriveTokenSource, DriveAuthCancelledError, DriveAuthUnavailableError } from './drive-token';

/** GIS の token client を模倣するスタブ。 */
function stubGis(behavior?: { onRequest?: (callback: (r: unknown) => void) => void }) {
  const requestAccessToken = vi.fn();
  const initTokenClient = vi.fn((config: { callback: (r: unknown) => void; error_callback?: (e: unknown) => void }) => {
    requestAccessToken.mockImplementation(() => {
      if (behavior?.onRequest) behavior.onRequest(config.callback);
      else
        config.callback({
          access_token: 'token-1',
          expires_in: 3600,
        });
    });
    return { requestAccessToken };
  });
  vi.stubGlobal('google', { accounts: { oauth2: { initTokenClient } } });
  return { requestAccessToken, initTokenClient };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('createDriveTokenSource', () => {
  it('ensureToken は即座に requestAccessToken を呼ぶ（他処理を待たない #384 DoD）', async () => {
    const { requestAccessToken } = stubGis();
    const source = createDriveTokenSource('client-id');

    const tokenPromise = source.ensureToken();
    // 呼び出しと同じターンでトークン要求が始まること。await の解決待ちではない。
    expect(requestAccessToken).toHaveBeenCalledOnce();
    await expect(tokenPromise).resolves.toBe('token-1');
  });

  it('取得したトークンは期限 1 分前まで使い回す（2 回目でポップアップを出さない）', async () => {
    const { requestAccessToken } = stubGis();
    const source = createDriveTokenSource('client-id');

    await source.ensureToken();
    await source.ensureToken();
    expect(requestAccessToken).toHaveBeenCalledOnce();
  });

  it('期限が 1 分を切ると再取得する', async () => {
    vi.useFakeTimers();
    const { requestAccessToken } = stubGis();
    const source = createDriveTokenSource('client-id');

    await source.ensureToken();
    vi.setSystemTime(Date.now() + 59 * 60 * 1000); // 59分後 = 残り 1 分を切る
    await source.ensureToken();
    expect(requestAccessToken).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it('同時呼び出しは 1 つのポップアップを共有する', async () => {
    const { requestAccessToken } = stubGis();
    const source = createDriveTokenSource('client-id');
    const [a, b] = await Promise.all([source.ensureToken(), source.ensureToken()]);
    expect(a).toBe('token-1');
    expect(b).toBe('token-1');
    expect(requestAccessToken).toHaveBeenCalledOnce();
  });

  it('小窓を閉じた・開けなかった・同意を断った中断は DriveAuthCancelledError（Sentry 非対象の想定内失敗）', async () => {
    stubGis({
      onRequest: (callback) => callback({ error: 'access_denied' }),
    });
    const source = createDriveTokenSource('client-id');
    await expect(source.ensureToken()).rejects.toBeInstanceOf(DriveAuthCancelledError);
  });

  it('GIS が読み込まれていなければ DriveAuthUnavailableError', async () => {
    vi.stubGlobal('google', undefined);
    const source = createDriveTokenSource('client-id');
    await expect(source.ensureToken()).rejects.toBeInstanceOf(DriveAuthUnavailableError);
  });

  it('invalidate 後は次の ensureToken で再取得する（401 受けの復帰経路）', async () => {
    const { requestAccessToken } = stubGis();
    const source = createDriveTokenSource('client-id');
    await source.ensureToken();
    source.invalidate();
    await source.ensureToken();
    expect(requestAccessToken).toHaveBeenCalledTimes(2);
  });
});

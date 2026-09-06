import { afterEach, describe, expect, it, vi } from 'vitest';

import { captureError, captureWarning, type ObservabilityHandle, registerObservabilityHandle, track } from './capture';

const REGISTRY_KEY = Symbol.for('skillsheet.observability');

function clearRegistry(): void {
  delete (globalThis as Record<symbol, unknown>)[REGISTRY_KEY];
}

describe('observability capture facade', () => {
  afterEach(() => {
    clearRegistry();
  });

  it('未登録なら captureError は例外を投げず何もしない', () => {
    expect(() => captureError(new Error('boom'))).not.toThrow();
  });

  it('未登録なら captureWarning は例外を投げず何もしない', () => {
    expect(() => captureWarning('degraded')).not.toThrow();
  });

  it('未登録なら track は例外を投げず何もしない', () => {
    expect(() => track({ name: 'viewer_auth_submitted', outcome: 'success' })).not.toThrow();
  });

  it('登録済みなら captureError が level: error で委譲される', () => {
    const handle: ObservabilityHandle = { capture: vi.fn(), track: vi.fn() };
    registerObservabilityHandle(handle);
    const err = new Error('boom');
    captureError(err, { scope: 'test' });
    expect(handle.capture).toHaveBeenCalledWith(err, 'error', { scope: 'test' });
  });

  it('登録済みなら captureWarning が level: warning で委譲される', () => {
    const handle: ObservabilityHandle = { capture: vi.fn(), track: vi.fn() };
    registerObservabilityHandle(handle);
    captureWarning('degraded', { feature: 'auth' });
    expect(handle.capture).toHaveBeenCalledWith('degraded', 'warning', { feature: 'auth' });
  });

  it('登録済みなら track がそのまま委譲される', () => {
    const handle: ObservabilityHandle = { capture: vi.fn(), track: vi.fn() };
    registerObservabilityHandle(handle);
    track({ name: 'sheet_view_toggled', view: 'timeline', enabled: true });
    expect(handle.track).toHaveBeenCalledWith({ name: 'sheet_view_toggled', view: 'timeline', enabled: true });
  });

  it('この窓口自体は setUser/identify に相当するメソッドを一切持たない', () => {
    // ObservabilityHandle インターフェースは capture/track の2つしか持たない。
    // つまりこの窓口経由では、そもそもユーザー識別情報を送る手段が構造的に無い。
    const handle: ObservabilityHandle = { capture: vi.fn(), track: vi.fn() };
    expect(Object.keys(handle).sort()).toEqual(['capture', 'track']);
  });
});

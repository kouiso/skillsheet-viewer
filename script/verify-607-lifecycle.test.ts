import { type ChildProcess, spawn } from 'node:child_process';
import { describe, expect, it, vi } from 'vitest';
import {
  CLEANUP_CAP_MS,
  capTime,
  createChildRegistry,
  createCleanup,
  createSignalHandler,
  GATEWAY_STOP_CAP_MS,
  STOP_ALL_WORST_MS,
  sleep,
  stopTree,
  waitReady,
} from './verify-607-lifecycle';

describe('createSignalHandler', () => {
  it('後片付けがハングしても上限で諦めて終了する', async () => {
    const exit = vi.fn();
    const handler = createSignalHandler({ cleanup: () => new Promise(() => {}), exit, capMs: 50 });
    handler('SIGTERM');
    expect(exit).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(143));
  });

  it('2 回目のシグナルは後片付けを待たず即終了する', () => {
    const exit = vi.fn();
    const handler = createSignalHandler({ cleanup: () => new Promise(() => {}), exit, capMs: 60_000 });
    handler('SIGINT');
    handler('SIGINT');
    expect(exit).toHaveBeenCalledWith(130);
  });

  it('後片付けが終われば待たずに終了コードを返し、後片付けは 1 回だけ走る', async () => {
    const exit = vi.fn();
    const cleanup = vi.fn(async () => {});
    const handler = createSignalHandler({ cleanup, exit, capMs: 60_000 });
    handler('SIGHUP');
    await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(129));
    expect(cleanup).toHaveBeenCalledTimes(1);
  });
});

describe('capTime', () => {
  it('ハングする処理でも上限で返る', async () => {
    const started = Date.now();
    await capTime(new Promise(() => {}), 50);
    expect(Date.now() - started).toBeLessThan(2000);
  });
});

describe('createChildRegistry', () => {
  it('止めた子は台帳から外れ、最終の後片付けで kill を再送しない', async () => {
    const stop = vi.fn(async (_c: ChildProcess) => {});
    const registry = createChildRegistry(stop);
    const a = { pid: 111 } as ChildProcess;
    const b = { pid: 222 } as ChildProcess;
    registry.add(a);
    registry.add(b);
    await registry.stop(a);
    expect(registry.children.has(a)).toBe(false);
    await registry.stopAll();
    expect(stop.mock.calls.map(([c]) => c.pid)).toEqual([111, 222]);
    expect(registry.children.size).toBe(0);
  });

  it('実プロセスのグループを止め、止めたあとの pid へ kill を送らない', async () => {
    const child = spawn('sleep', ['30'], { detached: true, stdio: 'ignore' });
    const registry = createChildRegistry();
    registry.add(child);
    await registry.stop(child);
    const kill = vi.spyOn(process, 'kill');
    await registry.stopAll();
    expect(kill).not.toHaveBeenCalled();
    kill.mockRestore();
    await stopTree(child, 100);
  });
});

describe('waitReady', () => {
  it('200 以外の応答は本文を cancel してから再試行する', async () => {
    const cancel = vi.fn(async () => {});
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce({ status: 503, body: { cancel } })
      .mockResolvedValueOnce({ status: 200, body: { cancel } });
    await waitReady('http://example.invalid/', 10_000, fetchImpl as unknown as typeof fetch);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('期限内に 200 にならなければ投げる', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ status: 404, body: null });
    await expect(waitReady('http://example.invalid/', 100, fetchImpl as unknown as typeof fetch)).rejects.toThrow(
      /did not become ready/,
    );
  });
});

describe('createCleanup（verify-607-output の後片付けの組み立て）', () => {
  // 実時間を縮めた再現: stopAll 300ms（SIGTERM→SIGKILL 待ち）、gateway は永久ハング、gateway 上限 400ms、全体上限 600ms。
  const run = async () => {
    const calls: string[] = [];
    const cleanup = createCleanup({
      stopAll: async () => {
        await sleep(300);
        calls.push('stopAll');
      },
      gatewayStop: () => new Promise(() => {}),
      killChildren: () => calls.push('killChildren'),
      gatewayCapMs: 400,
    });
    const exit = vi.fn(() => calls.push('exit'));
    createSignalHandler({ cleanup, exit, capMs: 600 })('SIGTERM');
    await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(143), { timeout: 3000 });
    return calls;
  };

  it('gateway がハングし stopAll が遅くても、全体上限内に killChildren が exit より前に呼ばれる', async () => {
    expect(await run()).toEqual(['stopAll', 'killChildren', 'exit']);
  });

  it('gateway が上限内に止まれば killChildren は呼ばない', async () => {
    const killChildren = vi.fn();
    await createCleanup({
      stopAll: async () => {},
      gatewayStop: async () => {},
      killChildren,
      gatewayCapMs: 400,
    })();
    expect(killChildren).not.toHaveBeenCalled();
  });

  it('gateway.stop() が reject しても停止済みとみなす（pkill を撃たない）', async () => {
    const killChildren = vi.fn();
    await createCleanup({
      stopAll: async () => {},
      gatewayStop: () => Promise.reject(new Error('x')),
      killChildren,
      gatewayCapMs: 400,
    })();
    expect(killChildren).not.toHaveBeenCalled();
  });

  it('全体上限は stopAll の最悪値と gateway 上限のどちらよりも大きい', () => {
    expect(CLEANUP_CAP_MS).toBeGreaterThan(STOP_ALL_WORST_MS);
    expect(CLEANUP_CAP_MS).toBeGreaterThan(GATEWAY_STOP_CAP_MS);
  });
});

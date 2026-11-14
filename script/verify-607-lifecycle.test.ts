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

  it('2 回目のシグナルでは、終了する前に forceKill で残りを撃つ', () => {
    const order: string[] = [];
    const handler = createSignalHandler({
      cleanup: () => new Promise(() => {}),
      exit: () => order.push('exit'),
      forceKill: () => order.push('forceKill'),
      capMs: 60_000,
    });
    handler('SIGINT');
    expect(order).toEqual([]);
    handler('SIGINT');
    expect(order).toEqual(['forceKill', 'exit']);
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

describe('createSignalHandler の既定の上限', () => {
  it('既定は CLEANUP_CAP_MS で、stopAll の最悪値より大きい', async () => {
    expect(CLEANUP_CAP_MS).toBeGreaterThan(STOP_ALL_WORST_MS);
    vi.useFakeTimers();
    try {
      const exit = vi.fn();
      createSignalHandler({ cleanup: () => new Promise(() => {}), exit })('SIGTERM');
      await vi.advanceTimersByTimeAsync(STOP_ALL_WORST_MS + 1);
      expect(exit).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(CLEANUP_CAP_MS - STOP_ALL_WORST_MS);
      expect(exit).toHaveBeenCalledWith(143);
    } finally {
      vi.useRealTimers();
    }
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

  it('stopAll の後に add された子は台帳に入らず、即座に止められて throw する', async () => {
    const stop = vi.fn(async (_c: ChildProcess) => {});
    const registry = createChildRegistry(stop);
    await registry.stopAll();
    const late = { pid: 333 } as ChildProcess;
    expect(() => registry.add(late)).toThrow();
    expect(registry.children.has(late)).toBe(false);
    expect(stop).toHaveBeenCalledWith(late);
  });

  it('子孫を持つ実プロセスのグループを止めると、子孫ごと消える', async () => {
    // 親の sh が孫の sleep を持つ形。wrangler が workerd を持つのと同じ形で、孫まで消えることを見る
    const child = spawn('sh', ['-c', 'sleep 30 & sleep 30; wait'], { detached: true, stdio: 'ignore' });
    const pid = child.pid as number;
    try {
      await new Promise((r) => setTimeout(r, 200));
      const registry = createChildRegistry();
      registry.add(child);
      await registry.stop(child);
      expect(() => process.kill(-pid, 0)).toThrow(expect.objectContaining({ code: 'ESRCH' }));
    } finally {
      try {
        process.kill(-pid, 'SIGKILL');
      } catch {}
    }
  });

  it('killAllNow は待たずに子孫ごとグループを止め、台帳を空にする', async () => {
    const child = spawn('sh', ['-c', 'trap "" TERM; sleep 30 & sleep 30; wait'], { detached: true, stdio: 'ignore' });
    const pid = child.pid as number;
    try {
      await new Promise((r) => setTimeout(r, 200));
      const registry = createChildRegistry();
      registry.add(child);
      registry.killAllNow();
      expect(registry.children.size).toBe(0);
      expect(registry.stopping).toBe(true);
      await vi.waitFor(() => expect(() => process.kill(-pid, 0)).toThrow(expect.objectContaining({ code: 'ESRCH' })), {
        timeout: 2000,
      });
    } finally {
      try {
        process.kill(-pid, 'SIGKILL');
      } catch {}
    }
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

  it('期限が短ければ再試行待ちも残り時間で切り、500ms まで延ばさない', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ status: 404, body: null });
    const started = Date.now();
    await expect(waitReady('http://example.invalid/', 100, fetchImpl as unknown as typeof fetch)).rejects.toThrow();
    expect(Date.now() - started).toBeLessThan(400);
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

  it('gateway.stop() が reject したら停止済みとみなさず killChildren を呼ぶ', async () => {
    const killChildren = vi.fn();
    await createCleanup({
      stopAll: async () => {},
      gatewayStop: () => Promise.reject(new Error('x')),
      killChildren,
      gatewayCapMs: 400,
    })();
    expect(killChildren).toHaveBeenCalledTimes(1);
  });

  it('cleanup を 2 回呼んでも stopAll / gatewayStop / killChildren は 1 回だけ走る', async () => {
    const stopAll = vi.fn(async () => {});
    const gatewayStop = vi.fn(() => Promise.reject(new Error('x')));
    const killChildren = vi.fn();
    const cleanup = createCleanup({ stopAll, gatewayStop, killChildren, gatewayCapMs: 400 });
    await Promise.all([cleanup(), cleanup()]);
    await cleanup();
    expect(stopAll).toHaveBeenCalledTimes(1);
    expect(gatewayStop).toHaveBeenCalledTimes(1);
    expect(killChildren).toHaveBeenCalledTimes(1);
  });

  it('全体上限は stopAll の最悪値と gateway 上限のどちらよりも大きい', () => {
    expect(CLEANUP_CAP_MS).toBeGreaterThan(STOP_ALL_WORST_MS);
    expect(CLEANUP_CAP_MS).toBeGreaterThan(GATEWAY_STOP_CAP_MS);
  });
});

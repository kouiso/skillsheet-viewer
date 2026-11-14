/**
 * verify-607-output.ts の後片付けと準備待ち。
 * 台本本体は import しただけで実行が始まるため、テストできるようここへ切り出した。
 */
import type { ChildProcess } from 'node:child_process';

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const groupAlive = (pid: number) => {
  try {
    process.kill(-pid, 0);
    return true;
  } catch {
    return false;
  }
};

// wrangler は workerd を子に持つ。親だけ SIGKILL すると workerd が残り、workerd は SIGTERM でも止まらないことがある。
// detached で起動して自分のプロセスグループを作り、グループごと SIGTERM → 残れば SIGKILL で止める。
// 親が先に死んでもグループに子が残る場合があるので、親の終了状態ではなくグループの生死を見る。
export async function stopTree(c: ChildProcess, graceMs = 3000): Promise<void> {
  const pid = c.pid;
  if (pid === undefined) return;
  try {
    process.kill(-pid, 'SIGTERM');
  } catch {}
  for (let waited = 0; waited < graceMs && groupAlive(pid); waited += 100) await sleep(100);
  if (groupAlive(pid)) {
    try {
      process.kill(-pid, 'SIGKILL');
    } catch {}
    for (let waited = 0; waited < 2000 && groupAlive(pid); waited += 100) await sleep(100);
  }
}

/**
 * 止めた子を台帳から外す。残すと最終の後片付けが同じ pid へ kill(-pid) を再送し、
 * pid が再利用されていた場合に無関係なプロセスグループを撃ってしまう。
 */
export function createChildRegistry(stop: (c: ChildProcess) => Promise<void> = (c) => stopTree(c)) {
  const children = new Set<ChildProcess>();
  return {
    children,
    add(c: ChildProcess) {
      children.add(c);
    },
    async stop(c: ChildProcess) {
      await stop(c);
      children.delete(c);
    },
    async stopAll() {
      await Promise.allSettled([...children].map((c) => this.stop(c)));
    },
  };
}

/** 後片付けに時間の上限を付ける。ハングしても必ず返る。 */
export async function capTime(work: Promise<unknown>, ms: number): Promise<void> {
  let timer: NodeJS.Timeout | undefined;
  try {
    await Promise.race([work.catch(() => {}), new Promise<void>((r) => (timer = setTimeout(r, ms)))]);
  } finally {
    clearTimeout(timer);
  }
}

export const GATEWAY_STOP_CAP_MS = 4_000;
// stopAll の最悪値は SIGTERM 3s + SIGKILL 後 2s。全体の上限はこれより厳密に大きくしないと、
// 直列でも並列でも pkill の退路まで届かず打ち切られる。
export const STOP_ALL_WORST_MS = 5_000;
export const CLEANUP_CAP_MS = 8_000;

/**
 * 後片付けの組み立て。stopAll と gateway.stop() は並列に走らせ、gateway が上限内に止まらなかった時だけ
 * 最後に killChildren（workerd 直撃の pkill）を必ず走らせる。直列にすると stopAll の待ちで
 * gateway の持ち時間が削られ、ハング時に pkill へ届かなかった。
 */
export function createCleanup(opts: {
  stopAll: () => Promise<unknown>;
  gatewayStop: () => Promise<unknown>;
  killChildren: () => void;
  gatewayCapMs?: number;
}) {
  return async () => {
    let stopped = false;
    const markStopped = () => {
      stopped = true;
    };
    await Promise.all([
      opts.stopAll().catch(() => {}),
      capTime(opts.gatewayStop().then(markStopped, markStopped), opts.gatewayCapMs ?? GATEWAY_STOP_CAP_MS),
    ]);
    if (!stopped) opts.killChildren();
  };
}

const SIGNAL_NUMBER = { SIGHUP: 1, SIGINT: 2, SIGTERM: 15 } as const;
export type HandledSignal = keyof typeof SIGNAL_NUMBER;

/**
 * シグナル受信時の終了処理。後片付け（gateway.stop() など）がハングしても上限で諦めて終了し、
 * 2 回目のシグナルは待たずに即終了する（Ctrl-C を連打した人を待たせない）。
 */
export function createSignalHandler(opts: {
  cleanup: () => Promise<unknown>;
  exit: (code: number) => void;
  capMs?: number;
}) {
  let received = false;
  return (sig: HandledSignal) => {
    const code = 128 + SIGNAL_NUMBER[sig];
    if (received) {
      opts.exit(code);
      return;
    }
    received = true;
    void capTime(opts.cleanup(), opts.capMs ?? 5000).then(() => opts.exit(code));
  };
}

// 1 回の fetch は 5 秒、待ち全体は 120 秒で打ち切る。相手が応答しないまま台本ごと止まるのを防ぐ。
export const READY_FETCH_TIMEOUT_MS = 5_000;
export const READY_TOTAL_TIMEOUT_MS = 120_000;
export async function waitReady(
  url: string,
  totalMs = READY_TOTAL_TIMEOUT_MS,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const deadline = Date.now() + totalMs;
  while (Date.now() < deadline) {
    try {
      const r = await fetchImpl(url, { signal: AbortSignal.timeout(READY_FETCH_TIMEOUT_MS) });
      if (r.status === 200) return;
      // 本文を読まずに放置すると接続が解放されず、再試行のたびにソケットが溜まる
      await r.body?.cancel();
    } catch {}
    await sleep(500);
  }
  throw new Error(`${url} did not become ready within ${totalMs}ms`);
}

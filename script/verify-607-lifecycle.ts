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
  // 終了処理に入った後に起動した子は、stopAll の対象から漏れて誰にも止められず残る。入口で断つ。
  let stopping = false;
  return {
    children,
    get stopping() {
      return stopping;
    },
    add(c: ChildProcess) {
      if (stopping) {
        void stop(c).catch(() => {});
        throw new Error('終了処理中のため子プロセスの起動を拒否した');
      }
      children.add(c);
    },
    async stop(c: ChildProcess) {
      await stop(c);
      children.delete(c);
    },
    async stopAll() {
      stopping = true;
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
  // シグナル経路と finally 経路の両方から呼ばれる。2 本目が gateway.stop() を重ねて呼ばないよう 1 つの Promise を共有する。
  let running: Promise<void> | undefined;
  const run = async () => {
    let stopped = false;
    await Promise.all([
      opts.stopAll().catch(() => {}),
      // reject は workerd が消えた証拠にならない。正常に resolve した時だけ停止済みとみなす
      capTime(
        opts.gatewayStop().then(() => {
          stopped = true;
        }),
        opts.gatewayCapMs ?? GATEWAY_STOP_CAP_MS,
      ),
    ]);
    if (!stopped) opts.killChildren();
  };
  return () => {
    running ??= run();
    return running;
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
    void capTime(opts.cleanup(), opts.capMs ?? CLEANUP_CAP_MS).then(() => opts.exit(code));
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
  for (let remaining = totalMs; remaining > 0; remaining = deadline - Date.now()) {
    try {
      // 期限直前の 1 回が全体の上限を超えないよう、残り時間でも打ち切る
      const r = await fetchImpl(url, { signal: AbortSignal.timeout(Math.min(READY_FETCH_TIMEOUT_MS, remaining)) });
      if (r.status === 200) return;
      // 本文を読まずに放置すると接続が解放されず、再試行のたびにソケットが溜まる
      await r.body?.cancel();
    } catch {}
    await sleep(Math.min(500, Math.max(0, deadline - Date.now())));
  }
  throw new Error(`${url} did not become ready within ${totalMs}ms`);
}

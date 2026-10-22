// 定期実行が GitHub に止められる前に知らせる（#590）。公開リポジトリでは、リポジトリに 60 日動きが無いと
// schedule の workflow が自動で無効になる（GitHub Docs「Disabling and enabling a workflow」）。止まった後は
// 監視そのものが動かず、自分では知らせられない。そこで止まる前、最後のコミットから warn 日を過ぎた時点で
// 0 以外を返し、監視の job ごと落として ci-failure-notify.yml の通知経路に乗せる。
// 使い方: pnpm exec tsx script/schedule-keepalive-check.ts --last-activity <ISO 日時> [--now <ISO 日時>] [--warn-days 45]
// 終了コード: 0 = 余裕あり、6 = 無効化まで残り少ない、2 = 引数の誤り。
import { pathToFileURL } from 'node:url';

const DAY_MS = 86_400_000;
export const DISABLE_AFTER_DAYS = 60;
export const DEFAULT_WARN_DAYS = 45;

export interface KeepaliveResult {
  status: 'ok' | 'stale';
  lastActivityAt: string;
  daysSinceActivity: number;
  daysUntilDisabled: number;
}

export function evaluateKeepalive(lastActivity: Date, now: Date, warnDays = DEFAULT_WARN_DAYS): KeepaliveResult {
  if (Number.isNaN(lastActivity.getTime()) || Number.isNaN(now.getTime())) throw new RangeError('INVALID_DATE');
  if (!Number.isInteger(warnDays) || warnDays < 1 || warnDays >= DISABLE_AFTER_DAYS)
    throw new RangeError('INVALID_WARN_DAYS');
  // 未来日のコミット（時計ずれ）は 0 日として扱い、負の日数で「余裕あり」を水増ししない。
  const daysSinceActivity = Math.max(0, Math.floor((now.getTime() - lastActivity.getTime()) / DAY_MS));
  return {
    status: daysSinceActivity >= warnDays ? 'stale' : 'ok',
    lastActivityAt: lastActivity.toISOString(),
    daysSinceActivity,
    daysUntilDisabled: Math.max(0, DISABLE_AFTER_DAYS - daysSinceActivity),
  };
}

export function parseArgs(argv: string[]) {
  let lastActivity: string | undefined;
  let now: string | undefined;
  let warnDays = DEFAULT_WARN_DAYS;
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    const value = argv[index + 1];
    if (value === undefined || value.startsWith('--')) throw new Error(`INVALID_VALUE: ${arg}`);
    index++;
    if (arg === '--last-activity') lastActivity = value;
    else if (arg === '--now') now = value;
    else if (arg === '--warn-days') {
      if (!/^[1-9][0-9]?$/.test(value)) throw new Error('INVALID_VALUE: --warn-days');
      warnDays = Number(value);
    } else throw new Error(`UNKNOWN_ARGUMENT: ${arg}`);
  }
  if (!lastActivity) throw new Error('LAST_ACTIVITY_REQUIRED');
  return { lastActivity: new Date(lastActivity), now: now ? new Date(now) : new Date(), warnDays };
}

function main() {
  const { lastActivity, now, warnDays } = parseArgs(process.argv.slice(2));
  const result = evaluateKeepalive(lastActivity, now, warnDays);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exitCode = result.status === 'stale' ? 6 : 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 2;
  }
}

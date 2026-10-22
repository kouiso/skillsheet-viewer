// 容量監視の定期実行が止まったことを、監視とは別の定期実行から知らせる（#590）。監視は自分が動かない日に
// 自分では知らせられない。variable を外した（skip）、workflow を消した、Actions の画面や API で無効にした、
// 実行が cancelled / timed_out で終わった、混雑で schedule が落とされた（GitHub Docs「Events that trigger
// workflows」の schedule 節）のどれでも、「最新の完了した実行が成功か失敗で、30 時間以内」が崩れる。
// 崩れたら 0 以外を返し、見張り側の job を落として ci-failure-notify.yml の通知経路に乗せる。
// 失敗（failure）で終わった実行は ci-failure-notify.yml が届けるので、ここでは止まっていない扱いにする。
// 使い方: node script/history-monitor-liveness-check.ts --workflow-state <state|missing> --real-runs <件数>
//   [--latest-conclusion <conclusion> --latest-created-at <ISO 日時>] [--now <ISO 日時>] [--max-age-hours 30]
// 終了コード: 0 = 動いている（または、まだ一度も有効にしていない）、7 = 止まっている、2 = 引数の誤り。
import { pathToFileURL } from 'node:url';

const HOUR_MS = 3_600_000;
// 見張りは JST 06:00、監視は前日 JST 07:30 なので、ふだんの間隔は 22.5 時間。schedule の遅れを 7.5 時間まで
// 許し、1 日落ちた時（46.5 時間）は翌朝に必ず捕まえる値にする。
export const DEFAULT_MAX_AGE_HOURS = 30;
const DELIVERED_CONCLUSIONS = new Set(['success', 'failure']);

export interface LivenessInput {
  /** GET /actions/workflows/{file} の state。読めなかった（404 を含む）時は 'missing'。 */
  workflowState: string;
  /** skip 以外で完了した実行の件数。0 ならまだ一度も有効にしていない。 */
  realRuns: number;
  latest?: { conclusion: string; createdAt: Date };
  now: Date;
  maxAgeHours?: number;
}

export interface LivenessResult {
  status: 'running' | 'not-enabled' | 'stopped';
  reason: string;
}

export function evaluateLiveness(input: LivenessInput): LivenessResult {
  const maxAgeHours = input.maxAgeHours ?? DEFAULT_MAX_AGE_HOURS;
  if (Number.isNaN(input.now.getTime())) throw new RangeError('INVALID_DATE');
  if (!Number.isInteger(input.realRuns) || input.realRuns < 0) throw new RangeError('INVALID_REAL_RUNS');
  if (input.workflowState !== 'active')
    return { status: 'stopped', reason: `workflow の state が ${input.workflowState}（active ではない）` };
  // 本番の secret を入れて variable で有効にするまでは毎日 skip される。一度でも動いた後の skip だけを止まりと見る。
  if (input.realRuns === 0) return { status: 'not-enabled', reason: 'まだ一度も有効にしていない' };
  if (!input.latest) return { status: 'stopped', reason: '完了した実行が見つからない' };
  const { conclusion, createdAt } = input.latest;
  if (Number.isNaN(createdAt.getTime())) throw new RangeError('INVALID_DATE');
  if (!DELIVERED_CONCLUSIONS.has(conclusion))
    return { status: 'stopped', reason: `最新の実行が ${conclusion} で終わった（成功でも失敗でもない）` };
  const ageHours = (input.now.getTime() - createdAt.getTime()) / HOUR_MS;
  if (ageHours > maxAgeHours)
    return {
      status: 'stopped',
      reason: `最新の実行から ${Math.floor(ageHours)} 時間たっている（上限 ${maxAgeHours} 時間）`,
    };
  return { status: 'running', reason: `最新の実行は ${conclusion}、${Math.floor(ageHours)} 時間前` };
}

export function parseArgs(argv: string[]): LivenessInput {
  const values = new Map<string, string>();
  const known = [
    '--workflow-state',
    '--real-runs',
    '--latest-conclusion',
    '--latest-created-at',
    '--now',
    '--max-age-hours',
  ];
  for (let index = 0; index < argv.length; index += 2) {
    const arg = argv[index] ?? '';
    const value = argv[index + 1];
    if (!known.includes(arg)) throw new Error(`UNKNOWN_ARGUMENT: ${arg}`);
    if (value === undefined || value === '' || value.startsWith('--')) throw new Error(`INVALID_VALUE: ${arg}`);
    values.set(arg, value);
  }
  const workflowState = values.get('--workflow-state');
  const realRuns = values.get('--real-runs');
  if (!workflowState) throw new Error('WORKFLOW_STATE_REQUIRED');
  if (!realRuns || !/^[0-9]+$/.test(realRuns)) throw new Error('INVALID_VALUE: --real-runs');
  const conclusion = values.get('--latest-conclusion');
  const createdAt = values.get('--latest-created-at');
  if ((conclusion === undefined) !== (createdAt === undefined)) throw new Error('LATEST_REQUIRES_BOTH');
  const maxAge = values.get('--max-age-hours');
  if (maxAge !== undefined && !/^[1-9][0-9]?$/.test(maxAge)) throw new Error('INVALID_VALUE: --max-age-hours');
  const now = values.get('--now');
  return {
    workflowState,
    realRuns: Number(realRuns),
    latest: conclusion && createdAt ? { conclusion, createdAt: new Date(createdAt) } : undefined,
    now: now ? new Date(now) : new Date(),
    maxAgeHours: maxAge ? Number(maxAge) : undefined,
  };
}

function main() {
  const result = evaluateLiveness(parseArgs(process.argv.slice(2)));
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (result.status === 'stopped') {
    process.stdout.write(`::error::History Capacity Monitor が止まっている: ${result.reason}\n`);
    process.exitCode = 7;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 2;
  }
}

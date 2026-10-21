// 履歴保持案の dry-run（#576）。snapshot（script/sql/history-retention-snapshot.sql の READ ONLY 出力）を読み、
// 案ごとに残る版・候補・保留の集計だけを出す。DB には接続せず、削除・apply の経路も持たない。
// 使い方: pnpm exec tsx script/history-retention-dry-run.ts --snapshot <snapshot.json> \
//   [--policy keep-all|window:<日>|tiered:<全版日>:<日次日>]... [--deleted-purge-days <日>|none] \
//   [--time-zone Asia/Tokyo|UTC] [--at <ISO時刻>]
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import type { RetentionPolicy } from '../src/db/history-capacity-model';
import {
  type BucketTimeZone,
  evaluateRetention,
  parseHistorySnapshot,
  type RetentionSimulation,
  summarizePlan,
} from '../src/db/history-retention';

// 消す・適用する系の指定は「知らない引数」ではなく、この道具では受けないと明示して止める。
const APPLY_FLAGS = new Set(['--apply', '--execute', '--delete', '--commit', '--force', '--yes']);

export function parsePolicy(text: string): RetentionPolicy {
  if (text === 'keep-all') return { kind: 'keep-all' };
  const windowMatch = /^window:([1-9][0-9]{0,4})$/.exec(text);
  if (windowMatch) return { kind: 'window', keepDays: Number(windowMatch[1]) };
  const tieredMatch = /^tiered:([1-9][0-9]{0,4}):([1-9][0-9]{0,4})$/.exec(text);
  if (tieredMatch) return { kind: 'tiered', fullDays: Number(tieredMatch[1]), dailyUntilDays: Number(tieredMatch[2]) };
  throw new Error(`INVALID_POLICY: ${text}`);
}

export function parseArgs(argv: string[]) {
  let snapshot: string | undefined;
  const policies: RetentionPolicy[] = [];
  let deletedSheetPurgeDays: number | null = null;
  let timeZone: BucketTimeZone = 'Asia/Tokyo';
  let at: string | undefined;
  const value = (index: number) => {
    const next = argv[index + 1];
    if (next === undefined || next.startsWith('--')) throw new Error(`MISSING_VALUE: ${argv[index]}`);
    return next;
  };
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index] ?? '';
    const name = arg.split('=')[0] ?? arg;
    if (APPLY_FLAGS.has(name)) throw new Error('APPLY_NOT_SUPPORTED: この道具は試算だけで、削除・適用はしない');
    if (arg === '--snapshot') snapshot = value(index++);
    else if (arg === '--policy') policies.push(parsePolicy(value(index++)));
    else if (arg === '--deleted-purge-days') {
      const days = value(index++);
      if (days === 'none') deletedSheetPurgeDays = null;
      else if (/^[1-9][0-9]{0,4}$/.test(days)) deletedSheetPurgeDays = Number(days);
      else throw new Error(`INVALID_PURGE_DAYS: ${days}`);
    } else if (arg === '--time-zone') {
      const zone = value(index++);
      if (zone !== 'Asia/Tokyo' && zone !== 'UTC') throw new Error(`INVALID_TIME_ZONE: ${zone}`);
      timeZone = zone;
    } else if (arg === '--at') at = value(index++);
    else throw new Error(`UNKNOWN_ARGUMENT: ${arg}`);
  }
  if (!snapshot) throw new Error('SNAPSHOT_REQUIRED');
  // 指定が無ければ無変更（全版保持）で試算する。
  if (policies.length === 0) policies.push({ kind: 'keep-all' });
  return { snapshot, policies, deletedSheetPurgeDays, timeZone, at };
}

export function runDryRun(snapshotJson: unknown, args: ReturnType<typeof parseArgs>) {
  const snapshot = parseHistorySnapshot(snapshotJson);
  // 評価時刻の既定は snapshot を取った時刻。実行するたびに結果が変わらないようにする。
  const asOf = args.at ?? snapshot.takenAt;
  return {
    tool: 'history-retention-dry-run',
    mode: 'dry-run',
    note: '試算のみ。どの版も削除していない。保持案は未承認のシミュレーション入力。',
    plans: args.policies.map((policy) => {
      const simulation: RetentionSimulation = {
        policy,
        deletedSheetPurgeDays: args.deletedSheetPurgeDays,
        timeZone: args.timeZone,
      };
      return summarizePlan(evaluateRetention(snapshot, simulation, asOf));
    }),
  };
}

// snapshot は JSON 1行だけを受ける。psql の -q 抜けで混ざる BEGIN・DO・COMMIT などを読み飛ばすと、
// 別の出力が紛れても気付けないので、JSON でなければ取り直しの手掛かりを付けて止める。
export function parseSnapshotText(text: string): unknown {
  const body = text.trim();
  try {
    return JSON.parse(body);
  } catch (error) {
    const firstLine = body.split('\n', 1)[0]?.slice(0, 40) ?? '';
    throw new Error(
      `SNAPSHOT_NOT_JSON: 先頭行=${JSON.stringify(firstLine)}。psql は -X -q -v ON_ERROR_STOP=1 -At で取り直す（script/sql/history-retention-snapshot.sql の「実行:」行）`,
      { cause: error },
    );
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const result = runDryRun(parseSnapshotText(readFileSync(args.snapshot, 'utf8')), args);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(2);
  }
}

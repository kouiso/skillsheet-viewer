// 履歴容量の監視結果を出す（#577）。観測（script/sql/history-size-report.sql を READ ONLY で実行した出力）を
// 古い順に並べて渡す。DB には接続せず、閾値を超えても削除・保持期間の短縮はしない。
// 使い方: pnpm exec tsx script/history-capacity-monitor.ts --sample <古い.json> --sample <新しい.json> \
//   [--warn-mib 200] [--limit-mib 256] [--database-limit-mib 1024]
// 終了コード: 0 = normal / warning、3 = exceeded、4 = measurement-failed、2 = 引数の誤り。
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { CANDIDATE_THRESHOLDS, evaluateMonitor, type MonitorResult, type MonitorThresholds } from '../src/db/history-capacity-monitor';
import { MIB } from '../src/db/history-capacity-model';

export function parseArgs(argv: string[]) {
  const samples: string[] = [];
  const thresholds: MonitorThresholds = { ...CANDIDATE_THRESHOLDS };
  const mib = (name: string, text: string | undefined) => {
    if (text === undefined || !/^[1-9][0-9]{0,6}$/.test(text)) throw new Error(`INVALID_VALUE: ${name}`);
    return Number(text) * MIB;
  };
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === '--sample') {
      const path = argv[++index];
      if (!path || path.startsWith('--')) throw new Error('INVALID_VALUE: --sample');
      samples.push(path);
    } else if (arg === '--warn-mib') thresholds.historyWarnBytes = mib(arg, argv[++index]);
    else if (arg === '--limit-mib') thresholds.historyLimitBytes = mib(arg, argv[++index]);
    else if (arg === '--database-limit-mib') thresholds.databaseLimitBytes = mib(arg, argv[++index]);
    else throw new Error(`UNKNOWN_ARGUMENT: ${arg}`);
  }
  if (samples.length === 0) throw new Error('SAMPLE_REQUIRED');
  return { samples, thresholds };
}

export function exitCode(result: MonitorResult) {
  if (result.status === 'exceeded') return 3;
  if (result.status === 'measurement-failed') return 4;
  return 0;
}

/** 読めないファイルも1点の失敗した観測として扱い、監視全体を例外で落とさない。 */
export function readSample(path: string, read: (path: string) => string = (file) => readFileSync(file, 'utf8')): unknown {
  try {
    return JSON.parse(read(path));
  } catch (error) {
    return { readError: error instanceof Error ? error.message : String(error) };
  }
}

function main() {
  const { samples, thresholds } = parseArgs(process.argv.slice(2));
  const result = evaluateMonitor(samples.map((path) => readSample(path)), thresholds);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exitCode = exitCode(result);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 2;
  }
}

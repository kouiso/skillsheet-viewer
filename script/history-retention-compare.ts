// 保持案ごとの容量を #574 の計測とモデルで並べる（#575）。DB には接続しない。
// 使い方: pnpm exec tsx script/history-retention-compare.ts --measurement <report.json>
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import {
  LOAD_PRESETS,
  type MeasurementReport,
  parseMeasurementReport,
  perVersionFromScenario,
  storageFromMeasurement,
} from '../src/db/history-capacity-input';
import { monthsUntilLimit, projectCapacity, type RetentionPolicy, toMiB } from '../src/db/history-capacity-model';

export interface PolicyOption {
  id: string;
  label: string;
  policy: RetentionPolicy;
}

/** 比べる案。tiered:30:365 と tiered:7:365 は #564 10/14 コメントの案（通常時と容量超過時）。 */
export const POLICY_OPTIONS: PolicyOption[] = [
  { id: 'A', label: '全版保持（今の動き）', policy: { kind: 'keep-all' } },
  { id: 'B', label: '90日より古い save を消す', policy: { kind: 'window', keepDays: 90 } },
  { id: 'C', label: '30日より古い save を消す', policy: { kind: 'window', keepDays: 30 } },
  {
    id: 'D',
    label: '30日全版・365日まで日1版・以降は月1版（10/14 案）',
    policy: { kind: 'tiered', fullDays: 30, dailyUntilDays: 365 },
  },
  {
    id: 'E',
    label: '7日全版・365日まで日1版・以降は月1版（10/14 案の超過時）',
    policy: { kind: 'tiered', fullDays: 7, dailyUntilDays: 365 },
  },
];

const mib = (bytes: number) => `${toMiB(bytes).toFixed(1)}`;

export function renderComparison(report: MeasurementReport, horizon = 120) {
  const perVersions = report.scenarios.map(perVersionFromScenario).filter((value) => value !== null);
  const base = [...perVersions].sort((a, b) => b.payloadTargetBytes - a.payloadTargetBytes)[0];
  if (!base) throw new Error('MEASUREMENT_HAS_NO_SINGLE_SIZE_SCENARIO');
  const storage = storageFromMeasurement(base, report.gitSha);
  const lines: string[] = [];
  lines.push(
    `1版 ${(base.compactBytesPerVersion / 1000).toFixed(1)} KB（計測 ${report.gitSha.slice(0, 7)}、合成・詰めた後）、履歴以外 ${mib(storage.value.nonHistoryBytes)} MiB と上限 ${mib(storage.value.limitBytes)} MiB は既存報告。結果はすべて外挿。`,
  );
  lines.push('');
  lines.push('| 負荷 | 案 | 12か月後の履歴 (MiB) | 36か月後の履歴 (MiB) | 上限到達 |');
  lines.push('|---|---|---:|---:|---|');
  for (const preset of LOAD_PRESETS) {
    for (const option of POLICY_OPTIONS) {
      const points = projectCapacity(preset.load.value, storage.value, option.policy, 36);
      const reach = monthsUntilLimit(preset.load.value, storage.value, option.policy, horizon);
      lines.push(
        `| ${preset.name} | ${option.id} | ${mib(points[11]?.historyBytes ?? 0)} | ${mib(points[35]?.historyBytes ?? 0)} | ${reach === null ? `${horizon}か月内に届かない` : `${reach}か月目`} |`,
      );
    }
  }
  return lines.join('\n');
}

function main() {
  const argv = process.argv.slice(2);
  if (argv[0] !== '--measurement' || !argv[1] || argv.length !== 2)
    throw new Error('USAGE: --measurement <report.json>');
  process.stdout.write(`${renderComparison(parseMeasurementReport(JSON.parse(readFileSync(argv[1], 'utf8'))))}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();

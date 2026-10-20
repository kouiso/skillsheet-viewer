// 計測 report から容量モデルの表（Markdown）を出す（#574）。DB には接続しない。
// 使い方: pnpm exec tsx script/history-capacity-report.ts --measurement <report.json> [--months 36]
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import {
  KEEP_ALL,
  LOAD_PRESETS,
  type MeasuredPerVersion,
  type MeasurementReport,
  parseMeasurementReport,
  perVersionFromScenario,
  REPORTED_20261014,
  storageFromMeasurement,
} from '../src/db/history-capacity-input';
import {
  type LoadProfile,
  monthlyNewVersions,
  monthsUntilLimit,
  projectCapacity,
  type RetentionPolicy,
  type StorageProfile,
  sensitivity,
  toMB,
  toMiB,
} from '../src/db/history-capacity-model';

const KIND_LABEL = { measured: '実測', reported: '既存報告', assumed: '仮定', extrapolated: '外挿' } as const;

export function parseArgs(argv: string[]) {
  let measurement: string | undefined;
  let months = 36;
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === '--measurement') measurement = argv[++index];
    else if (arg === '--months') months = Number(argv[++index]);
    else throw new Error(`UNKNOWN_ARGUMENT: ${arg}`);
  }
  if (!measurement) throw new Error('MEASUREMENT_REQUIRED');
  if (!Number.isInteger(months) || months < 1 || months > 240) throw new Error('INVALID_MONTHS');
  return { measurement, months };
}

const mib = (bytes: number) => `${toMiB(bytes).toFixed(1)} MiB`;
const both = (bytes: number) => `${toMiB(bytes).toFixed(1)} MiB（${toMB(bytes).toFixed(1)} MB）`;
const kb = (bytes: number) => `${(bytes / 1000).toFixed(1)} KB`;
const limitText = (months: number | null, horizon: number) =>
  months === null ? `${horizon}か月内に届かない` : `${months}か月目`;

function pickLarger(perVersions: MeasuredPerVersion[]) {
  return [...perVersions].sort((a, b) => b.payloadTargetBytes - a.payloadTargetBytes)[0];
}

export function renderCapacityReport(report: MeasurementReport, months: number, policy: RetentionPolicy = KEEP_ALL) {
  const perVersions = report.scenarios.map(perVersionFromScenario).filter((value) => value !== null);
  const base = pickLarger(perVersions);
  if (!base) throw new Error('MEASUREMENT_HAS_NO_SINGLE_SIZE_SCENARIO');
  const small = [...perVersions].sort((a, b) => a.payloadTargetBytes - b.payloadTargetBytes)[0] ?? base;
  const storage = storageFromMeasurement(base, report.gitSha);
  const lines: string[] = [];
  lines.push('## 計測条件');
  lines.push('');
  lines.push(`- 種類: ${report.kind}（Neon 本番の実測ではない）`);
  lines.push(`- コマンド: \`${report.command}\``);
  lines.push(`- SHA: ${report.gitSha}${report.gitDirty ? '（未コミット変更あり）' : ''}`);
  lines.push(`- 期間: ${report.startedAt} 〜 ${report.finishedAt}`);
  lines.push(
    `- 環境: ${report.environment.os} / PostgreSQL ${report.environment.postgres} / autovacuum=${report.environment.autovacuum}`,
  );
  lines.push(
    `- サンプル: ${Object.entries(report.samples)
      .map(([key, value]) => `${key}=${value}`)
      .join(', ')}`,
  );
  lines.push('');
  lines.push('## 実測（合成・ローカル PostgreSQL）');
  lines.push('');
  lines.push(
    '| scenario | 保存数 | 1版（詰めた後） | 1版（保存直後） | WAL/保存 | p50 | p95 | 失敗率 | ロック待ち | 圧縮後/元 |',
  );
  lines.push('|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|');
  for (const scenario of report.scenarios) {
    const perVersion = perVersionFromScenario(scenario);
    const sizeCells = perVersion
      ? [
          kb(perVersion.compactBytesPerVersion),
          kb(perVersion.writtenBytesPerVersion),
          kb(perVersion.walBytesPerVersion),
          perVersion.storedToLogicalRatio.toFixed(2),
        ]
      : ['（複数サイズ混在）', '—', kb(scenario.walBytes / Math.max(1, scenario.versionsAdded)), '—'];
    lines.push(
      `| ${scenario.name} | ${scenario.accepted}/${scenario.attempts} | ${sizeCells[0]} | ${sizeCells[1]} | ${sizeCells[2]} | ${scenario.latencyMs.p50} ms | ${scenario.latencyMs.p95} ms | ${scenario.failureRate ?? '未測定'} | ${scenario.lockWaits} | ${sizeCells[3]} |`,
    );
  }
  lines.push('');
  lines.push('## 既存報告（現在の実測ではない）');
  lines.push('');
  lines.push(`出典: ${REPORTED_20261014.source}`);
  lines.push('');
  lines.push('| 項目 | 値 | 区分 |');
  lines.push('|---|---|---|');
  lines.push(`| DB 全体 | ${mib(REPORTED_20261014.databaseBytes)} | 既存報告 |`);
  lines.push(`| 容量上限 | ${mib(REPORTED_20261014.limitBytes)} | 既存報告 |`);
  lines.push(`| シート数 | ${REPORTED_20261014.sheets} | 既存報告 |`);
  lines.push(
    `| revision | ${REPORTED_20261014.revision}（${REPORTED_20261014.periodLabel}、約${REPORTED_20261014.savesPerDay}回/日） | 既存報告。単点で、継続観測の保存頻度ではない |`,
  );
  lines.push(`| 本文 | 約${kb(REPORTED_20261014.bodyBytes)} | 既存報告 |`);
  lines.push('');
  lines.push(`## 月間モデル（保持案: ${policy.kind}、1版 ${kb(base.compactBytesPerVersion)}）`);
  lines.push('');
  lines.push('月間版数 = シート数 × 活動日 × 1活動日あたりの保存数 ＋ save 以外の版。初回 baseline は1シート1版。');
  lines.push('');
  lines.push('| 負荷 | 前提 | 区分 | 月間の新しい版 | 月間増分 | 12か月後の履歴 | 上限到達 |');
  lines.push('|---|---|---|---:|---:|---:|---|');
  for (const preset of LOAD_PRESETS) {
    const load = preset.load.value;
    const points = projectCapacity(load, storage.value, policy, Math.max(12, months));
    const twelve = points[11];
    lines.push(
      `| ${preset.name} | ${describeLoad(load)} | 入力は${KIND_LABEL[preset.load.kind]}、結果は外挿 | ${monthlyNewVersions(load)} | ${both(monthlyNewVersions(load) * storage.value.bytesPerVersion)} | ${twelve ? both(twelve.historyBytes) : '—'} | ${limitText(monthsUntilLimit(load, storage.value, policy, months), months)} |`,
    );
  }
  lines.push('');
  lines.push(
    `上限 = ${mib(storage.value.limitBytes)}（既存報告）、履歴以外 = ${mib(storage.value.nonHistoryBytes)}（既存報告）。`,
  );
  lines.push('');
  lines.push('## 感度分析');
  lines.push('');
  for (const preset of LOAD_PRESETS.filter((item) => item.name === 'normal' || item.name === 'high')) {
    lines.push(`### ${preset.name}`);
    lines.push('');
    lines.push('| 変えた前提 | 月間増分 | 上限到達 |');
    lines.push('|---|---:|---|');
    for (const row of sensitivity(
      preset.load.value,
      storage.value,
      policy,
      sensitivityVariants(preset.load.value, base, small),
    )) {
      lines.push(`| ${row.label} | ${both(row.monthlyNewBytes)} | ${limitText(row.monthsUntilLimit, 120)} |`);
    }
    lines.push('');
  }
  lines.push('## 未測定');
  lines.push('');
  lines.push(
    '- Neon 本番での保存遅延・WAL・バックアップ（履歴保持期間）分の容量。本番には履歴表が未導入で、月間履歴の実測は取得できない。',
  );
  lines.push('- 実データの圧縮率。合成本文はほぼ圧縮できない最悪側で、実データはこれより小さくなり得る。');
  lines.push('- 本番の継続的な保存頻度。revision は単点で、保存の時刻分布は記録されていない。');
  return lines.join('\n');
}

function describeLoad(load: LoadProfile) {
  return `${load.sheets}シート×月${load.activeDaysPerMonth}日×${load.savesPerActiveDay}保存＋非save ${load.nonSaveVersionsPerSheetPerMonth}/月`;
}

export function sensitivityVariants(load: LoadProfile, base: MeasuredPerVersion, small: MeasuredPerVersion) {
  const variants: { label: string; load?: Partial<LoadProfile>; storage?: Partial<StorageProfile> }[] = [
    { label: '基準' },
    { label: '保存数 ×0.5', load: { savesPerActiveDay: load.savesPerActiveDay * 0.5 } },
    { label: '保存数 ×2', load: { savesPerActiveDay: load.savesPerActiveDay * 2 } },
    { label: '保存数 ×4', load: { savesPerActiveDay: load.savesPerActiveDay * 4 } },
    {
      label: `1版 ${kb(small.compactBytesPerVersion)}（小さい本文の実測）`,
      storage: { bytesPerVersion: small.compactBytesPerVersion },
    },
    {
      label: `1版 ${kb(base.writtenBytesPerVersion)}（保存直後・dead tuple 込み）`,
      storage: { bytesPerVersion: base.writtenBytesPerVersion },
    },
    {
      label: 'save 以外の版 ×10',
      load: { nonSaveVersionsPerSheetPerMonth: load.nonSaveVersionsPerSheetPerMonth * 10 },
    },
    { label: 'シート数 ×3', load: { sheets: load.sheets * 3 } },
    { label: '上限を MB で数えた場合（1,024 MB）', storage: { limitBytes: 1024 * 1000 * 1000 } },
  ];
  return variants;
}

function main() {
  const { measurement, months } = parseArgs(process.argv.slice(2));
  const report = parseMeasurementReport(JSON.parse(readFileSync(measurement, 'utf8')));
  process.stdout.write(`${renderCapacityReport(report, months)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();

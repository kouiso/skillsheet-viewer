// 計測 report から容量モデルの表（Markdown）を出す（#574）。DB には接続しない。
// 使い方: pnpm exec tsx script/history-capacity-report.ts --measurement <report.json> [--months 36] [--policy keep-all]
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import {
  LOAD_PRESETS,
  type LoadPreset,
  MEASURED_20261021,
  type MeasuredPerVersion,
  type MeasurementReport,
  NEON_HISTORY_SOURCE,
  PITR_WINDOWS,
  parseMeasurementReport,
  perVersionFromScenario,
  REPORTED_20261014,
  REPORTED_BYTES_PER_VERSION_444,
  REPORTED_HISTORY_CAP_BYTES,
  RETENTION_OPTIONS,
  type RetentionOption,
  storageFromMeasurement,
} from '../src/db/history-capacity-input';
import {
  historyBytesAt,
  type LoadProfile,
  maxVersionsInWindow,
  monthlyNewVersions,
  monthsUntilLimit,
  projectCapacity,
  retainedWalBytes,
  type SensitivityVariant,
  type SourceKind,
  type StorageProfile,
  sensitivity,
  toMB,
  toMiB,
} from '../src/db/history-capacity-model';

const KIND_LABEL = { measured: '実測', reported: '既存報告', assumed: '仮定', extrapolated: '外挿' } as const;
/** 感度分析の上限到達を探す期間。表の月数（既定 36）より長く取り、間引いた案でも届くかを見る。 */
const SENSITIVITY_HORIZON_MONTHS = 120;
/** 文書に貼る生成結果の境界。文書の表を手で直すと単体テストが落ちる。 */
export const DOC_BLOCK_BEGIN = '<!-- history-capacity-report:begin -->';
export const DOC_BLOCK_END = '<!-- history-capacity-report:end -->';

export function parseArgs(argv: string[]) {
  let measurement: string | undefined;
  let months = 36;
  let policy: RetentionOption['name'] = 'keep-all';
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === '--measurement') measurement = argv[++index];
    else if (arg === '--months') months = Number(argv[++index]);
    else if (arg === '--policy') {
      const name = argv[++index];
      const option = RETENTION_OPTIONS.find((item) => item.name === name);
      if (!option) throw new Error('INVALID_POLICY');
      policy = option.name;
    } else throw new Error(`UNKNOWN_ARGUMENT: ${arg}`);
  }
  if (!measurement) throw new Error('MEASUREMENT_REQUIRED');
  if (!Number.isInteger(months) || months < 12 || months > 240) throw new Error('INVALID_MONTHS');
  return { measurement, months, policy };
}

const mib = (bytes: number) => `${toMiB(bytes).toFixed(1)} MiB`;
const both = (bytes: number) => `${toMiB(bytes).toFixed(1)} MiB（${toMB(bytes).toFixed(1)} MB）`;
const kb = (bytes: number) => `${(bytes / 1000).toFixed(1)} KB`;
const limitText = (months: number | null, horizon: number) =>
  months === null ? `${horizon}か月内に届かない` : `${months}か月目`;
const kindCell = (kind: SourceKind) => `入力は${KIND_LABEL[kind]}、結果は外挿`;

function optionByName(name: RetentionOption['name']) {
  const option = RETENTION_OPTIONS.find((item) => item.name === name);
  if (!option) throw new Error('INVALID_POLICY');
  return option;
}

function presetByName(name: LoadPreset['name']) {
  const preset = LOAD_PRESETS.find((item) => item.name === name);
  if (!preset) throw new Error(`UNKNOWN_PRESET: ${name}`);
  return preset;
}

function pickLarger(perVersions: MeasuredPerVersion[]) {
  return [...perVersions].sort((a, b) => b.payloadTargetBytes - a.payloadTargetBytes)[0];
}

function measuredInputs(report: MeasurementReport) {
  const perVersions = report.scenarios.map(perVersionFromScenario).filter((value) => value !== null);
  const base = pickLarger(perVersions);
  if (!base) throw new Error('MEASUREMENT_HAS_NO_SINGLE_SIZE_SCENARIO');
  const small = [...perVersions].sort((a, b) => a.payloadTargetBytes - b.payloadTargetBytes)[0] ?? base;
  return { base, small, storage: storageFromMeasurement(base, report.gitSha) };
}

export function renderCapacityReport(
  report: MeasurementReport,
  months: number,
  policyName: RetentionOption['name'] = 'keep-all',
) {
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
  lines.push(...renderProductionMeasurement());
  lines.push(renderModelSections(report, months, policyName));
  lines.push('');
  lines.push('## 未測定');
  lines.push('');
  lines.push(
    '- 本番の月間の履歴増分（版数・容量）。2026-10-21 の読取でも本番に `document_versions` / `deleted_documents` は無く（0件）、月ごとの履歴は取得できない。',
  );
  lines.push(
    '- Neon 本番での保存遅延・履歴の WAL の量（WAL は合成計測の値で外挿した。本番の pg_stat_wal は DB 全体の累計で、履歴だけの値ではない）。',
  );
  lines.push('- 実データの圧縮率。合成本文はほぼ圧縮できない最悪側で、実データはこれより小さくなり得る。');
  lines.push('- 本番の継続的な保存頻度。revision は単点で、保存の時刻分布は記録されていない。');
  lines.push(
    '- アプリ経由の2タブ同時編集。合成計測は DB の CAS で衝突とロック待ちを数えるだけで、衝突後の画面とやり直しは含まない。',
  );
  return lines.join('\n');
}

/** 月間モデル・保持案の比較・WAL・感度分析。文書にはこの出力をそのまま貼る。 */
export function renderModelSections(
  report: MeasurementReport,
  months: number,
  policyName: RetentionOption['name'] = 'keep-all',
) {
  const { base, small, storage } = measuredInputs(report);
  const option = optionByName(policyName);
  const lines: string[] = [];
  lines.push(`## 月間モデル（保持案: ${option.label}、1版 ${kb(base.compactBytesPerVersion)}）`);
  lines.push('');
  lines.push('月間版数 = シート数 × 活動日 × 1活動日あたりの保存数 ＋ save 以外の版。初回 baseline は1シート1版。');
  lines.push('');
  lines.push('| 負荷 | 前提 | 区分 | 月間の新しい版 | 月間増分 | 12か月後の履歴 | 上限到達 |');
  lines.push('|---|---|---|---:|---:|---:|---|');
  for (const preset of LOAD_PRESETS) {
    const load = preset.load.value;
    const points = projectCapacity(load, storage.value, option.policy, months);
    const twelve = points[11];
    lines.push(
      `| ${preset.name} | ${describeLoad(load)} | ${kindCell(preset.load.kind)} | ${monthlyNewVersions(load)} | ${both(monthlyNewVersions(load) * storage.value.bytesPerVersion)} | ${twelve ? both(twelve.historyBytes) : '—'} | ${limitText(monthsUntilLimit(load, storage.value, option.policy, months), months)} |`,
    );
  }
  lines.push('');
  lines.push(
    `上限 = ${mib(storage.value.limitBytes)}（実測 ${MEASURED_20261021.measuredAtJst}。10/14 報告と同じ値）、履歴以外 = ${mib(storage.value.nonHistoryBytes)}（実測 ${MEASURED_20261021.measuredAtJst}、branch の論理容量。10/14 報告の ${mib(REPORTED_20261014.databaseBytes)} は neondb だけの値で、上限が数える量ではない）、空き = ${mib(storage.value.limitBytes - storage.value.nonHistoryBytes)}。`,
  );
  lines.push('');
  lines.push(...renderPolicyComparison(storage.value, base, months));
  lines.push(...renderWal(base));
  lines.push('## 感度分析');
  lines.push('');
  lines.push(
    `保持案は ${option.label}。上限到達は ${SENSITIVITY_HORIZON_MONTHS} か月先まで探す。どの行も前提を1つだけ変えた外挿。`,
  );
  lines.push('');
  for (const preset of LOAD_PRESETS.filter((item) => item.name === 'normal' || item.name === 'high')) {
    lines.push(`### ${preset.name}`);
    lines.push('');
    lines.push(`| 変えた前提 | 区分 | 月間増分 | ${months}か月後の履歴 | 上限到達 |`);
    lines.push('|---|---|---:|---:|---|');
    const variants = sensitivityVariants(preset.load.value, storage.value, base, small, preset.load.kind);
    const rows = sensitivity(preset.load.value, storage.value, option.policy, variants, months);
    rows.forEach((row, index) => {
      const kind = variants[index]?.kind ?? preset.load.kind;
      lines.push(
        `| ${row.label} | ${kindCell(kind)} | ${both(row.monthlyNewBytes)} | ${both(row.historyBytesAtMonth)} | ${limitText(row.monthsUntilLimit, SENSITIVITY_HORIZON_MONTHS)} |`,
      );
    });
    lines.push('');
  }
  return lines.join('\n').trimEnd();
}

function renderPolicyComparison(storage: StorageProfile, base: MeasuredPerVersion, months: number) {
  const historyCap = { ...storage, nonHistoryBytes: 0, limitBytes: REPORTED_HISTORY_CAP_BYTES };
  const lines: string[] = [];
  lines.push('## 保持案ごとの比較（月次版の累積を含む）');
  lines.push('');
  lines.push(
    `間引いた案でも、365日より古い save は1か月1版ずつ、save 以外の版は全部が残り続ける。履歴上限 ${mib(REPORTED_HISTORY_CAP_BYTES)} は 10/14 コメントの案にある履歴だけの上限（既存報告）。`,
  );
  lines.push('');
  lines.push(
    `| 負荷 | 保持案 | 区分 | 12か月後の履歴 | ${months}か月後の履歴 | 履歴 ${mib(REPORTED_HISTORY_CAP_BYTES)} 到達 | 上限到達 |`,
  );
  lines.push('|---|---|---|---:|---:|---|---|');
  for (const preset of LOAD_PRESETS) {
    for (const option of RETENTION_OPTIONS) {
      const load = preset.load.value;
      lines.push(
        `| ${preset.name} | ${option.name} | ${kindCell(preset.load.kind)} | ${both(historyBytesAt(load, storage, option.policy, 12))} | ${both(historyBytesAt(load, storage, option.policy, months))} | ${limitText(monthsUntilLimit(load, historyCap, option.policy, months), months)} | ${limitText(monthsUntilLimit(load, storage, option.policy, months), months)} |`,
      );
    }
  }
  lines.push('');
  for (const option of RETENTION_OPTIONS) lines.push(`- ${option.name}: ${option.label}。出典: ${option.source}`);
  lines.push('');
  lines.push('### 10/14 の重い月を1版の大きさ別に再計算');
  lines.push('');
  lines.push(
    `負荷は reported-heavy（${describeLoad(presetByName('reported-heavy').load.value)}）。10/14 コメントの「約115MB」は 1版 47.5KB と 30日全版の案での値。`,
  );
  lines.push('');
  lines.push(
    `| 1版 | 1版の区分 | 保持案 | 区分 | 12か月後の履歴 | ${months}か月後の履歴 | 履歴 ${mib(REPORTED_HISTORY_CAP_BYTES)} 到達 |`,
  );
  lines.push('|---|---|---|---|---:|---:|---|');
  const heavy = presetByName('reported-heavy');
  const sizes: { label: string; kind: SourceKind; bytes: number }[] = [
    { label: '47.5 KB（PR #444、本文列だけ）', kind: 'reported', bytes: REPORTED_BYTES_PER_VERSION_444 },
    { label: `${kb(base.compactBytesPerVersion)}（詰めた後）`, kind: 'measured', bytes: base.compactBytesPerVersion },
    { label: `${kb(base.writtenBytesPerVersion)}（保存直後）`, kind: 'measured', bytes: base.writtenBytesPerVersion },
  ];
  for (const size of sizes) {
    for (const option of RETENTION_OPTIONS.filter((item) => item.name !== 'keep-all')) {
      const sized = { ...historyCap, bytesPerVersion: size.bytes };
      const load = heavy.load.value;
      lines.push(
        `| ${size.label} | ${KIND_LABEL[size.kind]} | ${option.name} | ${kindCell(heavy.load.kind)} | ${both(historyBytesAt(load, sized, option.policy, 12))} | ${both(historyBytesAt(load, sized, option.policy, months))} | ${limitText(monthsUntilLimit(load, sized, option.policy, months), months)} |`,
      );
    }
  }
  lines.push('');
  return lines;
}

function renderWal(base: MeasuredPerVersion) {
  const lines: string[] = [];
  lines.push('## WAL と PITR の保持');
  lines.push('');
  lines.push(
    '容量上限（`branch_logical_size_limit`）が数えるのは論理データ量（表・索引など DB の大きさ）。PITR のための WAL（Neon の History）とスナップショットは別の計量で、この上限には入らない。だから上の上限到達には WAL を足していない。',
  );
  lines.push(`出典: ${NEON_HISTORY_SOURCE}`);
  lines.push('');
  lines.push(
    `WAL は保持窓のあいだ残る。1版の WAL ${kb(base.walBytesPerVersion)}（合成の実測）× 窓に入る版の最大数で数える。窓の長さはプランで決まる。この project は ${MEASURED_20261021.plan}・保持窓 ${MEASURED_20261021.pitrWindowSeconds / 3600}時間（${MEASURED_20261021.pitrWindowSeconds}秒）を実測した（${MEASURED_20261021.measuredAtJst}）ので、今の値は「6時間」の行。ほかの行はプランを上げた場合の候補。Free の History は 1GB が上限。`,
  );
  lines.push('');
  lines.push('| 負荷 | 保持窓 | 区分 | 窓に入る版（最大） | 残る WAL |');
  lines.push('|---|---|---|---:|---:|');
  for (const preset of LOAD_PRESETS) {
    for (const window of PITR_WINDOWS) {
      const load = preset.load.value;
      lines.push(
        `| ${preset.name} | ${window.label} | ${kindCell(preset.load.kind)} | ${maxVersionsInWindow(load, window.days).toFixed(1)} | ${both(retainedWalBytes(load, base.walBytesPerVersion, window.days))} |`,
      );
    }
  }
  lines.push('');
  return lines;
}

/** 2026-10-21 の本番読取。10/14 の既存報告とは別の表に置く。 */
function renderProductionMeasurement() {
  const m = MEASURED_20261021;
  const bytes = (value: number) => `${mib(value)}（${value.toLocaleString('en-US')} B）`;
  const lines: string[] = [];
  const row = (item: string, value: string, note: string) => lines.push(`| ${item} | ${value} | ${note} |`);
  lines.push(`## 本番の実測（${m.measuredAtJst} ／ ${m.measuredAtPt}、10/14 の既存報告とは別）`);
  lines.push('');
  lines.push(`出典: ${m.source}`);
  lines.push('');
  lines.push('| 項目 | 値 | 区分 |');
  lines.push('|---|---|---|');
  row('branch の論理容量（上限が数える量）', bytes(m.branchLogicalBytes), '実測。neondb 以外の DB も含む');
  row('neondb（pg_database_size）', bytes(m.neondbBytes), '実測');
  row('容量上限（branch_logical_size_limit）', bytes(m.limitBytes), '実測');
  row('空き（上限 − branch の論理容量）', mib(m.limitBytes - m.branchLogicalBytes), '実測から計算');
  const pitr = `${m.pitrWindowSeconds / 3600}時間（${m.pitrWindowSeconds}秒）`;
  row('プラン / PITR の保持窓', `${m.plan} / ${pitr}`, '実測');
  row('シート数 / ブロック数', `${m.sheets} / ${m.blocks}`, '実測');
  row('revision', `${m.revision}（${m.periodLabel}）`, '実測。単点で、継続観測の保存頻度ではない');
  const body = `${kb(m.bodyLogicalBytes)} / ${kb(m.bodyStoredBytes)}`;
  row('本文（元の JSON / 圧縮後）', body, '実測。現在の本文で、履歴行ではない');
  row('履歴表（document_versions / deleted_documents）', `${m.historyTablesPresent}件（未導入）`, '実測');
  row('月間の履歴増分', '未測定', '本番に履歴表が無いので取得できない');
  lines.push('');
  return lines;
}

function describeLoad(load: LoadProfile) {
  return `${load.sheets}シート×月${load.activeDaysPerMonth}日×${load.savesPerActiveDay}保存＋非save ${load.nonSaveVersionsPerSheetPerMonth}/月`;
}

export function sensitivityVariants(
  load: LoadProfile,
  storage: StorageProfile,
  base: MeasuredPerVersion,
  small: MeasuredPerVersion,
  baseKind: SourceKind,
) {
  const walIncluded = (days: number) => storage.nonHistoryBytes + retainedWalBytes(load, base.walBytesPerVersion, days);
  const variants: (SensitivityVariant & { kind: SourceKind })[] = [
    { label: '基準', kind: baseKind },
    { label: '保存数 ×0.5', kind: 'assumed', load: { savesPerActiveDay: load.savesPerActiveDay * 0.5 } },
    { label: '保存数 ×2', kind: 'assumed', load: { savesPerActiveDay: load.savesPerActiveDay * 2 } },
    { label: '保存数 ×4', kind: 'assumed', load: { savesPerActiveDay: load.savesPerActiveDay * 4 } },
    {
      label: `1版 ${kb(small.compactBytesPerVersion)}（小さい本文の実測）`,
      kind: 'measured',
      storage: { bytesPerVersion: small.compactBytesPerVersion },
    },
    {
      label: `1版 ${kb(base.writtenBytesPerVersion)}（保存直後・dead tuple 込み）`,
      kind: 'measured',
      storage: { bytesPerVersion: base.writtenBytesPerVersion },
    },
    {
      label: 'save 以外の版 ×10',
      kind: 'assumed',
      load: { nonSaveVersionsPerSheetPerMonth: load.nonSaveVersionsPerSheetPerMonth * 10 },
    },
    { label: 'シート数 ×3', kind: 'assumed', load: { sheets: load.sheets * 3 } },
    { label: '上限を MB で数えた場合（1,024 MB）', kind: 'reported', storage: { limitBytes: 1024 * 1000 * 1000 } },
  ];
  for (const option of RETENTION_OPTIONS.filter((item) => item.name !== 'keep-all'))
    variants.push({ label: `保持案 ${option.name}（月次版の累積込み）`, kind: 'reported', policy: option.policy });
  for (const days of [1, 7])
    variants.push({
      label: `WAL（PITR ${days}日分）も上限に数えた場合`,
      kind: 'measured',
      storage: { nonHistoryBytes: walIncluded(days) },
    });
  return variants;
}

function main() {
  const { measurement, months, policy } = parseArgs(process.argv.slice(2));
  const report = parseMeasurementReport(JSON.parse(readFileSync(measurement, 'utf8')));
  process.stdout.write(`${renderCapacityReport(report, months, policy)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();

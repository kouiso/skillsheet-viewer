// 計測 report（script/measure-document-history.sh）と既存報告から、容量モデルの入力を組み立てる（#574）。
// 値ごとに実測・既存報告・仮定の別と出典を持たせる。
import type { LoadProfile, RetentionPolicy, Sourced, StorageProfile } from './history-capacity-model';
import { MIB } from './history-capacity-model';

export interface MeasurementScenario {
  name: string;
  payloadTargetBytes: number[];
  attempts: number;
  accepted: number;
  errors: number;
  failureRate: number | null;
  lockWaits: number;
  walBytes: number;
  versionsAdded: number;
  latencyMs: { samples: number; min: number; p50: number; p95: number; max: number };
  sizeBefore: SizeReport;
  sizeAfterWrite: SizeReport;
  sizeAfterCompact: SizeReport;
}
export interface SizeReport {
  versionCount: number;
  blocksStoredBytes: number;
  blocksLogicalBytes: number;
  relations: Record<string, { heapBytes: number; toastBytes: number; indexBytes: number; totalBytes: number }>;
}
export interface MeasurementReport {
  tool: string;
  kind: string;
  gitSha: string;
  gitDirty: boolean;
  command: string;
  startedAt: string;
  finishedAt: string;
  environment: { os: string; postgres: string; autovacuum: string };
  samples: Record<string, number>;
  scenarios: MeasurementScenario[];
}

const MEASUREMENT_TOOL = 'measure-document-history';

function invalid(): never {
  throw new Error('MEASUREMENT_REPORT_INVALID');
}
function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function object(value: unknown): Record<string, unknown> {
  if (!isObject(value)) invalid();
  return value;
}
function finite(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) invalid();
  return value;
}
function count(value: unknown): number {
  const number = finite(value);
  if (!Number.isInteger(number) || number < 0) invalid();
  return number;
}
function text(value: unknown): string {
  if (typeof value !== 'string') invalid();
  return value;
}

function parseSize(value: unknown): SizeReport {
  const size = object(value);
  const relations: SizeReport['relations'] = {};
  for (const [name, entry] of Object.entries(object(size.relations))) {
    const relation = object(entry);
    relations[name] = {
      heapBytes: count(relation.heapBytes),
      toastBytes: count(relation.toastBytes),
      indexBytes: count(relation.indexBytes),
      totalBytes: count(relation.totalBytes),
    };
  }
  // 1 版の容量は document_versions の総容量の差で出すので、無い report は使えない。
  if (!relations.document_versions) invalid();
  return {
    versionCount: count(size.versionCount),
    blocksStoredBytes: count(size.blocksStoredBytes),
    blocksLogicalBytes: count(size.blocksLogicalBytes),
    relations,
  };
}

function parseScenario(value: unknown): MeasurementScenario {
  const scenario = object(value);
  if (!Array.isArray(scenario.payloadTargetBytes) || scenario.payloadTargetBytes.length === 0) invalid();
  const attempts = count(scenario.attempts);
  const accepted = count(scenario.accepted);
  const errors = count(scenario.errors);
  if (accepted > attempts || errors > attempts - accepted) invalid();
  const failureRate = scenario.failureRate === null ? null : finite(scenario.failureRate);
  // 失敗率は試行と成功から決まる値なので、食い違う report は数え方が壊れている。
  if (failureRate === null ? attempts !== 0 : Math.abs(failureRate - (attempts - accepted) / attempts) > 1e-6)
    invalid();
  const latency = object(scenario.latencyMs);
  return {
    name: text(scenario.name),
    payloadTargetBytes: scenario.payloadTargetBytes.map(count),
    attempts,
    accepted,
    errors,
    failureRate,
    lockWaits: count(scenario.lockWaits),
    walBytes: count(scenario.walBytes),
    versionsAdded: count(scenario.versionsAdded),
    latencyMs: {
      samples: count(latency.samples),
      min: finite(latency.min),
      p50: finite(latency.p50),
      p95: finite(latency.p95),
      max: finite(latency.max),
    },
    sizeBefore: parseSize(scenario.sizeBefore),
    sizeAfterWrite: parseSize(scenario.sizeAfterWrite),
    sizeAfterCompact: parseSize(scenario.sizeAfterCompact),
  };
}

/** report の形を確かめる。足りない項目は推測で埋めず、読めない report として拒否する。 */
export function parseMeasurementReport(value: unknown): MeasurementReport {
  const report = object(value);
  const { gitDirty, scenarios } = report;
  if (report.tool !== MEASUREMENT_TOOL || !Array.isArray(scenarios) || typeof gitDirty !== 'boolean') invalid();
  const environment = object(report.environment);
  const samples: Record<string, number> = {};
  for (const [key, sample] of Object.entries(object(report.samples))) samples[key] = finite(sample);
  return {
    tool: MEASUREMENT_TOOL,
    kind: text(report.kind),
    gitSha: text(report.gitSha),
    gitDirty,
    command: text(report.command),
    startedAt: text(report.startedAt),
    finishedAt: text(report.finishedAt),
    environment: {
      os: text(environment.os),
      postgres: text(environment.postgres),
      autovacuum: text(environment.autovacuum),
    },
    samples,
    scenarios: scenarios.map(parseScenario),
  };
}

function historyTotal(size: SizeReport) {
  const relation = size.relations.document_versions;
  if (!relation) throw new Error('MEASUREMENT_REPORT_INVALID');
  return relation.totalBytes;
}

export interface MeasuredPerVersion {
  scenario: string;
  payloadTargetBytes: number;
  /** VACUUM FULL 後の詰めた大きさ（autovacuum が追いついた状態の下限側）。 */
  compactBytesPerVersion: number;
  /** 保存直後の大きさ。1 保存で履歴行が同一 transaction 内で複数回更新され、dead tuple が残る分を含む。 */
  writtenBytesPerVersion: number;
  walBytesPerVersion: number;
  storedToLogicalRatio: number;
}

/** 単一サイズの scenario から 1 版あたりの容量を出す。複数サイズが混ざる scenario は使わない。 */
export function perVersionFromScenario(scenario: MeasurementScenario): MeasuredPerVersion | null {
  if (scenario.payloadTargetBytes.length !== 1 || scenario.versionsAdded <= 0) return null;
  const added = scenario.versionsAdded;
  const before = historyTotal(scenario.sizeBefore);
  const stored = scenario.sizeAfterWrite.blocksStoredBytes - scenario.sizeBefore.blocksStoredBytes;
  const logical = scenario.sizeAfterWrite.blocksLogicalBytes - scenario.sizeBefore.blocksLogicalBytes;
  return {
    scenario: scenario.name,
    payloadTargetBytes: scenario.payloadTargetBytes[0] ?? 0,
    compactBytesPerVersion: (historyTotal(scenario.sizeAfterCompact) - before) / added,
    writtenBytesPerVersion: (historyTotal(scenario.sizeAfterWrite) - before) / added,
    walBytesPerVersion: scenario.walBytes / added,
    storedToLogicalRatio: logical > 0 ? stored / logical : Number.NaN,
  };
}

/** 2026-10-14 の #564 コメントの値。本番 Neon への読み取りによる「既存報告」で、この計測の実測ではない。 */
export const REPORTED_20261014 = {
  source: '#564 2026-10-14 コメント（本番 Neon の読取、当時点）',
  databaseBytes: 9.2 * MIB,
  limitBytes: 1024 * MIB,
  sheets: 1,
  revision: 14,
  periodLabel: '2026-09-16〜2026-10-07',
  savesPerDay: 0.5,
  bodyBytes: 45 * 1000,
} as const;

/**
 * 2026-10-21 13:23 JST（2026-10-20 21:23 PT）の本番 Neon への読み取りだけの実測。本文は読まず、集計値だけ。
 * project cool-boat-26004396 / branch main（br-empty-forest-aqe1538i）/ PostgreSQL 17.11。
 * 容量上限 `branch_logical_size_limit` が数えるのは branch 全体の論理容量（neondb 以外の DB も含む）なので、
 * 履歴以外の容量にはこの値を使う。10/14 の 9.2 MiB（neondb の pg_database_size）は既存報告として別に残す。
 */
export const MEASURED_20261021 = {
  source:
    '本番 Neon の読取（2026-10-21 13:23 JST、project cool-boat-26004396、branch main、Neon API の describe_project / list_branches と SELECT のみ）',
  measuredAtJst: '2026-10-21 13:23 JST',
  measuredAtPt: '2026-10-20 21:23 PT',
  branchLogicalBytes: 50_782_208,
  neondbBytes: 9_609_216,
  limitBytes: 1_073_741_824,
  plan: 'free_v3',
  pitrWindowSeconds: 21_600,
  sheets: 1,
  blocks: 12,
  revision: 16,
  periodLabel: '2026-09-16〜2026-10-21',
  bodyLogicalBytes: 95_080,
  bodyStoredBytes: 45_440,
  historyTablesPresent: 0,
} as const;

export interface LoadPreset {
  name: 'low' | 'normal' | 'high' | 'reported-pace' | 'reported-heavy';
  load: Sourced<LoadProfile>;
}

/**
 * 負荷の前提。600ms debounce は「手を止めてから保存」までの待ちで、24 時間連続で保存する頻度ではない。
 * high の 1 日 200 保存は 10/14 コメントの「いちばん重い月」の仮定をそのまま使う。
 */
export const LOAD_PRESETS: LoadPreset[] = [
  {
    name: 'low',
    load: {
      value: { sheets: 1, activeDaysPerMonth: 4, savesPerActiveDay: 5, nonSaveVersionsPerSheetPerMonth: 1 },
      kind: 'assumed',
      source: '仮定: 月4日だけ少し直す',
    },
  },
  {
    name: 'reported-pace',
    load: {
      value: { sheets: 1, activeDaysPerMonth: 15, savesPerActiveDay: 1, nonSaveVersionsPerSheetPerMonth: 1 },
      kind: 'extrapolated',
      source: '#564 10/14 の revision 14（約0.5回/日）を月15日×1保存に外挿。revision 単点で継続観測ではない',
    },
  },
  {
    name: 'normal',
    load: {
      value: { sheets: 1, activeDaysPerMonth: 10, savesPerActiveDay: 30, nonSaveVersionsPerSheetPerMonth: 2 },
      kind: 'assumed',
      source: '仮定: 月10日編集、1日30回の自動保存',
    },
  },
  {
    name: 'high',
    load: {
      value: { sheets: 3, activeDaysPerMonth: 20, savesPerActiveDay: 200, nonSaveVersionsPerSheetPerMonth: 10 },
      kind: 'assumed',
      source: '仮定: 3シートを月20日、1日200保存（10/14 の重い月の1日200版を上回る側）',
    },
  },
  {
    name: 'reported-heavy',
    load: {
      value: { sheets: 1, activeDaysPerMonth: 10, savesPerActiveDay: 200, nonSaveVersionsPerSheetPerMonth: 0 },
      kind: 'reported',
      source:
        '#564 10/14 コメントの「いちばん重い月」（1日200版×月10日、シート1枚）。save 以外の版は同コメントに無いので0',
    },
  },
];

export interface RetentionOption {
  name: 'keep-all' | 'tiered-30-365' | 'tiered-7-365';
  label: string;
  policy: RetentionPolicy;
  source: string;
}

export const KEEP_ALL: RetentionPolicy = { kind: 'keep-all' };

/** 比べる保持案。どれも本人承認済みではなく、比較のための入力。 */
export const RETENTION_OPTIONS: RetentionOption[] = [
  { name: 'keep-all', label: '全版', policy: KEEP_ALL, source: '現行仕様（自動削除なし）' },
  {
    name: 'tiered-30-365',
    label: '30日全版→365日まで1日1版→以降1か月1版',
    policy: { kind: 'tiered', fullDays: 30, dailyUntilDays: 365 },
    source: '#564 10/14 コメントの案（承認済みとは扱わない）',
  },
  {
    name: 'tiered-7-365',
    label: '7日全版→365日まで1日1版→以降1か月1版',
    policy: { kind: 'tiered', fullDays: 7, dailyUntilDays: 365 },
    source: '同コメントの「履歴が 256MiB を超えたら全版の期間を7日に縮める」',
  },
];

/** 10/14 コメントの案にある履歴だけの上限。DB 全体の上限（1,024MiB）とは別。 */
export const REPORTED_HISTORY_CAP_BYTES = 256 * MIB;

/** 1 版の大きさの既存報告。PR #444 の合成データの本文列だけの物理容量で、索引・TOAST の外側は含まない。 */
export const REPORTED_BYTES_PER_VERSION_444 = 47.5 * 1000;

/**
 * Neon の history window（PITR で戻れる期間）の既定値と上限。プランで決まる。
 * この project は free_v3・history_retention_seconds=21600（6時間）を 2026-10-21 に実測した（MEASURED_20261021）。
 * 出典は NEON_HISTORY_SOURCE。
 */
export const PITR_WINDOWS: { label: string; days: number }[] = [
  { label: '6時間（Free の上限）', days: 0.25 },
  { label: '1日（Launch・Scale の既定）', days: 1 },
  { label: '7日（Launch の上限）', days: 7 },
  { label: '30日（Scale の上限）', days: 30 },
];

export const NEON_HISTORY_SOURCE =
  'Neon docs（2026-10-21 閲覧）: https://neon.com/docs/postgres/backup-restore/history-window 、https://neon.com/docs/introduction/usage-metrics 、https://neon.com/docs/reference/glossary';

export function storageFromMeasurement(perVersion: MeasuredPerVersion, sha: string): Sourced<StorageProfile> {
  return {
    value: {
      bytesPerVersion: perVersion.compactBytesPerVersion,
      nonHistoryBytes: MEASURED_20261021.branchLogicalBytes,
      limitBytes: MEASURED_20261021.limitBytes,
    },
    kind: 'measured',
    source: `1版の容量は計測 ${sha.slice(0, 7)} の ${perVersion.scenario}（合成・VACUUM FULL 後）。非履歴容量（branch の論理容量）と上限は ${MEASURED_20261021.source}`,
  };
}

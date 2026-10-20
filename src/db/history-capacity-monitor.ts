// 履歴容量の監視（#577）。script/sql/history-size-report.sql の READ ONLY 出力を並べて、
// 今の容量・増え方・上限に届く見込み日を出す。純粋関数だけで、DB には触れない。
// 閾値を超えても、保持期間の短縮や削除は一切しない。結果を知らせるだけで、判断は本人に残す。
import { MIB } from './history-capacity-model';

export interface SizeSample {
  measuredAt: string;
  transactionReadOnly: string;
  databaseBytes: number;
  versionCount: number;
  relations: Record<string, { heapBytes: number; toastBytes: number; indexBytes: number; totalBytes: number }>;
}

/** 閾値は本人未承認の候補値。承認されるまで「候補」と表示し、どの値でも自動の削除・短縮には使わない。 */
export interface MonitorThresholds {
  historyWarnBytes: number;
  historyLimitBytes: number;
  databaseLimitBytes: number;
  approval: 'unapproved-candidate' | 'approved';
}

/** #564 10/14 コメントの比較案（200/256MiB）と、2026-10-21 に読んだ Neon の branch 論理容量上限 1,024MiB。 */
export const CANDIDATE_THRESHOLDS: MonitorThresholds = {
  historyWarnBytes: 200 * MIB,
  historyLimitBytes: 256 * MIB,
  databaseLimitBytes: 1024 * MIB,
  approval: 'unapproved-candidate',
};

export type MonitorStatus = 'normal' | 'warning' | 'exceeded' | 'measurement-failed';

export interface MonitorResult {
  status: MonitorStatus;
  measuredAt: string | null;
  thresholds: MonitorThresholds;
  historyBytes: number | null;
  historyBreakdown: { heapBytes: number; toastBytes: number; indexBytes: number } | null;
  databaseBytes: number | null;
  versionCount: number | null;
  /** 1日あたりの履歴の増え方。2点未満か1日に満たない観測では null（0 と言わない）。 */
  historyGrowthBytesPerDay: number | null;
  projectedHistoryLimitAt: string | null;
  projectedDatabaseLimitAt: string | null;
  problems: string[];
  /** 自動では何もしない。将来も、承認済みの別手順を通さずにここから削除へつながない。 */
  automaticAction: 'none';
}

const DAY_MS = 86_400_000;

function finiteNonNegative(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

/** 1点の観測を検査する。読めない点は推測で埋めず、問題として返す。 */
export function validateSample(value: unknown): { sample: SizeSample | null; problems: string[] } {
  const problems: string[] = [];
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return { sample: null, problems: ['観測の形が読めない'] };
  const record = value as Record<string, unknown>;
  if (typeof record.measuredAt !== 'string' || Number.isNaN(Date.parse(record.measuredAt))) problems.push('measuredAt が読めない');
  // READ ONLY で取った観測だけを使う。書込み可能な接続での観測は、監視が DB を変えていない証拠にならない。
  if (record.transactionReadOnly !== 'on') problems.push('READ ONLY の transaction で取った観測ではない');
  if (!finiteNonNegative(record.databaseBytes)) problems.push('databaseBytes が読めない');
  if (!finiteNonNegative(record.versionCount)) problems.push('versionCount が読めない');
  const relations = record.relations;
  const history =
    relations !== null && typeof relations === 'object' && !Array.isArray(relations)
      ? (relations as Record<string, unknown>).document_versions
      : undefined;
  if (history === null || typeof history !== 'object') problems.push('document_versions の容量が無い（履歴が未導入か、照会が失敗した）');
  else {
    const size = history as Record<string, unknown>;
    if (![size.heapBytes, size.toastBytes, size.indexBytes, size.totalBytes].every(finiteNonNegative))
      problems.push('document_versions の容量の内訳が読めない');
    // heap・TOAST・索引の和が総量と一致しなければ、二重計上か取りこぼしがある。
    else if ((size.heapBytes as number) + (size.toastBytes as number) + (size.indexBytes as number) !== size.totalBytes)
      problems.push('document_versions の内訳の和が総量と合わない');
  }
  return { sample: problems.length === 0 ? (record as unknown as SizeSample) : null, problems };
}

function validateThresholds(thresholds: MonitorThresholds) {
  for (const value of [thresholds.historyWarnBytes, thresholds.historyLimitBytes, thresholds.databaseLimitBytes])
    if (!finiteNonNegative(value) || value === 0) throw new RangeError('thresholds must be positive');
  if (thresholds.historyWarnBytes > thresholds.historyLimitBytes) throw new RangeError('warn must not exceed limit');
}

/** 最小二乗で1日あたりの増え方を出す。外れた1点に引きずられにくくする。 */
function slopePerDay(points: { t: number; y: number }[]) {
  if (points.length < 2) return null;
  const first = points[0];
  const last = points[points.length - 1];
  if (!first || !last || last.t - first.t < DAY_MS) return null;
  const n = points.length;
  const meanT = points.reduce((sum, p) => sum + p.t, 0) / n;
  const meanY = points.reduce((sum, p) => sum + p.y, 0) / n;
  let numerator = 0;
  let denominator = 0;
  for (const p of points) {
    numerator += (p.t - meanT) * (p.y - meanY);
    denominator += (p.t - meanT) ** 2;
  }
  return denominator === 0 ? null : (numerator / denominator) * DAY_MS;
}

function projectDate(fromMs: number, current: number, limit: number, perDay: number | null) {
  if (current >= limit) return new Date(fromMs).toISOString();
  if (perDay === null || perDay <= 0) return null;
  return new Date(fromMs + ((limit - current) / perDay) * DAY_MS).toISOString();
}

/**
 * 観測の並びから監視結果を出す。最新の観測が読めなければ measurement-failed にして、古い値で「正常」と言わない。
 * 途中の読めない観測は増え方の計算から外し、その旨を problems に残す。
 */
export function evaluateMonitor(values: unknown[], thresholds: MonitorThresholds = CANDIDATE_THRESHOLDS): MonitorResult {
  validateThresholds(thresholds);
  const failed = (problems: string[]): MonitorResult => ({
    status: 'measurement-failed',
    measuredAt: null,
    thresholds,
    historyBytes: null,
    historyBreakdown: null,
    databaseBytes: null,
    versionCount: null,
    historyGrowthBytesPerDay: null,
    projectedHistoryLimitAt: null,
    projectedDatabaseLimitAt: null,
    problems,
    automaticAction: 'none',
  });
  if (values.length === 0) return failed(['観測が無い']);
  const checked = values.map(validateSample);
  const latest = checked[checked.length - 1];
  if (!latest?.sample) return failed(latest?.problems ?? ['観測が無い']);
  const problems: string[] = [];
  checked.forEach((item, index) => {
    if (!item.sample) problems.push(`観測${index + 1}を増え方の計算から外した: ${item.problems.join(' / ')}`);
  });
  const points = checked.flatMap((item) => (item.sample ? [{ sample: item.sample, t: Date.parse(item.sample.measuredAt) }] : []));
  for (let index = 1; index < points.length; index++) {
    const previous = points[index - 1];
    const current = points[index];
    if (previous && current && current.t <= previous.t) return failed(['観測の時刻が古い順に並んでいない']);
  }
  const sample = latest.sample;
  const history = sample.relations.document_versions;
  if (!history) return failed(['document_versions の容量が無い']);
  const latestMs = Date.parse(sample.measuredAt);
  const growth = slopePerDay(points.map(({ sample: item, t }) => ({ t, y: item.relations.document_versions?.totalBytes ?? 0 })));
  const dbGrowth = slopePerDay(points.map(({ sample: item, t }) => ({ t, y: item.databaseBytes })));
  if (growth === null) problems.push('増え方は未測定（1日以上離れた観測が2点以上要る）');
  const exceeded = history.totalBytes >= thresholds.historyLimitBytes || sample.databaseBytes >= thresholds.databaseLimitBytes;
  const warning = history.totalBytes >= thresholds.historyWarnBytes;
  return {
    status: exceeded ? 'exceeded' : warning ? 'warning' : 'normal',
    measuredAt: sample.measuredAt,
    thresholds,
    historyBytes: history.totalBytes,
    historyBreakdown: { heapBytes: history.heapBytes, toastBytes: history.toastBytes, indexBytes: history.indexBytes },
    databaseBytes: sample.databaseBytes,
    versionCount: sample.versionCount,
    historyGrowthBytesPerDay: growth,
    projectedHistoryLimitAt: projectDate(latestMs, history.totalBytes, thresholds.historyLimitBytes, growth),
    projectedDatabaseLimitAt: projectDate(latestMs, sample.databaseBytes, thresholds.databaseLimitBytes, dbGrowth),
    problems,
    automaticAction: 'none',
  };
}

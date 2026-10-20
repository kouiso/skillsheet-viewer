// 版履歴の月間容量モデル（#574）。純粋関数だけで、DB には触れない。
// 入力ごとに「実測・既存報告・仮定・外挿」の区別を持たせ、表にしたときに混ざらないようにする。

export type SourceKind = 'measured' | 'reported' | 'assumed' | 'extrapolated';

export interface Sourced<T> {
  value: T;
  kind: SourceKind;
  /** 出典（計測 report の SHA、Issue コメント、仮定の理由など）。実データは書かない。 */
  source: string;
}

/** 負荷の前提。1 か月は 30 日として扱う（暦月の長さの差は誤差に比べて小さい）。 */
export interface LoadProfile {
  sheets: number;
  activeDaysPerMonth: number;
  savesPerActiveDay: number;
  /** restore / delete / restore-deleted など save 以外の版。どの保持案でも消さない前提なので無期限に積み上がる。 */
  nonSaveVersionsPerSheetPerMonth: number;
}

export interface StorageProfile {
  /** 1 版あたりの履歴表の総容量（heap+TOAST+索引）。 */
  bytesPerVersion: number;
  /** 履歴以外の DB 容量。 */
  nonHistoryBytes: number;
  /** 容量上限（例: Neon branch の論理容量上限）。 */
  limitBytes: number;
}

export type RetentionPolicy =
  | { kind: 'keep-all' }
  /** 直近 keepDays 日の save だけ残す。 */
  | { kind: 'window'; keepDays: number }
  /** 直近 fullDays 日は全版、dailyUntilDays 日までは 1 日 1 版、それより古い save は 1 か月 1 版。 */
  | { kind: 'tiered'; fullDays: number; dailyUntilDays: number };

export const DAYS_PER_MONTH = 30;
export const MIB = 1024 * 1024;
export const MB = 1000 * 1000;

function assertNonNegativeFinite(name: string, value: number) {
  if (!Number.isFinite(value) || value < 0) throw new RangeError(`${name} must be a non-negative finite number`);
}

function validateLoad(load: LoadProfile) {
  assertNonNegativeFinite('sheets', load.sheets);
  assertNonNegativeFinite('savesPerActiveDay', load.savesPerActiveDay);
  assertNonNegativeFinite('nonSaveVersionsPerSheetPerMonth', load.nonSaveVersionsPerSheetPerMonth);
  if (!Number.isInteger(load.sheets)) throw new RangeError('sheets must be an integer');
  if (
    !Number.isInteger(load.activeDaysPerMonth) ||
    load.activeDaysPerMonth < 0 ||
    load.activeDaysPerMonth > DAYS_PER_MONTH
  )
    throw new RangeError(`activeDaysPerMonth must be an integer between 0 and ${DAYS_PER_MONTH}`);
}

/** 保持案の形を検査する。dry-run（#576）とモデルで同じ規則を使う。 */
export function validatePolicy(policy: RetentionPolicy) {
  // JSON から来た入力は型どおりとは限らない。未知の案を keep-all 扱いにしない。
  const kind: unknown = (policy as { kind?: unknown }).kind;
  if (kind !== 'keep-all' && kind !== 'window' && kind !== 'tiered')
    throw new RangeError('unknown retention policy kind');
  if (policy.kind === 'window') {
    if (!Number.isInteger(policy.keepDays) || policy.keepDays < 1) throw new RangeError('keepDays must be >= 1');
  }
  if (policy.kind === 'tiered') {
    if (!Number.isInteger(policy.fullDays) || policy.fullDays < 1) throw new RangeError('fullDays must be >= 1');
    if (!Number.isInteger(policy.dailyUntilDays) || policy.dailyUntilDays < policy.fullDays)
      throw new RangeError('dailyUntilDays must be >= fullDays');
  }
}

/** 30 日の中で活動日を等間隔に置く。同じ入力なら常に同じ日になる。 */
export function isActiveDay(dayIndex: number, activeDaysPerMonth: number) {
  const day = dayIndex % DAYS_PER_MONTH;
  return (
    Math.floor(((day + 1) * activeDaysPerMonth) / DAYS_PER_MONTH) >
    Math.floor((day * activeDaysPerMonth) / DAYS_PER_MONTH)
  );
}

/** 1 か月あたりに新しく作られる版数（保持案を適用する前）。 */
export function monthlyNewVersions(load: LoadProfile) {
  validateLoad(load);
  return load.sheets * (load.activeDaysPerMonth * load.savesPerActiveDay + load.nonSaveVersionsPerSheetPerMonth);
}

/**
 * elapsedDays 日運用した時点で残る 1 シートあたりの版数。
 * 初回 baseline 1 版と、save 以外の版は全案で残す。最新版も必ず残す。
 * 日・月の代表は「その日（月）の最後の save」として 1 版に数える。
 */
export function retainedVersionsPerSheet(load: LoadProfile, policy: RetentionPolicy, elapsedDays: number) {
  validateLoad(load);
  validatePolicy(policy);
  if (!Number.isInteger(elapsedDays) || elapsedDays < 0)
    throw new RangeError('elapsedDays must be a non-negative integer');
  let saves = 0;
  let newestActiveDay = -1;
  let newestActiveDayKept = false;
  const monthlyBuckets = new Set<number>();
  for (let day = 0; day < elapsedDays; day++) {
    if (!isActiveDay(day, load.activeDaysPerMonth) || load.savesPerActiveDay === 0) continue;
    const age = elapsedDays - 1 - day;
    let kept = 0;
    if (policy.kind === 'keep-all') kept = load.savesPerActiveDay;
    else if (policy.kind === 'window') kept = age < policy.keepDays ? load.savesPerActiveDay : 0;
    else if (age < policy.fullDays) kept = load.savesPerActiveDay;
    else if (age < policy.dailyUntilDays) kept = 1;
    else monthlyBuckets.add(Math.floor(day / DAYS_PER_MONTH));
    saves += kept;
    newestActiveDay = day;
    newestActiveDayKept = kept > 0 || (policy.kind === 'tiered' && age >= policy.dailyUntilDays);
  }
  saves += monthlyBuckets.size;
  // 期間外でも各シートの最新版は消さない。
  if (newestActiveDay >= 0 && !newestActiveDayKept) saves += 1;
  const nonSave = load.nonSaveVersionsPerSheetPerMonth * (elapsedDays / DAYS_PER_MONTH);
  return 1 + saves + nonSave;
}

export interface CapacityPoint {
  month: number;
  versions: number;
  historyBytes: number;
  totalBytes: number;
  overLimit: boolean;
}

/** 月末ごとの残る版数と容量。 */
export function projectCapacity(load: LoadProfile, storage: StorageProfile, policy: RetentionPolicy, months: number) {
  assertNonNegativeFinite('bytesPerVersion', storage.bytesPerVersion);
  assertNonNegativeFinite('nonHistoryBytes', storage.nonHistoryBytes);
  assertNonNegativeFinite('limitBytes', storage.limitBytes);
  if (!Number.isInteger(months) || months < 1) throw new RangeError('months must be >= 1');
  const points: CapacityPoint[] = [];
  for (let month = 1; month <= months; month++) {
    const versions = load.sheets * retainedVersionsPerSheet(load, policy, month * DAYS_PER_MONTH);
    const historyBytes = versions * storage.bytesPerVersion;
    const totalBytes = historyBytes + storage.nonHistoryBytes;
    points.push({ month, versions, historyBytes, totalBytes, overLimit: totalBytes > storage.limitBytes });
  }
  return points;
}

/** 上限に初めて届く月。horizon 内に届かなければ null（「届かない」ではなく「horizon 内では届かない」）。 */
export function monthsUntilLimit(
  load: LoadProfile,
  storage: StorageProfile,
  policy: RetentionPolicy,
  horizonMonths = 120,
) {
  const hit = projectCapacity(load, storage, policy, horizonMonths).find((point) => point.overLimit);
  return hit ? hit.month : null;
}

export interface SensitivityRow {
  label: string;
  monthlyNewBytes: number;
  monthsUntilLimit: number | null;
}

/** 前提を1つずつ倍率で動かし、月間増分と上限到達月がどれだけ変わるかを並べる。 */
export function sensitivity(
  load: LoadProfile,
  storage: StorageProfile,
  policy: RetentionPolicy,
  variants: { label: string; load?: Partial<LoadProfile>; storage?: Partial<StorageProfile> }[],
): SensitivityRow[] {
  return variants.map((variant) => {
    const variedLoad = { ...load, ...variant.load };
    const variedStorage = { ...storage, ...variant.storage };
    return {
      label: variant.label,
      monthlyNewBytes: monthlyNewVersions(variedLoad) * variedStorage.bytesPerVersion,
      monthsUntilLimit: monthsUntilLimit(variedLoad, variedStorage, policy),
    };
  });
}

export function toMiB(bytes: number) {
  return bytes / MIB;
}
export function toMB(bytes: number) {
  return bytes / MB;
}

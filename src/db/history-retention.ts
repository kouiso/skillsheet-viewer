// 履歴保持案の影響を、1件も消さずに試算する（#576）。純粋関数だけで、DB には触れない。
// 承認前の保持案はシミュレーションの入力であって、有効な運用方針ではない。削除を実行する経路はここに置かない。
import { createHash } from 'node:crypto';
import { type RetentionPolicy, validatePolicy } from './history-capacity-model';
import { canonicalJson, isRevision } from './document-contract';

/** この版は必ず残す（最新版と並ぶ「常に残す版」）。 */
export const PROTECTED_ACTIONS = ['baseline', 'create', 'restore', 'delete', 'restore-deleted'] as const;
const PROTECTED = new Set<string>(PROTECTED_ACTIONS);
const KNOWN = new Set<string>([...PROTECTED_ACTIONS, 'save']);
const TIME_ZONES = ['Asia/Tokyo', 'UTC'] as const;
export type BucketTimeZone = (typeof TIME_ZONES)[number];

const MICROS_PER_DAY = 86_400_000_000;

export interface VersionRow {
  sheetId: string;
  ownerId: string;
  revision: string;
  action: string;
  recordedAt: string;
  restoredFrom: string | null;
  restoredBefore: string | null;
  /** title と blocks の格納サイズ（pg_column_size）。容量見積りだけに使う。 */
  storedBytes: number;
}
export interface DeletedRow {
  sheetId: string;
  ownerId: string;
  revision: string;
  deletedAt: string;
}
export interface LiveSheetRow {
  sheetId: string;
  ownerId: string;
  revision: string;
}
/** skillsheet_state.deleted_sheet_ids（旧 create の再送で削除シートを復活させないための台帳）。 */
export interface LedgerRow {
  ownerId: string;
  deletedSheetIds: string[];
}
export interface HistorySnapshot {
  takenAt: string;
  versions: VersionRow[];
  deleted: DeletedRow[];
  liveSheets: LiveSheetRow[];
  ledger: LedgerRow[];
  /** 本文・title の md5 を集約した指紋。内容が変われば計画を作り直させるためだけに使い、本文は含めない。 */
  contentFingerprint: string | null;
}

export interface RetentionSimulation {
  policy: RetentionPolicy;
  /** 削除シートの履歴を全部候補にするまでの日数。null は削除シートも期限なしで残す。 */
  deletedSheetPurgeDays: number | null;
  /** 日・月の代表を選ぶときの暦。 */
  timeZone: BucketTimeZone;
}

export type Decision = 'keep' | 'candidate' | 'hold';
export type Reason =
  | 'LATEST'
  | 'CURRENT_REVISION'
  | 'PROTECTED_ACTION'
  | 'DELETED_TARGET'
  | 'REFERENCED'
  | 'POLICY_KEEP_ALL'
  | 'WITHIN_WINDOW'
  | 'WITHIN_FULL'
  | 'DAILY_REPRESENTATIVE'
  | 'MONTHLY_REPRESENTATIVE'
  | 'OUTSIDE_WINDOW'
  | 'THINNED_DAILY'
  | 'THINNED_MONTHLY'
  | 'DELETED_SHEET_EXPIRED'
  | 'UNKNOWN_ACTION'
  | 'INVALID_REVISION'
  | 'INVALID_RECORDED_AT'
  | 'RECORDED_IN_FUTURE'
  | 'DUPLICATE_REVISION'
  | 'OWNER_MISMATCH'
  | 'LIVE_AND_DELETED'
  | 'ORPHAN_SHEET'
  | 'DELETED_TARGET_MISSING'
  | 'CURRENT_VERSION_MISSING'
  | 'LEDGER_MISSING'
  | 'INVALID_DELETED_AT'
  | 'REFERENCE_MISSING'
  | 'PURGE_CONFLICTS_WITH_PROTECTION';

export interface VersionDecision {
  sheetId: string;
  revision: string;
  decision: Decision;
  reason: Reason;
}

export interface RetentionPlan {
  asOf: string;
  policy: RetentionSimulation;
  policyHash: string;
  snapshotHash: string;
  planHash: string;
  sheets: number;
  totals: Record<Decision, number> & { versions: number };
  storedBytes: Record<Decision, number>;
  reasons: Partial<Record<Reason, number>>;
  /** 「常に残す」と「削除シートの全削除」がぶつかった版。保守的に保留し、どちらを優先するかは本人の判断に回す。 */
  conflicts: { sheetId: string; revision: string; reason: Reason }[];
  holds: { sheetId: string; revision: string; reason: Reason }[];
  decisions: VersionDecision[];
}

function sha256(value: unknown) {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}

const INSTANT =
  /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?(Z|[+-]\d{2}(?::?\d{2})?)$/;

/**
 * ISO 8601 の時刻をマイクロ秒で読む。PostgreSQL の timestamptz はマイクロ秒まで持つので、
 * Date.parse（ミリ秒で切り捨て）を使うと期間の境界ちょうどの版が古い側へずれる。
 */
export function parseInstantMicros(value: string): number | null {
  const match = INSTANT.exec(value);
  if (!match) return null;
  const [, y, mo, d, h, mi, s, frac = '', zone = 'Z'] = match;
  const year = Number(y);
  const month = Number(mo);
  const day = Number(d);
  const hour = Number(h);
  const minute = Number(mi);
  const second = Number(s);
  const millis = Date.UTC(year, month - 1, day, hour, minute, second);
  const check = new Date(millis);
  // 2月30日や25時のように Date.UTC が繰り上げて読む値は不正として扱う。
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day ||
    check.getUTCHours() !== hour ||
    check.getUTCMinutes() !== minute ||
    check.getUTCSeconds() !== second
  )
    return null;
  let offsetMinutes = 0;
  if (zone !== 'Z') {
    const sign = zone.startsWith('-') ? -1 : 1;
    const digits = zone.slice(1).replace(':', '');
    const offsetHours = Number(digits.slice(0, 2));
    const offsetMins = Number(digits.slice(2) || '0');
    if (offsetHours > 23 || offsetMins > 59) return null;
    offsetMinutes = sign * (offsetHours * 60 + offsetMins);
  }
  return (millis - offsetMinutes * 60_000) * 1000 + Number(frac.padEnd(6, '0'));
}

const formatters = new Map<BucketTimeZone, Intl.DateTimeFormat>();
/** 指定した暦での日付（YYYY-MM-DD）。月の代表はこの先頭7文字（YYYY-MM）で束ねる。 */
export function calendarDay(micros: number, timeZone: BucketTimeZone) {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' });
    formatters.set(timeZone, formatter);
  }
  return formatter.format(new Date(Math.floor(micros / 1000)));
}

function validateSimulation(simulation: RetentionSimulation) {
  validatePolicy(simulation.policy);
  const purge = simulation.deletedSheetPurgeDays;
  if (purge !== null && (!Number.isInteger(purge) || purge < 1))
    throw new RangeError('deletedSheetPurgeDays must be null or >= 1');
  if (!(TIME_ZONES as readonly string[]).includes(simulation.timeZone)) throw new RangeError('unsupported timeZone');
}

function compareRevision(a: string, b: string) {
  const left = BigInt(a);
  const right = BigInt(b);
  return left < right ? -1 : left > right ? 1 : 0;
}

/** 入力の順序に結果が左右されないよう、比較に使う形へ並べ直す。 */
function normalizeSnapshot(snapshot: HistorySnapshot) {
  const byKey = (a: { sheetId: string; revision: string }, b: { sheetId: string; revision: string }) =>
    a.sheetId < b.sheetId
      ? -1
      : a.sheetId > b.sheetId
        ? 1
        : isRevision(a.revision) && isRevision(b.revision)
          ? compareRevision(a.revision, b.revision)
          : a.revision < b.revision
            ? -1
            : a.revision > b.revision
              ? 1
              : 0;
  return {
    takenAt: snapshot.takenAt,
    versions: [...snapshot.versions].sort(byKey),
    deleted: [...snapshot.deleted].sort(byKey),
    liveSheets: [...snapshot.liveSheets].sort(byKey),
    ledger: [...snapshot.ledger]
      .map((row) => ({ ownerId: row.ownerId, deletedSheetIds: [...row.deletedSheetIds].sort() }))
      .sort((a, b) => (a.ownerId < b.ownerId ? -1 : a.ownerId > b.ownerId ? 1 : 0)),
    contentFingerprint: snapshot.contentFingerprint,
  };
}

export function snapshotHash(snapshot: HistorySnapshot) {
  return sha256(normalizeSnapshot(snapshot));
}

/** 入力の形を確かめる。足りない項目を推測で埋めず、読めない snapshot として拒否する。 */
export function parseHistorySnapshot(value: unknown): HistorySnapshot {
  const fail = () => {
    throw new Error('SNAPSHOT_INVALID');
  };
  const isObject = (item: unknown): item is Record<string, unknown> =>
    item !== null && typeof item === 'object' && !Array.isArray(item);
  const text = (item: unknown) => typeof item === 'string';
  const nullableText = (item: unknown) => item === null || typeof item === 'string';
  if (!isObject(value) || !text(value.takenAt)) fail();
  const record = value as Record<string, unknown>;
  for (const key of ['versions', 'deleted', 'liveSheets', 'ledger']) if (!Array.isArray(record[key])) fail();
  for (const row of record.versions as unknown[]) {
    if (
      !isObject(row) ||
      !text(row.sheetId) ||
      !text(row.ownerId) ||
      !text(row.revision) ||
      !text(row.action) ||
      !text(row.recordedAt) ||
      !nullableText(row.restoredFrom) ||
      !nullableText(row.restoredBefore) ||
      typeof row.storedBytes !== 'number' ||
      !Number.isFinite(row.storedBytes) ||
      row.storedBytes < 0
    )
      fail();
  }
  for (const row of record.deleted as unknown[])
    if (!isObject(row) || !text(row.sheetId) || !text(row.ownerId) || !text(row.revision) || !text(row.deletedAt))
      fail();
  for (const row of record.liveSheets as unknown[])
    if (!isObject(row) || !text(row.sheetId) || !text(row.ownerId) || !text(row.revision)) fail();
  for (const row of record.ledger as unknown[])
    if (!isObject(row) || !text(row.ownerId) || !Array.isArray(row.deletedSheetIds) || !row.deletedSheetIds.every(text))
      fail();
  if (!nullableText(record.contentFingerprint ?? null)) fail();
  return {
    takenAt: record.takenAt as string,
    versions: record.versions as VersionRow[],
    deleted: record.deleted as DeletedRow[],
    liveSheets: record.liveSheets as LiveSheetRow[],
    ledger: record.ledger as LedgerRow[],
    contentFingerprint: (record.contentFingerprint as string | null | undefined) ?? null,
  };
}

/**
 * 保持案を snapshot に当てて、各版を keep / candidate / hold に分ける。
 *
 * 規則（#575 の比較仕様の入力契約）:
 * - 常に残す: 各シートの最新版、現在の revision、baseline/create/restore/delete/restore-deleted、
 *   deleted_documents が指す版、残す版の restored_from / restored_before が指す版（連鎖をたどる）。
 * - 期間（window）: 評価時刻から keepDays 日以内（境界ちょうどは残す）の save だけ残す。
 * - 段階的間引き（tiered）: fullDays 日以内は全版、dailyUntilDays 日以内は暦日ごと、それより古い save は暦月ごとに1版。
 *   代表は「同じシート・同じ段・同じ暦日（暦月）の save（常に残す版・保留した版を除く）のうち revision が最大の版」。recorded_at は並行保存で
 *   revision と逆転しうるので代表の選択には使わず、どの暦日に属するかだけに使う。
 * - 削除シートの期限（deletedSheetPurgeDays）を過ぎたシートは、常に残す版以外を候補にし、常に残す版は衝突として保留する。
 * - 未知の action、不正な revision/時刻、owner の食い違い、参照先の欠損、台帳の欠損は、そのシートまたは版を保留する。
 */
export function evaluateRetention(snapshot: HistorySnapshot, simulation: RetentionSimulation, asOf: string) {
  validateSimulation(simulation);
  const now = parseInstantMicros(asOf);
  if (now === null) throw new RangeError('asOf must be an ISO 8601 instant');
  const normalized = normalizeSnapshot(snapshot);
  const decisions = new Map<string, VersionDecision>();
  const key = (sheetId: string, revision: string) => `${sheetId}\u0000${revision}`;
  const set = (row: { sheetId: string; revision: string }, decision: Decision, reason: Reason) =>
    decisions.set(key(row.sheetId, row.revision), { sheetId: row.sheetId, revision: row.revision, decision, reason });

  const live = new Map<string, LiveSheetRow[]>();
  for (const row of normalized.liveSheets) live.set(row.sheetId, [...(live.get(row.sheetId) ?? []), row]);
  const deleted = new Map<string, DeletedRow[]>();
  for (const row of normalized.deleted) deleted.set(row.sheetId, [...(deleted.get(row.sheetId) ?? []), row]);
  const ledger = new Map<string, Set<string>>();
  for (const row of normalized.ledger) {
    const ids = ledger.get(row.ownerId) ?? new Set<string>();
    for (const id of row.deletedSheetIds) ids.add(id.toLowerCase());
    ledger.set(row.ownerId, ids);
  }
  const sheets = new Map<string, VersionRow[]>();
  for (const row of normalized.versions) sheets.set(row.sheetId, [...(sheets.get(row.sheetId) ?? []), row]);

  for (const [sheetId, rows] of sheets) {
    const liveRows = live.get(sheetId) ?? [];
    const deletedRows = deleted.get(sheetId) ?? [];
    const sheetHold = sheetLevelHold(rows, liveRows, deletedRows, ledger);
    if (sheetHold) {
      for (const row of rows) set(row, 'hold', sheetHold);
      continue;
    }
    const revisions = new Set(rows.map((row) => row.revision));
    const latest = rows.reduce((max, row) => (compareRevision(row.revision, max.revision) > 0 ? row : max));
    const deletedRow = deletedRows[0];
    const times = new Map<string, number | null>(rows.map((row) => [row.revision, parseInstantMicros(row.recordedAt)]));

    // 1) 版ごとの不正は保留する。保留した版も消さないので、参照の起点として扱う。
    for (const row of rows) {
      const time = times.get(row.revision) ?? null;
      if (!KNOWN.has(row.action)) set(row, 'hold', 'UNKNOWN_ACTION');
      else if (time === null) set(row, 'hold', 'INVALID_RECORDED_AT');
      else if (time > now) set(row, 'hold', 'RECORDED_IN_FUTURE');
      else if (
        (row.restoredFrom !== null && !revisions.has(row.restoredFrom)) ||
        (row.restoredBefore !== null && !revisions.has(row.restoredBefore))
      )
        set(row, 'hold', 'REFERENCE_MISSING');
    }
    // 2) 常に残す版。
    const protect = (row: VersionRow, reason: Reason) => {
      if (!decisions.has(key(row.sheetId, row.revision))) set(row, 'keep', reason);
    };
    protect(latest, 'LATEST');
    for (const liveRow of liveRows) {
      const current = rows.find((row) => row.revision === liveRow.revision);
      if (current) protect(current, 'CURRENT_REVISION');
    }
    for (const row of rows) if (PROTECTED.has(row.action)) protect(row, 'PROTECTED_ACTION');
    if (deletedRow) {
      const target = rows.find((row) => row.revision === deletedRow.revision);
      if (target) protect(target, 'DELETED_TARGET');
    }
    // 3) 削除シートの期限切れ: 常に残す版と全削除は両立しない。どちらかを黙って選ばず、衝突として保留する。
    const deletedAt = deletedRow ? parseInstantMicros(deletedRow.deletedAt) : null;
    const purgeDays = simulation.deletedSheetPurgeDays;
    if (deletedRow && purgeDays !== null) {
      if (deletedAt === null || deletedAt > now) {
        for (const row of rows) if (!decisions.has(key(sheetId, row.revision))) set(row, 'hold', 'INVALID_DELETED_AT');
      } else if (now - deletedAt >= purgeDays * MICROS_PER_DAY) {
        for (const row of rows) {
          const existing = decisions.get(key(sheetId, row.revision));
          if (existing?.decision === 'keep') set(row, 'hold', 'PURGE_CONFLICTS_WITH_PROTECTION');
          else if (!existing) set(row, 'candidate', 'DELETED_SHEET_EXPIRED');
        }
      }
    }
    // 4) 残る save に保持案を当てる。
    const pending = rows.filter((row) => !decisions.has(key(sheetId, row.revision)));
    applyPolicy(pending, times, simulation, now, set);
    // 5) 残す・保留する版の参照先は候補にしない（Undo・復元の比較先が消えないように）。連鎖を最後までたどる。
    let changed = true;
    while (changed) {
      changed = false;
      for (const row of rows) {
        const decision = decisions.get(key(sheetId, row.revision));
        if (!decision || decision.decision === 'candidate') continue;
        for (const ref of [row.restoredFrom, row.restoredBefore]) {
          if (ref === null) continue;
          const target = decisions.get(key(sheetId, ref));
          if (target?.decision === 'candidate') {
            const targetRow = rows.find((item) => item.revision === ref);
            if (!targetRow) continue;
            // 期限切れの削除シートでは、参照先を残すと全削除と衝突する。
            set(targetRow, target.reason === 'DELETED_SHEET_EXPIRED' ? 'hold' : 'keep', target.reason === 'DELETED_SHEET_EXPIRED' ? 'PURGE_CONFLICTS_WITH_PROTECTION' : 'REFERENCED');
            changed = true;
          }
        }
      }
    }
  }

  // 同じ (sheet, revision) が重複した入力では Map が1件に潰れるので、行の順に結果を付け直す。
  const rows = normalized.versions.map((row) => {
    const decision = decisions.get(key(row.sheetId, row.revision));
    if (!decision) throw new Error('RETENTION_DECISION_MISSING');
    return { row, decision };
  });
  const ordered = rows.map((item) => item.decision);
  const totals = { versions: rows.length, keep: 0, candidate: 0, hold: 0 };
  const storedBytes = { keep: 0, candidate: 0, hold: 0 };
  const reasons: Partial<Record<Reason, number>> = {};
  for (const { row, decision } of rows) {
    totals[decision.decision] += 1;
    storedBytes[decision.decision] += row.storedBytes;
    reasons[decision.reason] = (reasons[decision.reason] ?? 0) + 1;
  }
  assertReferencesKept(rows);
  const unique = [...decisions.values()];
  const conflicts = unique
    .filter((item) => item.reason === 'PURGE_CONFLICTS_WITH_PROTECTION')
    .map(({ sheetId, revision, reason }) => ({ sheetId, revision, reason }));
  const holds = unique
    .filter((item) => item.decision === 'hold')
    .map(({ sheetId, revision, reason }) => ({ sheetId, revision, reason }));
  const policyHash = sha256(simulation);
  const hash = snapshotHash(snapshot);
  const planHash = sha256({ policyHash, snapshotHash: hash, asOf, decisions: ordered });
  const plan: RetentionPlan = {
    asOf,
    policy: simulation,
    policyHash,
    snapshotHash: hash,
    planHash,
    sheets: sheets.size,
    totals,
    storedBytes,
    reasons,
    conflicts,
    holds,
    decisions: ordered,
  };
  return plan;
}

function sheetLevelHold(
  rows: VersionRow[],
  liveRows: LiveSheetRow[],
  deletedRows: DeletedRow[],
  ledger: Map<string, Set<string>>,
): Reason | null {
  if (rows.some((row) => !isRevision(row.revision))) return 'INVALID_REVISION';
  if (new Set(rows.map((row) => row.revision)).size !== rows.length) return 'DUPLICATE_REVISION';
  const owners = new Set([...rows, ...liveRows, ...deletedRows].map((row) => row.ownerId));
  if (owners.size !== 1 || liveRows.length > 1 || deletedRows.length > 1) return 'OWNER_MISMATCH';
  if (liveRows.length > 0 && deletedRows.length > 0) return 'LIVE_AND_DELETED';
  if (liveRows.length === 0 && deletedRows.length === 0) return 'ORPHAN_SHEET';
  const revisions = new Set(rows.map((row) => row.revision));
  const liveRow = liveRows[0];
  if (liveRow && (!isRevision(liveRow.revision) || !revisions.has(liveRow.revision))) return 'CURRENT_VERSION_MISSING';
  const deletedRow = deletedRows[0];
  if (deletedRow) {
    if (!isRevision(deletedRow.revision) || !revisions.has(deletedRow.revision)) return 'DELETED_TARGET_MISSING';
    // 台帳から消えていれば、旧 create の再送で削除シートが復活しうる。整っていない状態で候補を出さない。
    if (!ledger.get(deletedRow.ownerId)?.has(deletedRow.sheetId.toLowerCase())) return 'LEDGER_MISSING';
  }
  return null;
}

function applyPolicy(
  pending: VersionRow[],
  times: Map<string, number | null>,
  simulation: RetentionSimulation,
  now: number,
  set: (row: VersionRow, decision: Decision, reason: Reason) => void,
) {
  const { policy, timeZone } = simulation;
  const timeOf = (row: VersionRow) => {
    const time = times.get(row.revision);
    // 時刻が読めない版は手前で保留にしているので、ここに来たら呼び出し側の誤り。
    if (time === undefined || time === null) throw new Error('RETENTION_TIME_MISSING');
    return time;
  };
  const age = (row: VersionRow) => now - timeOf(row);
  if (policy.kind === 'keep-all') {
    for (const row of pending) set(row, 'keep', 'POLICY_KEEP_ALL');
    return;
  }
  if (policy.kind === 'window') {
    for (const row of pending) {
      if (age(row) <= policy.keepDays * MICROS_PER_DAY) set(row, 'keep', 'WITHIN_WINDOW');
      else set(row, 'candidate', 'OUTSIDE_WINDOW');
    }
    return;
  }
  const buckets = new Map<string, VersionRow>();
  const tierOf = (row: VersionRow) =>
    age(row) <= policy.fullDays * MICROS_PER_DAY ? 'full' : age(row) <= policy.dailyUntilDays * MICROS_PER_DAY ? 'daily' : 'monthly';
  const bucketOf = (row: VersionRow) => {
    const day = calendarDay(timeOf(row), timeZone);
    return tierOf(row) === 'daily' ? `daily:${day}` : `monthly:${day.slice(0, 7)}`;
  };
  for (const row of pending) {
    if (tierOf(row) === 'full') continue;
    const bucket = bucketOf(row);
    const current = buckets.get(bucket);
    if (!current || compareRevision(row.revision, current.revision) > 0) buckets.set(bucket, row);
  }
  for (const row of pending) {
    const tier = tierOf(row);
    if (tier === 'full') {
      set(row, 'keep', 'WITHIN_FULL');
      continue;
    }
    const representative = buckets.get(bucketOf(row)) === row;
    if (tier === 'daily') set(row, representative ? 'keep' : 'candidate', representative ? 'DAILY_REPRESENTATIVE' : 'THINNED_DAILY');
    else set(row, representative ? 'keep' : 'candidate', representative ? 'MONTHLY_REPRESENTATIVE' : 'THINNED_MONTHLY');
  }
}

/** 残す・保留する版が参照する版が候補になっていないこと。崩れていれば計画そのものを出さない。 */
function assertReferencesKept(rows: { row: VersionRow; decision: VersionDecision }[]) {
  const bySheet = new Map<string, Map<string, Decision>>();
  for (const { row, decision } of rows) {
    const map = bySheet.get(row.sheetId) ?? new Map<string, Decision>();
    map.set(row.revision, decision.decision);
    bySheet.set(row.sheetId, map);
  }
  for (const { row, decision } of rows) {
    if (decision.decision === 'candidate') continue;
    for (const ref of [row.restoredFrom, row.restoredBefore]) {
      if (ref !== null && bySheet.get(row.sheetId)?.get(ref) === 'candidate') throw new Error('RETENTION_REFERENCE_BROKEN');
    }
  }
}

/**
 * 以前の計画を使い回してよいかを確かめる。snapshot（版・削除・台帳・内容の指紋）か入力が変わっていれば
 * 古い計画は使えないので、作り直しを求める。
 */
export function assertPlanReusable(plan: RetentionPlan, fresh: HistorySnapshot) {
  const again = evaluateRetention(fresh, plan.policy, plan.asOf);
  if (again.snapshotHash !== plan.snapshotHash || again.planHash !== plan.planHash) throw new Error('PLAN_STALE');
  return again;
}

/** 通常ログに出してよい集計だけを返す（owner・本文・title を含めない）。 */
export function summarizePlan(plan: RetentionPlan) {
  return {
    asOf: plan.asOf,
    policy: plan.policy,
    policyHash: plan.policyHash,
    snapshotHash: plan.snapshotHash,
    planHash: plan.planHash,
    sheets: plan.sheets,
    totals: plan.totals,
    storedBytes: plan.storedBytes,
    reasons: plan.reasons,
    conflicts: plan.conflicts,
    holds: plan.holds,
  };
}

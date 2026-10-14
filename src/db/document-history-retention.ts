/**
 * 版履歴の保存期限ルール（2026-10-14 決定、#564）の純粋な計画部分。
 *
 * DB へ実際に DELETE するのは skillsheet_private.prune_document_history で、
 * こちらは同じ規則を TypeScript の値だけで判定する。判定の基準は両方で一致させ、
 * 食い違いは SQL 側の隔離検証とここの vitest の両方で固定する。
 */

/** 履歴（document_versions と関連索引）の容量上限。1 GiB 上限の 25%。 */
export const RETENTION_HISTORY_LIMIT_BYTES = 256 * 1024 * 1024;
/** この容量を超えたら警告する。 */
export const RETENTION_HISTORY_WARN_BYTES = 200 * 1024 * 1024;
/** 通常時の全版保持期間（日）。 */
export const RETENTION_FULL_DAYS = 30;
/** 容量上限超過時に縮める全版保持期間（日）。 */
export const RETENTION_FULL_DAYS_OVER_LIMIT = 7;
/** この日数を超える版は JST 1か月1版へ間引く。以下は JST 1日1版。 */
export const RETENTION_DAILY_DAYS = 365;
/** 削除からこの日数を過ぎたシートは履歴ごと永久削除する。ちょうどこの日数は残す。 */
export const RETENTION_PURGE_DAYS = 90;
/** 間引き対象外にする action。これ以外の action（save）だけを日/月で間引く。 */
export const RETENTION_ALWAYS_KEEP_ACTIONS = ['baseline', 'create', 'restore', 'delete', 'restore-deleted'] as const;

const DAY_MS = 24 * 60 * 60 * 1000;
const JST = 'Asia/Tokyo';

export interface RetentionVersion {
  sheetId: string;
  revision: string;
  action: string;
  recordedAt: string;
}
export interface RetentionDeletedDocument {
  sheetId: string;
  revision: string;
  deletedAt: string;
}
export interface RetentionPlan {
  /** 間引きで消す版。永久削除対象シートの版は含めない。 */
  thin: { sheetId: string; revision: string }[];
  /** 履歴ごと永久削除するシート。 */
  purgeSheetIds: string[];
}

/** 履歴容量が上限を超えたら全版保持期間を 7 日へ縮める。 */
export function resolveFullDays(historyBytes: number): number {
  return historyBytes > RETENTION_HISTORY_LIMIT_BYTES ? RETENTION_FULL_DAYS_OVER_LIMIT : RETENTION_FULL_DAYS;
}

function timestamp(value: string): number {
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) throw new Error('INVALID_RECORDED_AT');
  return ms;
}

/** JST の暦日/暦月キー。UTC の日付で区切ると前日/翌日の版を同じ日に誤ってまとめる。 */
function jstBucket(ms: number, granularity: 'day' | 'month'): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: JST,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(ms));
  const get = (type: string) => parts.find((part) => part.type === type)?.value;
  const key = `${get('year')}-${get('month')}`;
  return granularity === 'month' ? key : `${key}-${get('day')}`;
}

export function planRetentionPrune(input: {
  now: Date;
  versions: RetentionVersion[];
  deletedDocuments: RetentionDeletedDocument[];
  fullDays?: number;
}): RetentionPlan {
  const nowMs = input.now.getTime();
  const fullDays = input.fullDays ?? RETENTION_FULL_DAYS;
  if (!Number.isInteger(fullDays) || fullDays < 1) throw new Error('INVALID_FULL_DAYS');

  const ledgerKeys = new Set(input.deletedDocuments.map((d) => `${d.sheetId}${d.revision}`));
  // ちょうど90日前は「過ぎた」に含めず残す。ledger の復元 CAS が指す版は別途保護する。
  const purgeSheetIds = input.deletedDocuments
    .filter((d) => nowMs - timestamp(d.deletedAt) > RETENTION_PURGE_DAYS * DAY_MS)
    .map((d) => d.sheetId)
    .sort();
  const purged = new Set(purgeSheetIds);

  const latestRevision = new Map<string, bigint>();
  for (const version of input.versions) {
    if (purged.has(version.sheetId)) continue;
    const revision = BigInt(version.revision);
    if ((latestRevision.get(version.sheetId) ?? -1n) < revision) latestRevision.set(version.sheetId, revision);
  }

  // 各シートの最新版と ledger が指す版は必ず残す。ただし候補から外すと
  // 「その日/月の最後」が1つ前の版にずれて間引き漏れになるため、
  // バケットの勝者決定には含めたうえで、最後に負けた側からだけ除く。
  const keep = new Map<string, RetentionVersion>();
  const losers: RetentionVersion[] = [];
  for (const version of input.versions) {
    if (purged.has(version.sheetId) || version.action !== 'save') continue;
    const recordedMs = timestamp(version.recordedAt);
    if (nowMs - recordedMs <= fullDays * DAY_MS) continue;
    // 日次と月次は別階層のバケットなので、月の中に新しい日次版があっても月の最後の版は残る。
    const bucket = `${version.sheetId}|${jstBucket(recordedMs, nowMs - recordedMs <= RETENTION_DAILY_DAYS * DAY_MS ? 'day' : 'month')}`;
    const current = keep.get(bucket);
    if (!current) {
      keep.set(bucket, version);
      continue;
    }
    // 「その日/月の最後の版」。同時刻なら大きい revision が後。
    const [currentMs, nextMs] = [timestamp(current.recordedAt), recordedMs];
    const drop =
      nextMs > currentMs || (nextMs === currentMs && BigInt(version.revision) > BigInt(current.revision))
        ? current
        : version;
    if (drop === current) keep.set(bucket, version);
    losers.push(drop);
  }
  const thin = losers.filter(
    (version) =>
      !ledgerKeys.has(`${version.sheetId}${version.revision}`) &&
      BigInt(version.revision) !== latestRevision.get(version.sheetId),
  );
  thin.sort((a, b) => a.sheetId.localeCompare(b.sheetId) || Number(BigInt(a.revision) - BigInt(b.revision)));
  return { thin, purgeSheetIds };
}

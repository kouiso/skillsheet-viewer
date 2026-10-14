import { describe, expect, it } from 'vitest';
import {
  planRetentionPrune,
  RETENTION_HISTORY_LIMIT_BYTES,
  RETENTION_HISTORY_WARN_BYTES,
  type RetentionPlan,
  type RetentionVersion,
  resolveFullDays,
} from './document-history-retention';

const SHEET = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01';
const GONE = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb01';
const NOW = new Date('2026-10-15T00:00:00+09:00');

function v(
  revision: number,
  recordedAt: string,
  options: { action?: string; sheetId?: string } = {},
): RetentionVersion {
  return {
    sheetId: options.sheetId ?? SHEET,
    revision: String(revision),
    action: options.action ?? 'save',
    recordedAt,
  };
}
function thinKeys(plan: RetentionPlan): string[] {
  return plan.thin.map((t) => `${t.sheetId}:${t.revision}`);
}

describe('保存期限ルール（2026-10-14 決定 #564）', () => {
  it('直近30日の save は全版残す', () => {
    const plan = planRetentionPrune({
      now: NOW,
      versions: [v(1, '2026-10-14T10:00:00+09:00'), v(2, '2026-09-16T00:00:00+09:00')],
      deletedDocuments: [],
    });
    expect(plan).toEqual({ thin: [], purgeSheetIds: [] });
  });

  it('30日を超える save は JST の日ごとに最後の1版だけ残す', () => {
    const plan = planRetentionPrune({
      now: NOW,
      versions: [
        v(1, '2026-09-10T09:00:00+09:00'),
        v(2, '2026-09-10T20:00:00+09:00'),
        v(3, '2026-09-11T09:00:00+09:00'),
        v(4, '2026-09-11T10:00:00+09:00'),
      ],
      deletedDocuments: [],
    });
    expect(thinKeys(plan)).toEqual([`${SHEET}:1`, `${SHEET}:3`]);
  });

  it('日の区切りは UTC ではなく JST で判定する', () => {
    const plan = planRetentionPrune({
      now: NOW,
      versions: [
        // UTC では同日でも JST では別日。別バケットなので両方残る。
        v(1, '2026-09-10T14:30:00+00:00'), // JST 2026-09-10 23:30
        v(2, '2026-09-10T15:30:00+00:00'), // JST 2026-09-11 00:30
      ],
      deletedDocuments: [],
    });
    expect(plan.thin).toEqual([]);
  });

  it('365日を超える save は JST の月ごとに最後の1版だけ残す', () => {
    const plan = planRetentionPrune({
      now: NOW,
      versions: [
        v(1, '2025-09-10T10:00:00+09:00'),
        v(2, '2025-09-20T10:00:00+09:00'),
        v(3, '2025-10-10T10:00:00+09:00'),
        v(4, '2025-10-11T10:00:00+09:00'),
      ],
      deletedDocuments: [],
    });
    expect(thinKeys(plan)).toEqual([`${SHEET}:1`, `${SHEET}:3`]);
  });

  it('境界: 365日前ちょうどは日次、366日前は月次バケット', () => {
    const plan = planRetentionPrune({
      now: NOW,
      versions: [
        v(1, '2025-10-15T00:00:00+09:00'), // ちょうど365日前 → 日次バケット
        v(2, '2025-10-15T12:00:00+09:00'), // 同日の後 → 残す
        v(3, '2025-10-14T00:00:00+09:00'), // 366日前 → 月次バケット（2025-10）
      ],
      deletedDocuments: [],
    });
    // rev1 は日次バケットで間引かれる。rev3 は月次バケットの唯一版で残る。
    // rev3（2025-10）と rev1/2（2025-10-15）が同じ月でも、年齢階層が違うので別バケット。
    expect(thinKeys(plan)).toEqual([`${SHEET}:1`]);
  });

  it('save 以外の action は間引かない', () => {
    const plan = planRetentionPrune({
      now: NOW,
      versions: [
        v(1, '2026-09-10T09:00:00+09:00'),
        v(2, '2026-09-10T10:00:00+09:00', { action: 'restore' }),
        v(3, '2026-09-10T11:00:00+09:00'),
        v(4, '2026-09-11T10:00:00+09:00', { action: 'baseline' }),
      ],
      deletedDocuments: [],
    });
    // rev2（restore）は同日の途中でも残す。rev4（baseline）も残す。間引きは rev1 のみ。
    expect(thinKeys(plan)).toEqual([`${SHEET}:1`]);
  });

  it('deleted_documents が指す版と各シートの最新版は必ず残す', () => {
    const plan = planRetentionPrune({
      now: NOW,
      versions: [
        v(1, '2026-09-10T09:00:00+09:00'),
        // rev2 は同日最後ではないが ledger が指す版（ledger は普通 delete 版を指すが、
        // 不整合でも参照先を消さないことをここで固定する）。
        v(2, '2026-09-10T10:00:00+09:00'),
        v(3, '2026-09-10T11:00:00+09:00'),
        // rev5 は同日最後ではないがシートの最新版。
        v(4, '2026-09-11T10:00:00+09:00'),
        v(5, '2026-09-11T09:00:00+09:00'),
      ],
      deletedDocuments: [{ sheetId: SHEET, revision: '2', deletedAt: '2026-10-10T00:00:00+09:00' }],
    });
    expect(thinKeys(plan)).toEqual([`${SHEET}:1`]);
  });

  it('削除から90日以内のシートは履歴を残し、save は通常どおり間引く', () => {
    const plan = planRetentionPrune({
      now: NOW,
      versions: [
        v(1, '2026-09-10T09:00:00+09:00', { sheetId: GONE }),
        v(2, '2026-09-10T10:00:00+09:00', { sheetId: GONE }),
        v(3, '2026-09-10T11:00:00+09:00', { sheetId: GONE, action: 'delete' }),
      ],
      deletedDocuments: [{ sheetId: GONE, revision: '3', deletedAt: '2026-10-10T00:00:00+09:00' }],
    });
    expect(plan.purgeSheetIds).toEqual([]);
    expect(thinKeys(plan)).toEqual([`${GONE}:1`]);
  });

  it('削除から90日を過ぎたシートは履歴ごと永久削除する', () => {
    const plan = planRetentionPrune({
      now: NOW,
      versions: [
        v(1, '2026-09-10T09:00:00+09:00', { sheetId: GONE }),
        v(2, '2026-07-01T10:00:00+09:00', { sheetId: GONE, action: 'delete' }),
        v(3, '2026-09-10T09:00:00+09:00'),
      ],
      deletedDocuments: [{ sheetId: GONE, revision: '2', deletedAt: '2026-07-01T10:00:00+09:00' }],
    });
    expect(plan.purgeSheetIds).toEqual([GONE]);
    // 永久削除対象シートの版は thin に重複計上しない。
    expect(thinKeys(plan)).toEqual([]);
  });

  it('削除猶予の境界: ちょうど90日前は残す', () => {
    const plan = planRetentionPrune({
      now: NOW,
      versions: [v(1, '2026-09-10T09:00:00+09:00', { sheetId: GONE })],
      deletedDocuments: [{ sheetId: GONE, revision: '1', deletedAt: '2026-07-17T00:00:00+09:00' }],
    });
    // 2026-07-17 → 2026-10-15 はちょうど90日。猶予「を過ぎた」には含めない。
    expect(plan.purgeSheetIds).toEqual([]);
  });

  it('revision は文字列のまま 64bit 整数として比較する', () => {
    const plan = planRetentionPrune({
      now: NOW,
      versions: [
        { sheetId: SHEET, revision: '9007199254740992', action: 'save', recordedAt: '2026-09-10T09:00:00+09:00' },
        { sheetId: SHEET, revision: '9007199254740993', action: 'save', recordedAt: '2026-09-10T09:00:00+09:00' },
      ],
      deletedDocuments: [],
    });
    // 同日同時刻 → 大きい revision が「その日の最後」。
    expect(thinKeys(plan)).toEqual([`${SHEET}:9007199254740992`]);
  });
});

describe('容量上限による全版保持期間の短縮', () => {
  it('256MiB を超えたら全版保持は7日に縮める', () => {
    expect(resolveFullDays(RETENTION_HISTORY_LIMIT_BYTES + 1)).toBe(7);
    expect(resolveFullDays(RETENTION_HISTORY_LIMIT_BYTES)).toBe(30);
    expect(resolveFullDays(RETENTION_HISTORY_WARN_BYTES)).toBe(30);
  });
});

import { describe, expect, it } from 'vitest';
import {
  assertPlanReusable,
  calendarDay,
  evaluateRetention,
  type HistorySnapshot,
  parseHistorySnapshot,
  parseInstantMicros,
  type RetentionSimulation,
  summarizePlan,
  type VersionRow,
} from './history-retention';

const SHEET = '11111111-1111-4111-8111-111111111111';
const DELETED_SHEET = '22222222-2222-4222-8222-222222222222';
const OWNER = 'synthetic-owner';
const DAY = 86_400_000;

function at(base: string, offsetMs: number) {
  return new Date(Date.parse(base) + offsetMs).toISOString();
}
function version(revision: number | string, recordedAt: string, extra: Partial<VersionRow> = {}): VersionRow {
  return {
    sheetId: SHEET,
    ownerId: OWNER,
    revision: String(revision),
    action: 'save',
    recordedAt,
    restoredFrom: null,
    restoredBefore: null,
    storedBytes: 100,
    ...extra,
  };
}
function snapshot(versions: VersionRow[], extra: Partial<HistorySnapshot> = {}): HistorySnapshot {
  const latest = versions
    .filter((row) => row.sheetId === SHEET)
    .reduce((max, row) => (BigInt(row.revision) > BigInt(max) ? row.revision : max), '0');
  return {
    takenAt: '2026-10-21T00:00:00Z',
    versions,
    deleted: [],
    liveSheets: [{ sheetId: SHEET, ownerId: OWNER, revision: latest }],
    ledger: [{ ownerId: OWNER, deletedSheetIds: [] }],
    contentFingerprint: 'fingerprint-1',
    ...extra,
  };
}
const KEEP_ALL: RetentionSimulation = { policy: { kind: 'keep-all' }, deletedSheetPurgeDays: null, timeZone: 'Asia/Tokyo' };
const window = (keepDays: number): RetentionSimulation => ({ ...KEEP_ALL, policy: { kind: 'window', keepDays } });
const tiered = (fullDays: number, dailyUntilDays: number, timeZone: 'Asia/Tokyo' | 'UTC' = 'Asia/Tokyo') => ({
  policy: { kind: 'tiered', fullDays, dailyUntilDays } as const,
  deletedSheetPurgeDays: null,
  timeZone,
});
const NOW = '2026-10-21T00:00:00Z';
const decisionOf = (plan: ReturnType<typeof evaluateRetention>, revision: string, sheetId = SHEET) =>
  plan.decisions.find((item) => item.sheetId === sheetId && item.revision === revision);

describe('時刻の読み取り', () => {
  it('マイクロ秒と時差を落とさずに読む', () => {
    expect(parseInstantMicros('2026-10-21T00:00:00.000001Z')).toBe(Date.parse('2026-10-21T00:00:00Z') * 1000 + 1);
    expect(parseInstantMicros('2026-10-21T09:00:00+09:00')).toBe(parseInstantMicros('2026-10-21T00:00:00Z'));
    expect(parseInstantMicros('2026-10-21 09:00:00.5+09')).toBe(Date.parse('2026-10-21T00:00:00.5Z') * 1000);
  });
  it('存在しない日付・形の崩れた値は読めないとする', () => {
    expect(parseInstantMicros('2026-02-30T00:00:00Z')).toBeNull();
    expect(parseInstantMicros('2026-10-21T24:00:00Z')).toBeNull();
    expect(parseInstantMicros('2026-10-21')).toBeNull();
    expect(parseInstantMicros('not a time')).toBeNull();
  });
  it('閏日を読み、JST と UTC で日付の境界が9時間ずれる', () => {
    const leap = parseInstantMicros('2028-02-29T15:30:00Z');
    expect(leap).not.toBeNull();
    expect(calendarDay(leap as number, 'UTC')).toBe('2028-02-29');
    expect(calendarDay(leap as number, 'Asia/Tokyo')).toBe('2028-03-01');
    expect(parseInstantMicros('2027-02-29T00:00:00Z')).toBeNull();
  });
});

describe('既定は無変更', () => {
  it('全版保持では候補が出ない', () => {
    const plan = evaluateRetention(
      snapshot([version(0, at(NOW, -400 * DAY), { action: 'create' }), version(1, at(NOW, -300 * DAY)), version(2, at(NOW, -DAY))]),
      KEEP_ALL,
      NOW,
    );
    expect(plan.totals).toEqual({ versions: 3, keep: 3, candidate: 0, hold: 0 });
  });
  it('保持案の不正・未知の種類・時刻の形を拒否する', () => {
    const base = snapshot([version(0, at(NOW, -DAY))]);
    expect(() => evaluateRetention(base, window(0), NOW)).toThrow(RangeError);
    expect(() =>
      evaluateRetention(base, { ...KEEP_ALL, policy: { kind: 'delete-all' } as unknown as RetentionSimulation['policy'] }, NOW),
    ).toThrow(RangeError);
    expect(() => evaluateRetention(base, { ...KEEP_ALL, deletedSheetPurgeDays: 0 }, NOW)).toThrow(RangeError);
    expect(() => evaluateRetention(base, KEEP_ALL, '2026-10-21')).toThrow(RangeError);
  });
});

describe('期間で区切る案', () => {
  it('境界ちょうどの版は残し、1マイクロ秒古い版は候補にする', () => {
    const boundary = '2026-09-21T00:00:00.000000Z';
    const older = '2026-09-20T23:59:59.999999Z';
    const plan = evaluateRetention(
      snapshot([version(0, older, { action: 'create' }), version(1, older), version(2, boundary), version(3, at(NOW, -DAY))]),
      window(30),
      NOW,
    );
    expect(decisionOf(plan, '1')).toMatchObject({ decision: 'candidate', reason: 'OUTSIDE_WINDOW' });
    expect(decisionOf(plan, '2')).toMatchObject({ decision: 'keep', reason: 'WITHIN_WINDOW' });
    expect(decisionOf(plan, '0')).toMatchObject({ decision: 'keep', reason: 'PROTECTED_ACTION' });
    expect(plan.storedBytes.candidate).toBe(100);
  });
  it('期間外でも最新版と現在の revision は残す', () => {
    const plan = evaluateRetention(snapshot([version(0, at(NOW, -90 * DAY)), version(1, at(NOW, -60 * DAY))]), window(7), NOW);
    expect(decisionOf(plan, '1')).toMatchObject({ decision: 'keep', reason: 'LATEST' });
    expect(decisionOf(plan, '0')).toMatchObject({ decision: 'candidate' });
  });
});

describe('段階的間引き', () => {
  it('日の代表は同じ暦日の save のうち revision が最大の版。recorded_at の逆転には左右されない', () => {
    // 同じ JST 日の3版。revision 3 は並行保存で recorded_at が revision 2 より古い。
    const day = '2026-08-01T01:00:00Z';
    const plan = evaluateRetention(
      snapshot([
        version(0, at(day, -DAY), { action: 'create' }),
        version(1, at(day, 0)),
        version(2, at(day, 60_000)),
        version(3, at(day, 30_000)),
        version(4, at(NOW, -DAY)),
      ]),
      tiered(30, 365),
      NOW,
    );
    expect(decisionOf(plan, '3')).toMatchObject({ decision: 'keep', reason: 'DAILY_REPRESENTATIVE' });
    expect(decisionOf(plan, '1')).toMatchObject({ decision: 'candidate', reason: 'THINNED_DAILY' });
    expect(decisionOf(plan, '2')).toMatchObject({ decision: 'candidate', reason: 'THINNED_DAILY' });
    expect(decisionOf(plan, '4')).toMatchObject({ decision: 'keep' });
  });
  it('同時刻の版も revision で代表を1つに決める', () => {
    const same = '2026-08-01T01:00:00.123456Z';
    const plan = evaluateRetention(snapshot([version(1, same), version(2, same), version(3, at(NOW, -DAY))]), tiered(30, 365), NOW);
    expect(decisionOf(plan, '2')).toMatchObject({ reason: 'DAILY_REPRESENTATIVE' });
    expect(decisionOf(plan, '1')).toMatchObject({ reason: 'THINNED_DAILY' });
  });
  it('暦日の区切りは指定した暦で決まる（UTC 15時台は JST では翌日）', () => {
    const versions = [version(1, '2026-08-01T14:30:00Z'), version(2, '2026-08-01T15:30:00Z'), version(3, at(NOW, -DAY))];
    const jst = evaluateRetention(snapshot(versions), tiered(30, 365, 'Asia/Tokyo'), NOW);
    const utc = evaluateRetention(snapshot(versions), tiered(30, 365, 'UTC'), NOW);
    // JST では 8/1 23:30 と 8/2 00:30 で別の日、UTC では同じ 8/1。
    expect([decisionOf(jst, '1')?.decision, decisionOf(jst, '2')?.decision]).toEqual(['keep', 'keep']);
    expect([decisionOf(utc, '1')?.decision, decisionOf(utc, '2')?.decision]).toEqual(['candidate', 'keep']);
    expect(jst.policyHash).not.toBe(utc.policyHash);
  });
  it('古い save は暦月ごとに1版。閏日も2月に入る', () => {
    const plan = evaluateRetention(
      snapshot([
        version(1, '2024-02-01T00:00:00Z'),
        version(2, '2024-02-29T14:00:00Z'),
        version(3, '2024-02-29T15:30:00Z'),
        version(4, at(NOW, -DAY)),
      ]),
      tiered(30, 365, 'Asia/Tokyo'),
      NOW,
    );
    // JST では revision 3 は 3/1 0:30。2月の代表は revision 2、3月の代表は revision 3。
    expect(decisionOf(plan, '1')).toMatchObject({ reason: 'THINNED_MONTHLY' });
    expect(decisionOf(plan, '2')).toMatchObject({ reason: 'MONTHLY_REPRESENTATIVE' });
    expect(decisionOf(plan, '3')).toMatchObject({ reason: 'MONTHLY_REPRESENTATIVE' });
  });
  it('64bit 近くの revision も丸めずに比べる', () => {
    const plan = evaluateRetention(
      snapshot([
        version('9007199254740993', '2026-08-01T01:00:00Z'),
        version('9007199254740994', '2026-08-01T01:00:01Z'),
        version('9223372036854775807', at(NOW, -DAY)),
      ]),
      tiered(30, 365),
      NOW,
    );
    expect(decisionOf(plan, '9007199254740994')).toMatchObject({ reason: 'DAILY_REPRESENTATIVE' });
    expect(decisionOf(plan, '9007199254740993')).toMatchObject({ reason: 'THINNED_DAILY' });
    expect(decisionOf(plan, '9223372036854775807')).toMatchObject({ reason: 'LATEST' });
  });
  it('空の履歴でも落ちずに0件を返す', () => {
    const plan = evaluateRetention(
      { takenAt: NOW, versions: [], deleted: [], liveSheets: [], ledger: [], contentFingerprint: null },
      tiered(30, 365),
      NOW,
    );
    expect(plan.totals).toEqual({ versions: 0, keep: 0, candidate: 0, hold: 0 });
    expect(plan.sheets).toBe(0);
  });
});

describe('復元・Undo の参照を壊さない', () => {
  it('restore の restored_from と restored_before が指す版は、古い save でも候補にしない', () => {
    const old = (offset: number) => at('2025-01-10T00:00:00Z', offset * 60_000);
    const plan = evaluateRetention(
      snapshot([
        version(0, old(0), { action: 'create' }),
        version(1, old(1)),
        version(2, old(2)),
        version(3, old(3)),
        version(4, old(4), { action: 'restore', restoredFrom: '1', restoredBefore: '3' }),
        version(5, at(NOW, -DAY)),
      ]),
      window(30),
      NOW,
    );
    expect(decisionOf(plan, '1')).toMatchObject({ decision: 'keep', reason: 'REFERENCED' });
    expect(decisionOf(plan, '3')).toMatchObject({ decision: 'keep', reason: 'REFERENCED' });
    expect(decisionOf(plan, '2')).toMatchObject({ decision: 'candidate' });
  });
  it('参照先が欠けた restore は保留し、未知 action も保留する', () => {
    const plan = evaluateRetention(
      snapshot([
        version(1, '2025-01-01T00:00:00Z', { action: 'restore', restoredFrom: '0', restoredBefore: null }),
        version(2, '2025-01-02T00:00:00Z', { action: 'import-legacy' }),
        version(3, at(NOW, -DAY)),
      ]),
      window(30),
      NOW,
    );
    expect(decisionOf(plan, '1')).toMatchObject({ decision: 'hold', reason: 'REFERENCE_MISSING' });
    expect(decisionOf(plan, '2')).toMatchObject({ decision: 'hold', reason: 'UNKNOWN_ACTION' });
  });
  it('未来の recorded_at と読めない時刻は保留する', () => {
    const plan = evaluateRetention(
      snapshot([version(1, at(NOW, DAY)), version(2, 'yesterday'), version(3, at(NOW, -DAY))]),
      window(30),
      NOW,
    );
    expect(decisionOf(plan, '1')).toMatchObject({ decision: 'hold', reason: 'RECORDED_IN_FUTURE' });
    expect(decisionOf(plan, '2')).toMatchObject({ decision: 'hold', reason: 'INVALID_RECORDED_AT' });
  });
});

describe('削除シート', () => {
  const deletedVersions = [
    version(0, '2025-01-01T00:00:00Z', { sheetId: DELETED_SHEET, action: 'create' }),
    version(1, '2025-01-02T00:00:00Z', { sheetId: DELETED_SHEET }),
    version(2, '2025-01-03T00:00:00Z', { sheetId: DELETED_SHEET }),
    version(3, '2025-01-04T00:00:00Z', { sheetId: DELETED_SHEET, action: 'delete' }),
  ];
  const withDeleted = (extra: Partial<HistorySnapshot> = {}) =>
    snapshot([version(0, at(NOW, -DAY), { action: 'create' }), ...deletedVersions], {
      deleted: [{ sheetId: DELETED_SHEET, ownerId: OWNER, revision: '3', deletedAt: '2025-01-04T00:00:00Z' }],
      ledger: [{ ownerId: OWNER, deletedSheetIds: [DELETED_SHEET] }],
      ...extra,
    });

  it('期限なしなら削除シートも通常の保持案に従い、deleted_documents の指す版は残す', () => {
    const plan = evaluateRetention(withDeleted(), window(30), NOW);
    expect(decisionOf(plan, '3', DELETED_SHEET)).toMatchObject({ decision: 'keep' });
    expect(decisionOf(plan, '1', DELETED_SHEET)).toMatchObject({ decision: 'candidate', reason: 'OUTSIDE_WINDOW' });
    expect(plan.conflicts).toEqual([]);
  });
  it('期限切れの全削除と「常に残す版」の衝突を報告し、衝突した版は保留にする', () => {
    const plan = evaluateRetention(withDeleted(), { ...KEEP_ALL, deletedSheetPurgeDays: 90 }, NOW);
    expect(decisionOf(plan, '1', DELETED_SHEET)).toMatchObject({ decision: 'candidate', reason: 'DELETED_SHEET_EXPIRED' });
    expect(decisionOf(plan, '3', DELETED_SHEET)).toMatchObject({ decision: 'hold', reason: 'PURGE_CONFLICTS_WITH_PROTECTION' });
    expect(decisionOf(plan, '0', DELETED_SHEET)).toMatchObject({ decision: 'hold', reason: 'PURGE_CONFLICTS_WITH_PROTECTION' });
    expect(plan.conflicts.map((item) => item.revision).sort()).toEqual(['0', '3']);
    // 生きているシートには影響しない。
    expect(decisionOf(plan, '0')).toMatchObject({ decision: 'keep' });
  });
  it('再送防止の台帳から消えている削除シートは、何も候補にしない', () => {
    const plan = evaluateRetention(withDeleted({ ledger: [{ ownerId: OWNER, deletedSheetIds: [] }] }), window(30), NOW);
    expect(plan.decisions.filter((item) => item.sheetId === DELETED_SHEET).every((item) => item.reason === 'LEDGER_MISSING')).toBe(true);
    expect(plan.totals.candidate).toBe(0);
  });
  it('deleted_documents の指す版が無い・owner が食い違う・生存と削除の両方にある・どちらにも無いシートは保留する', () => {
    const cases: [Partial<HistorySnapshot>, string][] = [
      [{ deleted: [{ sheetId: DELETED_SHEET, ownerId: OWNER, revision: '9', deletedAt: '2025-01-04T00:00:00Z' }] }, 'DELETED_TARGET_MISSING'],
      [{ deleted: [{ sheetId: DELETED_SHEET, ownerId: 'other', revision: '3', deletedAt: '2025-01-04T00:00:00Z' }] }, 'OWNER_MISMATCH'],
      [
        {
          liveSheets: [
            { sheetId: SHEET, ownerId: OWNER, revision: '0' },
            { sheetId: DELETED_SHEET, ownerId: OWNER, revision: '3' },
          ],
        },
        'LIVE_AND_DELETED',
      ],
      [{ deleted: [] }, 'ORPHAN_SHEET'],
    ];
    for (const [extra, reason] of cases) {
      const plan = evaluateRetention(withDeleted(extra), window(30), NOW);
      const rows = plan.decisions.filter((item) => item.sheetId === DELETED_SHEET);
      expect(rows.every((item) => item.decision === 'hold' && item.reason === reason)).toBe(true);
    }
  });
  it('削除時刻が読めない・未来なら期限判定をせず保留する', () => {
    const plan = evaluateRetention(
      withDeleted({ deleted: [{ sheetId: DELETED_SHEET, ownerId: OWNER, revision: '3', deletedAt: 'broken' }] }),
      { ...KEEP_ALL, deletedSheetPurgeDays: 90 },
      NOW,
    );
    expect(decisionOf(plan, '1', DELETED_SHEET)).toMatchObject({ decision: 'hold', reason: 'INVALID_DELETED_AT' });
  });
});

describe('シート単位の不整合', () => {
  it('同じ revision の重複・不正な revision・現在の revision の版が無いシートは全部保留する', () => {
    const duplicate = evaluateRetention(snapshot([version(1, '2025-01-01T00:00:00Z'), version(1, '2025-01-02T00:00:00Z')]), window(30), NOW);
    expect(duplicate.totals).toMatchObject({ versions: 2, hold: 2 });
    expect(duplicate.reasons.DUPLICATE_REVISION).toBe(2);
    const invalid = evaluateRetention(snapshot([version('01', '2025-01-01T00:00:00Z'), version(2, at(NOW, -DAY))]), window(30), NOW);
    expect(invalid.reasons.INVALID_REVISION).toBe(2);
    const missing = evaluateRetention(
      snapshot([version(1, '2025-01-01T00:00:00Z')], { liveSheets: [{ sheetId: SHEET, ownerId: OWNER, revision: '7' }] }),
      window(30),
      NOW,
    );
    expect(missing.reasons.CURRENT_VERSION_MISSING).toBe(1);
  });
});

describe('決定性と再評価', () => {
  const rows = [
    version(0, '2025-01-01T00:00:00Z', { action: 'create' }),
    version(1, '2025-01-02T00:00:00Z'),
    version(2, '2025-01-02T00:00:01Z'),
    version(3, at(NOW, -DAY)),
  ];
  it('同じ snapshot と入力なら、行の順序が違っても同じ結果と hash になる', () => {
    const first = evaluateRetention(snapshot(rows), tiered(30, 365), NOW);
    const second = evaluateRetention(snapshot([...rows].reverse()), tiered(30, 365), NOW);
    expect(second.planHash).toBe(first.planHash);
    expect(second.snapshotHash).toBe(first.snapshotHash);
    expect(second.decisions).toEqual(first.decisions);
  });
  it('間に保存や内容の変更が挟まった snapshot では古い計画を使い回させない', () => {
    const plan = evaluateRetention(snapshot(rows), tiered(30, 365), NOW);
    expect(assertPlanReusable(plan, snapshot(rows)).planHash).toBe(plan.planHash);
    expect(() => assertPlanReusable(plan, snapshot([...rows, version(4, at(NOW, -1000))]))).toThrow('PLAN_STALE');
    expect(() => assertPlanReusable(plan, snapshot(rows, { contentFingerprint: 'fingerprint-2' }))).toThrow('PLAN_STALE');
  });
  it('保持案が違えば policy hash も違う', () => {
    expect(evaluateRetention(snapshot(rows), window(30), NOW).policyHash).not.toBe(
      evaluateRetention(snapshot(rows), window(31), NOW).policyHash,
    );
  });
});

describe('出力と入力の形', () => {
  it('集計には owner・title・本文を含めない', () => {
    const plan = evaluateRetention(snapshot([version(1, '2025-01-01T00:00:00Z'), version(2, at(NOW, -DAY))]), window(30), NOW);
    const text = JSON.stringify(summarizePlan(plan));
    expect(text).not.toContain(OWNER);
    expect(text).not.toContain('decisions');
  });
  it('形の合わない snapshot を推測で埋めず拒否する', () => {
    const good = snapshot([version(1, '2025-01-01T00:00:00Z')]);
    expect(parseHistorySnapshot(JSON.parse(JSON.stringify(good)))).toEqual(good);
    expect(() => parseHistorySnapshot({ ...good, versions: [{ ...good.versions[0], storedBytes: -1 }] })).toThrow('SNAPSHOT_INVALID');
    expect(() => parseHistorySnapshot({ ...good, ledger: [{ ownerId: OWNER, deletedSheetIds: [1] }] })).toThrow('SNAPSHOT_INVALID');
    expect(() => parseHistorySnapshot({ ...good, deleted: undefined })).toThrow('SNAPSHOT_INVALID');
  });
});

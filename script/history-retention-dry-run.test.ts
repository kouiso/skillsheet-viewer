import { describe, expect, it } from 'vitest';
import { parseArgs, parsePolicy, runDryRun } from './history-retention-dry-run';

const snapshot = {
  takenAt: '2026-10-21T00:00:00Z',
  versions: [
    {
      sheetId: '11111111-1111-4111-8111-111111111111',
      ownerId: 'synthetic-owner',
      revision: '0',
      action: 'create',
      recordedAt: '2025-01-01T00:00:00Z',
      restoredFrom: null,
      restoredBefore: null,
      storedBytes: 10,
    },
    {
      sheetId: '11111111-1111-4111-8111-111111111111',
      ownerId: 'synthetic-owner',
      revision: '1',
      action: 'save',
      recordedAt: '2025-01-02T00:00:00Z',
      restoredFrom: null,
      restoredBefore: null,
      storedBytes: 20,
    },
    {
      sheetId: '11111111-1111-4111-8111-111111111111',
      ownerId: 'synthetic-owner',
      revision: '2',
      action: 'save',
      recordedAt: '2026-10-20T00:00:00Z',
      restoredFrom: null,
      restoredBefore: null,
      storedBytes: 30,
    },
  ],
  deleted: [],
  liveSheets: [{ sheetId: '11111111-1111-4111-8111-111111111111', ownerId: 'synthetic-owner', revision: '2' }],
  ledger: [],
  contentFingerprint: 'f',
};

describe('dry-run CLI', () => {
  it('削除・適用の指定は受けない', () => {
    for (const flag of ['--apply', '--execute', '--delete', '--commit', '--force', '--yes', '--apply=true']) {
      expect(() => parseArgs(['--snapshot', 's.json', flag])).toThrow('APPLY_NOT_SUPPORTED');
    }
    expect(() => parseArgs(['--snapshot', 's.json', '--purge'])).toThrow('UNKNOWN_ARGUMENT');
  });
  it('指定が無ければ全版保持（無変更）で試算する', () => {
    const args = parseArgs(['--snapshot', 's.json']);
    expect(args.policies).toEqual([{ kind: 'keep-all' }]);
    const result = runDryRun(snapshot, args);
    expect(result.plans[0]?.totals).toEqual({ versions: 3, keep: 3, candidate: 0, hold: 0 });
    expect(result.plans[0]?.asOf).toBe(snapshot.takenAt);
  });
  it('複数の案を同じ snapshot で並べ、owner を出さない', () => {
    const args = parseArgs([
      '--snapshot',
      's.json',
      '--policy',
      'keep-all',
      '--policy',
      'window:30',
      '--policy',
      'tiered:30:365',
    ]);
    const result = runDryRun(snapshot, args);
    expect(result.plans.map((plan) => plan.totals.candidate)).toEqual([0, 1, 0]);
    expect(result.plans[1]?.storedBytes.candidate).toBe(20);
    expect(JSON.stringify(result)).not.toContain('synthetic-owner');
  });
  it('案と値の形を検査する', () => {
    expect(parsePolicy('tiered:7:30')).toEqual({ kind: 'tiered', fullDays: 7, dailyUntilDays: 30 });
    expect(() => parsePolicy('window:0')).toThrow('INVALID_POLICY');
    expect(() => parsePolicy('delete-all')).toThrow('INVALID_POLICY');
    expect(() => parseArgs([])).toThrow('SNAPSHOT_REQUIRED');
    expect(() => parseArgs(['--snapshot'])).toThrow('MISSING_VALUE');
    expect(() => parseArgs(['--snapshot', 's.json', '--time-zone', 'America/New_York'])).toThrow('INVALID_TIME_ZONE');
    expect(() => parseArgs(['--snapshot', 's.json', '--deleted-purge-days', '-1'])).toThrow('INVALID_PURGE_DAYS');
    expect(() => parseArgs(['--snapshot', 's.json', '--deleted-purge-days', '0'])).toThrow('INVALID_PURGE_DAYS');
  });
});

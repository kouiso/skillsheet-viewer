import { describe, expect, it } from 'vitest';
import { MIB } from './history-capacity-model';
import { CANDIDATE_THRESHOLDS, evaluateMonitor, validateSample } from './history-capacity-monitor';

/** branchMiB は Neon の branch の論理容量。pg_database_size 側はそれより小さい値を入れ、上限の判定に使わんことを試す。 */
function sample(
  measuredAt: string,
  historyMiB: number,
  branchMiB = historyMiB + 10,
  extra: Record<string, unknown> = {},
) {
  const total = Math.round(historyMiB * MIB);
  const index = Math.round(total * 0.01);
  const toast = Math.round(total * 0.9);
  return {
    measuredAt,
    transactionReadOnly: 'on',
    databaseBytes: Math.round(branchMiB * 0.2 * MIB),
    allDatabasesBytes: Math.round(branchMiB * 0.7 * MIB),
    branchLogicalBytes: Math.round(branchMiB * MIB),
    versionCount: 100,
    relations: {
      document_versions: { heapBytes: total - index - toast, toastBytes: toast, indexBytes: index, totalBytes: total },
    },
    ...extra,
  };
}

describe('監視の状態', () => {
  it('候補の閾値より下なら normal で、自動では何もしない', () => {
    const result = evaluateMonitor([sample('2026-10-01T00:00:00Z', 10), sample('2026-10-11T00:00:00Z', 20)]);
    expect(result.status).toBe('normal');
    expect(result.automaticAction).toBe('none');
    expect(result.thresholds.approval).toBe('unapproved-candidate');
    expect(Math.abs((result.historyGrowthBytesPerDay ?? 0) - MIB)).toBeLessThan(1);
    // 20MiB から 1MiB/日 で 256MiB まで 236 日。浮動小数の誤差は1秒未満まで許す。
    const expected = Date.parse('2026-10-11T00:00:00Z') + 236 * 86_400_000;
    expect(Math.abs(Date.parse(result.projectedHistoryLimitAt ?? '') - expected)).toBeLessThan(1000);
  });
  it('警告・超過を閾値で分け、超過しても削除や短縮をしない', () => {
    expect(evaluateMonitor([sample('2026-10-11T00:00:00Z', 200)]).status).toBe('warning');
    const exceeded = evaluateMonitor([sample('2026-10-11T00:00:00Z', 256)]);
    expect(exceeded.status).toBe('exceeded');
    expect(exceeded.automaticAction).toBe('none');
    expect(exceeded.projectedHistoryLimitAt).toBe('2026-10-11T00:00:00.000Z');
    // branch の論理容量が上限に届いたら exceeded。pg_database_size（接続先・全 DB の和）がずっと小さくても見逃さない。
    const branchFull = evaluateMonitor([sample('2026-10-11T00:00:00Z', 10, 1024)]);
    expect(branchFull.status).toBe('exceeded');
    expect(branchFull.databaseBytes).toBeLessThan(CANDIDATE_THRESHOLDS.databaseLimitBytes);
    expect(branchFull.allDatabasesBytes).toBeLessThan(CANDIDATE_THRESHOLDS.databaseLimitBytes);
    expect(branchFull.projectedDatabaseLimitAt).toBe('2026-10-11T00:00:00.000Z');
  });
  it('上限の判定と見込み日は branch の論理容量で出し、pg_database_size では出さない', () => {
    // 2026-10-21 本番の比: neondb 9,609,216 B・全 DB の和 35,176,448 B・論理容量 50,782,208 B。
    const measured = (measuredAt: string, branchBytes: number) => ({
      ...sample(measuredAt, 0),
      databaseBytes: 9_609_216,
      allDatabasesBytes: 35_176_448,
      branchLogicalBytes: branchBytes,
    });
    const result = evaluateMonitor([
      measured('2026-10-01T00:00:00Z', 50_782_208),
      measured('2026-10-11T00:00:00Z', 50_782_208 + 10 * MIB),
    ]);
    expect(result.branchLogicalBytes).toBe(50_782_208 + 10 * MIB);
    // 論理容量が 1MiB/日 で増える。pg_database_size は横ばいなので、それで見ていたら見込み日は出ない。
    const remainingDays = (1024 * MIB - (50_782_208 + 10 * MIB)) / MIB;
    const expected = Date.parse('2026-10-11T00:00:00Z') + remainingDays * 86_400_000;
    expect(Math.abs(Date.parse(result.projectedDatabaseLimitAt ?? '') - expected)).toBeLessThan(1000);
  });
  it('閾値は差し替えられる', () => {
    const result = evaluateMonitor([sample('2026-10-11T00:00:00Z', 60)], {
      ...CANDIDATE_THRESHOLDS,
      historyWarnBytes: 50 * MIB,
      historyLimitBytes: 100 * MIB,
    });
    expect(result.status).toBe('warning');
    expect(() =>
      evaluateMonitor([sample('2026-10-11T00:00:00Z', 60)], { ...CANDIDATE_THRESHOLDS, historyWarnBytes: 300 * MIB }),
    ).toThrow(RangeError);
  });
});

describe('計測失敗', () => {
  it('観測が無い・最新の観測が読めないときは measurement-failed にし、古い値で正常と言わない', () => {
    expect(evaluateMonitor([]).status).toBe('measurement-failed');
    const result = evaluateMonitor([sample('2026-10-01T00:00:00Z', 10), { measuredAt: 'broken' }]);
    expect(result.status).toBe('measurement-failed');
    expect(result.historyBytes).toBeNull();
  });
  it('READ ONLY で取っていない観測・履歴表の無い観測・内訳が合わない観測は失敗にする', () => {
    expect(validateSample(sample('2026-10-01T00:00:00Z', 10, 20, { transactionReadOnly: 'off' })).problems).toContain(
      'READ ONLY の transaction で取った観測ではない',
    );
    expect(evaluateMonitor([sample('2026-10-01T00:00:00Z', 10, 20, { relations: {} })]).status).toBe(
      'measurement-failed',
    );
    const broken = sample('2026-10-01T00:00:00Z', 10);
    broken.relations.document_versions.totalBytes += 1;
    expect(evaluateMonitor([broken]).problems).toContain('document_versions の内訳の和が総量と合わない');
  });
  it('Neon の論理容量が無い観測は、pg_database_size で代わりに判定せず失敗にする', () => {
    const { branchLogicalBytes: _omitted, ...withoutBranch } = sample('2026-10-01T00:00:00Z', 10);
    const result = evaluateMonitor([withoutBranch]);
    expect(result.status).toBe('measurement-failed');
    expect(result.problems).toContain(
      'branchLogicalBytes（Neon API の branch.logical_size）が無い。pg_database_size では上限の判定をしない',
    );
  });
  it('時刻が逆順の観測は失敗にする', () => {
    expect(evaluateMonitor([sample('2026-10-11T00:00:00Z', 20), sample('2026-10-01T00:00:00Z', 10)]).status).toBe(
      'measurement-failed',
    );
  });
  it('途中の読めない観測は外して問題に残す。1日未満の観測では増え方を 0 と言わず未測定にする', () => {
    const result = evaluateMonitor([
      sample('2026-10-01T00:00:00Z', 10),
      { measuredAt: 'x' },
      sample('2026-10-01T06:00:00Z', 11),
    ]);
    expect(result.status).toBe('normal');
    expect(result.historyGrowthBytesPerDay).toBeNull();
    expect(result.projectedHistoryLimitAt).toBeNull();
    expect(result.problems.some((problem) => problem.startsWith('観測2を'))).toBe(true);
    expect(result.problems).toContain('増え方は未測定（1日以上離れた観測が2点以上要る）');
  });
  it('ほぼ横ばいで見込み日が Date の範囲を超えても、例外にせず見込みなしにする', () => {
    const at = (measuredAt: string, totalBytes: number) => ({
      measuredAt,
      transactionReadOnly: 'on',
      databaseBytes: 10 * MIB,
      allDatabasesBytes: 10 * MIB,
      branchLogicalBytes: 10 * MIB,
      versionCount: 10,
      relations: { document_versions: { heapBytes: totalBytes, toastBytes: 0, indexBytes: 0, totalBytes } },
    });
    const result = evaluateMonitor([
      at('2026-10-01T00:00:00Z', 81_920),
      at('2026-10-02T00:00:01Z', 90_112),
      at('2026-10-03T00:00:00Z', 81_920),
    ]);
    expect(result.status).toBe('normal');
    expect(result.historyGrowthBytesPerDay).toBeGreaterThan(0);
    expect(result.projectedHistoryLimitAt).toBeNull();
  });
  it('減っている・横ばいなら届く日を出さない', () => {
    const result = evaluateMonitor([sample('2026-10-01T00:00:00Z', 20), sample('2026-10-11T00:00:00Z', 20)]);
    expect(result.historyGrowthBytesPerDay).toBe(0);
    expect(result.projectedHistoryLimitAt).toBeNull();
  });
});

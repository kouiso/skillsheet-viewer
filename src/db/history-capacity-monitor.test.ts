import { describe, expect, it } from 'vitest';
import { CANDIDATE_THRESHOLDS, evaluateMonitor, validateSample } from './history-capacity-monitor';
import { MIB } from './history-capacity-model';

function sample(measuredAt: string, historyMiB: number, databaseMiB = historyMiB + 10, extra: Record<string, unknown> = {}) {
  const total = Math.round(historyMiB * MIB);
  const index = Math.round(total * 0.01);
  const toast = Math.round(total * 0.9);
  return {
    measuredAt,
    transactionReadOnly: 'on',
    databaseBytes: Math.round(databaseMiB * MIB),
    versionCount: 100,
    relations: { document_versions: { heapBytes: total - index - toast, toastBytes: toast, indexBytes: index, totalBytes: total } },
    ...extra,
  };
}

describe('監視の状態', () => {
  it('候補の閾値より下なら normal で、自動では何もしない', () => {
    const result = evaluateMonitor([sample('2026-10-01T00:00:00Z', 10), sample('2026-10-11T00:00:00Z', 20)]);
    expect(result.status).toBe('normal');
    expect(result.automaticAction).toBe('none');
    expect(result.thresholds.approval).toBe('unapproved-candidate');
    expect(result.historyGrowthBytesPerDay).toBeCloseTo(MIB);
    // 20MiB から 1MiB/日 で 256MiB まで 236 日。
    expect(result.projectedHistoryLimitAt).toBe(new Date(Date.parse('2026-10-11T00:00:00Z') + 236 * 86_400_000).toISOString());
  });
  it('警告・超過を閾値で分け、超過しても削除や短縮をしない', () => {
    expect(evaluateMonitor([sample('2026-10-11T00:00:00Z', 200)]).status).toBe('warning');
    const exceeded = evaluateMonitor([sample('2026-10-11T00:00:00Z', 256)]);
    expect(exceeded.status).toBe('exceeded');
    expect(exceeded.automaticAction).toBe('none');
    expect(exceeded.projectedHistoryLimitAt).toBe('2026-10-11T00:00:00.000Z');
    // DB 全体が上限に届いても exceeded。
    expect(evaluateMonitor([sample('2026-10-11T00:00:00Z', 10, 1024)]).status).toBe('exceeded');
  });
  it('閾値は差し替えられる', () => {
    const result = evaluateMonitor([sample('2026-10-11T00:00:00Z', 60)], {
      ...CANDIDATE_THRESHOLDS,
      historyWarnBytes: 50 * MIB,
      historyLimitBytes: 100 * MIB,
    });
    expect(result.status).toBe('warning');
    expect(() => evaluateMonitor([sample('2026-10-11T00:00:00Z', 60)], { ...CANDIDATE_THRESHOLDS, historyWarnBytes: 300 * MIB })).toThrow(
      RangeError,
    );
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
    expect(evaluateMonitor([sample('2026-10-01T00:00:00Z', 10, 20, { relations: {} })]).status).toBe('measurement-failed');
    const broken = sample('2026-10-01T00:00:00Z', 10);
    broken.relations.document_versions.totalBytes += 1;
    expect(evaluateMonitor([broken]).problems).toContain('document_versions の内訳の和が総量と合わない');
  });
  it('時刻が逆順の観測は失敗にする', () => {
    expect(evaluateMonitor([sample('2026-10-11T00:00:00Z', 20), sample('2026-10-01T00:00:00Z', 10)]).status).toBe(
      'measurement-failed',
    );
  });
  it('途中の読めない観測は外して問題に残す。1日未満の観測では増え方を 0 と言わず未測定にする', () => {
    const result = evaluateMonitor([sample('2026-10-01T00:00:00Z', 10), { measuredAt: 'x' }, sample('2026-10-01T06:00:00Z', 11)]);
    expect(result.status).toBe('normal');
    expect(result.historyGrowthBytesPerDay).toBeNull();
    expect(result.projectedHistoryLimitAt).toBeNull();
    expect(result.problems.some((problem) => problem.startsWith('観測2を'))).toBe(true);
    expect(result.problems).toContain('増え方は未測定（1日以上離れた観測が2点以上要る）');
  });
  it('減っている・横ばいなら届く日を出さない', () => {
    const result = evaluateMonitor([sample('2026-10-01T00:00:00Z', 20), sample('2026-10-11T00:00:00Z', 20)]);
    expect(result.historyGrowthBytesPerDay).toBe(0);
    expect(result.projectedHistoryLimitAt).toBeNull();
  });
});

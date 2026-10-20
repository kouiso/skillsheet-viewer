import { describe, expect, it } from 'vitest';
import { parseMeasurementReport } from '../src/db/history-capacity-input';
import { POLICY_OPTIONS, renderComparison } from './history-retention-compare';

function size(versionCount: number, totalBytes: number) {
  return {
    versionCount,
    blocksStoredBytes: 0,
    blocksLogicalBytes: 0,
    relations: { document_versions: { heapBytes: 0, toastBytes: totalBytes, indexBytes: 0, totalBytes } },
  };
}
const report = parseMeasurementReport({
  tool: 'measure-document-history',
  kind: 'synthetic-local-postgres',
  gitSha: '0123456789abcdef',
  gitDirty: false,
  command: './script/measure-document-history.sh',
  startedAt: '2026-10-20T00:00:00Z',
  finishedAt: '2026-10-20T00:01:00Z',
  environment: { os: 'test', postgres: '16', autovacuum: 'off' },
  samples: {},
  scenarios: [
    {
      name: 'burst-large',
      payloadTargetBytes: [95_000],
      attempts: 10,
      accepted: 10,
      errors: 0,
      failureRate: 0,
      lockWaits: 0,
      walBytes: 0,
      versionsAdded: 10,
      latencyMs: { samples: 10, min: 1, p50: 1, p95: 1, max: 1 },
      sizeBefore: size(1, 0),
      sizeAfterWrite: size(11, 2_000_000),
      sizeAfterCompact: size(11, 1_000_000),
    },
  ],
});

describe('保持案の比較表', () => {
  it('全負荷 × 全案を1表に並べ、全版保持が最も大きい', () => {
    const text = renderComparison(report);
    const rows = text.split('\n').filter((line) => /^\| (low|normal|high|reported-pace) \|/.test(line));
    expect(rows).toHaveLength(4 * POLICY_OPTIONS.length);
    const high = rows.filter((line) => line.startsWith('| high |')).map((line) => Number(line.split('|')[4]));
    expect(Math.max(...high)).toBe(high[0]);
    expect(text).toContain('結果はすべて外挿');
  });
});

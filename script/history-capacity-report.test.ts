import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseMeasurementReport, perVersionFromScenario } from '../src/db/history-capacity-input';
import {
  DOC_BLOCK_BEGIN,
  DOC_BLOCK_END,
  parseArgs,
  renderCapacityReport,
  renderModelSections,
} from './history-capacity-report';

function size(versionCount: number, totalBytes: number, storedBytes: number, logicalBytes: number) {
  return {
    versionCount,
    blocksStoredBytes: storedBytes,
    blocksLogicalBytes: logicalBytes,
    relations: { document_versions: { heapBytes: 0, toastBytes: totalBytes, indexBytes: 0, totalBytes } },
  };
}
function scenario(name: string, payloadTargetBytes: number[], added: number, compactPerVersion: number) {
  return {
    name,
    payloadTargetBytes,
    attempts: added,
    accepted: added,
    errors: 0,
    failureRate: 0,
    lockWaits: 0,
    walBytes: added * 3 * compactPerVersion,
    versionsAdded: added,
    latencyMs: { samples: added, min: 1, p50: 2, p95: 5, max: 9 },
    sizeBefore: size(4, 1_000_000, 0, 0),
    sizeAfterWrite: size(4 + added, 1_000_000 + added * 2 * compactPerVersion, added * 90_000, added * 100_000),
    sizeAfterCompact: size(4 + added, 1_000_000 + added * compactPerVersion, added * 90_000, added * 100_000),
  };
}
const report = {
  tool: 'measure-document-history',
  kind: 'synthetic-local-postgres',
  gitSha: '0123456789abcdef',
  gitDirty: false,
  command: './script/measure-document-history.sh',
  startedAt: '2026-10-20T00:00:00Z',
  finishedAt: '2026-10-20T00:01:00Z',
  environment: { os: 'test', postgres: '16', autovacuum: 'off' },
  samples: { burstSaves: 10 },
  scenarios: [
    scenario('burst-small', [33_000], 10, 40_000),
    scenario('burst-large', [95_000], 10, 100_000),
    scenario('normal-parallel', [33_000, 95_000], 4, 70_000),
  ],
};

describe('容量レポート', () => {
  it('計測 report から1版の容量・WAL・圧縮率を出す', () => {
    const [, largeScenario, mixedScenario] = parseMeasurementReport(report).scenarios;
    if (!largeScenario || !mixedScenario) throw new Error('fixture scenarios missing');
    const large = perVersionFromScenario(largeScenario);
    expect(large).toMatchObject({
      compactBytesPerVersion: 100_000,
      writtenBytesPerVersion: 200_000,
      walBytesPerVersion: 300_000,
    });
    expect(large?.storedToLogicalRatio).toBeCloseTo(0.9);
    // 複数サイズが混ざる scenario から1版の容量を作らない。
    expect(perVersionFromScenario(mixedScenario)).toBeNull();
  });
  it('実測・既存報告・仮定・外挿を別の欄に分けて出し、未測定を明記する', () => {
    const text = renderCapacityReport(parseMeasurementReport(report), 36);
    expect(text).toContain('## 実測（合成・ローカル PostgreSQL）');
    expect(text).toContain('## 既存報告（現在の実測ではない）');
    expect(text).toContain('入力は仮定、結果は外挿');
    expect(text).toContain('入力は外挿、結果は外挿');
    expect(text).toContain('単点で、継続観測の保存頻度ではない');
    expect(text).toContain('## 未測定');
    expect(text).toContain('Neon 本番の実測ではない');
    // 1版は大きい本文側（100KB）を基準にする。
    expect(text).toContain('1版 100.0 KB');
    expect(text).toContain('上限を MB で数えた場合');
  });
  it('感度分析に段階的間引き（30日・7日）の月次版の累積と、WAL・PITR の行を含める', () => {
    const text = renderCapacityReport(parseMeasurementReport(report), 36);
    expect(text).toContain('## 保持案ごとの比較（月次版の累積を含む）');
    expect(text).toContain('| normal | tiered-30-365 |');
    expect(text).toContain('| normal | tiered-7-365 |');
    expect(text).toContain('保持案 tiered-30-365（月次版の累積込み）');
    expect(text).toContain('保持案 tiered-7-365（月次版の累積込み）');
    expect(text).toContain('### 10/14 の重い月を1版の大きさ別に再計算');
    expect(text).toContain('## WAL と PITR の保持');
    expect(text).toContain('branch_logical_size_limit');
    expect(text).toContain('https://neon.com/docs/postgres/backup-restore/history-window');
    expect(text).toContain('WAL（PITR 1日分）も上限に数えた場合');
    // 感度分析の表は区分を独立した列に持つ。
    expect(text).toContain('| 変えた前提 | 区分 | 月間増分 | 36か月後の履歴 | 上限到達 |');
  });
  it('--policy で月間モデルと感度分析の保持案を切り替える', () => {
    const text = renderCapacityReport(parseMeasurementReport(report), 36, 'tiered-30-365');
    expect(text).toContain('## 月間モデル（保持案: 30日全版→365日まで1日1版→以降1か月1版');
    expect(text).toContain('保持案は 30日全版→365日まで1日1版→以降1か月1版。');
  });
  it('文書の容量表は生成結果そのもので、手で直した差分が無い', () => {
    const doc = readFileSync(new URL('../doc/document-history-capacity.md', import.meta.url), 'utf8');
    const begin = doc.indexOf(DOC_BLOCK_BEGIN);
    const end = doc.indexOf(DOC_BLOCK_END);
    expect(begin).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(begin);
    const embedded = doc.slice(begin + DOC_BLOCK_BEGIN.length, end).trim();
    const fixture = parseMeasurementReport(
      JSON.parse(readFileSync(new URL('./fixture/history-measure-report.json', import.meta.url), 'utf8')),
    );
    expect(embedded).toBe(renderModelSections(fixture, 36));
  });
  it('形の合わない report を推測で埋めず拒否する', () => {
    expect(() => parseMeasurementReport({ ...report, tool: 'other' })).toThrow('MEASUREMENT_REPORT_INVALID');
    expect(() => parseMeasurementReport({ ...report, scenarios: [{ name: 'x' }] })).toThrow(
      'MEASUREMENT_REPORT_INVALID',
    );
    const broken = structuredClone(report);
    (broken.scenarios[0] as { sizeAfterCompact: unknown }).sizeAfterCompact = { relations: {} };
    expect(() => parseMeasurementReport(broken)).toThrow('MEASUREMENT_REPORT_INVALID');
  });
  it('引数は明示したものだけ受ける', () => {
    expect(parseArgs(['--measurement', 'r.json'])).toEqual({ measurement: 'r.json', months: 36, policy: 'keep-all' });
    expect(parseArgs(['--measurement', 'r.json', '--policy', 'tiered-7-365']).policy).toBe('tiered-7-365');
    expect(() => parseArgs([])).toThrow('MEASUREMENT_REQUIRED');
    expect(() => parseArgs(['--measurement', 'r.json', '--apply'])).toThrow('UNKNOWN_ARGUMENT');
    expect(() => parseArgs(['--measurement', 'r.json', '--months', '0'])).toThrow('INVALID_MONTHS');
    // 12か月後の列を出すので、12か月未満は受けない。
    expect(() => parseArgs(['--measurement', 'r.json', '--months', '11'])).toThrow('INVALID_MONTHS');
    expect(() => parseArgs(['--measurement', 'r.json', '--policy', 'delete-all'])).toThrow('INVALID_POLICY');
    expect(() => parseArgs(['--measurement', 'r.json', '--policy'])).toThrow('INVALID_POLICY');
  });
});

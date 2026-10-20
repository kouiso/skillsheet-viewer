import { describe, expect, it } from 'vitest';
import { MIB } from '../src/db/history-capacity-model';
import { evaluateMonitor } from '../src/db/history-capacity-monitor';
import { exitCode, parseArgs, readSample } from './history-capacity-monitor';

describe('監視 CLI', () => {
  it('観測は必須で、閾値は MiB で差し替えられる', () => {
    expect(() => parseArgs([])).toThrow('SAMPLE_REQUIRED');
    expect(() => parseArgs(['--sample'])).toThrow('INVALID_VALUE');
    expect(() => parseArgs(['--sample', 'a.json', '--warn-mib', '0'])).toThrow('INVALID_VALUE');
    expect(() => parseArgs(['--sample', 'a.json', '--delete'])).toThrow('UNKNOWN_ARGUMENT');
    const args = parseArgs(['--sample', 'a.json', '--sample', 'b.json', '--warn-mib', '50', '--limit-mib', '100']);
    expect(args.samples).toEqual(['a.json', 'b.json']);
    expect(args.thresholds.historyWarnBytes).toBe(50 * MIB);
    expect(args.thresholds.historyLimitBytes).toBe(100 * MIB);
    expect(args.thresholds.approval).toBe('unapproved-candidate');
  });
  it('読めないファイルは失敗した観測として扱い、終了コードで知らせる', () => {
    const missing = readSample('missing.json', () => {
      throw new Error('ENOENT');
    });
    const result = evaluateMonitor([missing]);
    expect(result.status).toBe('measurement-failed');
    expect(exitCode(result)).toBe(4);
    expect(readSample('x.json', () => '{"a":1}')).toEqual({ a: 1 });
  });
});

import { describe, expect, it } from 'vitest';
import { executePruneDocumentHistory, parsePruneDocumentHistoryArgs } from './prune-document-history';

describe('保存期限処理の引数', () => {
  it('既定は dry-run で --apply の時だけ削除側になる', () => {
    expect(parsePruneDocumentHistoryArgs([]).apply).toBe(false);
    expect(parsePruneDocumentHistoryArgs(['--apply']).apply).toBe(true);
  });
  it('--now は検証用の基準時刻を受け取り、不正な値と未知の引数を拒否する', () => {
    expect(parsePruneDocumentHistoryArgs(['--now', '2026-10-15T00:00:00+09:00']).now.toISOString()).toBe(
      '2026-10-14T15:00:00.000Z',
    );
    for (const args of [
      ['--now'],
      ['--now', 'not-a-date'],
      ['--apply', '--apply'],
      ['--now', '2026-10-15T00:00:00+09:00', '--now', '2026-10-16T00:00:00+09:00'],
      ['--yes'],
      ['apply'],
    ]) {
      expect(() => parsePruneDocumentHistoryArgs(args)).toThrow();
    }
  });
});

describe('保存期限処理の実行', () => {
  it('DATABASE_URL が無ければ接続前に止まる', async () => {
    await expect(executePruneDocumentHistory([], undefined)).rejects.toThrow('DATABASE_URL_REQUIRED');
    await expect(executePruneDocumentHistory(['--apply'], undefined)).rejects.toThrow('DATABASE_URL_REQUIRED');
  });
});

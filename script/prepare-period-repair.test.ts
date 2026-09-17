import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { parseRepairArgs, preparePeriodRepair } from './prepare-period-repair';

const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
describe('修復dry-runの明示対象', () => {
  it('明示UUIDと絶対出力先を受け入れる', () => {
    expect(parseRepairArgs(['--sheet-id', id, '--out', '/private/proposal.json'])).toEqual({
      sheetId: id,
      out: '/private/proposal.json',
    });
  });
  it.each(
    (
      [
        [],
        ['--out', '/private/proposal.json'],
        ['--sheet-id', 'default', '--out', '/private/p.json'],
        ['--sheet-id', id, '--out', 'relative.json'],
        ['--sheet-id', id, '--out', '/private/p.json', '--write', 'true'],
        ['--sheet-id', id, '--sheet-id', id, '--out', '/private/p.json'],
      ] as string[][]
    ).map((args) => ({ args })),
  )('曖昧・書込指定・重複の引数を拒否する: %j', ({ args }) => {
    expect(() => parseRepairArgs(args)).toThrow();
  });
});

describe('修復dry-runの読取と保存', () => {
  it('明示IDの取得結果を未承認案として保存する', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'repair-cli-'));
    try {
      const out = join(directory, 'proposal.json');
      const read = vi.fn().mockResolvedValue({
        status: 'OK',
        snapshot: {
          sheetId: id,
          title: '合成',
          revision: '9',
          blocks: [],
          validation: { editable: true, issues: [] },
        },
      });
      expect(await preparePeriodRepair({ read }, 'owner-a', id, out)).toEqual({
        approved: false,
        changes: 0,
        remainingIssues: 0,
      });
      expect(read).toHaveBeenCalledExactlyOnceWith(id);
      expect(JSON.parse(readFileSync(out, 'utf8'))).toMatchObject({
        owner: 'owner-a',
        sheetId: id,
        expectedRevision: '9',
        approved: false,
      });
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
  it.each(['NOT_FOUND', 'EMPTY', 'INVALID_STATE'])('読取結果%sならファイルを作らない', async (status) => {
    const directory = mkdtempSync(join(tmpdir(), 'repair-cli-'));
    try {
      const out = join(directory, 'proposal.json');
      const read = vi.fn().mockResolvedValue({ status });
      await expect(preparePeriodRepair({ read }, 'owner-a', id, out)).rejects.toThrow('DOCUMENT_UNAVAILABLE');
      expect(existsSync(out)).toBe(false);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});

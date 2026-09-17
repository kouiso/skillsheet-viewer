import { execFileSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { PeriodRepairProposal } from './period-repair-proposal';
import { persistRepairProposal, readPrivateRepairRecord } from './repair-proposal-file';

const directories: string[] = [];
const setup = () => {
  const dir = mkdtempSync(join(tmpdir(), 'repair-test-'));
  directories.push(dir);
  return join(dir, 'proposal.json');
};
const proposal: PeriodRepairProposal = {
  version: 1,
  approved: false,
  owner: 'owner-a',
  sheetId: 'sheet',
  expectedRevision: '1',
  beforeHash: 'before',
  afterHash: 'after',
  changes: [],
  blocks: [],
  remainingIssues: [],
};
afterEach(() =>
  directories.splice(0).forEach((dir) => {
    rmSync(dir, { recursive: true, force: true });
  }),
);
describe('未承認修復案の非公開保存', () => {
  it('固定した記録だけを読み、公開ファイル・壊れたJSON・重複キー・symlinkを拒否する', () => {
    const path = setup();
    persistRepairProposal(path, proposal);
    expect(readPrivateRepairRecord(path)).toEqual(proposal);
    chmodSync(path, 0o644);
    expect(() => readPrivateRepairRecord(path)).toThrow('PRIVATE_FILE_REQUIRED');
    chmodSync(path, 0o600);
    for (const body of ['{', '{"a":1,"a":2}', '{ "a": 1 }']) {
      writeFileSync(path, body);
      expect(() => readPrivateRepairRecord(path)).toThrow();
    }
    rmSync(path);
    symlinkSync('missing', path);
    expect(() => readPrivateRepairRecord(path)).toThrow();
  });
  it('同一案の再保存は許可し、別案の上書きは拒否する', () => {
    const path = setup();
    persistRepairProposal(path, proposal);
    const before = readFileSync(path, 'utf8');
    expect(statSync(path).mode & 0o777).toBe(0o600);
    persistRepairProposal(path, proposal);
    expect(() => persistRepairProposal(path, { ...proposal, owner: 'owner-b' })).toThrow('PROPOSAL_FILE_CONFLICT');
    expect(readFileSync(path, 'utf8')).toBe(before);
  });
  it('既存FIFOは書き手を待たず拒否する', () => {
    const path = setup();
    execFileSync('mkfifo', ['-m', '600', path]);
    // 同期openの停止はテストランナーのtimeoutでは止まらないため、子processで期限を設ける。
    const output = execFileSync(
      process.execPath,
      [
        '--import',
        'tsx',
        '--input-type=module',
        '-e',
        `import { persistPrivateRepairRecord } from './script/repair-proposal-file.ts';
         try { persistPrivateRepairRecord(process.argv[1], {}); process.exitCode = 1; }
         catch (error) {
           if (error.message !== 'PRIVATE_FILE_REQUIRED') throw error;
           console.log('rejected');
         }`,
        path,
      ],
      { cwd: process.cwd(), timeout: 5000, encoding: 'utf8' },
    );
    expect(output.trim()).toBe('rejected');
  });
  it('公開権限のディレクトリやsymlinkの既存ファイルへ書き込まない', () => {
    const path = setup();
    chmodSync(join(path, '..'), 0o755);
    expect(() => persistRepairProposal(path, proposal)).toThrow('PRIVATE_DIRECTORY_REQUIRED');
    chmodSync(join(path, '..'), 0o700);
    symlinkSync('missing-target', path);
    expect(() => persistRepairProposal(path, proposal)).toThrow();
  });
});

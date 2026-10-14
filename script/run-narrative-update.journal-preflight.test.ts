import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const SHEET = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
  applyNarrativeUpdate: vi.fn(),
  persistPrivateRepairRecord: vi.fn(),
}));

vi.mock('../src/db/client', () => ({
  createDb: () => ({ execute: mocks.execute, $client: { end: async () => {} } }),
}));
vi.mock('../src/db/document-service', () => ({
  createDocumentService: () => ({
    read: async () => ({ status: 'OK', snapshot: { sheetId: SHEET, revision: '1', title: 't', blocks: [] } }),
  }),
}));
vi.mock('./apply-narrative', () => ({ applyNarrativeUpdate: mocks.applyNarrativeUpdate }));
vi.mock('./repair-proposal-file', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./repair-proposal-file')>()),
  persistPrivateRepairRecord: mocks.persistPrivateRepairRecord,
  readPrivateRepairRecord: (file: string) => {
    const name = path.basename(file);
    if (name === 'proposal.json')
      return {
        sheetId: SHEET,
        expectedRevision: '1',
        beforeHash: 'b'.repeat(64),
        afterHash: 'a'.repeat(64),
        changes: [],
        blocks: [],
      };
    if (name === 'before.json') return { owner: 'owner-a', snapshot: { sheetId: SHEET, blocks: [] } };
    if (name === 'db-applied.json') return { revision: '1', beforeHash: 'b'.repeat(64), afterHash: 'a'.repeat(64) };
    return {};
  },
}));

const { executeNarrativeCommand } = await import('./run-narrative-update');

const directories: string[] = [];
let dir: string;
beforeEach(() => {
  vi.clearAllMocks();
  dir = mkdtempSync(path.join(tmpdir(), 'narrative-preflight-'));
  directories.push(dir);
  chmodSync(dir, 0o700);
  // 承認後に壊れた journal（canonical JSON でない行）
  writeFileSync(path.join(dir, 'journal.jsonl'), '{"broken": true}\n', { mode: 0o600 });
});
afterEach(() => {
  for (const d of directories.splice(0)) rmSync(d, { recursive: true });
});

const itLinux = it.skipIf(process.platform !== 'linux');
const args = (action: string) => ['--action', action, '--journal', dir, '--owner', 'owner-a', '--sheet-id', SHEET];

describe('DB を書き換える前の journal 検証', () => {
  itLinux('apply は壊れた journal を DB 更新より前に拒否する', async () => {
    await expect(executeNarrativeCommand(args('apply'), 'postgres://unused')).rejects.toThrow('INVALID_JOURNAL_ENTRY');
    expect(mocks.applyNarrativeUpdate).not.toHaveBeenCalled();
    expect(mocks.persistPrivateRepairRecord).not.toHaveBeenCalled();
  });

  itLinux('revert も壊れた journal を DB 更新より前に拒否する', async () => {
    await expect(executeNarrativeCommand(args('revert'), 'postgres://unused')).rejects.toThrow('INVALID_JOURNAL_ENTRY');
    expect(mocks.execute).not.toHaveBeenCalled();
  });
});

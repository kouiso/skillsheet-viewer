import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

// /proc が無い・見えない環境を、fd 経由の open が ENOENT を返す状態として再現する。
vi.mock('./repair-proposal-file', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./repair-proposal-file')>()),
  readPrivateRepairText: () => {
    throw Object.assign(new Error('ENOENT: /proc/self/fd'), { code: 'ENOENT' });
  },
}));

const { readNarrativeJournal } = await import('./narrative-journal');

const directories: string[] = [];
afterEach(() => {
  for (const d of directories.splice(0)) rmSync(d, { recursive: true });
});

const itLinux = it.skipIf(process.platform !== 'linux');

describe('procfs が使えないときの journal 読取', () => {
  itLinux('journal が存在するのに fd 経由で開けない場合は「記録なし」にせず失敗する', () => {
    const d = mkdtempSync(path.join(tmpdir(), 'journal-procfs-'));
    directories.push(d);
    chmodSync(d, 0o700);
    const file = path.join(d, 'journal.jsonl');
    writeFileSync(file, '', { mode: 0o600 });
    expect(() => readNarrativeJournal(file)).toThrow('ENOENT');
  });

  itLinux('journal が本当に無い場合だけ空として扱う', () => {
    const d = mkdtempSync(path.join(tmpdir(), 'journal-procfs-'));
    directories.push(d);
    chmodSync(d, 0o700);
    expect(readNarrativeJournal(path.join(d, 'journal.jsonl'))).toEqual([]);
  });
});

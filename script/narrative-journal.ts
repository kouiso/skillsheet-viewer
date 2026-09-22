/**
 * 本文更新の状態遷移を私有領域へ追記するappend-only journal。
 * repair-proposal-file と同じく、所有者本人だけが読める既存ディレクトリへしか書かない。
 * 1行=1イベントのcanonical JSONで、 approved / db-applied / sync-pending / synced / reverted
 * を時系列に残す。追記しかしないので中断後も先行イベントを壊さない。
 */
import { closeSync, constants, existsSync, fstatSync, fsyncSync, openSync, readFileSync, writeSync } from 'node:fs';
import { basename, dirname } from 'node:path';
import { canonicalJson } from '../src/db/document-contract';

export type NarrativeJournalState = 'approved' | 'db-applied' | 'sync-pending' | 'synced' | 'reverted';

export interface NarrativeJournalEntry {
  version: 1;
  state: NarrativeJournalState;
  owner: string;
  sheetId: string;
  expectedRevision: string;
  beforeHash: string;
  afterHash: string;
  /** 状態の対象となったchange一覧（blockId+targetId+field）。 */
  changeIds: string[];
  at: string;
}

export function narrativeChangeId(change: { blockId: string; targetId: string; field: string }): string {
  return `${change.blockId}:${change.targetId}:${change.field}`;
}

export function appendNarrativeJournal(path: string, entry: NarrativeJournalEntry): void {
  const dir = openSync(dirname(path), constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
  try {
    const stat = fstatSync(dir);
    if ((stat.mode & 0o077) !== 0 || (process.getuid && stat.uid !== process.getuid())) {
      throw new Error('PRIVATE_DIRECTORY_REQUIRED');
    }
    const target = `/proc/self/fd/${dir}/${basename(path)}`;
    const fd = openSync(
      target,
      constants.O_WRONLY | constants.O_CREAT | constants.O_APPEND | constants.O_NOFOLLOW,
      0o600,
    );
    try {
      const file = fstatSync(fd);
      if (!file.isFile() || (file.mode & 0o077) !== 0 || (process.getuid && file.uid !== process.getuid())) {
        throw new Error('PRIVATE_FILE_REQUIRED');
      }
      writeSync(fd, `${canonicalJson(entry)}\n`);
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    fsyncSync(dir);
  } finally {
    closeSync(dir);
  }
}

export function readNarrativeJournal(path: string): NarrativeJournalEntry[] {
  if (!existsSync(path)) return [];
  const body = readFileSync(path, 'utf8');
  return body
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line) => {
      const entry: unknown = JSON.parse(line);
      if (canonicalJson(entry) !== line) throw new Error('INVALID_JOURNAL_ENTRY');
      return entry as NarrativeJournalEntry;
    });
}

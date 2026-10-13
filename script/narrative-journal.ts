/**
 * 本文更新の状態遷移を私有領域へ追記するappend-only journal。
 * repair-proposal-file と同じく、所有者本人だけが読める既存ディレクトリへしか書かない。
 * 1行=1イベントのcanonical JSONで、 approved / db-applied / sync-pending / synced / reverted
 * を時系列に残す。追記しかしないので中断後も先行イベントを壊さない。
 */
import { isUtf8 } from 'node:buffer';
import { closeSync, constants, fstatSync, fsyncSync, openSync, readFileSync, writeSync } from 'node:fs';
import { basename, dirname } from 'node:path';
import { canonicalJson, isRevision } from '../src/db/document-contract';

import { readPrivateRepairText } from './repair-proposal-file';

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
  validateNarrativeJournalEntry(entry);
  const dir = openSync(dirname(path), constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
  try {
    const stat = fstatSync(dir);
    if ((stat.mode & 0o077) !== 0 || (process.getuid && stat.uid !== process.getuid())) {
      throw new Error('PRIVATE_DIRECTORY_REQUIRED');
    }
    const target = `/proc/self/fd/${dir}/${basename(path)}`;
    const fd = openSync(
      target,
      constants.O_RDWR | constants.O_CREAT | constants.O_APPEND | constants.O_NOFOLLOW | constants.O_NONBLOCK,
      0o600,
    );
    try {
      const file = fstatSync(fd);
      if (!file.isFile() || (file.mode & 0o077) !== 0 || (process.getuid && file.uid !== process.getuid())) {
        throw new Error('PRIVATE_FILE_REQUIRED');
      }
      // 中断で途切れた行に新しいJSONを連結しない。既存記録は修復を推測せず拒否する。
      const raw = readFileSync(fd);
      if (!isUtf8(raw)) throw new Error('INVALID_JOURNAL_ENTRY');
      parseNarrativeJournal(raw.toString('utf8'));
      const bytes = Buffer.from(`${canonicalJson(entry)}\n`);
      if (writeSync(fd, bytes) !== bytes.length) throw new Error('INCOMPLETE_JOURNAL_WRITE');
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    fsyncSync(dir);
  } finally {
    closeSync(dir);
  }
}

/** 型assertionではなく保存記録の全項目を検証する。 */
export function validateNarrativeJournalEntry(value: unknown): asserts value is NarrativeJournalEntry {
  const fail = () => {
    throw new Error('INVALID_JOURNAL_ENTRY');
  };
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail();
  const v = value as Record<string, unknown>;
  const keys = [
    'version',
    'state',
    'owner',
    'sheetId',
    'expectedRevision',
    'beforeHash',
    'afterHash',
    'changeIds',
    'at',
  ];
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const hash = /^[0-9a-f]{64}$/;
  if (
    Object.keys(v).length !== keys.length ||
    !keys.every((key) => Object.hasOwn(v, key)) ||
    v.version !== 1 ||
    typeof v.state !== 'string' ||
    !['approved', 'db-applied', 'sync-pending', 'synced', 'reverted'].includes(String(v.state)) ||
    typeof v.owner !== 'string' ||
    !v.owner.trim() ||
    v.owner !== v.owner.trim() ||
    typeof v.sheetId !== 'string' ||
    !uuid.test(v.sheetId) ||
    !isRevision(v.expectedRevision) ||
    typeof v.beforeHash !== 'string' ||
    !hash.test(v.beforeHash) ||
    typeof v.afterHash !== 'string' ||
    !hash.test(v.afterHash) ||
    !Array.isArray(v.changeIds) ||
    !v.changeIds.every((id) => typeof id === 'string' && /^[^:]+:[^:]+:[^:]+$/.test(id)) ||
    new Set(v.changeIds).size !== v.changeIds.length ||
    typeof v.at !== 'string'
  )
    return fail();
  const timestamp = new Date(v.at as string);
  if (!Number.isFinite(timestamp.getTime()) || timestamp.toISOString() !== v.at) fail();
}

/** 途中で切れた最終行も拒否する。欠落を「記録なし」と読み替えない。 */
export function parseNarrativeJournal(body: string): NarrativeJournalEntry[] {
  if (body && !body.endsWith('\n')) throw new Error('INVALID_JOURNAL_ENTRY');
  if (!body) return [];
  return body
    .slice(0, -1)
    .split('\n')
    .map((line) => {
      let value: unknown;
      try {
        value = JSON.parse(line);
      } catch {
        throw new Error('INVALID_JOURNAL_ENTRY');
      }
      validateNarrativeJournalEntry(value);
      if (canonicalJson(value) !== line) throw new Error('INVALID_JOURNAL_ENTRY');
      return value;
    });
}

export function readNarrativeJournal(path: string): NarrativeJournalEntry[] {
  if (process.platform !== 'linux') throw new Error('LINUX_PRIVATE_RECORD_REQUIRED');
  let body: string;
  try {
    body = readPrivateRepairText(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
  return parseNarrativeJournal(body);
}

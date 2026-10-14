import { chmodSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { canonicalJson } from '../src/db/document-contract';
import {
  appendNarrativeJournal,
  type NarrativeJournalEntry,
  narrativeChangeId,
  parseNarrativeJournal,
  readNarrativeJournal,
  validateNarrativeJournalEntry,
} from './narrative-journal';

const entry = (state: NarrativeJournalEntry['state']): NarrativeJournalEntry => ({
  version: 1,
  state,
  owner: 'owner-a',
  sheetId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  expectedRevision: '42',
  beforeHash: 'b'.repeat(64),
  afterHash: 'a'.repeat(64),
  changeIds: ['bbbb:dddd:duties'],
  at: '2026-09-17T00:00:00.000Z',
});

const directories: string[] = [];
afterEach(() => {
  for (const d of directories.splice(0)) rmSync(d, { recursive: true });
});

function dir(): string {
  const d = mkdtempSync(path.join(tmpdir(), 'journal-'));
  directories.push(d);
  return d;
}

// appendNarrativeJournal は /proc/self/fd 経由の Linux 専用なので、その経路のテストだけ skip。
const itLinux = it.skipIf(process.platform !== 'linux');

describe('append-only journal', () => {
  itLinux('状態遷移を時系列で追記・読み戻す', () => {
    const file = path.join(dir(), 'journal.jsonl');
    appendNarrativeJournal(file, entry('approved'));
    appendNarrativeJournal(file, entry('db-applied'));
    appendNarrativeJournal(file, entry('sync-pending'));
    const states = readNarrativeJournal(file).map((e) => e.state);
    expect(states).toEqual(['approved', 'db-applied', 'sync-pending']);
    // 追記専用: 既存行はそのまま残る
    expect(readFileSync(file, 'utf8').trim().split('\n')).toHaveLength(3);
  });

  it('非canonicalな行は読み戻しで拒否する', () => {
    const file = path.join(dir(), 'journal.jsonl');
    writeFileSync(file, '{ "state": "approved" }\n'); // 整形済みJSONでなくかつcanonicalでない
    expect(() => parseNarrativeJournal(readFileSync(file, 'utf8'))).toThrow('INVALID_JOURNAL_ENTRY');
  });

  itLinux('未作成なら空を返す', () => {
    expect(readNarrativeJournal(path.join(dir(), 'journal.jsonl'))).toEqual([]);
  });

  it('changeIdはblock+target+fieldで一意', () => {
    expect(narrativeChangeId({ blockId: 'b', targetId: 't', field: 'f' })).toBe('b:t:f');
  });
});

describe('journalの型と読取境界', () => {
  it.each([
    null,
    {},
    { ...entry('approved'), state: 'future' },
    { ...entry('approved'), state: ['approved'] },
    { ...entry('approved'), owner: ' ' },
    { ...entry('approved'), expectedRevision: '01' },
    { ...entry('approved'), sheetId: 'invalid' },
    { ...entry('approved'), beforeHash: 'invalid' },
    { ...entry('approved'), at: 'invalid' },
    { ...entry('approved'), changeIds: ['a'] },
    { ...entry('approved'), changeIds: ['a:b:c', 'a:b:c'] },
    { ...entry('approved'), extra: true },
  ])('canonical JSONでも不正な記録を拒否する %j', (value) => {
    expect(() => parseNarrativeJournal(`${canonicalJson(value)}\n`)).toThrow('INVALID_JOURNAL_ENTRY');
  });
  it('正常行を読むが途中行と空行を拒否する', () => {
    const row = canonicalJson(entry('approved'));
    expect(parseNarrativeJournal(`${row}\n`)).toEqual([entry('approved')]);
    expect(() => parseNarrativeJournal(row)).toThrow('INVALID_JOURNAL_ENTRY');
    expect(() => parseNarrativeJournal(`${row}\n\n`)).toThrow('INVALID_JOURNAL_ENTRY');
    expect(() => validateNarrativeJournalEntry({})).toThrow('INVALID_JOURNAL_ENTRY');
  });
  itLinux('途中行が残ったjournalへ追記せず元のbyte列を保つ', () => {
    const target = path.join(dir(), 'journal.jsonl');
    const broken = `${canonicalJson(entry('approved'))}\n{"version":`;
    writeFileSync(target, broken, { mode: 0o600 });
    expect(() => appendNarrativeJournal(target, entry('db-applied'))).toThrow('INVALID_JOURNAL_ENTRY');
    expect(readFileSync(target, 'utf8')).toBe(broken);
  });
  itLinux.each([
    { invalid: [0xff] },
    { invalid: [0xc0, 0xaf] },
    { invalid: [0xed, 0xa0, 0x80] },
    { invalid: [0xe2, 0x82] },
  ])('不正UTF-8を読取・追記で拒否して元bytesを保つ %j', ({ invalid }) => {
    const target = path.join(dir(), 'journal.jsonl');
    const row = canonicalJson({ ...entry('approved'), owner: 'BYTE_MARKER' });
    const [prefix, suffix] = row.split('BYTE_MARKER');
    const raw = Buffer.concat([Buffer.from(prefix), Buffer.from(invalid), Buffer.from(`${suffix}\n`)]);
    writeFileSync(target, raw, { mode: 0o600 });
    expect(() => readNarrativeJournal(target)).toThrow('INVALID_REPAIR_RECORD');
    expect(() => appendNarrativeJournal(target, entry('db-applied'))).toThrow('INVALID_JOURNAL_ENTRY');
    expect(readFileSync(target)).toEqual(raw);
  });
  itLinux('正しいUTF-8の日本語と置換文字は変更せず読む', () => {
    const target = path.join(dir(), 'journal.jsonl');
    const value = { ...entry('approved'), owner: '合成所有者�' };
    appendNarrativeJournal(target, value);
    expect(readNarrativeJournal(target)).toEqual([value]);
    expect(readFileSync(target)).toEqual(Buffer.from(`${canonicalJson(value)}\n`));
  });
  itLinux('公開ファイルとsymlinkを読まず拒否する', () => {
    const directory = dir();
    const target = path.join(directory, 'journal.jsonl');
    writeFileSync(target, `${canonicalJson(entry('approved'))}\n`, { mode: 0o644 });
    expect(() => readNarrativeJournal(target)).toThrow('PRIVATE_FILE_REQUIRED');
    chmodSync(target, 0o600);
    const link = path.join(directory, 'link.jsonl');
    symlinkSync(target, link);
    expect(() => readNarrativeJournal(link)).toThrow();
    chmodSync(directory, 0o755);
    expect(() => readNarrativeJournal(target)).toThrow('PRIVATE_DIRECTORY_REQUIRED');
  });
  it.skipIf(process.platform === 'linux')('非Linuxで記録の存在を推測しない', () => {
    expect(() => readNarrativeJournal(path.join(dir(), 'journal.jsonl'))).toThrow('LINUX_PRIVATE_RECORD_REQUIRED');
  });
});

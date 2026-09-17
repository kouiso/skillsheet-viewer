import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  appendNarrativeJournal,
  type NarrativeJournalEntry,
  narrativeChangeId,
  readNarrativeJournal,
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

function dir(): string {
  const d = mkdtempSync(path.join(tmpdir(), 'journal-'));
  return d;
}

describe('append-only journal', () => {
  it('状態遷移を時系列で追記・読み戻す', () => {
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
    expect(() => readNarrativeJournal(file)).toThrow('INVALID_JOURNAL_ENTRY');
  });

  it('未作成なら空を返す', () => {
    expect(readNarrativeJournal(path.join(dir(), 'journal.jsonl'))).toEqual([]);
  });

  it('changeIdはblock+target+fieldで一意', () => {
    expect(narrativeChangeId({ blockId: 'b', targetId: 't', field: 'f' })).toBe('b:t:f');
  });
});

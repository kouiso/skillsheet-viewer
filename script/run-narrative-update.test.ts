import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Database } from '../src/db/client';
import { canonicalJson } from '../src/db/document-contract';
import type { DocumentSnapshot } from '../src/db/document-service';
import { loadNarrativeUpdate, narrativeAppliedRecord } from './load-narrative-update';
import { narrativeApprovalChanges, proposeNarrativeUpdate } from './narrative-proposal';
import { applyNarrative, revertNarrative } from './run-narrative-update';

const state = vi.hoisted(() => ({
  records: new Map<string, unknown>(),
  current: undefined as unknown,
  failRecord: '',
  failResponse: false,
  failJournal: false,
  partialJournal: false,
  realJournal: false,
}));
vi.mock('./repair-proposal-file', () => ({
  readPrivateRepairRecord: (path: string) => {
    const key = basename(path);
    if (!state.records.has(key)) throw new Error('MISSING_RECORD');
    return structuredClone(state.records.get(key));
  },
  persistPrivateRepairRecord: (path: string, record: unknown) => {
    const key = basename(path);
    if (state.failRecord === key) {
      state.failRecord = '';
      throw new Error('INJECTED_RECORD_FAILURE');
    }
    const previous = state.records.get(key);
    if (previous && JSON.stringify(previous) !== JSON.stringify(record)) throw new Error('PROPOSAL_FILE_CONFLICT');
    state.records.set(key, structuredClone(record));
  },
}));
vi.mock('./narrative-journal', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./narrative-journal')>();
  return {
    readNarrativeJournal: (path: string) => {
      if (state.realJournal) return actual.readNarrativeJournal(path);
      if (state.partialJournal) throw new Error('INVALID_JOURNAL_ENTRY');
      return [];
    },
    narrativeChangeId: () => 'synthetic-change',
    appendNarrativeJournal: () => {
      if (state.failJournal) {
        state.failJournal = false;
        throw new Error('INJECTED_JOURNAL_FAILURE');
      }
    },
  };
});
vi.mock('../src/db/document-service', () => ({
  createDocumentService: () => ({
    read: vi.fn(async () => ({ status: 'OK', snapshot: structuredClone(state.current) })),
  }),
  DocumentError: class extends Error {},
}));

const owner = 'synthetic-owner';
const sheetId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const directory = '/synthetic-private';
function setup() {
  const before: DocumentSnapshot = {
    sheetId,
    title: 'Synthetic',
    revision: '42',
    validation: { editable: true, issues: [] },
    blocks: [
      {
        id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        type: 'project',
        order: 0,
        data: {
          companies: [
            {
              id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
              name: 'Synthetic Company',
              kind: '自社',
              period: '2020.04 — ',
              note: '',
            },
          ],
          items: [
            {
              id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
              companyId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
              title: 'Synthetic Project',
              scope: '',
              period: '2021.01 — 2021.12',
              role: '',
              team: '',
              tech: { lang: [], fw: [], db: [], infra: [], tools: [], collab: [] },
              process: [],
              duties: 'Before',
              acquired: '',
              comment: '',
            },
          ],
        },
      },
    ],
  };
  const proposal = proposeNarrativeUpdate(owner, before, { projects: { 'Synthetic Project': { duties: 'After' } } });
  const approval = {
    version: 1,
    kind: 'narrative-update-approval',
    owner,
    sheetId,
    expectedRevision: '42',
    beforeHash: proposal.beforeHash,
    afterHash: proposal.afterHash,
    evidenceHash: proposal.evidenceHash,
    changes: narrativeApprovalChanges(proposal.changes),
  };
  state.records.set('before.json', { owner, snapshot: before });
  state.records.set('proposal.json', proposal);
  state.records.set('approved.json', approval);
  state.current = before;
  const execute = vi.fn(async () => {
    const current = state.current as DocumentSnapshot;
    state.current = {
      ...before,
      revision: (BigInt(current.revision) + 1n).toString(),
      blocks: current.revision === '42' ? proposal.blocks : before.blocks,
    };
    if (state.failResponse) {
      state.failResponse = false;
      throw new Error('INJECTED_LOST_RESPONSE');
    }
    return { rows: [{ result: { status: 'OK' } }] };
  });
  return { before, proposal, execute, db: { execute } as unknown as Pick<Database, 'execute'> };
}
beforeEach(() => {
  state.records.clear();
  state.failRecord = '';
  state.failResponse = false;
  state.failJournal = false;
  state.partialJournal = false;
  state.realJournal = false;
});

describe('narrative interruption recovery', () => {
  it('real reader rejects a canonical event whose final newline was lost before DB access', async () => {
    const { db, execute, proposal } = setup();
    const privateDirectory = mkdtempSync(join(tmpdir(), 'narrative-tail-'));
    const entry = {
      version: 1,
      state: 'approved',
      owner,
      sheetId,
      expectedRevision: proposal.expectedRevision,
      beforeHash: proposal.beforeHash,
      afterHash: proposal.afterHash,
      changeIds: proposal.changes.map(({ blockId, targetId, field }) => `${blockId}:${targetId}:${field}`),
      at: new Date().toISOString(),
    };
    try {
      writeFileSync(join(privateDirectory, 'journal.jsonl'), canonicalJson(entry), { mode: 0o600 });
      state.realJournal = true;
      await expect(applyNarrative(db, owner, privateDirectory, sheetId)).rejects.toThrow('INVALID_JOURNAL_ENTRY');
      await expect(revertNarrative(db, owner, privateDirectory, sheetId)).rejects.toThrow('INVALID_JOURNAL_ENTRY');
      expect(execute).not.toHaveBeenCalled();
      writeFileSync(join(privateDirectory, 'journal.jsonl'), `${canonicalJson(entry)}\n`, { mode: 0o600 });
      await expect(applyNarrative(db, owner, privateDirectory, sheetId)).resolves.toEqual({ sheetId, revision: '43' });
      writeFileSync(join(privateDirectory, 'journal.jsonl'), canonicalJson({ ...entry, state: 'db-applied' }), {
        mode: 0o600,
      });
      await expect(applyNarrative(db, owner, privateDirectory, sheetId)).rejects.toThrow('INVALID_JOURNAL_ENTRY');
      await expect(revertNarrative(db, owner, privateDirectory, sheetId)).rejects.toThrow('INVALID_JOURNAL_ENTRY');
      expect(execute).toHaveBeenCalledTimes(1);
    } finally {
      rmSync(privateDirectory, { recursive: true, force: true });
    }
  });
  it('stops apply and revert before DB writes when a journal line is partial', async () => {
    const { db, execute } = setup();
    state.partialJournal = true;
    await expect(applyNarrative(db, owner, directory, sheetId)).rejects.toThrow('INVALID_JOURNAL_ENTRY');
    expect(execute).not.toHaveBeenCalled();
    state.partialJournal = false;
    await applyNarrative(db, owner, directory, sheetId);
    state.partialJournal = true;
    await expect(applyNarrative(db, owner, directory, sheetId)).rejects.toThrow('INVALID_JOURNAL_ENTRY');
    await expect(revertNarrative(db, owner, directory, sheetId)).rejects.toThrow('INVALID_JOURNAL_ENTRY');
    expect(execute).toHaveBeenCalledTimes(1);
  });
  it.each([
    'response',
    'db-applied.json',
    'journal',
  ])('resumes apply after %s failure without a second write', async (fault) => {
    const { db, execute, before } = setup();
    if (fault === 'response') state.failResponse = true;
    else if (fault === 'journal') state.failJournal = true;
    else state.failRecord = fault;
    await expect(applyNarrative(db, owner, directory, sheetId)).rejects.toThrow('INJECTED');
    expect(state.records.get('before.json')).toEqual({ owner, snapshot: before });
    await expect(applyNarrative(db, owner, directory, sheetId)).resolves.toEqual({ sheetId, revision: '43' });
    expect(execute).toHaveBeenCalledTimes(1);
  });
  it.each([
    'response',
    'reverted.json',
    'journal',
  ])('resumes revert after %s failure without a second write', async (fault) => {
    const { db, execute } = setup();
    await applyNarrative(db, owner, directory, sheetId);
    if (fault === 'response') state.failResponse = true;
    else if (fault === 'journal') state.failJournal = true;
    else state.failRecord = fault;
    await expect(revertNarrative(db, owner, directory, sheetId)).rejects.toThrow('INJECTED');
    await expect(revertNarrative(db, owner, directory, sheetId)).resolves.toEqual({ sheetId, revision: '44' });
    expect(execute).toHaveBeenCalledTimes(2);
  });
  it('does not write if durable revert request cannot be recorded', async () => {
    const { db, execute } = setup();
    await applyNarrative(db, owner, directory, sheetId);
    state.failRecord = 'revert-requested.json';
    await expect(revertNarrative(db, owner, directory, sheetId)).rejects.toThrow('INJECTED');
    expect(execute).toHaveBeenCalledTimes(1);
  });
  it('rejects recovery after a later revision or title change', async () => {
    const { db, execute, before, proposal } = setup();
    state.current = { ...before, revision: '44', blocks: proposal.blocks };
    await expect(applyNarrative(db, owner, directory, sheetId)).rejects.toThrow('NARRATIVE_RESUME_CONFLICT');
    state.current = { ...before, revision: '43', title: 'Changed', blocks: proposal.blocks };
    await expect(applyNarrative(db, owner, directory, sheetId)).rejects.toThrow('NARRATIVE_RESUME_CONFLICT');
    expect(execute).not.toHaveBeenCalled();
  });
  it('requires the matching durable request before accepting a reverted snapshot', async () => {
    const { db, execute, before, proposal } = setup();
    state.records.set('db-applied.json', narrativeAppliedRecord(owner, before, proposal));
    state.current = { ...before, revision: '44' };
    await expect(revertNarrative(db, owner, directory, sheetId)).rejects.toThrow('MISSING_RECORD');
    expect(execute).not.toHaveBeenCalled();
  });
});

describe('saved narrative record validation', () => {
  it('accepts only fully matching before/proposal/approval records', () => {
    const { before, proposal } = setup();
    expect(loadNarrativeUpdate(directory, owner, sheetId)).toMatchObject({ before, proposal });
  });
  it.each([
    'owner',
    'sheetId',
    'beforeHash',
    'afterHash',
    'kind',
    'revision',
  ])('rejects changed applied %s before any DB access', async (field) => {
    const { db, execute, before, proposal } = setup();
    const applied = narrativeAppliedRecord(owner, before, proposal);
    state.records.set('db-applied.json', { ...applied, [field]: 'changed' });
    await expect(revertNarrative(db, owner, directory, sheetId)).rejects.toThrow('NARRATIVE_APPLIED_RECORD_MISMATCH');
    expect(execute).not.toHaveBeenCalled();
  });
  it.each([
    'before',
    'validation',
    'proposal',
    'approval',
    'field',
  ])('rejects tampered %s records before writes', async (target) => {
    const { db, execute, before, proposal } = setup();
    if (target === 'before') state.records.set('before.json', { owner, snapshot: { ...before, title: 'Changed' } });
    if (target === 'validation')
      state.records.set('before.json', { owner, snapshot: { ...before, validation: { editable: false, issues: [] } } });
    if (target === 'proposal') state.records.set('proposal.json', { ...proposal, version: 2 });
    if (target === 'approval') state.records.set('approved.json', { kind: 'wrong' });
    if (target === 'field')
      state.records.set('proposal.json', { ...proposal, changes: [{ ...proposal.changes[0], field: 'title' }] });
    await expect(applyNarrative(db, owner, directory, sheetId)).rejects.toThrow();
    expect(execute).not.toHaveBeenCalled();
  });
});

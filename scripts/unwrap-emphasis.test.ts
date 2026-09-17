import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { ProjectItem } from '../src/db/blocks';
import { canonicalJson, type RawDocumentBlock } from '../src/db/document-contract';
import { parseUnwrapArgs, proposeUnwrap } from './unwrap-emphasis';

const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const project = (projectId: string, duties: string): ProjectItem => ({
  id: projectId,
  companyId: 'company',
  title: '同じタイトル',
  scope: '',
  period: '',
  role: '',
  team: '',
  tech: { lang: [], fw: [], db: [], infra: [], tools: [], collab: [] },
  process: [],
  duties,
  acquired: '',
  comment: '',
});

describe('unwrap proposal', () => {
  it('requires explicit UUID and refuses the unapproved legacy writer', () => {
    expect(parseUnwrapArgs(['--sheet-id', id])).toBe(id);
    expect(() => parseUnwrapArgs([])).toThrow();
    expect(() => parseUnwrapArgs(['--sheet-id', 'bad'])).toThrow();
    expect(() => parseUnwrapArgs(['--sheet-id', id, '--write'])).toThrow('LEGACY_WRITER_DISABLED');
  });
  it('preserves block identity and raw data while addressing equal titles by project ID', () => {
    const blocks: RawDocumentBlock[] = [
      {
        id,
        order: 0,
        type: 'project',
        data: {
          companies: [],
          items: [project('first', '**原文**'), project('second', '変更なし')],
          unknown: '保持',
        },
      },
    ];
    const original = canonicalJson(blocks);
    const result = proposeUnwrap(blocks);
    expect(result.blocks[0]).toMatchObject({ id, order: 0, data: { unknown: '保持' } });
    expect(result.changes).toEqual([
      {
        blockId: id,
        projectId: 'first',
        field: 'duties',
        beforeHash: createHash('sha256').update(canonicalJson('**原文**')).digest('hex'),
        afterHash: createHash('sha256').update(canonicalJson('原文')).digest('hex'),
      },
    ]);
    expect(canonicalJson(blocks)).toBe(original);
    expect(proposeUnwrap(result.blocks).changes).toEqual([]);
  });
  it('keeps uninterpretable and unrelated blocks intact', () => {
    const blocks = [{ id, type: 'future', order: 0, data: { raw: '**保持**' } }];
    expect(proposeUnwrap(blocks)).toEqual({ blocks, changes: [] });
  });
});

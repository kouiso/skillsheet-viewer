import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it, vi } from 'vitest';
import type { Database } from './client';
import { createDocumentService } from './document-service';

const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const blocks = [{ id, order: 0, type: 'markdown', data: { markdown: '原文' } }];
const ok = (revision = '0', data = blocks) => ({
  status: 'OK',
  snapshot: { sheetId: id, title: '合成', revision, blocks: data },
});
function harness(...responses: unknown[]) {
  const execute = vi.fn();
  for (const result of responses) execute.mockResolvedValueOnce({ rows: [{ result }] });
  const service = createDocumentService({ execute } as unknown as Pick<Database, 'execute'>, 'owner-a');
  return { execute, service };
}

describe('document service', () => {
  it('期間投影の矛盾をDB呼出前に拒否する', async () => {
    const { service, execute } = harness();
    const raw = [
      {
        id,
        order: 0,
        type: 'project',
        data: {
          companies: [],
          items: [
            {
              id: 'p1',
              companyId: 'c1',
              title: '案件',
              scope: '',
              period: '2026.08 — ',
              ongoing: true,
              role: '',
              team: '',
              tech: { lang: [], fw: [], db: [], infra: [], tools: [], collab: [] },
              process: [],
              duties: '',
              acquired: '',
              comment: '',
            },
          ],
        },
      },
    ];
    await expect(service.replace(id, '0', '合成', raw)).rejects.toMatchObject({ code: 'UNEDITABLE_DOCUMENT' });
    expect(execute).not.toHaveBeenCalled();
  });

  it.each([
    { code: '42501' },
    { cause: { code: '42501' } },
  ])('surfaces DB privilege denial as an access error', async (error) => {
    const { service, execute } = harness();
    execute.mockRejectedValueOnce(error);
    await expect(service.read(id)).rejects.toMatchObject({ code: 'ACCESS_DENIED' });
  });
  it('reads navigation metadata through the owner-bound list function', async () => {
    const rows = [
      {
        sheetId: id,
        title: '合成',
        isDefault: true,
        createdAt: '2026-09-01T00:00:00Z',
        updatedAt: '2026-09-02T00:00:00Z',
      },
    ];
    const { service, execute } = harness(rows);
    expect(await service.list()).toEqual(rows);
    const query = new PgDialect().sqlToQuery(execute.mock.calls[0][0]);
    expect(query.sql).toContain('skillsheet_private.list_sheets');
    expect(query.params).toEqual(['owner-a']);
  });
  it('rejects corrupt navigation metadata instead of selecting a fallback ID', async () => {
    const { service } = harness([
      { sheetId: id, title: '合成', isDefault: true, createdAt: 'invalid', updatedAt: 'invalid' },
    ]);
    await expect(service.list()).rejects.toMatchObject({ code: 'INVALID_DB_RESPONSE' });
  });
  it('returns identity, raw and exact revision from one snapshot', async () => {
    const { service, execute } = harness(ok('9007199254740993'));
    const result = await service.read(id);
    expect(result).toMatchObject({
      status: 'OK',
      snapshot: { sheetId: id, revision: '9007199254740993', validation: { editable: true } },
    });
    const query = new PgDialect().sqlToQuery(execute.mock.calls[0][0]);
    expect(query.params).toEqual([id, 'owner-a']);
    expect(query.sql).toContain('skillsheet_private.read_snapshot');
  });
  it('returns EMPTY without creating or resolving another sheet', async () => {
    const { service, execute } = harness({ status: 'EMPTY' });
    expect(await service.read()).toEqual({ status: 'EMPTY' });
    expect(execute).toHaveBeenCalledTimes(1);
  });
  it('rejects a returned identity that differs from requested sheet', async () => {
    const { service } = harness(ok());
    await expect(service.read('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')).rejects.toMatchObject({
      code: 'SNAPSHOT_ID_MISMATCH',
    });
  });
  it('retains unknown stored fields and prevents their removal by replace', async () => {
    const raw = [{ ...blocks[0], data: { markdown: '原文', extra: '保持' } }];
    const { service, execute } = harness(ok('0', raw));
    await expect(service.replace(id, '0', '合成', blocks)).rejects.toMatchObject({ code: 'UNEDITABLE_DOCUMENT' });
    expect(execute).toHaveBeenCalledTimes(1);
    expect(raw[0].data.extra).toBe('保持');
  });
  it('still handles CAS conflict after successful validation read', async () => {
    const { service, execute } = harness(ok(), { status: 'CONFLICT' });
    await expect(service.replace(id, '0', '合成', blocks)).rejects.toMatchObject({ code: 'CONFLICT' });
    const query = new PgDialect().sqlToQuery(execute.mock.calls[1][0]);
    expect(query.params).toEqual([id, '0', '合成', expect.any(String), 'owner-a']);
    expect(query.sql).toContain('skillsheet_private.replace_sheet');
  });
  it('requires revision and client UUID before invoking a writer', async () => {
    const { service, execute } = harness();
    await expect(service.delete(id, '01')).rejects.toMatchObject({ code: 'INVALID_REVISION' });
    await expect(service.create('not-uuid', '合成', blocks)).rejects.toMatchObject({ code: 'INVALID_ID' });
    expect(execute).not.toHaveBeenCalled();
  });
  it('passes delete revision zero and expected owner unchanged', async () => {
    const { service, execute } = harness({ status: 'OK' });
    await service.delete(id, '0');
    expect(new PgDialect().sqlToQuery(execute.mock.calls[0][0]).params).toEqual([id, '0', 'owner-a']);
  });
});

import { describe, expect, it, vi } from 'vitest';
import { createDocumentService, DocumentError } from '@/db/document-service';
import { SkillSheetNotFoundError } from '@/db/skillsheet';
import { readViewerDocument } from './document-view';

vi.mock('@/db/document-service', async (original) => ({
  ...(await original<typeof import('@/db/document-service')>()),
  createDocumentService: vi.fn(),
}));
const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
function arrange(result: unknown) {
  const read = vi.fn().mockResolvedValue(result);
  vi.mocked(createDocumentService).mockReturnValue({ read } as never);
  return read;
}
describe('viewer document boundary', () => {
  it('reads only the specified owner and document and preserves raw supported data', async () => {
    const blocks = [{ id, type: 'markdown', order: 0, data: { markdown: '原文', unknown: '保持' } }];
    const read = arrange({ status: 'OK', snapshot: { title: 'T', revision: '9007199254740993', blocks } });
    const result = await readViewerDocument({} as never, 'owner-a', id);
    expect(createDocumentService).toHaveBeenLastCalledWith({}, 'owner-a');
    expect(read).toHaveBeenCalledWith(id);
    expect(result.blocks).toEqual(blocks);
    expect(result.revision).toBe('9007199254740993');
    expect(result.content).toContain('原文');
  });
  it('shows EMPTY without creating a document', async () => {
    const read = arrange({ status: 'EMPTY' });
    expect(await readViewerDocument({} as never, 'owner-a', null)).toMatchObject({ blocks: [], content: '' });
    expect(read).toHaveBeenCalledTimes(1);
  });
  it('does not substitute another sheet for NOT_FOUND', async () => {
    const read = arrange({ status: 'NOT_FOUND' });
    await expect(readViewerDocument({} as never, 'owner-a', id)).rejects.toBeInstanceOf(SkillSheetNotFoundError);
    expect(read).toHaveBeenCalledTimes(1);
  });
  it('does not repair invalid defaults', async () => {
    arrange({ status: 'INVALID_STATE' });
    await expect(readViewerDocument({} as never, 'owner-a', null)).rejects.toMatchObject({ code: 'INVALID_STATE' });
  });
  it('excludes hidden companies/items from the returned blocks', async () => {
    const item = (over: Record<string, unknown>) => ({
      id: 'i',
      companyId: 'c1',
      title: '案件',
      scope: '',
      period: '',
      role: '',
      team: '',
      duties: '',
      acquired: '',
      comment: '',
      tech: { lang: [], fw: [], db: [], infra: [], tools: [], collab: [] },
      process: [],
      ...over,
    });
    const blocks = [
      {
        id,
        type: 'project',
        order: 0,
        data: {
          companies: [
            { id: 'c1', name: '公開会社', kind: '', period: '', note: '' },
            { id: 'c2', name: '非公開会社', kind: '', period: '', note: '', hidden: true },
          ],
          items: [
            item({ id: 'i1', title: '公開案件' }),
            item({ id: 'i2', title: '非公開案件', hidden: true }),
            item({ id: 'i3', companyId: 'c2', title: '非公開会社の案件' }),
          ],
        },
      },
    ];
    arrange({ status: 'OK', snapshot: { title: 'T', revision: '0', blocks } });
    const result = await readViewerDocument({} as never, 'owner-a', id);
    const data = (result.blocks[0] as { data: { companies: { id: string }[]; items: { id: string }[] } }).data;
    expect(data.companies.map((c) => c.id)).toEqual(['c1']);
    expect(data.items.map((i) => i.id)).toEqual(['i1']);
    expect(result.content).not.toContain('非公開会社');
    expect(result.content).not.toContain('非公開案件');
  });
  it('refuses partial success when a block cannot be interpreted', async () => {
    arrange({
      status: 'OK',
      snapshot: { title: 'T', revision: '0', blocks: [{ id, type: 'future', order: 0, data: {} }] },
    });
    await expect(readViewerDocument({} as never, 'owner-a', id)).rejects.toBeInstanceOf(DocumentError);
  });
});

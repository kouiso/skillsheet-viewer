/**
 * 共有サービス層（sheet-service）のテスト（Issue #305, node 環境）。
 *
 * DB アクセスは document-service をモックし、revision CAS の引き渡し・差分生成・
 * 入力検証・キャッシュ失効の呼び出しを検証する。SQL/DB 実効は別途 dev サーバーで
 * 実測する。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DocumentSnapshot } from '@/db/document-service';
import { DocumentError } from '@/db/document-service';

const { serviceMock, revalidateTagMock } = vi.hoisted(() => ({
  serviceMock: {
    read: vi.fn(),
    list: vi.fn(),
    create: vi.fn(),
    replace: vi.fn(),
    delete: vi.fn(),
  },
  revalidateTagMock: vi.fn(),
}));

vi.mock('next/cache', () => ({
  revalidateTag: revalidateTagMock,
  unstable_cache: <T extends (...args: unknown[]) => unknown>(fn: T) => fn,
}));

vi.mock('@/db/client', () => ({ getDb: () => ({}) }));
vi.mock('@/db/skillsheet', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/db/skillsheet')>();
  return { ...actual, getOwnerId: () => 'owner-1' };
});
vi.mock('@/db/document-service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/db/document-service')>();
  return { ...actual, createDocumentService: () => serviceMock };
});

import {
  addProjectItem,
  getOwnerSheet,
  listOwnerSheets,
  reorderProjectItems,
  searchProjects,
  updateCompany,
  updateProjectItem,
  updateStatsItem,
} from './sheet-service';

const SHEET_ID = '11111111-2222-4333-8444-555555555555';
const REVISION = '1';
const SAVED_REVISION = '2';

function makeSnapshot(): DocumentSnapshot {
  return {
    sheetId: SHEET_ID,
    title: 'エンジニアスキルシート',
    revision: REVISION,
    validation: { editable: true, issues: [] },
    blocks: [
      {
        id: 'aaaaaaaa-1111-4111-8111-111111111111',
        type: 'project',
        order: 0,
        data: {
          companies: [
            { id: 'c1', name: '株式会社A', kind: '自社', period: '2020-', note: '' },
            { id: 'c2', name: '株式会社B', kind: '受託', period: '2024-', note: '' },
          ],
          items: [
            {
              id: 'p1',
              companyId: 'c1',
              title: '案件α',
              scope: '開発',
              period: '2024-01〜',
              role: 'SE',
              team: '3名',
              tech: { lang: ['TypeScript'], fw: ['Next.js'], db: [], infra: [], tools: [], collab: [] },
              process: ['要件定義'],
              duties: '設計と実装',
              acquired: '',
              comment: '',
            },
            {
              id: 'p2',
              companyId: 'c2',
              title: '案件β',
              scope: '',
              period: '',
              role: '',
              team: '',
              tech: { lang: [], fw: [], db: ['PostgreSQL'], infra: [], tools: [], collab: [] },
              process: [],
              duties: '',
              acquired: '',
              comment: '',
              hidden: true,
            },
          ],
        },
      },
      {
        id: 'bbbbbbbb-2222-4222-8222-222222222222',
        type: 'stats',
        order: 1,
        data: { items: [{ label: '経験年数', value: '10', unit: '年' }] },
      },
    ],
  };
}

beforeEach(() => {
  for (const fn of Object.values(serviceMock)) fn.mockReset();
  revalidateTagMock.mockReset();
  serviceMock.read.mockResolvedValue({ status: 'OK', snapshot: makeSnapshot() });
  serviceMock.replace.mockResolvedValue({ ...makeSnapshot(), revision: SAVED_REVISION });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('listOwnerSheets / getOwnerSheet', () => {
  it('一覧は文書境界へ委譲する', async () => {
    serviceMock.list.mockResolvedValue([
      { sheetId: SHEET_ID, title: 't', isDefault: true, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-02T00:00:00Z' },
    ]);
    const sheets = await listOwnerSheets();
    expect(sheets).toEqual([
      { id: SHEET_ID, title: 't', isDefault: true, updatedAt: '2026-01-02T00:00:00Z' },
    ]);
    expect(serviceMock.list).toHaveBeenCalledTimes(1);
  });

  it('他オーナー/不存在のシートは NOT_FOUND', async () => {
    serviceMock.read.mockResolvedValue({ status: 'NOT_FOUND' });
    await expect(getOwnerSheet(SHEET_ID)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('updateProjectItem', () => {
  it('指定フィールドだけ更新し、差分と保存後 revision を返す', async () => {
    const result = await updateProjectItem({
      sheetId: SHEET_ID,
      projectId: 'p1',
      expectedRevision: REVISION,
      fields: { role: 'TL', hidden: true },
    });
    expect(result.targetId).toBe('p1');
    expect(result.revision).toBe(SAVED_REVISION);
    expect(result.changes).toEqual([
      { field: 'role', before: 'SE', after: 'TL' },
      { field: 'hidden', before: undefined, after: true },
    ]);
    // 楽観ロック: expectedRevision をそのまま replace へ渡す
    expect(serviceMock.replace).toHaveBeenCalledWith(
      SHEET_ID,
      REVISION,
      'エンジニアスキルシート',
      expect.any(Array),
    );
    // キャッシュ失効
    expect(revalidateTagMock).toHaveBeenCalledWith('db-sheet', { expire: 0 });
    const savedBlocks = serviceMock.replace.mock.calls[0][3];
    const proj = savedBlocks.find((b: { type: string }) => b.type === 'project');
    const p1 = proj.data.items.find((i: { id: string }) => i.id === 'p1');
    expect(p1.role).toBe('TL');
    expect(p1.hidden).toBe(true);
    // 未指定フィールドは変わらない
    expect(p1.title).toBe('案件α');
  });

  it('tech は指定したサブキーだけ置き換える', async () => {
    await updateProjectItem({
      sheetId: SHEET_ID,
      projectId: 'p1',
      expectedRevision: REVISION,
      fields: { tech: { lang: ['Go'] } },
    });
    const savedBlocks = serviceMock.replace.mock.calls[0][3];
    const p1 = savedBlocks.find((b: { type: string }) => b.type === 'project').data.items[0];
    expect(p1.tech.lang).toEqual(['Go']);
    expect(p1.tech.fw).toEqual(['Next.js']);
  });

  it('存在しない projectId は NOT_FOUND', async () => {
    await expect(
      updateProjectItem({ sheetId: SHEET_ID, projectId: 'nope', expectedRevision: REVISION, fields: { role: 'x' } }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(serviceMock.replace).not.toHaveBeenCalled();
  });

  it('更新フィールド無しは BAD_REQUEST', async () => {
    await expect(
      updateProjectItem({ sheetId: SHEET_ID, projectId: 'p1', expectedRevision: REVISION, fields: {} }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('存在しない companyId への変更は NOT_FOUND', async () => {
    await expect(
      updateProjectItem({
        sheetId: SHEET_ID,
        projectId: 'p1',
        expectedRevision: REVISION,
        fields: { companyId: 'cx' },
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('DocumentError(CONFLICT) はそのまま伝播し、失効も差分も返さない', async () => {
    serviceMock.replace.mockRejectedValue(new DocumentError('CONFLICT'));
    await expect(
      updateProjectItem({ sheetId: SHEET_ID, projectId: 'p1', expectedRevision: REVISION, fields: { role: 'x' } }),
    ).rejects.toBeInstanceOf(DocumentError);
    expect(revalidateTagMock).not.toHaveBeenCalled();
  });
});

describe('updateCompany', () => {
  it('指定フィールドだけ更新し差分を返す', async () => {
    const result = await updateCompany({
      sheetId: SHEET_ID,
      companyId: 'c1',
      expectedRevision: REVISION,
      fields: { note: '備考' },
    });
    expect(result.targetId).toBe('c1');
    expect(result.changes).toEqual([{ field: 'note', before: '', after: '備考' }]);
    const saved = serviceMock.replace.mock.calls[0][3].find((b: { type: string }) => b.type === 'project');
    expect(saved.data.companies[0].note).toBe('備考');
    expect(saved.data.companies[0].name).toBe('株式会社A');
  });

  it('存在しない companyId は NOT_FOUND', async () => {
    await expect(
      updateCompany({ sheetId: SHEET_ID, companyId: 'cx', expectedRevision: REVISION, fields: { name: 'x' } }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('updateStatsItem', () => {
  it('index と expectedLabel が一致した項目だけ更新する', async () => {
    const result = await updateStatsItem({
      sheetId: SHEET_ID,
      index: 0,
      expectedLabel: '経験年数',
      expectedRevision: REVISION,
      fields: { value: '11' },
    });
    expect(result.changes).toEqual([{ field: 'value', before: '10', after: '11' }]);
    const saved = serviceMock.replace.mock.calls[0][3].find((b: { type: string }) => b.type === 'stats');
    expect(saved.data.items[0].value).toBe('11');
  });

  it('expectedLabel が一致しない場合は NOT_FOUND で保存しない', async () => {
    await expect(
      updateStatsItem({
        sheetId: SHEET_ID,
        index: 0,
        expectedLabel: '別ラベル',
        expectedRevision: REVISION,
        fields: { value: '1' },
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(serviceMock.replace).not.toHaveBeenCalled();
  });

  it('index が範囲外なら NOT_FOUND', async () => {
    await expect(
      updateStatsItem({
        sheetId: SHEET_ID,
        index: 9,
        expectedLabel: '経験年数',
        expectedRevision: REVISION,
        fields: { value: '1' },
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('addProjectItem', () => {
  it('サーバー側で ID を生成して末尾へ追加し、targetId に新規 ID を返す', async () => {
    const result = await addProjectItem({
      sheetId: SHEET_ID,
      expectedRevision: REVISION,
      item: {
        companyId: 'c1',
        title: '案件γ',
        scope: '',
        period: '',
        role: '',
        team: '',
        process: [],
        duties: '',
        acquired: '',
        comment: '',
      },
    });
    expect(result.targetId).toMatch(/^[0-9a-f-]{36}$/);
    const saved = serviceMock.replace.mock.calls[0][3].find((b: { type: string }) => b.type === 'project');
    expect(saved.data.items).toHaveLength(3);
    const added = saved.data.items[2];
    expect(added.id).toBe(result.targetId);
    expect(added.title).toBe('案件γ');
    expect(added.tech).toEqual({ lang: [], fw: [], db: [], infra: [], tools: [], collab: [] });
  });

  it('存在しない companyId は NOT_FOUND で保存しない', async () => {
    await expect(
      addProjectItem({
        sheetId: SHEET_ID,
        expectedRevision: REVISION,
        item: {
          companyId: 'cx',
          title: 'x',
          scope: '',
          period: '',
          role: '',
          team: '',
          process: [],
          duties: '',
          acquired: '',
          comment: '',
        },
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(serviceMock.replace).not.toHaveBeenCalled();
  });
});

describe('reorderProjectItems', () => {
  it('全 ID を指定すれば並び替えが保存される', async () => {
    const result = await reorderProjectItems({
      sheetId: SHEET_ID,
      expectedRevision: REVISION,
      projectIds: ['p2', 'p1'],
    });
    const saved = serviceMock.replace.mock.calls[0][3].find((b: { type: string }) => b.type === 'project');
    expect(saved.data.items.map((i: { id: string }) => i.id)).toEqual(['p2', 'p1']);
    expect(result.changes[0]).toMatchObject({ field: 'items.order', after: ['p2', 'p1'] });
  });

  it('重複 ID は BAD_REQUEST', async () => {
    await expect(
      reorderProjectItems({ sheetId: SHEET_ID, expectedRevision: REVISION, projectIds: ['p1', 'p1'] }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(serviceMock.replace).not.toHaveBeenCalled();
  });

  it('未知 ID は BAD_REQUEST', async () => {
    await expect(
      reorderProjectItems({ sheetId: SHEET_ID, expectedRevision: REVISION, projectIds: ['p1', 'p2', 'px'] }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('既存 ID の欠落は BAD_REQUEST', async () => {
    await expect(
      reorderProjectItems({ sheetId: SHEET_ID, expectedRevision: REVISION, projectIds: ['p1'] }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });
});

describe('searchProjects', () => {
  it('案件名の完全一致で projectId と companyId を返す', async () => {
    const hits = await searchProjects('案件α', SHEET_ID);
    expect(hits).toEqual([
      expect.objectContaining({ projectId: 'p1', companyId: 'c1', matchedOn: 'project', companyName: '株式会社A' }),
    ]);
  });

  it('会社名の完全一致で配下案件ごと返す', async () => {
    const hits = await searchProjects('株式会社B', SHEET_ID);
    expect(hits).toEqual([
      expect.objectContaining({ projectId: 'p2', companyId: 'c2', matchedOn: 'company', hidden: true }),
    ]);
  });

  it('技術名の完全一致でヒットする', async () => {
    const hits = await searchProjects('PostgreSQL', SHEET_ID);
    expect(hits).toEqual([expect.objectContaining({ projectId: 'p2', matchedOn: 'tech' })]);
  });

  it('部分一致はヒットしない（完全一致のみ）', async () => {
    expect(await searchProjects('案件', SHEET_ID)).toEqual([]);
  });
});

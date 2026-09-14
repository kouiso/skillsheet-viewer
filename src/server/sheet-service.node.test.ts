/**
 * 共有サービス層（sheet-service）のテスト（Issue #305, node 環境）。
 *
 * DB アクセスは @/db をモックし、楽観ロックの引き渡し・差分生成・入力検証・
 * キャッシュ失効の呼び出しを検証する。SQL/DB 実効は別途 dev サーバーで実測する。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { OwnerSkillSheet } from '@/db';
import { ConflictError, SkillSheetNotFoundError } from '@/db';

const { getOwnerSkillSheetByIdMock, saveSkillSheetBlocksMock, listSheetsMock, revalidateTagMock } = vi.hoisted(() => ({
  getOwnerSkillSheetByIdMock: vi.fn(),
  saveSkillSheetBlocksMock: vi.fn(),
  listSheetsMock: vi.fn(),
  revalidateTagMock: vi.fn(),
}));

vi.mock('next/cache', () => ({
  revalidateTag: revalidateTagMock,
  unstable_cache: <T extends (...args: unknown[]) => unknown>(fn: T) => fn,
}));

vi.mock('@/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/db')>();
  return {
    ...actual,
    getOwnerSkillSheetById: getOwnerSkillSheetByIdMock,
    saveSkillSheetBlocks: saveSkillSheetBlocksMock,
    listSheets: listSheetsMock,
  };
});

import {
  addProjectItem,
  getOwnerSheet,
  listOwnerSheets,
  reorderProjectItems,
  saveOwnerSheet,
  searchProjects,
  updateCompany,
  updateProjectItem,
  updateStatsItem,
} from './sheet-service';

const SHEET_ID = '11111111-2222-4333-8444-555555555555';
const EXPECTED = new Date('2026-01-01T00:00:00Z');
const SAVED_AT = new Date('2026-01-02T00:00:00Z');

function makeSheet(): OwnerSkillSheet {
  return {
    id: SHEET_ID,
    title: 'エンジニアスキルシート',
    updatedAt: EXPECTED,
    blocks: [
      {
        id: 'b-proj',
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
        id: 'b-stats',
        type: 'stats',
        order: 1,
        data: { items: [{ label: '経験年数', value: '10', unit: '年' }] },
      },
    ],
  };
}

beforeEach(() => {
  getOwnerSkillSheetByIdMock.mockReset();
  saveSkillSheetBlocksMock.mockReset();
  listSheetsMock.mockReset();
  revalidateTagMock.mockReset();
  getOwnerSkillSheetByIdMock.mockResolvedValue(makeSheet());
  saveSkillSheetBlocksMock.mockResolvedValue({ updatedAt: SAVED_AT });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('listOwnerSheets / getOwnerSheet', () => {
  it('一覧は db 層へ委譲する', async () => {
    listSheetsMock.mockResolvedValue([{ id: SHEET_ID, title: 't', updatedAt: EXPECTED }]);
    const sheets = await listOwnerSheets();
    expect(sheets).toHaveLength(1);
    expect(listSheetsMock).toHaveBeenCalledTimes(1);
  });

  it('他オーナー/不存在のシートは SkillSheetNotFoundError が伝播する', async () => {
    getOwnerSkillSheetByIdMock.mockRejectedValue(new SkillSheetNotFoundError(SHEET_ID));
    await expect(getOwnerSheet(SHEET_ID)).rejects.toBeInstanceOf(SkillSheetNotFoundError);
  });
});

describe('updateProjectItem', () => {
  it('指定フィールドだけ更新し、差分と更新後 updatedAt を返す', async () => {
    const result = await updateProjectItem({
      sheetId: SHEET_ID,
      projectId: 'p1',
      expectedUpdatedAt: EXPECTED,
      fields: { role: 'TL', hidden: true },
    });
    expect(result.targetId).toBe('p1');
    expect(result.updatedAt).toBe(SAVED_AT);
    expect(result.changes).toEqual([
      { field: 'role', before: 'SE', after: 'TL' },
      { field: 'hidden', before: undefined, after: true },
    ]);
    // 楽観ロック: expectedUpdatedAt をそのまま saveSkillSheetBlocks へ渡す
    expect(saveSkillSheetBlocksMock).toHaveBeenCalledWith(
      'エンジニアスキルシート',
      expect.any(Array),
      SHEET_ID,
      EXPECTED,
    );
    // キャッシュ失効
    expect(revalidateTagMock).toHaveBeenCalledWith('db-sheet', { expire: 0 });
    const savedBlocks = saveSkillSheetBlocksMock.mock.calls[0][1];
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
      expectedUpdatedAt: EXPECTED,
      fields: { tech: { lang: ['Go'] } },
    });
    const savedBlocks = saveSkillSheetBlocksMock.mock.calls[0][1];
    const p1 = savedBlocks.find((b: { type: string }) => b.type === 'project').data.items[0];
    expect(p1.tech.lang).toEqual(['Go']);
    expect(p1.tech.fw).toEqual(['Next.js']);
  });

  it('存在しない projectId は NOT_FOUND', async () => {
    await expect(
      updateProjectItem({ sheetId: SHEET_ID, projectId: 'nope', expectedUpdatedAt: EXPECTED, fields: { role: 'x' } }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(saveSkillSheetBlocksMock).not.toHaveBeenCalled();
  });

  it('更新フィールド無しは BAD_REQUEST', async () => {
    await expect(
      updateProjectItem({ sheetId: SHEET_ID, projectId: 'p1', expectedUpdatedAt: EXPECTED, fields: {} }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('存在しない companyId への変更は NOT_FOUND', async () => {
    await expect(
      updateProjectItem({
        sheetId: SHEET_ID,
        projectId: 'p1',
        expectedUpdatedAt: EXPECTED,
        fields: { companyId: 'cx' },
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('ConflictError はそのまま伝播し、失効も差分も返さない', async () => {
    saveSkillSheetBlocksMock.mockRejectedValue(new ConflictError());
    await expect(
      updateProjectItem({ sheetId: SHEET_ID, projectId: 'p1', expectedUpdatedAt: EXPECTED, fields: { role: 'x' } }),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(revalidateTagMock).not.toHaveBeenCalled();
  });
});

describe('updateCompany', () => {
  it('指定フィールドだけ更新し差分を返す', async () => {
    const result = await updateCompany({
      sheetId: SHEET_ID,
      companyId: 'c1',
      expectedUpdatedAt: EXPECTED,
      fields: { note: '備考' },
    });
    expect(result.targetId).toBe('c1');
    expect(result.changes).toEqual([{ field: 'note', before: '', after: '備考' }]);
    const saved = saveSkillSheetBlocksMock.mock.calls[0][1].find((b: { type: string }) => b.type === 'project');
    expect(saved.data.companies[0].note).toBe('備考');
    expect(saved.data.companies[0].name).toBe('株式会社A');
  });

  it('存在しない companyId は NOT_FOUND', async () => {
    await expect(
      updateCompany({ sheetId: SHEET_ID, companyId: 'cx', expectedUpdatedAt: EXPECTED, fields: { name: 'x' } }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('updateStatsItem', () => {
  it('index と expectedLabel が一致した項目だけ更新する', async () => {
    const result = await updateStatsItem({
      sheetId: SHEET_ID,
      index: 0,
      expectedLabel: '経験年数',
      expectedUpdatedAt: EXPECTED,
      fields: { value: '11' },
    });
    expect(result.changes).toEqual([{ field: 'value', before: '10', after: '11' }]);
    const saved = saveSkillSheetBlocksMock.mock.calls[0][1].find((b: { type: string }) => b.type === 'stats');
    expect(saved.data.items[0].value).toBe('11');
  });

  it('expectedLabel が一致しない場合は NOT_FOUND で保存しない', async () => {
    await expect(
      updateStatsItem({
        sheetId: SHEET_ID,
        index: 0,
        expectedLabel: '別ラベル',
        expectedUpdatedAt: EXPECTED,
        fields: { value: '1' },
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(saveSkillSheetBlocksMock).not.toHaveBeenCalled();
  });

  it('index が範囲外なら NOT_FOUND', async () => {
    await expect(
      updateStatsItem({
        sheetId: SHEET_ID,
        index: 9,
        expectedLabel: '経験年数',
        expectedUpdatedAt: EXPECTED,
        fields: { value: '1' },
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('addProjectItem', () => {
  it('サーバー側で ID を生成して末尾へ追加し、targetId に新規 ID を返す', async () => {
    const result = await addProjectItem({
      sheetId: SHEET_ID,
      expectedUpdatedAt: EXPECTED,
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
    const saved = saveSkillSheetBlocksMock.mock.calls[0][1].find((b: { type: string }) => b.type === 'project');
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
        expectedUpdatedAt: EXPECTED,
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
    expect(saveSkillSheetBlocksMock).not.toHaveBeenCalled();
  });
});

describe('reorderProjectItems', () => {
  it('全 ID を指定すれば並び替えが保存される', async () => {
    const result = await reorderProjectItems({
      sheetId: SHEET_ID,
      expectedUpdatedAt: EXPECTED,
      projectIds: ['p2', 'p1'],
    });
    const saved = saveSkillSheetBlocksMock.mock.calls[0][1].find((b: { type: string }) => b.type === 'project');
    expect(saved.data.items.map((i: { id: string }) => i.id)).toEqual(['p2', 'p1']);
    expect(result.changes[0]).toMatchObject({ field: 'items.order', after: ['p2', 'p1'] });
  });

  it('重複 ID は BAD_REQUEST', async () => {
    await expect(
      reorderProjectItems({ sheetId: SHEET_ID, expectedUpdatedAt: EXPECTED, projectIds: ['p1', 'p1'] }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(saveSkillSheetBlocksMock).not.toHaveBeenCalled();
  });

  it('未知 ID は BAD_REQUEST', async () => {
    await expect(
      reorderProjectItems({ sheetId: SHEET_ID, expectedUpdatedAt: EXPECTED, projectIds: ['p1', 'p2', 'px'] }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('既存 ID の欠落は BAD_REQUEST', async () => {
    await expect(
      reorderProjectItems({ sheetId: SHEET_ID, expectedUpdatedAt: EXPECTED, projectIds: ['p1'] }),
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

describe('saveOwnerSheet（tRPC 共有経路）', () => {
  it('保存後にキャッシュを失効させる', async () => {
    await saveOwnerSheet({ title: 't', blocks: [], sheetId: SHEET_ID, expectedUpdatedAt: EXPECTED });
    expect(saveSkillSheetBlocksMock).toHaveBeenCalledWith('t', [], SHEET_ID, EXPECTED);
    expect(revalidateTagMock).toHaveBeenCalledWith('db-sheet', { expire: 0 });
  });
});

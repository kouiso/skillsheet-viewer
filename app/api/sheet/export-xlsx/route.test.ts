import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  hasViewerSession: vi.fn(),
  isEditor: vi.fn(),
  getSkillSheet: vi.fn(),
  getSkillSheetById: vi.fn(),
  buildSkillSheetXlsx: vi.fn(),
  buildSkillSheetXlsxDigest: vi.fn(),
}));

vi.mock('@/server/viewer-gate', () => ({ hasViewerSession: mocks.hasViewerSession }));
vi.mock('@/server/auth-gate', () => ({ isEditor: mocks.isEditor }));
vi.mock('@/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/db')>();
  return { ...actual, getSkillSheet: mocks.getSkillSheet, getSkillSheetById: mocks.getSkillSheetById };
});
vi.mock('@/lib/export/build-xlsx', () => ({ buildSkillSheetXlsx: mocks.buildSkillSheetXlsx }));
vi.mock('@/lib/export/build-xlsx-digest', () => ({ buildSkillSheetXlsxDigest: mocks.buildSkillSheetXlsxDigest }));

import { GET } from './route';

const req = (url: string) => new NextRequest(url, { headers: { host: 'localhost:3000' } });

describe('GET /api/sheet/export-xlsx', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('閲覧 cookie でも編集者でも無ければ 401（要約版でも同じ）', async () => {
    mocks.hasViewerSession.mockResolvedValue(false);
    mocks.isEditor.mockResolvedValue(false);
    const res = await GET(req('http://localhost:3000/api/sheet/export-xlsx'));
    expect(res.status).toBe(401);
    const digest = await GET(req('http://localhost:3000/api/sheet/export-xlsx?edition=digest'));
    expect(digest.status).toBe(401);
    expect(mocks.getSkillSheet).not.toHaveBeenCalled();
  });

  it('閲覧者は xlsx を受け取れる（Content-Disposition と Content-Type を見る）', async () => {
    mocks.hasViewerSession.mockResolvedValue(true);
    mocks.isEditor.mockResolvedValue(false);
    mocks.getSkillSheetById.mockResolvedValue({ title: 'スキルシート', blocks: [] });
    mocks.buildSkillSheetXlsx.mockResolvedValue(Buffer.from('PK-fake'));

    const id = '11111111-1111-4111-8111-111111111111';
    const res = await GET(req(`http://localhost:3000/api/sheet/export-xlsx?id=${id}`));

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    expect(res.headers.get('Content-Disposition')).toContain('attachment');
    expect(res.headers.get('Content-Disposition')).toContain(encodeURIComponent('スキルシート.xlsx'));
    expect(mocks.getSkillSheetById).toHaveBeenCalledWith(id);
    // Buffer.from(...).buffer は Node のプール全体を指すことがあるため Uint8Array で比較する
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(new Uint8Array(Buffer.from('PK-fake')));
  });

  it('id が UUID でなければ 400、存在しなければ 404', async () => {
    mocks.hasViewerSession.mockResolvedValue(true);
    const bad = await GET(req('http://localhost:3000/api/sheet/export-xlsx?id=not-a-uuid'));
    expect(bad.status).toBe(400);

    const { SkillSheetNotFoundError } = await import('@/db');
    mocks.getSkillSheetById.mockRejectedValue(new SkillSheetNotFoundError('11111111-1111-4111-8111-111111111111'));
    const missing = await GET(
      req('http://localhost:3000/api/sheet/export-xlsx?id=11111111-1111-4111-8111-111111111111'),
    );
    expect(missing.status).toBe(404);
  });

  it('edition=digest は要約版ビルダーと「（要約版）」付きファイル名を使う', async () => {
    mocks.hasViewerSession.mockResolvedValue(true);
    mocks.isEditor.mockResolvedValue(false);
    mocks.getSkillSheetById.mockResolvedValue({ title: 'スキルシート', blocks: [] });
    mocks.buildSkillSheetXlsxDigest.mockResolvedValue(Buffer.from('PK-digest'));

    const id = '11111111-1111-4111-8111-111111111111';
    const res = await GET(req(`http://localhost:3000/api/sheet/export-xlsx?id=${id}&edition=digest`));

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    expect(res.headers.get('Content-Disposition')).toContain('attachment');
    expect(res.headers.get('Content-Disposition')).toContain(encodeURIComponent('スキルシート（要約版）.xlsx'));
    expect(mocks.buildSkillSheetXlsxDigest).toHaveBeenCalledWith([], 'スキルシート');
    expect(mocks.buildSkillSheetXlsx).not.toHaveBeenCalled();
  });

  it('edition 省略と edition=full は全文版ビルダーを使う', async () => {
    mocks.hasViewerSession.mockResolvedValue(true);
    mocks.isEditor.mockResolvedValue(false);
    mocks.getSkillSheet.mockResolvedValue({ title: 'シート', blocks: [] });
    mocks.buildSkillSheetXlsx.mockResolvedValue(Buffer.from('PK-full'));

    const def = await GET(req('http://localhost:3000/api/sheet/export-xlsx'));
    expect(def.status).toBe(200);
    expect(def.headers.get('Content-Disposition')).toContain(encodeURIComponent('シート.xlsx'));

    const id = '11111111-1111-4111-8111-111111111111';
    mocks.getSkillSheetById.mockResolvedValue({ title: 'シート', blocks: [] });
    const full = await GET(req(`http://localhost:3000/api/sheet/export-xlsx?id=${id}&edition=full`));
    expect(full.status).toBe(200);
    expect(full.headers.get('Content-Disposition')).toContain(encodeURIComponent('シート.xlsx'));

    expect(mocks.buildSkillSheetXlsx).toHaveBeenCalledTimes(2);
    expect(mocks.buildSkillSheetXlsxDigest).not.toHaveBeenCalled();
  });

  it('edition が不明値なら 400 でビルダーを呼ばない', async () => {
    mocks.hasViewerSession.mockResolvedValue(true);
    mocks.isEditor.mockResolvedValue(false);
    const id = '11111111-1111-4111-8111-111111111111';
    const res = await GET(req(`http://localhost:3000/api/sheet/export-xlsx?id=${id}&edition=half`));
    expect(res.status).toBe(400);
    expect(mocks.buildSkillSheetXlsx).not.toHaveBeenCalled();
    expect(mocks.buildSkillSheetXlsxDigest).not.toHaveBeenCalled();
  });
});

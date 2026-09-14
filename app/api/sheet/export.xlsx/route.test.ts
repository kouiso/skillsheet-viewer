import { NextRequest } from 'next/server';
import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  hasViewerSession: vi.fn(),
  isEditor: vi.fn(),
  getSkillSheet: vi.fn(),
  getSkillSheetById: vi.fn(),
  buildSkillSheetXlsx: vi.fn(),
}));

vi.mock('@/server/viewer-gate', () => ({ hasViewerSession: mocks.hasViewerSession }));
vi.mock('@/server/auth-gate', () => ({ isEditor: mocks.isEditor }));
vi.mock('@/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/db')>();
  return { ...actual, getSkillSheet: mocks.getSkillSheet, getSkillSheetById: mocks.getSkillSheetById };
});
vi.mock('@/lib/export/build-xlsx', () => ({ buildSkillSheetXlsx: mocks.buildSkillSheetXlsx }));

import { GET } from './route';

const req = (url: string) => new NextRequest(url, { headers: { host: 'localhost:3000' } });

describe('GET /api/sheet/export.xlsx', () => {
  it('閲覧 cookie でも編集者でも無ければ 401', async () => {
    mocks.hasViewerSession.mockResolvedValue(false);
    mocks.isEditor.mockResolvedValue(false);
    const res = await GET(req('http://localhost:3000/api/sheet/export.xlsx'));
    expect(res.status).toBe(401);
    expect(mocks.getSkillSheet).not.toHaveBeenCalled();
  });

  it('閲覧者は xlsx を受け取れる（Content-Disposition と Content-Type を見る）', async () => {
    mocks.hasViewerSession.mockResolvedValue(true);
    mocks.isEditor.mockResolvedValue(false);
    mocks.getSkillSheetById.mockResolvedValue({ title: 'スキルシート', blocks: [] });
    mocks.buildSkillSheetXlsx.mockResolvedValue(Buffer.from('PK-fake'));

    const id = '11111111-1111-4111-8111-111111111111';
    const res = await GET(req(`http://localhost:3000/api/sheet/export.xlsx?id=${id}`));

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    expect(res.headers.get('Content-Disposition')).toContain('attachment');
    expect(res.headers.get('Content-Disposition')).toContain(encodeURIComponent('スキルシート.xlsx'));
    expect(mocks.getSkillSheetById).toHaveBeenCalledWith(id);
    expect(await res.arrayBuffer()).toEqual(Buffer.from('PK-fake').buffer as ArrayBuffer);
  });

  it('id が UUID でなければ 400、存在しなければ 404', async () => {
    mocks.hasViewerSession.mockResolvedValue(true);
    const bad = await GET(req('http://localhost:3000/api/sheet/export.xlsx?id=not-a-uuid'));
    expect(bad.status).toBe(400);

    const { SkillSheetNotFoundError } = await import('@/db');
    mocks.getSkillSheetById.mockRejectedValue(new SkillSheetNotFoundError('11111111-1111-4111-8111-111111111111'));
    const missing = await GET(
      req('http://localhost:3000/api/sheet/export.xlsx?id=11111111-1111-4111-8111-111111111111'),
    );
    expect(missing.status).toBe(404);
  });
});
